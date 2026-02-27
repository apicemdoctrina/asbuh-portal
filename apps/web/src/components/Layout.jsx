import { Outlet, NavLink, Link, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import {
  LayoutDashboard,
  Map,
  Building2,
  Users,
  UserCheck,
  Phone,
  BookOpen,
  ScrollText,
  TrendingUp,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: null },
  { to: "/sections", label: "Участки", icon: Map, permission: ["section", "view"] },
  {
    to: "/organizations",
    label: "Организации",
    icon: Building2,
    permission: ["organization", "view"],
  },
  { to: "/staff", label: "Сотрудники", icon: Users, role: "admin" },
  { to: "/clients", label: "Клиенты", icon: UserCheck, permission: ["user", "view"] },
  { to: "/contacts", label: "Контакты", icon: Phone, permission: ["work_contact", "view"] },
  {
    to: "/knowledge",
    label: null,
    icon: BookOpen,
    permission: ["knowledge_item", "view"],
  },
  { to: "/audit-log", label: "Журнал", icon: ScrollText, role: "admin" },
  { to: "/management", label: "Управление", icon: TrendingUp, role: "admin" },
];

export default function Layout() {
  const { user, logout, hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNav = navItems.filter((item) => {
    if (item.role) return hasRole(item.role);
    if (item.permission) return hasPermission(item.permission[0], item.permission[1]);
    return true;
  });

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-[#6567F1]/10 text-[#6567F1]"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="fixed top-0 z-50 w-full h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden text-slate-600 hover:text-slate-900"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-xl font-bold text-slate-900">
            AS <span className="text-[#6567F1]">|</span> BUH
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            {user?.avatarUrl ? (
              <img
                src={`${import.meta.env.VITE_API_URL || ""}${user.avatarUrl}`}
                alt=""
                className="w-8 h-8 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#6567F1]/10 flex items-center justify-center text-[#6567F1] text-xs font-bold">
                {(user?.firstName?.[0] || "").toUpperCase()}
                {(user?.lastName?.[0] || "").toUpperCase()}
              </div>
            )}
            <span className="text-sm text-slate-600 hidden sm:inline">
              {user?.firstName} {user?.lastName}
            </span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-[#6567F1] transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Выйти</span>
          </button>
        </div>
      </header>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-16 left-0 z-40 h-[calc(100vh-4rem)] w-60 bg-white border-r border-slate-200 p-4 transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={linkClass}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={18} />
              {item.label ?? (hasRole("client") ? "Материалы" : "База знаний")}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="pt-16 lg:pl-60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
