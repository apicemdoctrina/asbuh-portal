import { useAuth } from "../context/AuthContext.jsx";

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="fixed top-0 z-50 w-full h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <span className="text-xl font-bold text-slate-900">
          AS <span className="text-[#6567F1]">|</span> BUH
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            {user?.firstName} {user?.lastName}
          </span>
          <button
            onClick={logout}
            className="text-sm text-slate-500 hover:text-[#6567F1] transition-colors"
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="pt-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-2">
          Добро пожаловать, {user?.firstName}. Роль: {user?.roles?.join(", ")}
        </p>
      </main>
    </div>
  );
}
