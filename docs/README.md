# 花卉電商網站（backend-project）

花卉電商全端應用，提供前台商品瀏覽、購物車、配送費用計算、訂單管理，以及後台商品與訂單管理功能。支援訪客購物車（X-Session-Id）與會員登入（JWT）雙模式。

## 技術棧

| 分類 | 技術 | 版本 |
|------|------|------|
| 執行環境 | Node.js | 22 以上（CI 使用 24） |
| Web 框架 | Express | ^4.22.3 |
| 資料庫 | SQLite（better-sqlite3） | ^12.8.0 |
| 模板引擎 | EJS | ^5.0.1 |
| CSS 框架 | Tailwind CSS | ^4.2.2 |
| 認證 | JSON Web Token（jsonwebtoken） | ^9.0.2 |
| 密碼雜湊 | bcrypt | ^6.0.0 |
| ID 生成 | uuid（v4） | ^11.1.0 |
| CORS | cors | ^2.8.5 |
| 環境變數 | dotenv | ^16.4.7 |
| API 文件 | swagger-jsdoc（devDependency） | ^6.3.0 |
| 測試框架 | Vitest | ^2.1.9 |
| HTTP 測試 | supertest | ^7.2.2 |
| E2E 測試 | Playwright | ^1.62.1 |
| API Collection | openapi-to-postmanv2 | ^6.3.3 |

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env
# 編輯 .env，至少設定 JWT_SECRET

# 3. 啟動伺服器（含 CSS 編譯）
npm run start
# 伺服器預設在 http://localhost:3001

# 4. 開發模式（分別啟動）
npm run dev:server   # 啟動 Express 伺服器
npm run dev:css      # Tailwind CSS watch 模式

# 5. 執行 Unit Test
npm run test:unit

# 6. 執行完整結帳 Integration Test
npm run test:integration

# 7. 生成 OpenAPI 文件
npm run openapi

# 8. 伺服器已於 3001 啟動時，執行真實付款 E2E
npm run test:e2e

# 9. 重生 OpenAPI 與 Postman Collection
npm run postman
```

### 預設帳號

| 角色 | Email | 密碼 |
|------|-------|------|
| 管理員 | admin@hexschool.com | 12345678 |

管理員帳號在伺服器首次啟動時自動建立（可透過 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 環境變數自訂）。

## 配送費用

- 宅配基本運費 120 元；超商取貨 60 元。
- 商品小計滿 1,500 元免基本運費。
- 偏遠地區加收 200 元；當日急件加收 250 元。
- 滿額免運不免除附加費。建立訂單時由伺服器端 `src/utils/shipping.js` 統一重算。

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm run start` | 編譯 CSS + 啟動伺服器 |
| `npm run dev:server` | 僅啟動伺服器 |
| `npm run dev:css` | Tailwind CSS watch 模式 |
| `npm run css:build` | 編譯並壓縮 CSS |
| `npm run test` | 同 `npm run test:unit` |
| `npm run test:unit` | 執行單元與 API 測試（51 項） |
| `npm run test:integration` | 執行結帳、DB、庫存、回滾與綠界整合測試（10 項） |
| `npm run test:e2e` | 對已啟動的 3001 服務執行綠界網路 ATM 實測（1 項） |
| `npm run test:acceptance` | 第四場 3 個 Issue 的驗收測試；可加檔名篩選，如 `npm run test:acceptance -- coupon` |
| `npm run openapi` | 生成 openapi.json |
| `npm run postman` | 重生 openapi.json 與 postman_collection.json |

Vitest 與 Integration Test 皆使用記憶體 SQLite，不會修改專案根目錄的 `database.sqlite`。Integration Test 中的綠界回應使用 mock。Playwright E2E 則刻意操作已啟動的開發環境、實際寫入訂單及扣庫存，並連接綠界 staging；測試不會自行啟動伺服器。

## 持續整合（CI）

`.github/workflows/test.yml` 於每次 push、pull request 及手動觸發時，執行 `npm ci`、`npm run test:unit` 與 `npm run test:integration`。E2E 需要已啟動的服務與綠界 staging，驗收測試在 Issue 完成前預期失敗，兩者都不在 CI 執行。

若儲存庫的 **Actions** 分頁顯示 workflow 未啟用，請先手動啟用。

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架構、目錄結構、資料流 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、計畫歸檔流程 |
| [FEATURES.md](./FEATURES.md) | 功能列表與完成狀態（含行為描述） |
| [TESTING.md](./TESTING.md) | 測試規範與指南 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
| [plans/](./plans/) | 開發計畫目錄 |
| [plans/archive/](./plans/archive/) | 已完成計畫歸檔 |
