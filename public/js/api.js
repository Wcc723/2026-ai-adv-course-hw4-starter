// Login/register return 401 for wrong credentials; let the page show the error instead of redirecting
const CREDENTIAL_ENDPOINTS = ['/api/auth/login', '/api/auth/register'];

async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...Auth.getAuthHeaders(),
    ...options.headers
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && !CREDENTIAL_ENDPOINTS.includes(url)) {
    localStorage.removeItem(Auth.TOKEN_KEY);
    localStorage.removeItem(Auth.USER_KEY);
    window.location.href = '/login';
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    throw { status: res.status, data };
  }

  return data;
}

// SQLite datetime('now') is stored in UTC without a timezone suffix ("YYYY-MM-DD HH:MM:SS")
function formatDate(value) {
  if (!value) return '';
  return new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('zh-TW');
}
