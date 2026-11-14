"use client";

import { useEffect, useState, type ReactNode } from "react";

/** True once the page has scrolled past the top. */
export function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // React skips the re-render when the boolean is unchanged, so this is cheap.
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}

/**
 * The navbar frame shared by the landing page and the dashboard. At the very
 * top it is seamless with the page (no background, full content width). Once
 * the page scrolls it appears as a floating pill and shrinks a little:
 * narrower, shorter and lifted off the top edge.
 *
 * Three slots: `left` (logo), `center` (links, hidden on phones), `right`.
 * Must be rendered outside any transformed scroll wrapper, since transforms
 * break position: fixed.
 */
export function NavShell({
  scrolled,
  left,
  center,
  right,
}: {
  scrolled: boolean;
  left: ReactNode;
  center?: ReactNode;
  right: ReactNode;
}) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div
        className={`pointer-events-auto mx-auto grid grid-cols-[1fr_auto] items-center gap-4 rounded-full border transition-[width,height,margin,padding,background-color,border-color,box-shadow] duration-500 ease-out-expo md:grid-cols-[1fr_auto_1fr] ${
          scrolled
            ? "mt-3 h-[60px] w-[min(1120px,calc(100%-24px))] border-line-strong bg-surface/85 pr-2 pl-5 shadow-[0_10px_30px_rgb(0_0_0/0.35)] backdrop-blur-md"
            : "mt-0 h-[76px] w-[min(1200px,calc(100%-2*clamp(16px,4vw,40px)))] border-transparent bg-transparent px-0"
        }`}
      >
        <div className="flex items-center justify-self-start">{left}</div>
        {center && <div className="hidden items-center gap-[clamp(20px,3vw,40px)] md:flex">{center}</div>}
        <div className="flex items-center gap-2 justify-self-end">{right}</div>
      </div>
    </header>
  );
}

/** Logo height that tracks the bar: a touch smaller once it shrinks. */
export const logoClass = (scrolled: boolean) =>
  `w-auto transition-[height] duration-500 ease-out-expo ${scrolled ? "h-7" : "h-8"}`;
