import type { ComponentType, ReactNode } from "react";

type ChartComponentProps = {
  children?: ReactNode;
  [key: string]: unknown;
};

export declare const Area: ComponentType<ChartComponentProps>;
export declare const AreaChart: ComponentType<ChartComponentProps>;
export declare const Bar: ComponentType<ChartComponentProps>;
export declare const BarChart: ComponentType<ChartComponentProps>;
export declare const CartesianGrid: ComponentType<ChartComponentProps>;
export declare const Cell: ComponentType<ChartComponentProps>;
export declare const Legend: ComponentType<ChartComponentProps>;
export declare const Pie: ComponentType<ChartComponentProps>;
export declare const PieChart: ComponentType<ChartComponentProps>;
export declare const ResponsiveContainer: ComponentType<ChartComponentProps>;
export declare const Tooltip: ComponentType<ChartComponentProps>;
export declare const XAxis: ComponentType<ChartComponentProps>;
export declare const YAxis: ComponentType<ChartComponentProps>;
