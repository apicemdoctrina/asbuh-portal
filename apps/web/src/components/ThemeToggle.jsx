import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";

/**
 * Light/dark theme switch. Shows the icon of the theme you'd switch TO.
 * `className` lets callers match the surrounding button styling (header vs. public pages).
 */
export default function ThemeToggle({ className = "" }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      className={
        className ||
        "p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
      }
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
