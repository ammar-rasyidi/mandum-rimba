"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Toggle persisted in localStorage; the pre-paint script in the layout sets
 *  data-theme before hydration so there is no flash. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `fw-theme=${next};path=/;max-age=31536000;samesite=lax`;
    try {
      localStorage.setItem("fw-theme", next);
    } catch {
      // private mode: theme just won't persist
    }
    setTheme(next);
  };

  return (
    <button
      className="h-[1.9rem] w-[1.9rem] shrink-0 cursor-pointer rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] text-[0.9rem] leading-none text-muted transition-[color,border-color,transform] hover:border-accent hover:text-foreground active:scale-90"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
