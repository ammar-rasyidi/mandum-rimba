import type { Config } from "tailwindcss";

/**
 * Tailwind is layered onto the existing hand-written design system in
 * globals.css rather than replacing it.
 *
 * - Colours read the CSS theme variables (set per `[data-theme]` on <html>),
 *   so utilities like `bg-surface` / `text-accent` swap automatically between
 *   light and dark, no `dark:` variants needed for colour.
 * - Preflight (Tailwind's global reset) is OFF: the existing CSS depends on
 *   default browser styling for unclassed headings/lists, so enabling it would
 *   regress the current pages. All other utilities still work normally.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        surface: "var(--bg-raised)",
        border: "var(--border)",
        foreground: "var(--text)",
        muted: "var(--text-dim)",
        accent: {
          DEFAULT: "var(--accent)",
          dim: "var(--accent-dim)",
        },
        danger: "var(--danger)",
        link: "var(--link)",
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
      borderRadius: {
        glass: "18px",
      },
      boxShadow: {
        glass: "inset 0 1px 0 var(--glass-highlight), var(--glass-shadow)",
      },
      backdropBlur: {
        glass: "20px",
      },
    },
  },
};

export default config;
