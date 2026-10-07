# 更新日誌

所有重大變更皆記錄於此文件。格式參考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added
- `npm run hw4:review-pr`（`scripts/hw4-review-pr.js`）：以 `hw4-review-target` 的變更建立挑戰一的 Review PR。用 Template 建立的儲存庫不保留分支歷史，無法直接從該分支開 PR

### Changed
- `postman_collection.json` 不進版控（列入 `.gitignore`），需要時以 `npm run postman` 產生；路由變更後只需以 `npm run openapi` 同步 `openapi.json`。`docs/TESTING.md` 補上產生與匯入步驟
- `scripts/generate-postman.js` 產生結果固定，同一份 OpenAPI 重跑不再出現亂數差異

## [1.2.0] - 2026-10-06

### Added
- 第四場作業素材：`tests/acceptance/` 三份驗收測試（優惠碼、取消訂單、訂單篩選與分頁）、`vitest.acceptance.config.js` 與 `npm run test:acceptance`
- 根目錄 `README.md`：第四場作業前置準備（Use this template、GitHub CLI）

### Changed
- `test:unit` 排除 `tests/acceptance/`；驗收測試不加入 CI

## [1.1.1] - 2026-10-06

### Added
- 新增 GitHub Actions CI（`.github/workflows/test.yml`）：push、pull request 時執行 Unit 與 Integration Test，不執行 E2E
- 登入／註冊時若帶 `X-Session-Id`，將訪客購物車併入會員購物車（同商品數量相加、以庫存為上限），修正「訪客加入購物車 → 登入 → 結帳」時購物車變空
- 新增 10 項 Unit/API 測試與 1 項 Integration 測試，涵蓋本版修正

### Fixed
- 登入頁 `redirect` 參數只接受同源路徑，修正 open redirect 與 `javascript:` 造成的 XSS
- 導覽列使用者名稱改以 `textContent` 插入，不再經過 `innerHTML`
- 登入或註冊失敗（401）時不再被 `apiFetch` 導頁，錯誤訊息可正常顯示
- `POST /api/orders/:id/check-payment` 標記已付款前，驗證綠界回應的 CheckMacValue，並核對 `MerchantTradeNo` 與 `TradeAmt`；錯誤訊息不再夾帶內部錯誤細節
- 付款狀態更新加上 `status = 'pending'` 條件，確保狀態不可逆
- `PATCH /api/orders/:id/pay` 模擬付款僅在 `NODE_ENV=test` 開放，其他環境回 404
- 刪除仍在購物車中的商品時回 500：改為在 transaction 中先移除購物車品項
- `errorHandler` 依狀態碼回傳對應錯誤碼，JSON 格式錯誤改回 `VALIDATION_ERROR`，不再一律為 `INTERNAL_ERROR`
- 註冊、登入、建單、購物車、後台商品等 API 補上字串型別檢查；欄位傳入數字或物件時回 400，不再造成 500
- 購物車數量改為嚴格正整數驗證，`1.9`、`"3abc"`、`[5]` 不再被 `parseInt` 截斷後接受
- 後台新增商品拒絕全為空白的名稱，與編輯商品一致
- 註冊 API 的 bcrypt rounds 依規格於測試環境使用 1
- 訂單編號日期改採台北時間；前端訂單日期以 UTC 解析，修正台灣 00:00–08:00 下單顯示為前一天
- 購物車徽章改為重新查詢購物車品項數，修正重複加入同商品時數字與實際不符
- 文件修正：個人資料 API 的錯誤情境、check-payment 流程、OpenAPI 中 check-payment 的 400 說明與 `POST /api/cart` 的必填欄位

### Security
- Express 由 `~4.16.1` 升級至 `^4.22.3`，並以 `npm audit fix` 更新 `proxy-addr`、`uuid`、`brace-expansion`；`npm audit --omit=dev` 為 0
- `swagger-jsdoc` 僅供 `npm run openapi` 使用，移至 devDependencies

### Changed
- `CLAUDE.md` 與 `AGENTS.md` 內容同步：補齊 `test:unit`、`test:integration`、`test:e2e`、`postman` 指令與測試隔離、CI 規則
- `vitest.config.js` 移除無效的 `sequence.files` 設定；各測試檔使用獨立記憶體 SQLite，不依賴執行順序
- `.env.example` 補上 `NODE_ENV`、`PORT`，`FRONTEND_URL` 改為與本站同源的 `http://localhost:3001`
- 文件補充 Node.js 版本、CI 說明、目錄結構與已知限制（MerchantTradeNo 不可重複）

