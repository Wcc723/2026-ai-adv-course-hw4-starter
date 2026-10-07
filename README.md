# 花卉電商網站｜第四場作業起始儲存庫

Node.js + Express + SQLite + EJS + Tailwind CSS 全端電商專案，為第三場結束後的範例專案，另外加上第四場作業所需的素材。專案介紹與完整文件請見 [docs/README.md](./docs/README.md)。

## 第四場作業前置準備

### 1. 用 Template 建立自己的儲存庫

1. 在本儲存庫頁面點選 **Use this template** → **Create a new repository**
2. **勾選「Include all branches」**，確保 `hw4-review-target` 分支一併帶入
3. 之後所有的 PR、Issue、標籤與 Loop 都在你自己的儲存庫中進行，不要對本儲存庫開 PR 或 Issue

建立完成後，確認分支有帶進來：

```bash
git clone <你的儲存庫網址>
cd <專案資料夾>
git branch -a   # 應看到 remotes/origin/hw4-review-target
```

### 2. 安裝並登入 GitHub CLI

| 環境 | 安裝方式 |
|------|----------|
| macOS | `brew install gh` |
| Windows（PowerShell） | `winget install --id GitHub.cli` |
| Windows（WSL2）／Linux | 依 [官方安裝說明](https://github.com/cli/cli/blob/trunk/docs/install_linux.md) 安裝 |

```bash
gh auth login        # 依提示登入 GitHub
gh issue list        # 在專案資料夾中執行，沒有錯誤即代表設定完成
```

Windows 同學請在實際要使用的終端機環境（PowerShell 或 WSL2）中完成安裝與登入。

### 3. 安裝與啟動專案

```bash
npm install
cp .env.example .env    # 至少設定 JWT_SECRET
npm run start           # http://localhost:3001
```

## 第四場作業素材

| 位置 | 用途 |
|------|------|
| `hw4-review-target` 分支 | 挑戰一的 Review 目標。執行 `npm run hw4:review-pr` 開 PR 到 `main`（Template 不保留分支歷史，無法直接從此分支開 PR） |
| `tests/acceptance/` | 3 個 Issue 的驗收測試（**不得修改**） |

3 個 Issue 的內容請見第四場作業說明的附錄，依 Issue Template 的欄位貼到你自己儲存庫的 GitHub Issue。

## 測試指令

| 指令 | 說明 |
|------|------|
| `npm run test:unit` | Unit／API 測試 |
| `npm run test:integration` | 結帳、DB、庫存、回滾與綠界整合測試 |
| `npm run test:acceptance` | 3 個 Issue 的驗收測試（在 `main` 上預期失敗，完成 Issue 後才會通過） |
| `npm run test:acceptance -- coupon` | 只執行指定檔名的驗收測試（`coupon`、`cancel-order`、`order-filter`） |

GitHub Actions（`.github/workflows/test.yml`）只執行 `test:unit` 與 `test:integration`，不執行驗收測試與 E2E。
