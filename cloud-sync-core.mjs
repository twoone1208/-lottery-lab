// 純資料合併模組，可獨立測試。相同紀錄 ID 的衝突會要求人工確認。
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => value === undefined ? undefined : structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function mergeValue(base, local, remote, path = '資料') {
  if (equal(local, remote) || equal(remote, base)) return clone(local);
  if (equal(local, base)) return clone(remote);
  if (object(local) && object(remote)) {
    const result = {};
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('資料含不合法欄位');
      const value = mergeValue(base?.[key], local[key], remote[key], `${path}.${key}`);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const identified = [...local, ...remote].every(item => object(item) && (item.id || item.key));
    if (identified) {
      const map = list => new Map((list || []).map(item => [item.id || item.key, item]));
      const before = map(base), left = map(local), right = map(remote), result = [];
      for (const id of new Set([...left.keys(), ...right.keys()])) {
        const value = mergeValue(before.get(id), left.get(id), right.get(id), `${path}[${id}]`);
        if (value !== undefined) result.push(value);
      }
      return result;
    }
    // 期序指紋只接受相同前綴的追加，避免改寫原追蹤期序。
    if (path.endsWith('.prefix')) {
      const shorter = local.length < remote.length ? local : remote;
      const longer = local.length < remote.length ? remote : local;
      if (shorter.every((value, i) => value === longer[i])) return clone(longer);
    } else if (local.every(object) && remote.every(object)) {
      return [...new Map([...local, ...remote].map(item => [JSON.stringify(item), clone(item)])).values()];
    }
  }
  throw Error(`兩台裝置的 ${path} 同時變更，請先匯出備份後處理衝突`);
}

export function validateBackup(data) {
  if (!object(data) || data.schema !== 'lotto-member-backup/1' || !object(data.entries)) {
    throw Error('雲端備份格式不正確');
  }
  if (JSON.stringify(data).length > 10 * 1024 * 1024) throw Error('備份超過 10MB，請先匯出歷史紀錄');
  return data;
}

export function activeVip(profile, now = Date.now()) {
  return profile?.tier === 'vip' && (!profile.vip_expire_at || Date.parse(profile.vip_expire_at) > now);
}
