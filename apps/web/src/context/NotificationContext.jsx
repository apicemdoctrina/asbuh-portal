import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext.jsx";
import { api, getAccessToken, setAccessToken } from "../lib/api.js";

const API_BASE = import.meta.env.VITE_API_URL || "";

function playChime() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    // Two-note chime: A5 → C#6
    [
      [880, 0],
      [1108, 0.12],
    ].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.5);
    });

    setTimeout(() => ctx.close(), 1000);
  } catch {
    // AudioContext unavailable (e.g. automated tests) — ignore
  }
}

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const esRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api("/api/notifications?limit=30");
      if (res.ok) setNotifications(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const addToast = useCallback((notif) => {
    const toastId = `${notif.id}-${Date.now()}`;
    setToasts((prev) => [...prev, { ...notif, toastId }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
    }, 5000);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || !user) return;
    const token = getAccessToken();
    if (!token) return;

    const es = new EventSource(
      `${API_BASE}/api/notifications/stream?token=${encodeURIComponent(token)}`,
    );
    esRef.current = es;

    es.addEventListener("notification", (e) => {
      const notif = JSON.parse(e.data);
      setNotifications((prev) => [notif, ...prev]);
      addToast(notif);
      playChime();
    });

    es.onerror = async () => {
      es.close();
      if (!mountedRef.current) return;
      // Try to refresh token before reconnecting
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);
        }
      } catch {
        // ignore
      }
      reconnectTimerRef.current = setTimeout(connect, 5000);
    };
  }, [user, addToast]);

  useEffect(() => {
    mountedRef.current = true;
    if (!user) return;

    loadHistory();
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      esRef.current?.close();
    };
  }, [user, connect, loadHistory]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function markRead(id) {
    await api(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
  }

  async function markAllRead() {
    await api("/api/notifications/read-all", { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
  }

  function dismissToast(toastId) {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, markRead, markAllRead, toasts, dismissToast }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
