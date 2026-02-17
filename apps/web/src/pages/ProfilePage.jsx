import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { Camera, Save, Lock, Eye, EyeOff, Phone, Calendar } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function ProfilePage() {
  const { user, setSession, fetchMe } = useAuth();

  // Profile form
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [birthDate, setBirthDate] = useState(
    user?.birthDate ? new Date(user.birthDate).toISOString().slice(0, 10) : "",
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  // Avatar
  const fileRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const initials = `${(user?.firstName?.[0] || "").toUpperCase()}${(user?.lastName?.[0] || "").toUpperCase()}`;
  const avatarUrl = user?.avatarUrl ? `${API_BASE}${user.avatarUrl}` : null;

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await api("/api/users/me/avatar", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setProfileMsg({ type: "error", text: data.error || "Ошибка загрузки" });
        return;
      }
      // Refresh user data
      await fetchMe();
    } catch {
      setProfileMsg({ type: "error", text: "Ошибка загрузки аватарки" });
    } finally {
      setAvatarUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await api("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone: phone || null,
          birthDate: birthDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ type: "error", text: data.error || "Ошибка сохранения" });
        return;
      }
      setProfileMsg({ type: "success", text: "Данные сохранены" });
      // Refresh user context
      await fetchMe();
    } catch {
      setProfileMsg({ type: "error", text: "Ошибка сохранения" });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPwMsg(null);

    if (newPassword.length < 8) {
      setPwMsg({ type: "error", text: "Пароль должен быть не менее 8 символов" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "Пароли не совпадают" });
      return;
    }

    setPwSaving(true);
    try {
      const res = await api("/api/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ type: "error", text: data.error || "Ошибка смены пароля" });
        return;
      }
      // Update session with new access token
      await setSession(data.accessToken);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg({ type: "success", text: "Пароль успешно изменён" });
    } catch {
      setPwMsg({ type: "error", text: "Ошибка смены пароля" });
    } finally {
      setPwSaving(false);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] transition-colors";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Профиль</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Avatar card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 flex flex-col items-center gap-4">
          <div className="relative group">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Аватар"
                className="w-24 h-24 rounded-full object-cover border-2 border-slate-200"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-[#6567F1]/10 flex items-center justify-center text-[#6567F1] text-2xl font-bold">
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            >
              <Camera size={20} className="text-white" />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarUploading}
            className="text-sm text-[#6567F1] hover:text-[#5557E1] font-medium transition-colors"
          >
            {avatarUploading ? "Загрузка..." : "Изменить фото"}
          </button>
          <div className="text-center">
            <p className="font-semibold text-slate-900">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            {user?.roles?.length > 0 && (
              <span className="inline-block mt-2 bg-[#6567F1]/10 text-[#6567F1] px-3 py-1 rounded-full text-xs font-medium">
                {user.roles[0]}
              </span>
            )}
          </div>
        </div>

        {/* Personal data card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Личные данные</h2>
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Фамилия</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Имя</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Phone size={14} className="inline mr-1 -mt-0.5" />
                  Телефон
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (999) 123-45-67"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Calendar size={14} className="inline mr-1 -mt-0.5" />
                  Дата рождения
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            {profileMsg && (
              <p
                className={`text-sm ${profileMsg.type === "error" ? "text-red-600" : "text-green-600"}`}
              >
                {profileMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={profileSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
            >
              <Save size={16} />
              {profileSaving ? "Сохранение..." : "Сохранить"}
            </button>
          </form>
        </div>
      </div>

      {/* Change password card */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Lock size={20} className="text-slate-400" />
          Смена пароля
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Текущий пароль</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Новый пароль</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Подтверждение пароля
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              required
              minLength={8}
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Пароли не совпадают</p>
            )}
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.type === "error" ? "text-red-600" : "text-green-600"}`}>
              {pwMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pwSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
          >
            <Lock size={16} />
            {pwSaving ? "Сохранение..." : "Сменить пароль"}
          </button>
        </form>
      </div>
    </div>
  );
}
