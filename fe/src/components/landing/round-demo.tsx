"use client";

import { useEffect, useRef, useState } from "react";

// A scripted example round. Illustrative only: the real dashboard reads the
// phase, bids and memos from the contract.
const PHASES = ["Commit", "Reveal", "Awarded", "Exclusive", "Settled"] as const;
const TICKS = 10; // per phase, sped up
const TICK_MS = 580;
// Phase lengths in blocks, from the deployed contract's get_config
// (commit_blocks 100, reveal_blocks 100, grace_blocks 150). "Awarded" waits
// until the job is due, which varies; 50 is an illustrative value.
const PHASE_BLOCKS = [100, 100, 50, 150];

const CAPTION = [
  "blocks left to commit",
  "blocks left to reveal",
  "blocks until the job is due",
  "blocks left for k2 to execute",
  "k2 paid 0.0171 NEAR (bid − 5% fee)",
];

const BIDS = [
  { id: "k1", bid: "0.020", revealAt: 2, memo: "Gas ≈ 0.0125 NEAR plus inference. 60% margin, clean history." },
  { id: "k2", bid: "0.018", revealAt: 4, memo: "Routine job, 7 of 7 runs paid. 0.018 should undercut k1." },
  { id: "k3", bid: "0.024", revealAt: 7, memo: "Model timed out. Fallback rule: gas × 1.9." },
];

export function RoundDemo() {
  const root = useRef<HTMLElement>(null);
  // Starts mid-reveal so the static (no-JS / reduced-motion) state is the interesting one.
  const [{ phase, tick }, setState] = useState({ phase: 1, tick: 6 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = false;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(root.current!);

    const timer = setInterval(() => {
      if (!visible || document.hidden) return;
      setState((s) =>
        s.tick < TICKS ? { ...s, tick: s.tick + 1 } : { phase: (s.phase + 1) % PHASES.length, tick: 0 },
      );
    }, TICK_MS);

    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, []);

  const settled = phase === 4;

  return (
    <figure
      ref={root}
      aria-label="Example of one auction round"
      className="rounded-3xl border border-line bg-bg p-[clamp(18px,2.4vw,28px)] tabular-nums"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
        <span className="rounded-full bg-surface-3 px-2.5 py-1 font-bold text-ink">
          Job #1 · every epoch
        </span>
        <span>Example round, sped up</span>
      </div>
      <p className="mt-3.5 font-mono text-[clamp(1.25rem,2.2vw,1.7rem)] leading-tight font-medium">
        epoch_update_rewards
      </p>
      <p className="mt-1 font-mono text-xs text-ink-2">linear-protocol.testnet</p>

      <ol className="mt-5 grid grid-cols-5 gap-1.5">
        {PHASES.map((name, i) => {
          const done = i < phase;
          const now = i === phase;
          return (
            <li
              key={name}
              className={`text-xs ${now ? "font-bold text-ink" : done ? "text-ink-2" : "text-ink-3"}`}
            >
              <span className="mb-2 block h-2 overflow-hidden rounded bg-line-strong">
                <span
                  className={`block h-full origin-left ${
                    done
                      ? "bg-accent-deep"
                      : "bg-linear-to-r from-accent to-amber transition-transform duration-500 ease-linear"
                  }`}
                  style={{ transform: `scaleX(${done ? 1 : now ? tick / TICKS : 0})` }}
                />
              </span>
              {name}
            </li>
          );
        })}
      </ol>

      <p className="mt-5 flex min-h-16 items-end gap-3.5">
        <b className="min-w-[1.3em] font-display text-[clamp(3rem,5vw,4.25rem)] leading-[0.9] font-semibold tracking-[-0.03em] text-glow">
          {settled ? "✓" : Math.round((PHASE_BLOCKS[phase] * (TICKS - tick)) / TICKS)}
        </b>
        <span className="pb-1.5 text-[15px] font-bold">{CAPTION[phase]}</span>
      </p>

      <ul className="mt-4">
        {BIDS.map((b) => {
          const open = phase > 1 || (phase === 1 && tick >= b.revealAt);
          const wins = phase >= 2 && b.id === "k2";
          return (
            <li
              key={b.id}
              className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 border-t border-line py-3"
            >
              <span
                className={`grid size-9 place-items-center rounded-[11px] text-sm sm:text-[13px] font-extrabold transition-colors duration-300 ${
                  wins ? "bg-accent text-accent-ink" : "bg-surface-3"
                }`}
              >
                {b.id}
              </span>
              <div>
                <p className="font-mono text-xs font-medium">{b.id}.mashpit.testnet</p>
                <p className={`mt-0.5 text-sm sm:text-[13px] leading-snug ${open ? "text-ink-2" : "text-ink-3"}`}>
                  {open ? `“${b.memo}”` : "Sealed bid"}
                </p>
              </div>
              <p
                className={`text-right font-display text-xl leading-tight font-semibold ${
                  wins ? "text-glow" : open ? "" : "text-ink-3"
                }`}
              >
                {open ? b.bid : "Sealed"}
                <small className="block font-sans text-xs sm:text-[11px] font-medium text-ink-3">
                  {open ? "NEAR" : " "}
                </small>
              </p>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
