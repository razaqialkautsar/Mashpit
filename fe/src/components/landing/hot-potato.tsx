"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, Timer } from "lucide-react";
import type { SleeperState } from "./three/sleeper";
import { Heading, Reveal } from "./motion";

// Mirrors WINDOW_BLOCKS in ./three/sleeper (a value import would pull three.js into this chunk).
const WINDOW_BLOCKS = 150;

const failover = [
  { at: "due", text: "k2 won the round and holds the job." },
  { at: "+150 blk", text: "k2 never executes. The window closes." },
  { at: "slash", text: "0.05 NEAR leaves k2’s stake and lands in your job balance." },
  { at: "+152 blk", text: "k3 runs the call in open mode and gets paid." },
];

/**
 * A keeper that won the job dozes off while its exclusive window runs out and
 * gets burned. The 3D loop drives the timer and lights up the matching line
 * of the failover list, so the scene and the text tell the same story.
 */
export function HotPotato() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [state, setState] = useState<SleeperState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("./three/sleeper")
      .then(({ mountSleeper }) => {
        if (cancelled || !host.current) return;
        dispose = mountSleeper(host.current, (s) => !cancelled && setState(s));
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("failed"));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  const step = status === "ready" ? (state?.step ?? 0) : -1;
  const left = state?.left ?? WINDOW_BLOCKS;
  const burning = step >= 2;

  return (
    <section id="burn" className="section-y overflow-hidden bg-accent text-accent-ink">
      <div className="wrap grid items-center gap-x-[clamp(32px,6vw,96px)] gap-y-10 md:grid-cols-2 md:grid-rows-[auto_1fr]">
        <div className="md:col-start-1 md:row-start-1">
          <Heading text="Hold it too long and you get burned." className="text-[clamp(2rem,5vw,4rem)] leading-[1.05]" />
          <Reveal delay={0.15} distance={20}>
            <p className="mt-5 max-w-[52ch] text-[clamp(1rem,1.3vw,1.125rem)] font-medium">
              The winner gets 150 blocks to run the job. Miss that window and their stake is slashed, you are
              compensated, and any keeper can grab the job.
            </p>
          </Reveal>
        </div>

        {/* The sleeping keeper. Decorative: the list below says the same thing in words. */}
        {status !== "failed" && (
          <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[520px] md:col-start-2 md:row-span-2 md:row-start-1">
            {/* A dark pool so the cartoon flames read against the orange. */}
            <div className="absolute inset-[6%] rounded-full bg-radial from-accent-ink/45 via-accent-ink/15 to-transparent" />
            <div
              ref={host}
              className={`absolute inset-0 transition-opacity duration-700 ${status === "ready" ? "opacity-100" : "opacity-0"}`}
            />
            {/* Task timer: the exclusive window ticking down. */}
            <div className="absolute top-[4%] left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-accent-ink px-4 py-2 text-sm font-bold whitespace-nowrap shadow-lg">
              {burning ? (
                <>
                  <Flame className="size-4 text-bad" />
                  <span className="text-bad">Window missed · slashed</span>
                </>
              ) : (
                <>
                  <span className="relative grid size-6 place-items-center">
                    <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent-deep" />
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        pathLength={1}
                        strokeDasharray={`${left / WINDOW_BLOCKS} 1`}
                        className={left < 40 ? "text-bad" : "text-amber"}
                      />
                    </svg>
                    <Timer className="size-3 text-glow" />
                  </span>
                  <span className="font-mono text-glow tabular-nums">{left} blk</span>
                  <span className="font-medium text-ink-3">left to execute</span>
                </>
              )}
            </div>
          </div>
        )}

        <Reveal role="list" stagger={0.1} distance={24} className="md:col-start-1 md:row-start-2 md:self-start">
          {failover.map((f, i) => {
            const active = i === step;
            return (
              <div
                role="listitem"
                key={f.at}
                aria-current={active ? "step" : undefined}
                className="grid grid-cols-[4.5rem_1fr] items-start gap-3 border-t border-accent-ink/30 py-4 font-semibold last:border-b sm:grid-cols-[5.5rem_1fr] sm:gap-4"
              >
                {/* Active step: the label inverts. Text stays full-strength so contrast never drops. */}
                <span
                  className={`w-fit rounded-full px-2 py-0.5 font-mono text-sm font-medium transition-colors duration-300 sm:text-[13px] ${
                    active ? "bg-accent-ink text-glow" : ""
                  }`}
                >
                  {f.at}
                </span>
                {f.text}
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
