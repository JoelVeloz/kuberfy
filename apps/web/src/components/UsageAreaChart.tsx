import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatTooltipLabel } from "@/lib/chart-time";

const chartConfigs = {
  cpu: { cpu: { label: "CPU", color: "var(--chart-1)" } },
  mem: { mem: { label: "Memory", color: "var(--chart-2)" } },
} satisfies Record<"cpu" | "mem", ChartConfig>;

const tooltipRow = (label: string, formatValue: (value: unknown) => string) => (value: unknown) => (
  <div className="flex flex-1 items-center justify-between leading-none">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono font-medium text-foreground tabular-nums">{formatValue(value)}</span>
  </div>
);

interface UsageAreaChartProps {
  metric: "cpu" | "mem";
  data: ReadonlyArray<Record<string, number>>;
  dataKey: string;
  timeDomain: [number, number];
  formatAxisTick: (t: number) => string;
  yAxisWidth: number;
  yDomain: [number, number | ((max: number) => number)];
  unit?: string;
  yTickFormatter?: (value: number) => string;
  tooltipLabel: string;
  formatTooltipValue: (value: unknown) => string;
}

export function UsageAreaChart({ metric, data, dataKey, timeDomain, formatAxisTick, yAxisWidth, yDomain, unit, yTickFormatter, tooltipLabel, formatTooltipValue }: UsageAreaChartProps) {
  const gradientId = `usage-fill-${React.useId().replace(/:/g, "")}`;
  const colorVar = `var(--color-${metric})`;

  return (
    <ChartContainer config={chartConfigs[metric]} className="aspect-auto h-32 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colorVar} stopOpacity={0.4} />
            <stop offset="95%" stopColor={colorVar} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="t" type="number" domain={timeDomain} tickFormatter={formatAxisTick} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis width={yAxisWidth} tickLine={false} axisLine={false} domain={yDomain} unit={unit} tickFormatter={yTickFormatter} />
        <ChartTooltip labelFormatter={formatTooltipLabel} content={<ChartTooltipContent formatter={tooltipRow(tooltipLabel, formatTooltipValue)} />} />
        <Area dataKey={dataKey} name={metric} type="monotone" fill={`url(#${gradientId})`} stroke={colorVar} strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  );
}
