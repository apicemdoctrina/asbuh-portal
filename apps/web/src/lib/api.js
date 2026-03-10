const API_BASE = import.meta.env.VITE_API_URL || "";

let accessToken = null;

// Mutex: only one refresh request at a time to prevent token rotation race conditions
let refreshPromise = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

async function doRefresh() {
  const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (refreshRes.ok) {
    const data = await refreshRes.json();
    accessToken = data.accessToken;
    return true;
  }
  accessToken = null;
  return false;
}

/** Ensure only one refresh runs at a time; concurrent callers share the same promise. */
function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...options.headers,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res = await fetch(url, { ...options, headers, credentials: "include" });

  // If 401 and not already a refresh/login request, try refresh
  if (
    res.status === 401 &&
    !path.includes("/api/auth/refresh") &&
    !path.includes("/api/auth/login")
  ) {
    const ok = await refreshOnce();

    if (ok) {
      headers.Authorization = `Bearer ${accessToken}`;
      res = await fetch(url, { ...options, headers, credentials: "include" });
    }
  }

  return res;
}
