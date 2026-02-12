import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
      <h1 className="text-7xl font-bold text-slate-300">404</h1>
      <p className="text-xl text-slate-500 mt-4">Страница не найдена</p>
      <Link to="/" className="mt-6 text-[#6567F1] hover:text-[#5557E1] font-medium">
        На главную
      </Link>
    </div>
  );
}
