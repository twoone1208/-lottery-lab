/* 既有計算工具繼續使用原本的 LocalStorage API，個人資料依會員 ID 分開保存。 */
(() => {
  const native = {
    get: Storage.prototype.getItem,
    set: Storage.prototype.setItem,
    remove: Storage.prototype.removeItem
  };
  const marker = '~lotto-lz1~';
  const rawGet = key => {
    const value = native.get.call(localStorage, key);
    return value?.startsWith(marker) && window.LZString
      ? window.LZString.decompressFromUTF16(value.slice(marker.length)) : value;
  };
  const rawSet = (key, value) => {
    // 重複的歷史快照用無損壓縮保存，原本訪客備份保留原格式。
    const packed = window.LZString && /^(lotto-member:|lotto-cloud-baseline:|lotto-cloud-before-restore:)/.test(key)
      ? marker + window.LZString.compressToUTF16(String(value)) : value;
    native.set.call(localStorage, key, packed);
  };
  const ownerKey = 'lotto-cloud-active-owner';
  const owner = rawGet(ownerKey) || 'guest';
  const scoped = key => /^(lotto-memory-v1-(539|daily|mark6)|lotto-chain-patterns-v1-(539|daily|mark6)|lotto-manual-forecasts-v1|lotto-original-rank-archive-v1:local(?::view:(539|daily|mark6))?|lotto-nav-shortcuts-v1|lotto-evidence-font-v1)$/.test(key);
  const settings = key => /^539-open-lab-v1(?:-(daily|mark6))?$/.test(key);
  const address = (key, id = owner) => `lotto-member:${id}:${key}`;
  const read = (key, id = owner) => rawGet(id === 'guest' ? key : address(key, id));
  const changed = key => dispatchEvent(new CustomEvent('member-local-change', { detail: { key } }));

  Storage.prototype.getItem = function (key) {
    key = String(key);
    if (this !== localStorage) return native.get.call(this, key);
    if (scoped(key)) return read(key);
    const value = rawGet(key);
    if (settings(key) && owner !== 'guest' && value) {
      const config = read(key);
      return JSON.stringify({ ...JSON.parse(value), config: config ? JSON.parse(config) : {} });
    }
    return value;
  };
  Storage.prototype.setItem = function (key, value) {
    key = String(key);
    if (this !== localStorage) return native.set.call(this, key, value);
    if (scoped(key)) {
      rawSet(owner === 'guest' ? key : address(key), String(value));
      changed(key);
      return;
    }
    if (settings(key) && owner !== 'guest') {
      const incoming = JSON.parse(value);
      rawSet(address(key), JSON.stringify(incoming.config || {}));
      const previous = JSON.parse(rawGet(key) || '{}');
      // 共用歷史的原始 key 保留訪客設定，避免其他會員看到目前會員的條件。
      value = JSON.stringify({ ...incoming, config: previous.config || {} });
    }
    native.set.call(this, key, value);
    if (settings(key)) changed(key);
  };
  Storage.prototype.removeItem = function (key) {
    key = String(key);
    if (this === localStorage && scoped(key)) {
      native.remove.call(this, owner === 'guest' ? key : address(key));
      changed(key);
      return;
    }
    native.remove.call(this, key);
  };

  const keys = [
    ...['539', 'daily', 'mark6'].flatMap(game => [`lotto-memory-v1-${game}`, `lotto-chain-patterns-v1-${game}`]),
    'lotto-manual-forecasts-v1', 'lotto-original-rank-archive-v1:local',
    'lotto-nav-shortcuts-v1', 'lotto-evidence-font-v1',
    '539-open-lab-v1', '539-open-lab-v1-daily', '539-open-lab-v1-mark6'
  ];
  function capture(id = owner) {
    const entries = {};
    for (const key of keys) {
      const value = read(key, id);
      if (!value) continue;
      const data = JSON.parse(value);
      entries[key] = settings(key) && id === 'guest' ? data.config || {} : data;
    }
    return { schema: 'lotto-member-backup/1', entries };
  }
  function apply(data, id = owner) {
    // 完整寫入前保留可匯出的本機副本。
    rawSet(`lotto-cloud-before-restore:${id}`, JSON.stringify(capture(id)));
    for (const [key, value] of Object.entries(data.entries)) {
      if (!keys.includes(key)) throw Error('備份包含不支援的儲存欄位');
      rawSet(id === 'guest' ? key : address(key, id), JSON.stringify(value));
    }
  }
  function hasResearch(data) {
    return Object.entries(data.entries).some(([key, value]) =>
      key.includes('manual-forecasts') ? value.records?.length :
      key.includes('rank-archive') ? value.versions?.length : value.rules?.length);
  }
  window.MemberStorage = { owner, capture, apply, hasResearch, rawGet, rawSet,
    setOwner: id => rawSet(ownerKey, id || 'guest') };
})();
