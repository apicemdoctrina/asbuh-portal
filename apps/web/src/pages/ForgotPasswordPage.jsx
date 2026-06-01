import { useState } from "react";
import { Link } from "react-router";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setError("Не удалось отправить запрос. Попробуйте позже.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-lg border border-line p-8">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="ASBUH AUTOPILOT" className="h-16 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-heading">
            ASBUH <span className="text-primary">AUTOPILOT</span>
          </h1>
          <p className="text-subtle mt-2">Восстановление пароля</p>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto">
              <svg
                className="w-7 h-7 text-emerald-600 dark:text-emerald-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-sm text-body">
              Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.
            </p>
            <p className="text-xs text-subtle">Проверьте папку «Спам», если письмо не пришло.</p>
            <Link to="/login" className="block text-sm text-primary hover:underline mt-2">
              ← Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-subtle">
              Введите email вашей учётной записи — мы отправим ссылку для сброса пароля.
            </p>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-body mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-line px-4 py-3 text-heading focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            {error && (
              <div className="text-red-600 dark:text-red-300 text-sm bg-red-50 dark:bg-red-500/15 rounded-lg px-4 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
            >
              {submitting ? "Отправка..." : "Отправить ссылку"}
            </button>

            <div className="text-center">
              <Link to="/login" className="text-sm text-subtle hover:text-body">
                ← Вернуться ко входу
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
