const API_BASE = import.meta.env.VITE_API_URL || "";

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
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
    const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      accessToken = data.accessToken;
      headers.Authorization = `Bearer ${accessToken}`;
      res = await fetch(url, { ...options, headers, credentials: "include" });
    } else {
      accessToken = null;
    }
  }

  return res;
}
