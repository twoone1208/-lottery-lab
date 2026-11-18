# 統計學人生 LINE 登入與雲端同步

## 本次交付與設定順序

- `index.html` 沿用 GitHub 正式主站，只加入會員區及同步模組載入。
- 將本次網站檔案放在既有儲存庫根目錄，保留原本的其他 JS、JSON、圖示與 3.0 入口。
- 在原專案 `ehvwtmrbgnyjilsvxxlm` 的 SQL Editor 執行 `supabase_setup.sql` 一次。SQL 在交易中執行，遇到既有同名 policy/function 等衝突會整筆停止，先核對後再繼續。
- 此次提供 SQL 檔供管理員執行，正式資料庫尚未套用此 migration。
- `config.js` 已沿用 3.0 公開 URL 與 publishable key。`SUPABASE_ANON_KEY` 是相容的設定名稱，值可以使用公開 publishable key 或舊版 anon key。
- `AUTH_STORAGE_KEY` 沿用 `lab3-internal-auth`，同一網域的舊 Email 會員可沿用既有登入。

## LINE Developers

- 建立或使用既有 LINE Login channel，啟用 Web app。
- 在 Supabase 的 Authentication → Sign In / Providers → Custom Providers 建立 OIDC 提供者。
- Identifier 填 `custom:line`，Name 填 `LINE`，Issuer 填 `https://access.line.me`，Scopes 使用 `openid profile`。
- Client ID 使用 LINE Channel ID，Client Secret 使用 LINE Channel Secret。Secret 僅填在 Supabase 後台。
- LINE 不一定提供 Email，請在自訂提供者設定啟用 `email_optional`。若需 Email，先向 LINE 申請 Email 權限，再加入 email scope。
- 從 Supabase 建立提供者表單複製完整的 read-only Callback URL，貼到 LINE Developers → LINE Login → Callback URL。依表單顯示的值逐字填入，不自行猜測自訂提供者的 callback 路徑。
- 將 channel 發布為可供一般使用者登入的狀態；開發中的 channel 僅限已授權測試者。
- Supabase 官方自訂 OAuth 提供者必須使用 `custom:` 前綴，因此程式使用 `signInWithOAuth({provider:'custom:line'})`。原需求的 `provider:'line'` 不是目前文件中的內建提供者。

## Supabase 回站設定

- Site URL 使用 `https://twoone1208.github.io/-lottery-lab/`。
- Redirect URLs 加入 `https://twoone1208.github.io/-lottery-lab/auth-callback.html`，並保留既有 Email 驗證／密碼重設回站網址。
- CDN 使用固定 v2 版本 `@supabase/supabase-js@2.118.0`。
- `auth-callback.html` 會先完成 Supabase 登入，再回主站，避免主站 `#home` 路由先移除 OAuth 回傳資料。
- 瀏覽器端只有公開 URL／key。Channel Secret、service_role 或 Supabase secret key 均不可填入 config.js、HTML 或提交到 GitHub。

## 舊 Email 帳號綁定 LINE

- 先以原本 Email 帳號登入 3.0，再開啟新版主站。
- 點選會員資訊中的「綁定 LINE」，沿用同一個 auth.users.id。
- Supabase Authentication 設定需啟用 Manual identity linking。
- 已有另一個 LINE 帳號身分綁定到其他 Supabase 使用者時，由管理員確認帳號歸屬後處理；前端會顯示 Supabase 錯誤，不按名稱自動合併兩個會員。
- 首次直接 LINE 登入會建立新的會員身分，請既有會員先執行綁定步驟。

## 同步內容與使用方式

- 同步三彩種的已記住版路、A→B 規則、追蹤事件、手動儲存預測／核驗、舊推薦版本及計算條件。
- 雲端只備份個人研究與設定，開獎歷史繼續使用中央資料。
- 訪客模式保留原本 LocalStorage。登入後以會員 ID 分開本機儲存，登出回訪客資料。
- 首次登入且已有本機研究時，主動詢問是否合併；取消後同步暫停，可按「重新同步」重新決定。
- 雲端有備份、本機沒有研究時會自動還原，並重新載入頁面讓既有工具讀取。
- 本機資料修改後約 900ms 背景同步，失敗保留本機並顯示錯誤，可按「重新同步」。離線時繼續本機運算，網路恢復後重試。
- 開啟網頁／回到頁面時檢查雲端；遠端有新增紀錄時顯示「載入最新資料」，按下後保存合併結果並重載。
- 兩台同時寫入以 revision 檢查。不同 ID 的新增紀錄合併，相同欄位同時被不同修改時提示衝突，請先匯出兩台備份。
- 頁面關閉前尚未完成的同步以本機副本保留，請確認「已同步」後再關閉。
- 此備份服務只做個人保存，不會自動把私人公式送入公司研究庫；既有研究授權流程仍在 3.0 內。

## VIP 與資料權限

- profiles 自動建立 tier=`free`，會員只能更新 display_name、avatar_url。
- `tier`、`vip_expire_at` 由 SQL Editor 或可信任後端管理。付款尚未開啟。
- 到期的 VIP 顯示一般會員。未設定到期日的 VIP 視為持續有效。
- VIP 欄位目前用於會員資訊與未來權限擴充。若未來需要保護 VIP 工具或公司私有資料，須在對應後端 RPC／RLS 再驗證權限。
- backups 和 profiles 只能透過 auth.uid() 存取自己的資料，備份 RPC 使用 security invoker，繼續受 RLS 約束。
- 公開 JS 的計算工具仍可在訪客模式執行。

## 驗收與回退

- 執行 `node tests.mjs` 驗證雙裝置合併、衝突、離線保留、帳號隔離及 VIP 到期。
- 測試專案先套用 migration 並建立兩個測試會員，再執行 `test_rls.sql`，檢查所有權、VIP 欄位禁止更新及同步衝突。此測試以交易 rollback 結束。
- 舊帳號登入主站後，新增一條版路及一筆預測，確認「已同步」，再以相同帳號登入手機查驗。
- 以兩個不同會員測試讀取、更新及偽造 user_id，另一人的資料應讀不到，寫入應失敗。
- 用 authenticated REST 更新 tier / vip_expire_at 應收到權限錯誤。
- LINE provider、SQL migration 與真實兩端登入完成後，才能驗收完整 OAuth 與跨裝置流程。
- 回退時使用 Git 還原此次 index.html 的三個腳本與一個樣式載入；保留本機 namespace 及 user_backups，不刪資料。重新上線相同模組後可繼續讀取。
- 3.0 以 iframe 所建立、帶 user ID 的舊推薦封存，及資料庫裡的公司候選研究庫，目前保留原入口；這份套件同步主站所使用的版路與預測資料。

## 官方文件

- Supabase 自訂提供者 https://supabase.com/docs/guides/auth/custom-oauth-providers
- Supabase 身分綁定 https://supabase.com/docs/guides/auth/auth-identity-linking
- Supabase RLS https://supabase.com/docs/guides/database/postgres/row-level-security
- LINE Login https://developers.line.biz/en/docs/line-login/integrate-line-login/
