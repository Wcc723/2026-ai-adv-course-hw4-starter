# 測試規範與指南

## 測試工具

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev/) | 單元測試、API 測試與 Integration Test 執行器 |
| [Supertest](https://github.com/ladjs/supertest) | 直接對 Express app 發送 HTTP 請求 |
| better-sqlite3 | 使用同一測試 DB connection 驗證持久化、庫存與 transaction |
| [Playwright](https://playwright.dev/) | 操作真實 Chrome，驗證本站 UI 與綠界 staging 付款 |
| openapi-to-postmanv2 | 將 OpenAPI 3 文件轉換為 Postman Collection 2.1 |

## 執行指令

```bash
# 單元與 API 測試（7 個檔案、55 項測試）
npm run test:unit

# 結帳、訂單、DB、庫存、回滾與綠界整合測試（10 項測試）
npm run test:integration

# 已另行啟動 http://localhost:3001 後，執行真實付款 E2E
npm run test:e2e

# 重生 openapi.json，並產生 postman_collection.json（不進版控）
npm run postman
```

Integration Test 不呼叫真實綠界 API，無需外部網路。

## 驗收測試（Acceptance Test）

`tests/acceptance/` 是第四場作業 3 個 Issue 的驗收測試，由助教提供，**不得修改**：

| 檔案 | 對應 Issue（規格見第四場作業說明附錄） |
|------|------------|
| `tests/acceptance/coupon.test.js` | Issue A：結帳優惠碼 |
| `tests/acceptance/cancel-order.test.js` | Issue B：取消未付款訂單並回補庫存 |
| `tests/acceptance/order-filter.test.js` | Issue C：我的訂單篩選與分頁 |

```bash
npm run test:acceptance                 # 全部
npm run test:acceptance -- coupon       # 只跑檔名包含 coupon 的測試
```

- 設定檔為 `vitest.acceptance.config.js`，同樣使用記憶體 SQLite。
- 只透過 HTTP API 驗證，不依賴內部函式名稱或資料表結構；每個測試自建會員與指定價格的商品。
- 在 Issue 完成前預期失敗，因此不包含在 `test:unit`、`test:integration` 與 CI 中。

## 持續整合（CI）

`.github/workflows/test.yml` 在 push、pull request 與手動觸發時，以 Node.js 24 執行：

1. `npm ci`
2. `npm run test:unit`
3. `npm run test:integration`

Playwright E2E 需要已啟動的服務並連接綠界 staging，**不在 CI 執行**，只在本機手動跑。新增測試時，請確保 Unit 與 Integration Test 不依賴外部網路，才能在 CI 穩定通過。

## Playwright E2E Test

主測試檔：`tests/e2e/ecpay-atm-payment.spec.js`

`playwright.config.js` 僅設定 `baseURL`，未設 `webServer`，因此 `npm run test:e2e` 只會使用當前已啟動的專案。`tests/e2e/global-setup.js` 會先探測服務，若 3001 未就緒則立即回報可讀錯誤，不會自行啟服務。

測試流程：

1. 以 `admin@hexschool.com` 登入，驗證 HTTP 200 及瀏覽器 JWT。
2. 清掉該帳號舊購物車，以 UI 選商品、加車、進結帳並填寫宅配資料。
3. 驗證建單 HTTP 201，從 `/ecpay/payment/:id` 導頁取得訂單 ID，並以 API 核對配送費與總額。
4. 於綠界 staging 選擇「網路 ATM」、「台灣土地銀行」、「前往付款」，關閉提示後在土地銀行測試頁按 `Save`。
5. 等待綠界付款成功，擷取 `ecpay-payment-success.png`；返回商店後斷言頁面「已付款」與 API `status: paid`，再擷取 `payment-return-success.png`。兩張均附加至 Playwright report。

E2E 預設使用本機 Google Chrome；可以 `E2E_BASE_URL`、`E2E_ADMIN_EMAIL`、`E2E_ADMIN_PASSWORD`、`PLAYWRIGHT_CHANNEL` 與 `PLAYWRIGHT_HEADLESS=false` 覆寫。此測試會寫入現行開發 SQLite、扣除一件商品庫存並留下已付款訂單。失敗時輸出 `test-results/`、trace、screenshot 與 video。

## Postman Collection

`postman_collection.json` 不進版控（已列入 `.gitignore`），需要用 Postman 測試 API 時再自行產生：

1. 執行 `npm run postman`，在專案根目錄產生 `postman_collection.json`。
2. 在 Postman 點選 **Import**，選擇該檔案匯入。
3. 先啟動伺服器（`npm run start`），再執行 **Auth › 登入**，JWT 會自動存入 `token` 變數，之後需要認證的 API 可直接送出。

路由 JSDoc 變更後，重新執行 `npm run postman` 並再匯入一次即可。

`npm run postman` 會先執行現有 `generate-openapi.js`，再由 `scripts/generate-postman.js` 產生 `postman_collection.json`。產物具備：

- `baseUrl` 預設 `http://localhost:3001`，並含 `token`、`sessionId` collection variables。
- 所有 request URL 使用 `{{baseUrl}}`。
- OpenAPI `bearerAuth` 端點自動使用 `Bearer {{token}}`。
- 購物車 API 帶 `X-Session-Id: {{sessionId}}`。
- 登入成功後自動將 `data.token` 寫入 collection variable。
- 產生後自動再驗 JSON、變數、URL、Bearer 與登入 script。

## 測試資料庫隔離

所有 Vitest 測試都由 `tests/setup/testEnvironment.js` 在載入 `app.js` 前設定：

```text
NODE_ENV=test
DATABASE_PATH=:memory:
JWT_SECRET=integration-test-secret
ECPAY_ENV=staging
```

`src/database.js` 依 `DATABASE_PATH` 選擇 SQLite：

- 開發/生產未設定：使用專案根目錄 `database.sqlite`。
- 自動測試：使用 `:memory:`，無實體檔案。

Integration Test 中有兩層防護：

1. 以 `PRAGMA database_list` 斷言主 DB 檔案路徑為空。
2. `tests/setup/integrationGlobalSetup.mjs` 於測試前後比對原 `database.sqlite` 之 SHA-256、大小與修改時間；任一值改變即使測試失敗。

## Vitest 設定

### `vitest.config.js`

用於 `npm run test:unit`：

- 載入記憶體 SQLite 測試環境。
- 排除 `tests/integration/**` 與 `tests/e2e/**`，避免 Vitest 載入 Playwright test API。
- 循序執行原有單元/API 測試。

### `vitest.integration.config.js`

用於 `npm run test:integration`：

- 僅收錄 `tests/integration/**/*.integration.test.js`。
- 載入記憶體 SQLite setup 與原 DB 雜湊守衛。
- 停用檔案平行執行，避免 fixture 相互影響。

## 原有測試檔案

| 檔案 | 範圍 |
|------|------|
| `tests/shipping.test.js` | Shipping 純函式、門檻與附加費 |
| `tests/auth.test.js` | 註冊、登入、重複 Email、個人資料、非字串欄位、JSON 格式錯誤 |
| `tests/products.test.js` | 商品列表、分頁、詳情與 404 |
| `tests/cart.test.js` | 訪客/會員購物車 CRUD、數量驗證、登入/註冊時合併訪客購物車（含庫存上限） |
| `tests/orders.test.js` | 建單、配送費、查詢與認證、模擬付款僅限測試環境 |
| `tests/adminProducts.test.js` | 後台商品 CRUD 與權限、刪除仍在購物車中的商品、名稱驗證 |
| `tests/adminOrders.test.js` | 後台訂單列表、詳情與篩選 |

`tests/setup.js` 提供 `app`、`request`、`getAdminToken()` 與 `registerUser()` 等共用輔助。

## Integration Test

主測試檔：`tests/integration/order-checkout.integration.test.js`

| 情境 | 主要斷言 |
|------|----------|
| 記憶體 DB | `PRAGMA database_list` 無實體檔案 |
| 前端入口 | `/cart`、`/checkout`、checkout.js 皆可取得，配送欄位存在 |
| 完整建單 | 註冊 → 取商品 → 加購物車 → 建立含配送資訊的訂單 |
| DB 持久化 | orders、order_items、收件/配送快照正確 |
| 金額 | 小計 1,400、運費 510、總額 1,910 |
| 庫存/購物車 | 庫存 10 → 8，建單後購物車清空 |
| 庫存不足 | 400 / `STOCK_INSUFFICIENT`，無訂單、無扣庫存、購物車保留 |
| transaction 回滾 | 臨時 SQLite trigger 使第二筆品項寫入失敗，驗證訂單/品項/庫存/購物車全數回滾 |
| ECPay AIO 表單 | staging action、MerchantTradeNo、TotalAmount、ItemName、URL 與 CheckMacValue |
| QueryTradeInfo | mock 已付（附有效 CheckMacValue）、未付、HTTP 錯誤；驗證 API 與 DB 狀態 |
| QueryTradeInfo 驗證 | 簽章遭竄改、金額不符的「已付」回應皆回 500，訂單維持 pending |

### 成功建單資料

測試 fixture：商品單價 700 元、庫存 10，購買 2 件，超商取貨 + 偏遠地區 + 當日急件。

```text
subtotal     = 700 × 2 = 1400
shipping_fee = 60 + 200 + 250 = 510
total_amount = 1400 + 510 = 1910
stock        = 10 - 2 = 8
```

## Fixture 與清理

`tests/integration/helpers.js` 於每個測試前後：

1. 移除臨時 rollback trigger。
2. 依 foreign key 順序清除 `order_items`、`orders`、`cart_items`、`products`、`users`。
3. 建立測試專屬商品；會員由註冊 API 建立。
4. `afterEach` 還原 fetch、console spy 等 Vitest mock。

不得依賴其他測試所建的資料。

## Integration Test 綠界規範

- AIO 表單以 `verifyCheckMacValue()` 重算簽章。
- QueryTradeInfo 必須使用 `vi.stubGlobal('fetch', ...)`，禁止真實外部請求。
- 模擬「已付款」回應須以 `generateCheckMacValue()` 簽章，並帶正確的 `MerchantTradeNo` 與 `TradeAmt`；成功回應應將訂單狀態設為 `paid`。
- 未付或查詢錯誤應保留 `pending`。

## 撰寫新 Integration Test

1. 將檔案置於 `tests/integration/`，命名為 `*.integration.test.js`。
2. 使用 `beforeEach(resetDatabase)` 及 `afterEach(resetDatabase)`。
3. 所有 fixture 價格、庫存與數量應為可預測整數。
4. API 斷言應包含 HTTP status 與 `{ data, error, message }`。
5. 重要寫入必須再以 SQL 查詢驗證，不僅比對 API response。
6. 禁止寫入專案 `database.sqlite`，禁止呼叫真實綠界 API。

## 注意事項

- Supertest 會為 Express app 建立臨時本機監聽埠，但不會執行 `server.js` 的長時間 `app.listen()`。
- Integration Test 之前端範圍為 EJS/靜態腳本 smoke test 與同等 HTTP 流程；真實瀏覽器 DOM、點擊及外部付款由 Playwright E2E 負責。
- Vitest 會設定 `NODE_ENV=test`，種子管理員與註冊 API 的 bcrypt rounds 皆為 1；`PATCH /api/orders/:id/pay` 也只在此環境開放。
