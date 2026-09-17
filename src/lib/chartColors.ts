// Semantic chart colors. Keep chart meaning consistent across the application.
export const CHART_COLORS = {
  success: "#16a34a",
  danger: "#e11d48",
  warning: "#d97706",
  info: "#2563eb",
  genderMale: "#14b8a6",
  genderFemale: "#1e293b",
  neutral: "#64748b",
} as const;

// Shared Recharts presentation tokens. Charts do not inherit application
// typography reliably, so pass these values to every axis, grid, and legend.
export const CHART_THEME = {
  fontFamily: '"Geist Variable", Inter, system-ui, sans-serif',
  fontSize: 12,
  axisTick: {
    fill: "#64748b",
    fontSize: 12,
    fontFamily: '"Geist Variable", Inter, system-ui, sans-serif',
  },
  grid: {
    stroke: "#e2e8f0",
    strokeDasharray: "3 3",
  },
  legend: {
    verticalAlign: "bottom" as const,
    align: "center" as const,
    wrapperStyle: {
      fontFamily: '"Geist Variable", Inter, system-ui, sans-serif',
      fontSize: 12,
      paddingTop: 8,
    },
  },
  yAxisLabel: {
    fill: "#64748b",
    fontSize: 11,
    fontFamily: '"Geist Variable", Inter, system-ui, sans-serif',
  },
} as const;

export const formatChartNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
