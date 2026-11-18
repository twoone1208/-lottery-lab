import { mergeValue, equal, validateBackup, activeVip } from './cloud-sync-core.mjs';

const config = window.LOTTO_CLOUD_CONFIG;
const storage = window.MemberStorage;
const node = (tag, text) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
};
const mount = document.querySelector('.topbar a[href="#member"], .topbar a[href*="internal-3.html"]');
const bar = node('div');
bar.className = 'member-cloud';
const account = node('div');
const status = node('span');
status.className = 'member-sync-status';
status.setAttribute('role', 'status');
bar.append(account, status);
mount?.replaceWith(bar);
let client, user, ready = false, busy = false, timer, dirty = false;
const empty = () => ({ schema: 'lotto-member-backup/1', entries: {} });
const baselineKey = id => `lotto-cloud-baseline:${id}`;
const consentKey = id => `lotto-cloud-sync-enabled:${id}`;
const report = text => { status.textContent = text; };
const button = (text, action) => {
  const element = node('button', text);
  element.type = 'button';
  element.className = 'button quiet';
  element.onclick = () => Promise.resolve().then(action).catch(error => report(error.message));
  return element;
};
const check = result => {
  if (result.error) throw result.error;
  return result.data;
};

function askMerge() {
  return new Promise(resolve => {
    const dialog = node('dialog');
    dialog.className = 'member-merge-dialog';
    dialog.append(node('h2', '合併這台裝置的資料？'), node('p',
      '將此裝置的已記住版路、已儲存預測與計算設定合併到你的會員雲端。合併完成後，新增和修改會自動同步。'));
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.append(button('合併並啟用同步', () => finish(true)), button('稍後處理', () => finish(false)));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

async function readCloud(id) {
  const row = check(await client.from('user_backups').select('backup_data,revision,updated_at').eq('user_id', id).maybeSingle());
  if (row) validateBackup(row.backup_data);
  return row;
}

// 每次寫入先重讀遠端，並使用版本號避免兩個裝置相互覆蓋。
async function upload(local, base, id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (user?.id !== id) throw Error('登入帳號已變更，請重新整理');
    const row = await readCloud(id);
    const merged = validateBackup(mergeValue(base, local, row?.backup_data || empty()));
    if (equal(merged, row?.backup_data)) return { data: merged, time: row.updated_at };
    const result = await client.rpc('lotto_sync_save_backup', { p_data: merged, p_revision: row?.revision || 0 });
    if (!result.error) return { data: merged, time: result.data[0].updated_at };
    if (result.error.code !== '40001') throw result.error;
  }
  throw Error('其他裝置正在同步，請按「重新同步」再試');
}

async function initializeSession(session) {
  ready = false;
  user = session?.user || null;
  account.replaceChildren();
  if (!user) {
    if (storage.owner !== 'guest') {
      storage.setOwner('guest');
      location.reload();
      return;
    }
    const line = button(config.LINE_READY ? 'LINE 登入' : 'LINE 登入（待設定）', signIn);
    line.disabled = !config.LINE_READY;
    account.append(line);
    const legacy = node('a', '原會員登入');
    legacy.className = 'text-button';
    legacy.href = './internal-3.html#personal';
    account.append(legacy);
    report('未登入 · 資料保存在此裝置');
    return;
  }
  // 以伺服器確認登入者，再讀取該使用者自己的資料。
  user = check(await client.auth.getUser()).user;
  const id = user.id;
  const profile = check(await client.from('profiles').select('display_name,avatar_url,tier,vip_expire_at').eq('id', id).single());
  if (profile.avatar_url) {
    try {
      const url = new URL(profile.avatar_url);
      if (url.protocol === 'https:') {
        const avatar = node('img');
        avatar.src = url.href;
        avatar.alt = '會員頭像';
        avatar.referrerPolicy = 'no-referrer';
        account.append(avatar);
      }
    } catch { /* 沒有合法頭像時只顯示名稱。 */ }
  }
  account.append(node('strong', profile.display_name || user.email || '會員'));
  const center = node('a', '會員中心');
  center.href = './internal-3.html#personal';
  center.className = 'text-button';
  account.append(center);
  const vip = activeVip(profile);
  account.append(node('span', vip ? 'VIP 會員' : '一般會員'));
  if (vip && profile.vip_expire_at) account.append(node('small', '到期 ' + new Date(profile.vip_expire_at).toLocaleDateString('zh-TW')));
  account.append(button('登出', async () => {
    if (ready && dirty) await flush();
    check(await client.auth.signOut());
    storage.setOwner('guest');
    location.reload();
  }));
  account.append(button('重新同步', async () => {
    if (!ready) {
      storage.rawSet(consentKey(id), '');
      await initializeSession(session);
    } else await flush();
  }));
  if (config.LINE_READY && !user.identities?.some(identity => identity.provider === config.LINE_PROVIDER)) {
    account.append(button('綁定 LINE', async () => {
      check(await client.auth.linkIdentity({ provider: config.LINE_PROVIDER, options: { redirectTo: callbackUrl(), scopes: 'openid profile' } }));
    }));
  }
  const row = await readCloud(id);
  const cloud = row?.backup_data || empty();
  const switching = storage.owner !== id;
  const local = switching ? storage.capture(id) : storage.capture();
  const guest = storage.owner === 'guest' ? storage.capture('guest') : empty();
  const imported = storage.hasResearch(guest) ? mergeValue(empty(), local, guest) : local;
  const hasLocal = storage.hasResearch(imported);
  const enabled = storage.rawGet(consentKey(id)) === 'yes';
  if (hasLocal && !enabled && !(await askMerge())) {
    report('雲端同步暫停，可按「重新同步」啟用');
    return;
  }
  const base = JSON.parse(storage.rawGet(baselineKey(id)) || JSON.stringify(empty()));
  const hasData = Object.keys(imported.entries).length > 0;
  const result = hasData ? await upload(imported, base, id) : { data: cloud, time: row?.updated_at };
  if (user?.id !== id) return;
  const latestLocal = switching ? storage.capture(id) : storage.capture();
  const restored = validateBackup(mergeValue(local, latestLocal, result.data));
  storage.apply(restored, id);
  storage.rawSet(baselineKey(id), JSON.stringify(result.data));
  storage.rawSet(consentKey(id), 'yes');
  storage.setOwner(id);
  if (switching || !equal(local, restored)) {
    location.reload();
    return;
  }
  ready = true;
  report(result.time ? '已同步 ' + new Date(result.time).toLocaleString('zh-TW') : '雲端同步已啟用');
}

async function flush() {
  if (!ready || !user || busy) return;
  busy = true;
  dirty = false;
  const id = user.id;
  const local = storage.capture();
  const base = JSON.parse(storage.rawGet(baselineKey(id)) || JSON.stringify(empty()));
  let completed = false;
  try {
    report('同步中…');
    const result = await upload(local, base, id);
    if (user?.id !== id) return;
    if (!equal(result.data, local)) {
      // 先保留此裝置運算中的狀態，遠端新增的資料於重新載入後套用。
      report('其他裝置有新增資料，請按「載入最新資料」');
      if (!account.querySelector('[data-cloud-reload]')) {
        const reload = button('載入最新資料', async () => {
          const currentBase = JSON.parse(storage.rawGet(baselineKey(id)) || JSON.stringify(empty()));
          const current = storage.capture();
          const latest = await upload(current, currentBase, id);
          if (user?.id !== id) return;
          storage.apply(validateBackup(mergeValue(current, storage.capture(), latest.data)), id);
          storage.rawSet(baselineKey(id), JSON.stringify(latest.data));
          location.reload();
        });
        reload.dataset.cloudReload = '';
        account.append(reload);
      }
    } else {
      storage.rawSet(baselineKey(id), JSON.stringify(result.data));
      report('已同步 ' + new Date(result.time).toLocaleString('zh-TW'));
    }
    completed = true;
  } catch (error) {
    dirty = true;
    report('同步未完成：' + error.message + '。本機資料仍保留');
    throw error;
  } finally {
    busy = false;
    if (completed && dirty) schedule();
  }
}

function schedule() {
  dirty = true;
  if (!ready) return;
  clearTimeout(timer);
  timer = setTimeout(() => flush().catch(() => {}), 900);
}
function callbackUrl() {
  return new URL('./auth-callback.html', location.href).href;
}
async function signIn() {
  check(await client.auth.signInWithOAuth({ provider: config.LINE_PROVIDER,
    options: { redirectTo: callbackUrl(), scopes: 'openid profile' } }));
}

try {
  if (!config?.SUPABASE_URL || !config.SUPABASE_ANON_KEY || !window.supabase) throw Error('會員設定或連線程式尚未載入');
  client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: config.AUTH_STORAGE_KEY }
  });
  // Auth 事件內只安排工作，避免在事件鎖中執行其他 Supabase API。
  let initializedId;
  const start = session => {
    const id = session?.user?.id || null;
    if (initializedId === id) return;
    initializedId = id;
    initializeSession(session).catch(error => { report('會員同步未完成：' + error.message); });
  };
  client.auth.onAuthStateChange((event, session) => {
    if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION'].includes(event)) setTimeout(() => start(session), 0);
  });
  start(check(await client.auth.getSession()).session);
  addEventListener('member-local-change', schedule);
  addEventListener('online', () => { if (ready) flush().catch(() => {}); });
  addEventListener('storage', event => {
    if (event.key === 'lotto-cloud-active-owner' && event.newValue !== storage.owner) location.reload();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ready) flush().catch(() => {}); });
} catch (error) {
  account.append(node('a', '會員中心'));
  account.lastChild.href = './internal-3.html#personal';
  report(error.message);
}
