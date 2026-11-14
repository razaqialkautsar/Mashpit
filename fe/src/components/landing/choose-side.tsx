"use client";

import Image from "next/image";
import { Heading } from "./motion";
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
    // Full-width layers centred on each glove, so the light fades out with no seam.
    glow: "bg-radial-[ellipse_55%_75%_at_34%_50%] from-accent/45 to-transparent",
    // Matches its glove at rest, flips to the other side's colour on hover.
    title: "text-accent group-hover:text-white group-focus-visible:text-white",
    cta: "bg-accent text-accent-ink",
  },
  mono: {
    glow: "bg-radial-[ellipse_55%_75%_at_66%_50%] from-white/22 to-transparent",
    title: "text-white group-hover:text-accent group-focus-visible:text-accent",
    cta: "bg-ink text-bg",
  },
} as const;

// Height of the 3D stage. The camera scales with this height, so the figure
// grows with it.
const STAGE = "clamp(252px,43.2vw,564px)";
// How far the stage rises into the title, so the potato overlaps it.
const OVERLAP = `calc(${STAGE} * 0.2)`;
// Where the choice text starts. The gloves fill roughly the top half of the
// stage and grow ~6% lower on hover, so 66% leaves a clear gap without the
// empty band a full STAGE offset left under them.
const TEXT_TOP = `calc(${STAGE} * 0.66)`;

export function ChooseSide() {
  const host = useRef<HTMLDivElement>(null);
  const setHover = useRef<(side: Side | null) => void>(() => {});
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [hovered, setHovered] = useState<Side | null>(null);
  const hover = (side: Side | null) => {
    setHovered(side);
    setHover.current(side);
  };

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
    <section className="relative overflow-hidden border-t border-line">
      {/* The hover light spans the whole section, title included, so it never shows an edge. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {sides.map((s) => (
          <span
            key={s.side}
            className={`absolute inset-0 transition-opacity duration-500 ${tones[s.side].glow} ${
              hovered === s.side ? "opacity-100" : hovered ? "opacity-0" : "opacity-30"
            }`}
          />
        ))}
      </div>

      {/* One block: the title, then the 3D stage, then the two choices under it. */}
      <div className="relative pt-[clamp(64px,9vw,128px)]">
        {/* Layers, bottom to top: title, 3D stage, choice text. */}
        <div className="wrap relative z-0 text-center">
          <Heading text="Pick your side of the pit." className="text-[clamp(2.25rem,5.04vw,3.9rem)]" />
        </div>

        <div
          style={{ marginTop: `calc(-1 * ${OVERLAP})` }}
          className="relative z-10 mx-auto grid max-w-[1320px] grid-cols-2 [&:has(a:focus-visible)>a:not(:focus-visible)]:opacity-45 [&:has(a:hover)>a:not(:hover)]:opacity-45">
          {sides.map((s) => {
            const t = tones[s.side];
            return (
              <Link
                key={s.side}
                href={s.href}
                onPointerEnter={() => hover(s.side)}
                onPointerLeave={() => hover(null)}
                onFocus={() => hover(s.side)}
                onBlur={() => hover(null)}
                style={{ paddingTop: TEXT_TOP }}
                className="group relative z-20 flex flex-col items-center px-[clamp(8px,2vw,32px)] pb-[clamp(40px,6vw,80px)] text-center transition-opacity duration-300 focus-visible:outline-offset-[-6px]"
              >
                <span className="relative mt-[clamp(16px,2.4vw,32px)] block origin-top transition-transform duration-500 ease-out-expo group-hover:scale-[1.08] group-focus-visible:scale-[1.08]">
                  <span
                    className={`block font-display text-[clamp(1.15rem,2.4vw,1.75rem)] leading-tight font-semibold tracking-[-0.02em] transition-colors duration-300 ${t.title}`}
                  >
                    {s.title}
                  </span>
                  <span className="mx-auto mt-2 block max-w-[34ch] text-[clamp(0.875rem,1.2vw,1rem)] leading-snug text-ink-2">
                    {s.text}
                  </span>
                  <span
                    className={`mt-4 inline-flex rounded-full px-4 py-2.5 text-sm font-bold sm:mt-5 sm:px-[22px] sm:py-[13px] sm:text-[15px] transition-transform duration-300 group-hover:-translate-y-0.5 ${t.cta}`}
                  >
                    {s.cta}
                  </span>
                </span>
              </Link>
            );
          })}

          {/* The 3D stage: above the title, below the choice text (which sits over its empty lower part). */}
          <div
            aria-hidden="true"
            style={{ height: STAGE }}
            className="pointer-events-none absolute inset-x-0 top-0 z-10"
          >
            {status === "failed" ? (
              <Image
                src={potato}
                alt=""
                sizes="252px"
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
      </div>
    </section>
  );
}
