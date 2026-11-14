import { Check, Circle, Eye, Flame, Lock, Trophy, CircleCheck, type LucideIcon } from "lucide-react";
import { STEP, TRACK, type TrackStep } from "@/lib/phase";
import type { Phase } from "@/lib/types";

const ICON: Record<TrackStep, LucideIcon> = {
  Commit: Lock,
  Reveal: Eye,
  Awarded: Trophy,
  Exclusive: Flame,
  Settled: CircleCheck,
};

/**
 * The signature heat track (DESIGN.md): done steps dim to accent-deep, the
 * current one fills orange → amber as its blocks run out, the rest stay dark.
 */
export function HeatTrack({
  phase,
  progress,
  labels = "full",
}: {
  phase: Phase;
  progress: number;
  labels?: "full" | "short" | "none";
}) {
  const step = STEP[phase] ?? 0;
  return (
    <ol aria-label="Round phases" className="grid grid-cols-5 gap-1.5">
      {TRACK.map((name, i) => {
        const done = i < step;
        const now = i === step;
        const Icon = done ? Check : now ? ICON[name] : Circle;
        return (
          <li key={name} aria-current={now ? "step" : undefined} className="min-w-0">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${done ? "bg-accent-deep" : now ? "bg-linear-to-r from-accent to-amber" : ""}`}
                style={{ width: done ? "100%" : now ? `${Math.max(6, Math.round(progress * 100))}%` : "0%" }}
              />
            </div>
            {labels !== "none" && (
              <span
                className={`mt-2.5 flex items-center gap-1.5 truncate text-xs sm:text-[13px] ${
                  now ? "font-bold text-amber" : done ? "text-ink-2" : "text-ink-3"
                } ${labels === "short" ? "justify-center" : ""}`}
              >
                {labels === "full" && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
                {name}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
