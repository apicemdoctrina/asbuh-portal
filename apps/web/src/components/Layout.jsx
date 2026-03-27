import { Outlet, NavLink, Link, useNavigate, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCheck,
  Phone,
  BookOpen,
  ScrollText,
  TrendingUp,
  ClipboardList,
  Mail,
  ChevronDown,
  Info,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import NotificationBell from "./NotificationBell.jsx";

const navItems = [
  { to: "/", label: "Главная", icon: LayoutDashboard, permission: null },
  { to: "/tasks", label: "Задачи", icon: ClipboardList, permission: ["task", "view"] },
  { to: "/management", label: "Управление", icon: TrendingUp, roles: ["admin", "supervisor"] },
  { to: "/staff", label: "Сотрудники", icon: Users, role: "admin" },
  {
    to: "/organizations",
    label: "Организации",
    icon: Building2,
    permission: ["organization", "view"],
  },
  { to: "/clients", label: "Клиенты", icon: UserCheck, permission: ["user", "view"] },
  {
    group: true,
    label: "Информация",
    icon: Info,
    children: [
      { to: "/contacts", label: "Контакты", icon: Phone, permission: ["work_contact", "view"] },
      {
        to: "/knowledge",
        label: null,
        icon: BookOpen,
        permission: ["knowledge_item", "view"],
      },
      {
        to: "/message-templates",
        label: "Сообщения",
        icon: Mail,
        permission: ["message", "view"],
      },
    ],
  },
  { to: "/audit-log", label: "Журнал", icon: ScrollText, role: "admin" },
];

function isItemVisible(item, { hasPermission, hasRole }) {
  if (item.roles) return item.roles.some((r) => hasRole(r));
  if (item.role) return hasRole(item.role);
  if (item.permission) return hasPermission(item.permission[0], item.permission[1]);
  return true;
}

function NavGroup({ group, hasPermission, hasRole, onClose }) {
  const location = useLocation();

  const visibleChildren = group.children.filter((c) =>
    isItemVisible(c, { hasPermission, hasRole }),
  );

  const isChildActive = visibleChildren.some((c) => {
    if (c.to === "/") return location.pathname === "/";
    return location.pathname.startsWith(c.to);
  });

  const [open, setOpen] = useState(isChildActive);

  // Auto-expand when navigating to a child route
  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [isChildActive]);

  if (visibleChildren.length === 0) return null;

  const linkClass = (isActive) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? "bg-[#6567F1]/10 text-[#6567F1] border-l-2 border-[#6567F1] pl-[10px]"
        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
    }`;

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
          isChildActive && !open
            ? "bg-[#6567F1]/10 text-[#6567F1]"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <span
          className={`flex items-center justify-center w-5 h-5 rounded-md transition-colors ${
            isChildActive ? "text-[#6567F1]" : "text-slate-400"
          }`}
        >
          <group.icon size={18} />
        </span>
        <span className="flex-1 text-left">{group.label}</span>

        {/* Pill count badge when collapsed & a child is active */}
        {isChildActive && !open && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#6567F1] mr-0.5" />
        )}

        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Children — animated slide */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? `${visibleChildren.length * 44}px` : "0px" }}
      >
        <div className="mt-0.5 ml-3 pl-3 border-l-2 border-slate-100 flex flex-col gap-0.5 pb-1">
          {visibleChildren.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              end={child.to === "/"}
              onClick={onClose}
              className={({ isActive }) => linkClass(isActive)}
            >
              <child.icon size={16} />
              {child.label ?? (child.to === "/tickets" ? "Тикеты" : "База знаний")}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNav = navItems.filter((item) => {
    if (item.group) {
      return item.children.some((c) => isItemVisible(c, { hasPermission, hasRole }));
    }
    return isItemVisible(item, { hasPermission, hasRole });
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
      <header className="fixed top-0 z-50 w-full h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="ASBUH AUTOPILOT" className="h-8 w-auto" />
            <span className="text-xl font-bold text-slate-900">
              ASBUH <span className="text-[#6567F1]">AUTOPILOT</span>
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
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
        className={`fixed top-20 left-0 z-40 h-[calc(100vh-5rem)] w-60 bg-white border-r border-slate-200 p-4 transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-1">
          {visibleNav.map((item) => {
            if (item.group) {
              return (
                <NavGroup
                  key={item.label}
                  group={item}
                  hasPermission={hasPermission}
                  hasRole={hasRole}
                  onClose={() => setSidebarOpen(false)}
                />
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={linkClass}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={18} />
                {item.label ??
                  (item.to === "/tickets"
                    ? hasRole("client")
                      ? "Обращения"
                      : "Тикеты"
                    : hasRole("client")
                      ? "Материалы"
                      : "База знаний")}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="pt-20 lg:pl-60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
