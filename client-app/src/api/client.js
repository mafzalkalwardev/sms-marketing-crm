const API_BASE =
  import.meta.env.VITE_API_URL ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) ||
  'https://signalmint-api.vercel.app';

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (response.status === 401) {
    if (unauthorizedHandler) unauthorizedHandler();
    throw new Error('Session expired. Please log in again.');
  }
  if (!response.ok) throw new Error(data.error || data.details || 'Request failed');
  return data;
}

export { API_BASE };
