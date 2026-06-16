const config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Syne'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        // New palette
        "page-bg": "#F4F7FC",
        "card-bg": "#fafafa",
        sidebar: "#07091f",
        "sidebar-text": "#fafafa",
        primary: "#2563eb",
        "primary-hover": "#1d4ed8",
        ink: "#080402",
        "ink-muted": "#08040299",
        border: "#E2E8F0",

        slate: {
          950: "#0a0f1e",
          900: "#0f172a",
          800: "#1e293b",
          700: "#334155",
        },
        accent: {
          DEFAULT: "#2563eb",
          dim: "#1d4ed8",
          glow: "rgba(37,99,235,0.15)",
        },
        danger: "#ff4d6d",
        warn: "#fbbf24",
        info: "#2563eb",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(37,99,235,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.03) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        glow: "0 0 20px rgba(37,99,235,0.2)",
        "glow-lg": "0 0 40px rgba(37,99,235,0.3)",
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "spin-slow": "spin 8s linear infinite",
        float: "float 6s ease-in-out infinite",
        "fade-up": "fadeUp 0.4s ease-out forwards",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;