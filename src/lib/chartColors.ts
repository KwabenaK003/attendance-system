// Semantic chart colors. Keep chart meaning consistent across the application.
export const CHART_COLORS = {
  success: "#18794e",
  danger: "#b4233a",
  warning: "#a85d00",
  info: "#245db2",
  genderMale: "#7047EB",
  genderFemale: "#475d6b",
  neutral: "#6b7780",
} as const;

// Shared Recharts presentation tokens. Charts do not inherit application
// typography reliably, so pass these values to every axis, grid, and legend.
export const CHART_THEME = {
  fontFamily: '"Clash Grotesk", system-ui, sans-serif',
  fontSize: 12,
  axisTick: {
    fill: "#5e6b75",
    fontSize: 12,
    fontFamily: '"Clash Grotesk", system-ui, sans-serif',
  },
  grid: {
    stroke: "#dce3e5",
    strokeDasharray: "3 3",
  },
  legend: {
    verticalAlign: "bottom" as const,
    align: "center" as const,
    wrapperStyle: {
      fontFamily: '"Clash Grotesk", system-ui, sans-serif',
      fontSize: 12,
      paddingTop: 8,
    },
  },
  yAxisLabel: {
    fill: "#5e6b75",
    fontSize: 11,
    fontFamily: '"Clash Grotesk", system-ui, sans-serif',
  },
} as const;

export const formatChartNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
