"use client";

import Image from "next/image";
import { useRef } from "react";
import chair from "@/assets/landing/chair.webp";
import potato from "@/assets/landing/potato.webp";
import { Draggable, gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

// Eight chairs on an ellipse around the potato. Positions are percentages of
// the scene box, so the whole thing scales with its container.
const CENTER = { x: 50, y: 64 };
const RADIUS = { x: 41, y: 24 };
// Four at the back, one on each flank, two up front, like a ring seen from the stalls.
const ANGLES = [222, 250, 290, 318, 8, 62, 118, 172];

// Rounded so server and client render identical style strings.
const round = (n: number) => Math.round(n * 100) / 100;

const chairs = ANGLES.map((deg) => {
  const angle = (deg * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {
    left: round(CENTER.x + RADIUS.x * cos),
    top: round(CENTER.y + RADIUS.y * sin),
    // Chairs nearer the viewer are bigger and sit in front of the potato.
    scale: round(0.8 + 0.28 * ((sin + 1) / 2)),
    front: sin > 0,
    // The artwork faces right, so chairs on the right are mirrored to face the centre.
    flip: cos > 0,
  };
});

export function PitScene() {
  const scene = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const drag = scene.current!.querySelector<HTMLElement>("[data-potato-drag]")!;
        const body = scene.current!.querySelector<HTMLElement>("[data-potato-body]")!;
        const shadow = scene.current!.querySelector<HTMLElement>("[data-potato-shadow]")!;
        const beam = scene.current!.querySelector<HTMLElement>("[data-beam]")!;

        // Idle life: the potato bobs, its shadow breathes, the chairs rock.
        const idle = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut" } });
        idle
          .to(body, { y: "-5%", duration: 1.4 }, 0)
          .to(shadow, { scale: 0.86, opacity: 0.5, duration: 1.4 }, 0);
        const rock = gsap.to("[data-chair]", {
          rotation: (i) => (i % 2 ? 2.5 : -2.5),
          duration: 1.8,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          stagger: { each: 0.22, from: "random" },
        });

        // The potato leans toward the pointer, and the spotlight follows it.
        const lean = gsap.quickTo(body, "rotation", { duration: 0.6, ease: "power3.out" });
        const beamX = gsap.quickTo(beam, "xPercent", { duration: 0.9, ease: "power3.out" });
        const onMove = (e: PointerEvent) => {
          const box = scene.current!.getBoundingClientRect();
          const p = (e.clientX - box.left) / box.width - 0.5;
          lean(gsap.utils.clamp(-9, 9, p * 18));
          beamX(p * 6);
        };
        scene.current!.addEventListener("pointermove", onMove);

        // Drag it anywhere in the pit; it springs back to the middle on release.
        const [draggable] = Draggable.create(drag, {
          type: "x,y",
          bounds: scene.current,
          zIndexBoost: false,
          onPress: () => gsap.to(body, { scale: 1.08, duration: 0.25, ease: "back.out(3)" }),
          onDrag() {
            lean(gsap.utils.clamp(-20, 20, this.deltaX * 2.2));
          },
          onRelease() {
            gsap.to(body, { scale: 1, duration: 0.3 });
            gsap.to(drag, { x: 0, y: 0, duration: 1.2, ease: "elastic.out(1, 0.42)" });
            lean(0);
          },
        });

        // Nothing animates while the hero is off screen.
        const visibility = ScrollTrigger.create({
          trigger: scene.current,
          start: "top bottom",
          end: "bottom top",
          onToggle: ({ isActive }) => {
            idle.paused(!isActive);
            rock.paused(!isActive);
          },
        });

        return () => {
          scene.current?.removeEventListener("pointermove", onMove);
          draggable.kill();
          visibility.kill();
        };
      });
    },
    { scope: scene },
  );

  return (
    <div
      ref={scene}
      aria-hidden="true"
      className="relative mx-auto aspect-[4/3] w-full max-w-[1320px] select-none sm:aspect-[16/9] lg:aspect-[2.3/1]"
    >
      {/* Spotlight cone and the lit floor of the pit */}
      <div
        data-beam
        className="absolute inset-x-[6%] top-0 h-[66%] bg-linear-to-b from-accent/85 via-accent/35 to-amber/10 [clip-path:polygon(40%_0,60%_0,100%_100%,0_100%)]"
      />
      <div className="absolute top-[40%] left-[3%] h-[50%] w-[94%] rounded-[50%] bg-radial from-amber/50 via-accent/30 to-transparent to-70%" />
      <div className="absolute top-[40%] left-[3%] h-[50%] w-[94%] rounded-[50%] border border-amber/25" />

      {chairs.map((c, i) => (
        <div
          key={i}
          className="absolute w-[13%] sm:w-[8.5%]"
          style={{
            left: `${c.left}%`,
            top: `${c.top}%`,
            zIndex: c.front ? 30 : 10,
            transform: `translate(-50%, -88%) scale(${c.flip ? -c.scale : c.scale}, ${c.scale})`,
          }}
        >
          <Image
            data-chair
            src={chair}
            alt=""
            sizes="(min-width: 640px) 112px, 13vw"
            className="h-auto w-full origin-bottom"
            draggable={false}
          />
        </div>
      ))}

      <div
        className="absolute z-20 w-[17%] sm:w-[11.5%]"
        style={{ left: `${CENTER.x}%`, top: `${CENTER.y + 4}%`, transform: "translate(-50%, -100%)" }}
      >
        <div
          data-potato-shadow
          className="absolute -bottom-[5%] left-[8%] h-[12%] w-[84%] rounded-[50%] bg-accent-ink/70 blur-[6px]"
        />
        <div data-potato-drag className="relative cursor-grab touch-none active:cursor-grabbing">
          <Image
            data-potato-body
            src={potato}
            alt=""
            priority
            sizes="(min-width: 640px) 152px, 17vw"
            className="h-auto w-full origin-bottom"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
