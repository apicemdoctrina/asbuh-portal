import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Пароль должен быть не менее 8 символов");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось сбросить пароль");
        return;
      }
      navigate("/login", { state: { passwordReset: true } });
    } catch {
      setError("Не удалось сбросить пароль. Попробуйте позже.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-slate-700">Недействительная ссылка для сброса пароля.</p>
          <Link to="/forgot-password" className="text-sm text-[#6567F1] hover:underline">
            Запросить новую ссылку
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            ASBUH <span className="text-[#6567F1]">AUTOPILOT</span>
          </h1>
          <p className="text-slate-500 mt-2">Новый пароль</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Новый пароль
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6567F1]/40 focus:border-[#6567F1]"
              placeholder="Минимум 8 символов"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1">
              Повторите пароль
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6567F1]/40 focus:border-[#6567F1]"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
          >
            {submitting ? "Сохранение..." : "Сохранить пароль"}
          </button>
        </form>
      </div>
    </div>
  );
}
