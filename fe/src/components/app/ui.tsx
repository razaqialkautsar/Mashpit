import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Archive,
  CircleCheck,
  CircleMinus,
  CircleX,
  Eye,
  Flame,
  Hourglass,
  Info,
  Loader,
  Lock,
  LockOpen,
  Pause,
  TriangleExclamationPoint,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { accountUrl } from "@/lib/near";
import { formatNear, initials, shortAccount } from "@/lib/format";
import type { JobStatus, Outcome, Phase, Yocto } from "@/lib/types";

/* ---------- page furniture ---------- */

export function PageHeader({ title, lede, aside }: { title: string; lede?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <div className="min-w-0 max-w-[560px]">
        <h1 className="text-[clamp(2.25rem,4vw,2.75rem)] leading-none">{title}</h1>
        {lede && <p className="mt-4 text-base text-ink-2 sm:text-[15px]">{lede}</p>}
      </div>
      {aside}
    </div>
  );
}

/** Inline divided numbers beside a page title (DESIGN.md: a strip, not metric cards). */
export function StatStrip({ items }: { items: { label: string; value: ReactNode; tone?: string }[] }) {
  return (
    <dl className="hidden flex-wrap md:flex">
      {items.map((it, i) => (
        <div key={it.label} className={`px-5 ${i === 0 ? "pl-0" : "border-l border-line"} last:pr-0`}>
          <dt className="text-xs text-ink-3">{it.label}</dt>
          <dd className={`mt-1 text-lg font-bold tabular-nums ${it.tone ?? "text-ink"}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Panel({
  children,
  glow = false,
  className = "",
}: {
  children: ReactNode;
  glow?: boolean;
  className?: string;
}) {
  return (
    <section className={`relative overflow-hidden rounded-[24px] border border-line bg-surface ${className}`}>
      {glow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-radial-[ellipse_60%_70%_at_0%_0%] from-accent/30 to-transparent"
        />
      )}
      <div className="relative h-full">{children}</div>
    </section>
  );
}

export function PanelHead({ title, right, className = "" }: { title: string; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-4 ${className}`}>
      <h2 className="text-[22px] leading-none">{title}</h2>
      {right && <div className="text-[13px] text-ink-3">{right}</div>}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] text-ink-3">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function BackLink({ href, label, current }: { href: string; label: string; current?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
      <Link href={href} className="inline-flex items-center gap-1.5 font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft aria-hidden="true" className="size-4" /> {label}
      </Link>
      {current && (
        <>
          <span aria-hidden="true" className="text-ink-3">/</span>
          <span aria-current="page" className="font-semibold text-ink">{current}</span>
        </>
      )}
    </nav>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-bad/40 bg-bad-bg px-4 py-3 text-sm text-bad">
      <TriangleExclamationPoint aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">Could not reach the network: {message}. Retrying automatically.</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-bold underline underline-offset-2">
          Retry now
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-display text-2xl">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-[46ch] text-base text-ink-2">{children}</p>}
    </div>
  );
}

export function Skeleton({ className = "h-64" }: { className?: string }) {
  return <div aria-busy="true" aria-label="Loading" className={`animate-pulse rounded-[24px] bg-surface ${className}`} />;
}

/* ---------- identity ---------- */

export function AccountLink({ id, className = "" }: { id: string; className?: string }) {
  return (
    <a
      href={accountUrl(id)}
      target="_blank"
      rel="noreferrer"
      title={id}
      className={`font-mono underline-offset-[3px] hover:underline ${className}`}
    >
      {shortAccount(id)}
    </a>
  );
}

/** Keeper avatar: initials on a tile; accent when it leads or holds a job. */
export function Avatar({ id, hot = false, size = "md" }: { id: string; hot?: boolean; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl font-bold ${size === "sm" ? "size-9 text-[13px]" : "size-11 text-[15px]"} ${
        hot ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink"
      }`}
    >
      {initials(id)}
    </span>
  );
}

export const Near = ({ yocto, digits = 4, className = "" }: { yocto: Yocto; digits?: number; className?: string }) => (
  <span className={`tabular-nums ${className}`}>{formatNear(yocto, digits)} NEAR</span>
);

/* ---------- status pills ---------- */

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap";

const phases: Record<Phase, { label: string; icon: LucideIcon; tone: string }> = {
  Commit: { label: "Commit", icon: Lock, tone: "bg-accent-soft text-amber" },
  Reveal: { label: "Reveal", icon: Eye, tone: "bg-accent-soft text-amber" },
  AwaitingFinalize: { label: "Finalizing", icon: Hourglass, tone: "bg-surface-3 text-ink-2" },
  Awarded: { label: "Awarded", icon: Trophy, tone: "bg-accent-soft text-amber" },
  Exclusive: { label: "Exclusive", icon: Flame, tone: "bg-accent text-accent-ink" },
  Open: { label: "Open", icon: LockOpen, tone: "bg-surface-3 text-warn" },
  InFlight: { label: "Running", icon: Loader, tone: "bg-accent-soft text-amber" },
  Paused: { label: "Paused", icon: Pause, tone: "bg-warn-bg text-warn" },
  Closed: { label: "Closed", icon: Archive, tone: "bg-surface-3 text-ink-3" },
};

export function PhasePill({ phase, suffix }: { phase: Phase; suffix?: string }) {
  const p = phases[phase] ?? phases.Open;
  const Icon = p.icon;
  return (
    <span className={`${pill} ${p.tone}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {p.label}
      {suffix && <span className="font-semibold opacity-80">· {suffix}</span>}
    </span>
  );
}

const outcomes: Record<Outcome, { label: string; icon: LucideIcon; tone: string }> = {
  Paid: { label: "Paid", icon: CircleCheck, tone: "text-ok" },
  ReturnedFalse: { label: "Returned false", icon: CircleMinus, tone: "text-warn" },
  Failed: { label: "Failed", icon: CircleX, tone: "text-bad" },
  Slashed: { label: "Slashed", icon: Flame, tone: "text-amber" },
};

/** Icon + coloured label, plus the amount when one was paid (DESIGN.md → Outcome). */
export function Outcome({ outcome, paid }: { outcome: Outcome; paid?: Yocto }) {
  const o = outcomes[outcome] ?? outcomes.Failed;
  const Icon = o.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span className={`inline-flex items-center gap-1.5 font-semibold ${o.tone}`}>
        <Icon aria-hidden="true" className="size-4" />
        {o.label}
      </span>
      {paid && paid !== "0" && <span className="text-ink-2 tabular-nums">{formatNear(paid)}</span>}
    </span>
  );
}

export function FailoverPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-hover">
      <Flame aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

const statuses: Record<JobStatus, string> = {
  Active: "bg-ok-bg text-ok",
  Paused: "bg-warn-bg text-warn",
  Closed: "bg-surface-3 text-ink-3",
};

export function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`${pill} ${statuses[status] ?? statuses.Closed}`}>{status}</span>;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-xs font-bold text-ink">{children}</span>;
}

/* ---------- tables ---------- */

/** Scrolls sideways on narrow screens instead of squeezing columns (FE-NFR-4). */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export const th = "px-6 py-3 text-left text-[11px] font-bold tracking-[0.06em] text-ink-3 uppercase whitespace-nowrap";
export const td = "px-6 py-5 align-middle text-sm";
export const thead = "border-y border-line bg-surface-2/70";
