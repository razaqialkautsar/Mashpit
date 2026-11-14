"use client";

import { useRef, type ReactNode } from "react";
import { gsap, ScrollSmoother, useGSAP } from "@/lib/gsap";

// Anchors land just below the fixed 72px nav.
const ANCHOR_OFFSET = 88;

/**
 * Wraps the page in GSAP ScrollSmoother and wires the scroll-linked effects
 * (entrance animations live in ./motion.tsx, built on React Bits):
 * - [data-draw]    a line that scales in with scroll progress
 * - [data-speed]   parallax, handled by ScrollSmoother itself
 * Everything here is skipped under prefers-reduced-motion.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const smoother = ScrollSmoother.create({
          wrapper: wrapper.current,
          content: content.current,
          smooth: 1.1,
          effects: true,
          // Touch keeps native momentum scrolling: lighter, and what thumbs expect.
          smoothTouch: false,
        });

        const onAnchorClick = (e: MouseEvent) => {
          const link = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
          const target = link && document.querySelector(link.hash);
          if (!link || !target) return;
          e.preventDefault();
          smoother.scrollTo(target, true, `top ${ANCHOR_OFFSET}px`);
          history.replaceState(null, "", link.hash);
        };
        document.addEventListener("click", onAnchorClick);

        gsap.utils.toArray<HTMLElement>("[data-draw]").forEach((line) => {
          gsap.fromTo(
            line,
            { scaleY: 0 },
            {
              scaleY: 1,
              ease: "none",
              scrollTrigger: {
                trigger: line.parentElement,
                start: "top 75%",
                end: "bottom 60%",
                scrub: true,
              },
            },
          );
        });

        return () => document.removeEventListener("click", onAnchorClick);
      });
    },
    { scope: wrapper },
  );

  return (
    <div ref={wrapper} id="smooth-wrapper">
      <div ref={content} id="smooth-content">
        {children}
      </div>
    </div>
  );
}
