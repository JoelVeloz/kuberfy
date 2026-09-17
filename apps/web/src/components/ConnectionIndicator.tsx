// Shared by every live WebSocket view (runtime logs, build logs, the exec terminal) for the same small
// dot-plus-label readout, so connection state reads identically everywhere instead of each one rolling its own.
export function ConnectionIndicator({ connected, label, pulse = false }: { connected: boolean; label: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground/40"} ${connected && pulse ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}
