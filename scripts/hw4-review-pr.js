// 建立第四場挑戰一的 Review 目標 PR：npm run hw4:review-pr
//
// 用 Template 建立的儲存庫，hw4-review-target 與 main 沒有共同歷史，GitHub 無法直接開 PR。
// 這支指令把 hw4-review-target 的變更套用到以 main 為基礎的新分支 hw4-review，再開 PR 到 main。
const { execFileSync } = require('child_process');

const SOURCE = 'origin/hw4-review-target';
const BRANCH = 'hw4-review';
const TITLE = 'refactor: 整理訂單、付款與購物車驗證模組';
const BODY = [
  '- 抽出 src/services/orderService.js，集中訂單查詢、序列化與建單 transaction',
  '- 抽出 src/services/paymentService.js，統一 QueryTradeInfo 結果判斷與付款狀態更新',
  '- 新增 src/utils/validators.js 統一輸入驗證；Shipping 模組改以規則表描述，單元測試改為 table-driven',
  '',
  'API 路徑、請求與回應格式皆未變更。'
].join('\n');

function run(command, args, { input, trim = true } = {}) {
  const output = execFileSync(command, args, {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit']
  });
  return trim ? output.trim() : output;
}

function tryRun(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function main() {
  if (run('git', ['status', '--porcelain'])) {
    fail('工作目錄有尚未 commit 的變更，請先 commit 或 stash 後再執行。');
  }

  run('git', ['fetch', 'origin']);

  if (tryRun('git', ['rev-parse', '--verify', '--quiet', SOURCE]) === null) {
    fail(`找不到 ${SOURCE}。用 Template 建立儲存庫時，請勾選「Include all branches」。`);
  }
  if (tryRun('git', ['rev-parse', '--verify', '--quiet', BRANCH]) !== null
    || tryRun('git', ['ls-remote', '--exit-code', '--heads', 'origin', BRANCH]) !== null) {
    fail(`分支 ${BRANCH} 已存在，Review PR 應該已經建立過了（可用 gh pr list 查看）。`);
  }

  // Shared history: diff from the merge base. Template copies have none, so use
  // main's first commit, which is the template snapshot of main.
  const base = tryRun('git', ['merge-base', 'origin/main', SOURCE])
    || run('git', ['rev-list', '--max-parents=0', 'origin/main']).split('\n').pop();
  const patch = run('git', ['diff', '--binary', base, SOURCE], { trim: false });
  if (!patch.trim()) {
    fail(`${SOURCE} 與 main 沒有差異，無法建立 Review PR。`);
  }

  const originalBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

  run('git', ['switch', '-c', BRANCH, 'origin/main']);
  run('git', ['apply', '--index', '--3way'], { input: patch });
  run('git', ['commit', '-m', TITLE, '-m', BODY]);
  run('git', ['push', '-u', 'origin', BRANCH]);
  const url = run('gh', ['pr', 'create', '--base', 'main', '--head', BRANCH, '--title', TITLE, '--body', BODY]);
  run('git', ['switch', originalBranch]);

  console.log(`\n✔ 已建立 Review PR：${url}`);
}

main();
