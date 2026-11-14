"use client";

import { useEffect, useRef, useState } from "react";
import { PitScene } from "./pit-scene";

/**
 * The hero scene in WebGL, filling its section. three.js and the scene code
 * are loaded on demand, so they stay out of the initial bundle. If WebGL is
 * unavailable, the 2D illustrated scene takes over below the copy.
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

  if (status === "failed") {
    return (
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0">
        <PitScene />
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="absolute inset-0 select-none">
      {/* Spotlight cone, centred over the pit (the scene shifts it right on desktop). */}
      <div className="absolute top-0 left-1/2 h-[84%] w-[110%] -translate-x-1/2 bg-linear-to-b from-accent/30 via-accent/40 to-amber/5 [clip-path:polygon(42%_0,58%_0,100%_100%,0_100%)] [mask-image:linear-gradient(to_bottom,black_55%,transparent)] lg:left-[73%] lg:w-[62%]" />
      <div
        ref={host}
        className={`absolute inset-0 transition-opacity duration-700 ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
