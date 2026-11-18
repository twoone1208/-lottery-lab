// 此檔只存公開連線資料。LINE Channel Secret 請填在 Supabase 管理後台。
window.LOTTO_CLOUD_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://ehvwtmrbgnyjilsvxxlm.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_ShYGBofpDHuKxl72-3S_jw_ZMk1meLx',
  LINE_PROVIDER: 'custom:line-web',
  LINE_READY: true, // 完成 Supabase 自訂 LINE 提供者設定後改成 true。
  AUTH_STORAGE_KEY: 'lab3-internal-auth'
});
