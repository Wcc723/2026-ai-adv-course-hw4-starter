const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// The converter fills examples with Math.random values and its faker keeps a
// reference from load time, so seed Math.random before requiring it. The same
// openapi.json then always produces the same collection (no noisy diffs in PRs).
function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = seededRandom(20260407);

const Converter = require('openapi-to-postmanv2');

const projectRoot = path.resolve(__dirname, '..');
const openapiPath = path.join(projectRoot, 'openapi.json');
const outputPath = path.join(projectRoot, 'postman_collection.json');

function stableId(...parts) {
  const hex = crypto.createHash('sha1').update(parts.join('\u0000')).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Replace the converter's random UUIDs with ids derived from each node's position
function assignStableIds(collection) {
  collection.info._postman_id = stableId('collection', collection.info.name || '');
  function visit(node, trail) {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') {
        visit(value, `${trail}/${key}`);
      }
    }
    if (typeof node.id === 'string') {
      node.id = stableId(trail, node.name || node.key || '');
    }
  }
  visit(collection, '');
}

function convertOpenApi(spec) {
  return new Promise((resolve, reject) => {
    Converter.convert(
      { type: 'json', data: spec },
      {
        folderStrategy: 'Tags',
        requestParametersResolution: 'Example',
        includeAuthInfoInExample: true,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result.result) return reject(new Error(result.reason || 'OpenAPI 轉換失敗'));
        resolve(result.output[0].data);
      }
    );
  });
}

function operationKey(method, pathName) {
  return `${method.toUpperCase()} ${pathName}`;
}

function postmanPathToOpenApi(url) {
  const parts = Array.isArray(url.path) ? url.path : [];
  return '/' + parts.map((part) => String(part).replace(/^:(.+)$/, '{$1}')).join('/');
}

function buildOperationMap(spec) {
  const operations = new Map();
  for (const [pathName, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
      if (pathItem[method]) {
        operations.set(operationKey(method, pathName), pathItem[method]);
      }
    }
  }
  return operations;
}

function upsertHeader(request, key, value) {
  request.header = request.header || [];
  const existing = request.header.find((header) => header.key.toLowerCase() === key.toLowerCase());
  if (existing) {
    existing.value = value;
    existing.disabled = false;
  } else {
    request.header.push({ key, value, type: 'text' });
  }
}

function setCollectionVariables(collection) {
  collection.variable = [
    { key: 'baseUrl', value: 'http://localhost:3001', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'sessionId', value: '', type: 'string' },
  ];
}

function normalizeRequestUrl(request) {
  if (!request.url || typeof request.url === 'string') return;

  request.url.host = ['{{baseUrl}}'];
  const pathname = (request.url.path || []).join('/');
  const enabledQuery = (request.url.query || []).filter((query) => !query.disabled);
  const queryString = enabledQuery.length
    ? '?' + enabledQuery.map((query) => `${query.key}=${query.value || ''}`).join('&')
    : '';
  request.url.raw = `{{baseUrl}}/${pathname}${queryString}`;
}

function addLoginTokenScript(item) {
  item.event = (item.event || []).filter((event) => event.listen !== 'test');
  item.event.push({
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        "pm.test('登入成功並儲存 JWT', function () {",
        '  pm.response.to.have.status(200);',
        '  const body = pm.response.json();',
        "  pm.expect(body.data && body.data.token).to.be.a('string').and.not.empty;",
        "  pm.collectionVariables.set('token', body.data.token);",
        '});',
      ],
    },
  });
}

function customizeRequests(collection, spec) {
  const operationMap = buildOperationMap(spec);
  let loginFound = false;
  let bearerCount = 0;

  function visit(items) {
    for (const item of items || []) {
      if (item.item) {
        visit(item.item);
        continue;
      }
      if (!item.request) continue;

      const request = item.request;
      normalizeRequestUrl(request);
      const openApiPath = postmanPathToOpenApi(request.url);
      const key = operationKey(request.method, openApiPath);
      const operation = operationMap.get(key);
      if (!operation) {
        throw new Error(`無法對應 OpenAPI operation：${key}`);
      }

      const security = operation.security ?? spec.security ?? [];
      const requiresBearer = security.some((entry) => Object.hasOwn(entry, 'bearerAuth'));
      const supportsSession = security.some((entry) => Object.hasOwn(entry, 'sessionId'));

      if (requiresBearer) {
        request.auth = {
          type: 'bearer',
          bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
        };
        bearerCount += 1;
      } else {
        request.auth = { type: 'noauth' };
      }

      if (supportsSession) {
        upsertHeader(request, 'X-Session-Id', '{{sessionId}}');
      }

      if (key === 'POST /api/auth/login') {
        addLoginTokenScript(item);
        loginFound = true;
      }
    }
  }

  visit(collection.item);
  if (!loginFound) throw new Error('找不到登入 request，無法加入 JWT 儲存腳本');
  if (bearerCount === 0) throw new Error('找不到需要 Bearer Token 的 API');
}

function validateCollection(collection) {
  const variables = new Map((collection.variable || []).map((variable) => [variable.key, variable.value]));
  if (variables.get('baseUrl') !== 'http://localhost:3001') {
    throw new Error('Postman baseUrl 預設值不正確');
  }
  for (const key of ['token', 'sessionId']) {
    if (!variables.has(key)) throw new Error(`Postman Collection 缺少 ${key} 變數`);
  }

  let loginScriptFound = false;
  function visit(items) {
    for (const item of items || []) {
      if (item.item) {
        visit(item.item);
        continue;
      }
      if (!item.request) continue;
      const raw = item.request.url && item.request.url.raw;
      if (!raw || !raw.startsWith('{{baseUrl}}/')) {
        throw new Error(`Request 未使用 {{baseUrl}}：${item.name}`);
      }
      if (item.request.auth?.type === 'bearer') {
        const token = item.request.auth.bearer?.find((entry) => entry.key === 'token');
        if (token?.value !== '{{token}}') {
          throw new Error(`Bearer Token 設定不正確：${item.name}`);
        }
      }
      const scripts = (item.event || []).flatMap((event) => event.script?.exec || []);
      if (scripts.some((line) => line.includes("collectionVariables.set('token'"))) {
        loginScriptFound = true;
      }
    }
  }
  visit(collection.item);
  if (!loginScriptFound) throw new Error('Postman Collection 缺少登入後 JWT 儲存腳本');
}

async function main() {
  const spec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
  const collection = await convertOpenApi(spec);
  setCollectionVariables(collection);
  customizeRequests(collection, spec);
  assignStableIds(collection);
  validateCollection(collection);

  fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2) + '\n');
  const generated = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  validateCollection(generated);
  console.log(`postman_collection.json generated successfully (${generated.item.length} folders)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
