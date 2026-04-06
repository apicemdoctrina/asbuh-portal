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
  Megaphone,
  Ticket,
  FileSpreadsheet,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import NotificationBell from "./NotificationBell.jsx";
import AnnouncementsPanel from "./AnnouncementsPanel.jsx";
import AnnouncementsWelcomeModal from "./AnnouncementsWelcomeModal.jsx";
import { api } from "../lib/api.js";

const navItems = [
  { to: "/", label: "Главная", icon: LayoutDashboard, permission: null },
  { to: "/tasks", label: "Задачи", icon: ClipboardList, permission: ["task", "view"] },
  { to: "/tickets", label: "Тикеты", icon: Ticket, permission: ["ticket", "view"] },
  {
    to: "/reporting",
    label: "Отчётность",
    icon: FileSpreadsheet,
    permission: ["reporting", "view"],
  },
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
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [welcomeItems, setWelcomeItems] = useState(null); // null = not checked yet

  // On mount: fetch unread announcements; show welcome modal once per session
  const checkAnnouncements = useCallback(async () => {
    try {
      const res = await api("/api/announcements");
      const data = await res.json();
      const unread = Array.isArray(data) ? data.filter((a) => !a.isRead) : [];
      setUnreadAnnouncements(unread.length);

      const shownKey = "announcements_welcome_shown";
      const alreadyShown = sessionStorage.getItem(shownKey);
      if (unread.length > 0 && !alreadyShown) {
        sessionStorage.setItem(shownKey, "1");
        setWelcomeItems(unread);
      }
    } catch {
      // silent — not critical
    }
  }, []);

  useEffect(() => {
    checkAnnouncements();
  }, [checkAnnouncements]);

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
          {/* Announcements bell */}
          <button
            onClick={() => setAnnouncementsOpen(true)}
            className="relative p-1.5 rounded-lg text-slate-500 hover:text-[#6567F1] hover:bg-[#6567F1]/5 transition-colors"
            title="Обновления сервиса"
          >
            <Megaphone size={20} />
            {unreadAnnouncements > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#6567F1] text-white text-[10px] font-bold flex items-center justify-center">
                {unreadAnnouncements > 9 ? "9+" : unreadAnnouncements}
              </span>
            )}
          </button>
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

      {/* Announcements slide-over panel */}
      {announcementsOpen && (
        <AnnouncementsPanel
          onClose={() => setAnnouncementsOpen(false)}
          onUnreadChange={setUnreadAnnouncements}
        />
      )}

      {/* Welcome modal — shown once per session when there are unread announcements */}
      {welcomeItems && welcomeItems.length > 0 && (
        <AnnouncementsWelcomeModal
          items={welcomeItems}
          onClose={() => {
            setWelcomeItems(null);
            setUnreadAnnouncements(0);
          }}
        />
      )}
    </div>
  );
}
