"use client";

import { useRef, type ReactNode } from "react";
import { gsap, ScrollSmoother, ScrollTrigger, useGSAP } from "@/lib/gsap";

const NAV_OFFSET = 72;

/**
 * Wraps the page in GSAP ScrollSmoother and wires the scroll-linked effects:
 * - [data-reveal]  fades up once when it enters the viewport
 * - [data-draw]    a line that scales in with scroll progress
 * - [data-speed]   parallax, handled by ScrollSmoother itself
 * Everything is skipped under prefers-reduced-motion, and content stays
 * visible if JS never runs.
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
          smoother.scrollTo(target, true, `top ${NAV_OFFSET}px`);
          history.replaceState(null, "", link.hash);
        };
        document.addEventListener("click", onAnchorClick);

        const reveals = gsap.utils.toArray<HTMLElement>("[data-reveal]");
        gsap.set(reveals, { autoAlpha: 0, y: 28 });
        ScrollTrigger.batch(reveals, {
          start: "top 88%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              autoAlpha: 1,
              y: 0,
              duration: 0.9,
              ease: "expo.out",
              stagger: 0.08,
              overwrite: true,
            }),
        });

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
