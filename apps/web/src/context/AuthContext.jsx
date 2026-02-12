import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, setAccessToken, clearAccessToken } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await api("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
        clearAccessToken();
      }
    } catch {
      setUser(null);
      clearAccessToken();
    }
  }, []);

  // On mount: try to restore session via refresh cookie
  useEffect(() => {
    async function restore() {
      try {
        const refreshRes = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAccessToken(data.accessToken);
          await fetchMe();
        }
      } catch {
        // No valid session
      } finally {
        setLoading(false);
      }
    }
    restore();
  }, [fetchMe]);

  async function login(email, password) {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Login failed");
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
    // Fetch full profile (with permissions and organizations)
    await fetchMe();
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors
    }
    clearAccessToken();
    setUser(null);
  }

  function hasPermission(entity, action) {
    return user?.permissions?.some((p) => p.entity === entity && p.action === action) ?? false;
  }

  function hasRole(roleName) {
    return user?.roles?.includes(roleName) ?? false;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
