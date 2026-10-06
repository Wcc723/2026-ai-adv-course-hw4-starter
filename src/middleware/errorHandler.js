const SAFE_MESSAGES = {
  400: '請求格式錯誤',
  401: '未授權的請求',
  403: '禁止存取',
  404: '找不到該資源',
  409: '資源衝突',
  422: '無法處理的請求',
  429: '請求過於頻繁'
};

const ERROR_CODES = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT'
};

function errorHandler(err, req, res, _next) {
  console.error('Unhandled error:', err.message);

  const statusCode = err.status || err.statusCode || 500;
  const isServerError = statusCode >= 500;

  // Use safe messages to avoid leaking internal details
  const message = isServerError
    ? '伺服器內部錯誤'
    : (err.isOperational ? err.message : (SAFE_MESSAGES[statusCode] || '請求處理失敗'));

  // e.g. malformed JSON body (400) → VALIDATION_ERROR instead of INTERNAL_ERROR
  const error = isServerError
    ? 'INTERNAL_ERROR'
    : (ERROR_CODES[statusCode] || 'VALIDATION_ERROR');

  res.status(statusCode).json({
    data: null,
    error,
    message
  });
}

module.exports = errorHandler;
