import { useAuth } from "../context/AuthContext.jsx";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <>
      <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-slate-600 mt-2">
        Добро пожаловать, {user?.firstName}. Роль: {user?.roles?.join(", ")}
      </p>
    </>
  );
}
