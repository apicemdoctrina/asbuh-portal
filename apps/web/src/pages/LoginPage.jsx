import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            AS <span className="text-[#6567F1]">|</span> BUH
          </h1>
          <p className="text-slate-500 mt-2">Вход в портал</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6567F1]/40 focus:border-[#6567F1]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {submitting ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
