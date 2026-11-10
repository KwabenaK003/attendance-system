export const colors = {
  /** Brand accent — normal blue */
  accent:      "#7047EB",
  accentDim:   "#5B35D5",
  accentMuted: "#e5defc",

  /** Semantic */
  danger:  "#e53e3e",
  warn:    "#d97706",
  info:    "#2563eb",
  success: "#059669",

  /**
   * Surface scale.
   * NOTE: these are remapped — slate-950 is the page bg (blueish-white),
   * slate-900 is the navy sidebar, slate-800 is the off-white card bg.
   * See globals.css @theme for full context.
   */
  slate: {
    950: "#F4F7FC",   // page background — soft blue-white
    900: "#07091f",   // sidebar background — navy
    800: "#fafafa",   // card background — off-white
    750: "#E2E8F0",   // card border
    700: "#fafafa",   // input background
    600: "#E2E8F0",   // input border
    500: "#9ca3af",   // muted icons
    400: "#6b7280",   // muted text
    300: "#374151",   // body text
    200: "#080402",   // headings
  },
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────

export const shadows = {
  card:     "none",
  elevated: "none",
  accent:   "none",
} as const;

// ── Fonts ─────────────────────────────────────────────────────────────────────

export const fonts = {
  display: '"Inter", system-ui, sans-serif',
  body:    '"Inter", system-ui, sans-serif',
  mono:    '"JetBrains Mono", monospace',
} as const;

// ── Border radius ─────────────────────────────────────────────────────────────

export const radius = {
  sm:   "6px",
  md:   "8px",
  lg:   "12px",
  full: "9999px",
} as const;

// ── Badge variants ────────────────────────────────────────────────────────────

export type BadgeVariant = "green" | "red" | "yellow" | "blue" | "slate";

export const badgeStyles: Record<BadgeVariant, { background: string; color: string; border: string }> = {
  green:  { background: "#ecfdf5", color: "#059669", border: "0" },
  red:    { background: "#fff5f5", color: "#e53e3e", border: "0" },
  yellow: { background: "#fffbeb", color: "#d97706", border: "0" },
  blue:   { background: "#f0ecfb", color: "#5940a3", border: "0" },
  slate:  { background: "#f9fafb", color: "#6b7280", border: "0" },
};

// ── Icon box variants ─────────────────────────────────────────────────────────

export type IconBoxVariant = "blue" | "green" | "red" | "yellow" | "slate";

export const iconBoxStyles: Record<IconBoxVariant, { background: string; color: string; border: string }> = {
  blue:   { background: "#f0ecfb", color: "#5940a3", border: "0" },
  green:  { background: "#ecfdf5", color: "#059669", border: "0" },
  red:    { background: "#fff5f5", color: "#e53e3e", border: "0" },
  yellow: { background: "#fffbeb", color: "#d97706", border: "0" },
  slate:  { background: "#f9fafb", color: "#6b7280", border: "0" },
};

// ── Button class names (Tailwind CSS class strings) ───────────────────────────

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export const buttonClass: Record<ButtonVariant, string> = {
  primary:   "btn-primary",
  secondary: "btn-secondary",
  ghost:     "btn-ghost",
  danger:    "btn-danger",
};