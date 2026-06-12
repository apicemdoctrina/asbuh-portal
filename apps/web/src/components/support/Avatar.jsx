import { avatarUrl } from "./supportHelpers.js";

export default function Avatar({ user, size = 32 }) {
  const url = avatarUrl(user);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover border border-line shrink-0"
      />
    );
  }
  const initials = `${(user?.firstName?.[0] || "").toUpperCase()}${(user?.lastName?.[0] || "").toUpperCase()}`;
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0"
    >
      {initials || "?"}
    </div>
  );
}
