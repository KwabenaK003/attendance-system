const config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Clash Grotesk'", "system-ui", "sans-serif"],
        body: ["'Clash Grotesk'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        // New palette
        "page-bg": "#f6f7f5",
        "card-bg": "#ffffff",
        sidebar: "#7047EB",
        "sidebar-text": "#e8f0f3",
        primary: "#7047EB",
        "primary-hover": "#5B35D5",
        ink: "#17212b",
        "ink-muted": "#5e6b75",
        border: "#dce3e5",

        slate: {
          950: "#0a0f1e",
          900: "#0f172a",
          800: "#1e293b",
          700: "#334155",
        },
        accent: {
        DEFAULT: "#7047EB",
        dim: "#5B35D5",
        glow: "rgba(112,71,235,0.12)",
        },
      success: "#18794e",
      danger: "#b4233a",
      warn: "#a85d00",
      info: "#245db2",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(112,71,235,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(112,71,235,0.025) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        glow: "none",
        "glow-lg": "none",
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