### Removed
- 移除 `pnpm-lock.yaml`，統一使用 npm（`package-lock.json`）
- 移除未使用的 `public/stylesheets/style.css`
- 清空 `docs/plans/archive/` 中的舊計畫

## [1.1.0] - 2026-08-17

### Added
- Playwright 綠界 E2E 於綠界付款成功後擷取 `ecpay-payment-success.png`；返回本站並驗證頁面「已付款」與 API `paid` 後，再擷取 `payment-return-success.png`。兩張均附加至 HTML report
- 新增 `npm run test:e2e` 與 Playwright 測試，對既有 3001 服務完成登入、購物車、配送結帳、綠界網路 ATM、土地銀行 Save、返店與 `paid` 雙重斷言
- 新增 `npm run postman`、`scripts/generate-postman.js` 及 `postman_collection.json`；登入自存 JWT，認證 API 自動使用 Bearer Token，並提供 `baseUrl` / `token` / `sessionId` 變數
- 新增 `npm run test:unit`，與 Integration/E2E/Postman 統一為明確的測試與產物指令
- 新增 `npm run test:integration`，以 Vitest + Supertest 驗證前端入口、建單 API、SQLite 寫入、運費、庫存、購物車、transaction rollback 與綠界付款流程
- 新增 `vitest.integration.config.js`、Integration Test fixture/reset helper 與 `database.sqlite` 雜湊守衛
- 新增 `src/utils/shipping.js` 獨立配送費用模組：宅配 120 元、超商 60 元、滿 1,500 元免基本運費、偏遠地區加收 200 元、當日急件加收 250 元
- 新增 `tests/shipping.test.js` Shipping 單元測試，覆蓋配送方式、免運邊界及附加費組合八種情境
- 訂單新增 `subtotal`、`shipping_fee`、`shipping_method`、`is_remote_area`、`is_express` 配送快照欄位
- 綠界 ECPay AIO 金流串接：結帳後導向綠界付款頁面完成真實付款流程
- 新增 `src/utils/ecpay.js` 工具模組：CheckMacValue 簽章產生/驗證、ECPay 專用 URL 編碼、QueryTradeInfo API 查詢
- 新增 `GET /ecpay/payment/:orderId` 頁面路由：產生自動送出的 ECPay 付款表單
- 新增 `POST /api/orders/:id/check-payment` API：透過 QueryTradeInfo API 主動查詢付款狀態（取代本地端無法接收的 Server Notify）
- 訂單新增 `merchant_trade_no` 欄位：對應綠界 MerchantTradeNo，由 order_no 去除連字號產生

### Changed
- `src/database.js` 支援 `DATABASE_PATH`；所有 Vitest 測試改用記憶體 SQLite，不再寫入專案 `database.sqlite`
- 綠界 QueryTradeInfo Integration Test 全數使用 mock fetch，測試不依賴外部網路
- `POST /api/orders` 新增配送條件驗證，由伺服器計算 `shipping_fee` 及 `total_amount = subtotal + shipping_fee`
- 結帳頁新增宅配/超商取貨、偏遠地區與當日急件選項；購物車及商品文案更新為滿 1,500 元免基本運費
- 訂單詳情與後台訂單詳情顯示商品小計、運費、配送條件與訂單總額
- 結帳頁面（checkout.js）：送出訂單後導向綠界付款頁面，不再直接跳轉訂單詳情
- 訂單詳情頁面（order-detail.ejs / order-detail.js）：原「付款成功/失敗」模擬按鈕改為「查詢付款狀態」與「前往付款」按鈕；從綠界導回時自動觸發付款狀態查詢

## [1.0.0] - 2026-04-12

### 新增
- 使用者註冊、登入、個人資料 API
- 商品列表與詳情 API（公開）
- 購物車 CRUD API（雙模式認證：JWT / X-Session-Id）
- 訂單建立、查詢、模擬付款 API
- 後台商品管理 API（CRUD）
- 後台訂單查詢 API（含狀態篩選）
- EJS 前台頁面（首頁、商品詳情、購物車、結帳、訂單）
- EJS 後台頁面（商品管理、訂單管理）
- SQLite 資料庫自動初始化與種子資料
- Vitest 測試套件（6 個測試檔案，循序執行）
- Swagger/OpenAPI 文件生成
- Tailwind CSS 樣式系統
- 專案文件結構建立
