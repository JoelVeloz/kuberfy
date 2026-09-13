// Shared by the System and per-application stats charts (recharts AreaChart over a rolling time window).

export const MIN_WINDOW_MS = 60 * 1000;
// Below this span, axis ticks switch to include seconds — otherwise a ~1min domain shows the same "HH:mm"
// repeated across several ticks. The tooltip always shows seconds so hovering adjacent samples reads as distinct.
export const SHORT_WINDOW_MS = 5 * 60 * 1000;

export function formatClock(t: number, withSeconds: boolean) {
  return new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined, hour12: false });
}

// Grows from the oldest sample actually held (never further back than a real timestamp) up to `now`, so a chart
// with only a few seconds of data shows a tight, honest window instead of empty space reserved for a full hour.
// Once the buffer fills the oldest end naturally slides forward tick by tick.
export function computeTimeDomain(data: Array<{ t: number }>): [number, number] {
  const domainMax = data.at(-1)?.t ?? Date.now();
  const domainMin = Math.min(data[0]?.t ?? domainMax, domainMax - MIN_WINDOW_MS);
  return [domainMin, domainMax];
}

// ChartTooltipContent resolves its header label by looking up `config[dataKey]` and only calls labelFormatter with
// that (a string, or undefined when the key doesn't match, e.g. dataKey "memMB" vs config key "mem") — never the
// raw x-value. Reading the timestamp straight off the hovered point's payload sidesteps that lookup entirely.
export const formatTooltipLabel = (_value: unknown, payload: unknown) => {
  const point = (payload as Array<{ payload?: { t?: number } }> | undefined)?.[0]?.payload;
  return point?.t ? formatClock(point.t, true) : "";
};
