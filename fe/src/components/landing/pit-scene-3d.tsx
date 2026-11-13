"use client";

import { useEffect, useRef, useState } from "react";
import { PitScene } from "./pit-scene";

/**
 * The hero scene in WebGL. three.js and the scene code are loaded on demand,
 * so they stay out of the initial bundle. If WebGL is unavailable, the 2D
 * illustrated scene takes over.
 */
export function PitScene3D() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;

    import("./three/pit")
      .then(({ mountPit }) => {
        if (cancelled || !host.current) return;
        dispose = mountPit(host.current);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("failed"));

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  if (status === "failed") return <PitScene />;

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-[4/3] w-full max-w-[1320px] select-none sm:aspect-[16/9] lg:aspect-[2.3/1]"
    >
      {/* Spotlight cone: plain CSS behind the transparent canvas */}
      <div className="absolute inset-x-[8%] top-0 h-[70%] bg-linear-to-b from-accent/85 via-accent/35 to-amber/5 [clip-path:polygon(41%_0,59%_0,100%_100%,0_100%)]" />
      <div
        ref={host}
        className={`absolute inset-0 transition-opacity duration-700 ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
