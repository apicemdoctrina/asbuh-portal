import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, setSession } = useAuth();

  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  // Registration form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const autoAccepted = useRef(false);

  // 1. Validate token on mount
  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/auth/invite-info/${token}`,
        );
        if (!res.ok) throw new Error("Ошибка проверки приглашения");
        const data = await res.json();
        setInviteInfo(data);
      } catch {
        setInviteInfo({ valid: false, reason: "Ошибка проверки приглашения" });
      } finally {
        setLoading(false);
      }
    }
    validate();
  }, [token]);

  // 2. Auto-accept if user just logged in (fromLogin redirect)
  useEffect(() => {
    if (
      authLoading ||
      loading ||
      !user ||
      !inviteInfo?.valid ||
      autoAccepted.current ||
      !location.state?.fromLogin
    )
      return;

    autoAccepted.current = true;
    acceptInvite();
  }, [authLoading, loading, user, inviteInfo]);

  async function acceptInvite() {
    setAccepting(true);
    setError("");
    try {
      const res = await api("/api/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ inviteToken: token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка принятия приглашения");
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
      setAccepting(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setFormError("");
    if (!firstName.trim() || !lastName.trim()) {
      setFormError("Имя и фамилия обязательны");
      return;
    }
    if (password.length < 8) {
      setFormError("Пароль должен быть не менее 8 символов");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          inviteToken: token,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка регистрации");
      await setSession(data.accessToken);
      navigate("/", { replace: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Loading states
  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <p className="text-subtle text-sm">Загрузка...</p>
      </div>
    );
  }

  // Auto-accepting (logged in + fromLogin)
  if (accepting) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <p className="text-subtle text-sm">Принятие приглашения...</p>
      </div>
    );
  }

  // Invalid token
  if (!inviteInfo?.valid) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-surface rounded-2xl shadow-lg border border-line p-8 text-center">
          <h1 className="text-xl font-bold text-heading mb-2">Приглашение недействительно</h1>
          <p className="text-subtle text-sm mb-6">{inviteInfo?.reason}</p>
          <Link
            to="/"
            className="inline-flex px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all"
          >
            На главную
          </Link>
        </div>
      </div>
    );
  }

  const orgName = inviteInfo.organizationName;

  // Logged in user — show accept button
  if (user) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-surface rounded-2xl shadow-lg border border-line p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-heading">
              ASBUH <span className="text-primary">AUTOPILOT</span>
            </h1>
            <p className="text-subtle mt-2">Приглашение в организацию</p>
          </div>

          <p className="text-body text-sm text-center mb-6">
            Вы приглашены в организацию{" "}
            <span className="font-semibold text-heading">&laquo;{orgName}&raquo;</span>. Принять
            приглашение?
          </p>

          {error && (
            <div className="text-red-600 dark:text-red-300 text-sm bg-red-50 dark:bg-red-500/15 rounded-lg px-4 py-2 mb-4">
              {error}
            </div>
          )}

          <button
            onClick={acceptInvite}
            disabled={accepting}
            className="w-full h-12 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
          >
            {accepting ? "Принятие..." : "Принять приглашение"}
          </button>
        </div>
      </div>
    );
  }

  // Not logged in — registration form
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-lg border border-line p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-heading">
            ASBUH <span className="text-primary">AUTOPILOT</span>
          </h1>
          <p className="text-subtle mt-2">
            Вы приглашены в{" "}
            <span className="font-semibold text-heading">&laquo;{orgName}&raquo;</span>
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-body mb-1">
              Фамилия
            </label>
            <input
              id="lastName"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-line px-4 py-3 text-heading focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-body mb-1">
              Имя
            </label>
            <input
              id="firstName"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-line px-4 py-3 text-heading focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-body mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line px-4 py-3 text-heading focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-body mb-1">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line px-4 py-3 text-heading focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
            <p className="text-xs text-subtle mt-1">Минимум 8 символов</p>
          </div>

          {formError && (
            <div className="text-red-600 dark:text-red-300 text-sm bg-red-50 dark:bg-red-500/15 rounded-lg px-4 py-2">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
          >
            {submitting ? "Регистрация..." : "Зарегистрироваться"}
          </button>
        </form>

        <p className="text-sm text-subtle text-center mt-4">
          Уже есть аккаунт?{" "}
          <Link
            to="/login"
            state={{ redirect: `/invite/${token}` }}
            className="text-primary hover:underline font-medium"
          >
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
