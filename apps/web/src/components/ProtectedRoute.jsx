import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
