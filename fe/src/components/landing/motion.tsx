"use client";

import type { ComponentProps } from "react";
import AnimatedContent from "../react-bits/AnimatedContent";
import SplitText from "../react-bits/SplitText";

// Shared motion presets for the landing page, built on React Bits.
// Kept deliberately light: titles move per line (not per word or letter, which
// reads like typing), body copy moves as one block, and nothing uses a blur
// filter. Filters leave GPU layers over the 3D hero canvas, which made strips
// of it drop out while ScrollSmoother scrolled. Both components clear their
// inline styles when done and skip motion under prefers-reduced-motion.

/** Titles: each line rises out of a mask, a beat apart. */
export function Heading({
  text,
  className = "",
  tag = "h2",
  onLoad = false,
}: {
  text: string;
  className?: string;
  tag?: "h1" | "h2" | "h3";
  onLoad?: boolean;
}) {
  return (
    <SplitText
      text={text}
      tag={tag}
      splitType="lines"
      effect="rise"
      mask
      delay={110}
      duration={0.9}
      ease="expo.out"
      trigger={onLoad ? "load" : "view"}
      threshold={0.2}
      rootMargin="-40px"
      textAlign="inherit"
      className={`w-full ${className}`}
    />
  );
}

type RevealProps = Omit<ComponentProps<typeof AnimatedContent>, "duration" | "ease"> & {
  duration?: number;
};

/** Blocks fade up into place as one piece; `stagger` cascades through direct children. */
export function Reveal({ distance = 24, duration = 0.8, threshold = 0.12, ...props }: RevealProps) {
  return (
    <AnimatedContent distance={distance} duration={duration} ease="power3.out" threshold={threshold} {...props} />
  );
}
