# CLAUDE.md

## 專案概述
花卉電商網站（backend-project） — Node.js + Express + SQLite + EJS + Tailwind CSS 全端電商平台

## 常用指令
```bash
npm run start              # 編譯 CSS 並啟動伺服器（http://localhost:3001）
npm run dev:server         # 僅啟動伺服器（不編譯 CSS）
npm run dev:css            # Tailwind CSS watch 模式
npm run css:build          # 編譯並壓縮 CSS
npm run test               # 同 test:unit
npm run test:unit          # 執行 Unit/API Test
npm run test:integration   # 執行結帳、DB、庫存、回滾與綠界 Integration Test
npm run test:e2e           # 連已啟動的 3001 服務，執行綠界 Playwright E2E
npm run test:acceptance    # 第四場 Issue 驗收測試；可加檔名：npm run test:acceptance -- coupon
npm run hw4:review-pr      # 第四場挑戰一：以 hw4-review-target 的變更開 Review PR
npm run openapi            # 從 JSDoc 生成 openapi.json
npm run postman            # 重生 OpenAPI 並產生 Postman Collection（不進版控）
```

## 關鍵規則
- 所有 API 回應統一格式：`{ data, error, message }`，錯誤時 `data: null`
- 購物車使用**雙模式認證**（dualAuth）：優先 JWT，fallback 到 `X-Session-Id`；建立訂單僅支援 JWT
- 訂單建立使用 `db.transaction()` 原子操作：建立訂單 → 寫入品項快照 → 扣庫存 → 清空購物車
- 資料庫為 SQLite（better-sqlite3 同步 API），WAL 模式，foreign keys 啟用
- 所有 Vitest 測試必須使用記憶體/獨立 SQLite，不得修改專案 `database.sqlite`
- Playwright E2E 僅使用已啟動服務，不得設定 `webServer`；此測試會寫入開發 DB 並連綠界 staging
- GitHub Actions CI（`.github/workflows/test.yml`）只跑 Unit 與 Integration Test，不跑 E2E
- 套件管理使用 npm（`package-lock.json`）
- 功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/

## 詳細文件
- ./docs/README.md — 項目介紹與快速開始
- ./docs/ARCHITECTURE.md — 架構、目錄結構、資料流
- ./docs/DEVELOPMENT.md — 開發規範、命名規則
- ./docs/FEATURES.md — 功能列表與完成狀態
- ./docs/TESTING.md — 測試規範與指南
- ./docs/CHANGELOG.md — 更新日誌
