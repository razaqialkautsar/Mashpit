"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import potato from "@/assets/landing/potato.webp";
import { routes } from "@/lib/routes";
import type { Side } from "./three/choose";

const sides: { side: Side; href: string; title: string; text: string; cta: string }[] = [
  {
    side: "orange",
    href: routes.newJob,
    title: "You own a contract",
    text: "Register the call once. Top up, pause or close whenever you like.",
    cta: "Post a job",
  },
  {
    side: "mono",
    href: routes.keepers,
    title: "You have spare NEAR",
    text: "Stake 1 NEAR, point the agent at a model, and start bidding.",
    cta: "Run a keeper",
  },
];

const tones = {
  orange: {
    glow: "bg-radial-[at_35%_40%] from-accent/50 to-transparent to-65%",
    title: "group-hover:text-accent group-focus-visible:text-accent",
    cta: "bg-accent text-accent-ink",
  },
  mono: {
    glow: "bg-radial-[at_65%_40%] from-white/25 to-transparent to-65%",
    title: "group-hover:text-white group-focus-visible:text-white",
    cta: "bg-ink text-bg",
  },
} as const;

// Height reserved for the 3D stage; the links' text starts below it.
const STAGE = "clamp(210px,36vw,470px)";

export function ChooseSide() {
  const host = useRef<HTMLDivElement>(null);
  const setHover = useRef<(side: Side | null) => void>(() => {});
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;

    import("./three/choose")
      .then(({ mountChoose }) => {
        if (cancelled || !host.current) return;
        const scene = mountChoose(host.current);
        setHover.current = scene.setHover;
        dispose = scene.dispose;
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("failed"));

    return () => {
      cancelled = true;
      setHover.current = () => {};
      dispose?.();
    };
  }, []);

  return (
    <section className="overflow-hidden border-t border-line pt-[clamp(64px,9vw,128px)]">
      <h2 data-reveal className="wrap text-center text-[clamp(2rem,4.2vw,3.25rem)]">
        Pick your side of the pit.
      </h2>

      <div className="relative mx-auto mt-[clamp(20px,3vw,40px)] grid max-w-[1320px] grid-cols-2 [&:has(a:focus-visible)>a:not(:focus-visible)]:opacity-45 [&:has(a:hover)>a:not(:hover)]:opacity-45">
        {sides.map((s) => {
          const t = tones[s.side];
          return (
            <Link
              key={s.side}
              href={s.href}
              onPointerEnter={() => setHover.current(s.side)}
              onPointerLeave={() => setHover.current(null)}
              onFocus={() => setHover.current(s.side)}
              onBlur={() => setHover.current(null)}
              style={{ paddingTop: STAGE }}
              className="group relative flex flex-col items-center px-[clamp(8px,2vw,32px)] pb-[clamp(40px,6vw,80px)] text-center transition-opacity duration-300 focus-visible:outline-offset-[-6px]"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-0 opacity-30 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 ${t.glow}`}
              />
              <span className="relative z-10 mt-[clamp(12px,2vw,28px)] block">
                <span
                  className={`block font-display text-[clamp(1.15rem,2.4vw,1.75rem)] leading-tight font-semibold tracking-[-0.02em] transition-colors duration-300 ${t.title}`}
                >
                  {s.title}
                </span>
                <span className="mx-auto mt-2 block max-w-[34ch] text-[clamp(0.8125rem,1.2vw,1rem)] text-ink-2">
                  {s.text}
                </span>
                <span
                  className={`mt-5 inline-flex rounded-full px-[22px] py-[13px] text-[15px] font-bold transition-transform duration-300 group-hover:-translate-y-0.5 ${t.cta}`}
                >
                  {s.cta}
                </span>
              </span>
            </Link>
          );
        })}

        {/* The 3D stage sits over both links but lets every pointer event through. */}
        <div
          aria-hidden="true"
          style={{ height: STAGE }}
          className="pointer-events-none absolute inset-x-0 top-0"
        >
          {status === "failed" ? (
            <Image
              src={potato}
              alt=""
              sizes="210px"
              className="mx-auto h-full w-auto object-contain"
            />
          ) : (
            <div
              ref={host}
              className={`size-full transition-opacity duration-700 ${
                status === "ready" ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </div>
      </div>
    </section>
  );
}
