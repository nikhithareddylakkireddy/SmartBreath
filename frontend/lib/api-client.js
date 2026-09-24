const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

function authHeaders(user) {
  const headers = { 'Content-Type': 'application/json' };
  if (user?.accessToken) headers.Authorization = `Bearer ${user.accessToken}`;
  if (user && !user.accessToken) headers['x-local-user'] = JSON.stringify(user);
  return headers;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || `Request failed with status ${response.status}`); error.status = response.status; throw error; }
  return body;
}

export const apiClient = {
  dashboard: (user) => request('/api/dashboard', { headers: authHeaders(user) }),
  recommendations: (user) => request('/api/recommendations', { headers: authHeaders(user) }),
  alerts: (schoolId, user) => request(`/api/schools/${schoolId}/alerts`, { headers: authHeaders(user) }),
  readings: (schoolId, user) => request(`/api/schools/${schoolId}/readings`, { headers: authHeaders(user) }),
  predictions: (schoolId, user) => request(`/api/schools/${schoolId}/predictions`, { headers: authHeaders(user) }),
  audit: (schoolId, user) => request(`/api/schools/${schoolId}/audit`, { headers: authHeaders(user) }),
  contacts: (schoolId, user) => request(`/api/schools/${schoolId}/contacts`, { headers: authHeaders(user) }),
  acknowledge: (schoolId, alertId, user) => request(`/api/schools/${schoolId}/alerts/${alertId}/acknowledge`, { method: 'POST', headers: authHeaders(user), body: '{}' }),
  demo: (schoolId, user) => request(`/api/schools/${schoolId}/demo/severe-pm25`, { method: 'POST', headers: authHeaders(user), body: '{}' })
};

export { authHeaders, request };
