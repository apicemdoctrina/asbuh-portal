import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center">
      <h1 className="text-7xl font-bold text-subtle">404</h1>
      <p className="text-xl text-subtle mt-4">Страница не найдена</p>
      <Link to="/" className="mt-6 text-primary hover:text-[#5557E1] font-medium">
        На главную
      </Link>
    </div>
  );
}
