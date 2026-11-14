import type { Config } from "@/lib/types";

/** Target call + callback + overhead against the 300 Tgas ceiling. */
export function GasMeter({ gas, config, compact = false }: { gas: number; config?: Config; compact?: boolean }) {
  const cb = config?.callback_gas_tgas ?? 0;
  const oh = config?.overhead_gas_tgas ?? 0;
  const max = config?.max_total_gas_tgas ?? 300;
  const total = gas + cb + oh;
  const over = total > max;
  const parts = [
    { label: "Target call", value: gas, tone: "bg-accent" },
    { label: "Callback", value: cb, tone: "bg-amber" },
    { label: "Overhead", value: oh, tone: "bg-glow" },
  ];
  const pct = (v: number) => `${Math.max(0, (Math.min(v, max) / max) * 100)}%`;

  return (
    <div>
      {!compact && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-ink-3">Gas per execution</span>
          <span className={`text-sm font-bold tabular-nums ${over ? "text-bad" : "text-ink"}`}>
            {total} / {max} Tgas
          </span>
        </div>
      )}
      <div
        role="img"
        aria-label={`${total} of ${max} Tgas used`}
        className={`flex h-2 gap-1 overflow-hidden rounded-full bg-surface-3 ${compact ? "" : "mt-3.5"}`}
      >
        {parts.map((p) => (
          <span key={p.label} className={`${p.tone} rounded-full`} style={{ width: pct(p.value) }} />
        ))}
      </div>
      {!compact && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
          {parts.map((p) => (
            <li key={p.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2 rounded-sm ${p.tone}`} /> {p.label} {p.value}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-sm bg-surface-3" /> Headroom {Math.max(0, max - total)}
          </li>
        </ul>
      )}
    </div>
  );
}
