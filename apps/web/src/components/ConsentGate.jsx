import { useState, useEffect } from "react";
import { Navigate } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

/**
 * For users with role "client": ensures they accepted the latest legal documents
 * before reaching the protected app. Non-clients pass through.
 */
export default function ConsentGate({ children }) {
  const { hasRole } = useAuth();
  const isClient = hasRole("client");
  const [state, setState] = useState({ loading: isClient, allAccepted: !isClient });

  useEffect(() => {
    if (!isClient) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/consents/status");
        if (!res.ok) throw new Error("status check failed");
        const data = await res.json();
        if (!cancelled) setState({ loading: false, allAccepted: data.allAccepted });
      } catch {
        // On failure, allow through — backend errors shouldn't lock users out.
        // If the user actually needs to consent, the next API call that depends
        // on it will surface the issue.
        if (!cancelled) setState({ loading: false, allAccepted: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isClient]);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="text-[#6567F1] animate-spin" size={28} />
      </div>
    );
  }

  if (!state.allAccepted) {
    return <Navigate to="/consent" replace />;
  }

  return children;
}
