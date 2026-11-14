import * as THREE from "three";
import { gsap } from "@/lib/gsap";
import { createGlowDisc, createHand, createPill, createPotato } from "./models";
import { createStage } from "./stage";

export type Side = "orange" | "mono";

const TONES = {
  orange: { rest: 0xc4623f, lit: 0xff5a26, dim: 0x7a4532, pill: [0xffd38a, 0x802d18] },
  mono: { rest: 0xa9a6a2, lit: 0xffffff, dim: 0x6b6966, pill: [0xffffff, 0x1a0b05] },
} as const;

const HAND_SCALE = 0.92;
const HAND_YAW = 0.45; // fingers point out and toward the viewer
const PALM_TILT = 0.4; // tips the palm toward the viewer
// Floating gloves, cartoon style: they hover beside the potato with a clear gap.
const HAND_HOME = new THREE.Vector3(1.78, 0.78, -0.35);

/**
 * The closing scene: the potato offers a pill in each hand.
 * `setHover` drives the reaction; the DOM links on top own the actual hover.
 */
export function mountChoose(host: HTMLElement) {
  // The camera is set back far enough that the whole figure, hover growth
  // included, stays inside the canvas and never spills onto the text below.
  const stage = createStage(host, {
    fov: 30,
    cameraPosition: new THREE.Vector3(0, 2.3, 7.3),
    lookAt: new THREE.Vector3(0, 1.12, 0),
    halfWidth: 3.3,
  });
  const { scene } = stage;

  const { potato, body, hat } = createPotato();
  potato.scale.setScalar(1.15);
  potato.position.set(0, -0.55, -1.0);
  scene.add(potato);

  const sides = (["orange", "mono"] as const).map((side) => {
    const tone = TONES[side];
    const direction = side === "orange" ? -1 : 1;
    const { hand, glove } = createHand(tone.rest);
    const pill = createPill(tone.pill[0], tone.pill[1]);
    pill.position.set(0, 0.34, 0.12);
    hand.add(pill);
    hand.scale.set(-direction * HAND_SCALE, HAND_SCALE, HAND_SCALE); // mirrored: thumbs on the outside
    hand.rotation.x = PALM_TILT;

    const arm = new THREE.Group();
    arm.add(hand);
    arm.position.set(direction * HAND_HOME.x, HAND_HOME.y, HAND_HOME.z);
    arm.rotation.y = direction * HAND_YAW;
    scene.add(arm);

    const glow = createGlowDisc(
      1.1,
      side === "orange" ? "rgba(255,120,60,0.9)" : "rgba(255,255,255,0.75)",
      "rgba(0,0,0,0)",
    );
    glow.position.set(0, -0.2, 0.2);
    (glow.material as THREE.MeshBasicMaterial).opacity = 0;
    arm.add(glow);

    return {
      side,
      direction,
      arm,
      home: arm.position.clone(),
      pill,
      glove,
      glow: glow.material as THREE.MeshBasicMaterial,
      rest: new THREE.Color(tone.rest),
      lit: new THREE.Color(tone.lit),
      dim: new THREE.Color(tone.dim),
      // 1 = chosen, 0 = resting, -1 = the other one is chosen
      focus: { value: 0 },
    };
  });

  const head = { value: 0 };

  const setHover = (side: Side | null) => {
    const duration = stage.reducedMotion ? 0 : 0.6;
    for (const s of sides) {
      gsap.to(s.focus, {
        value: side === null ? 0 : s.side === side ? 1 : -1,
        duration,
        ease: "expo.out",
        overwrite: true,
      });
    }
    gsap.to(head, {
      value: side === null ? 0 : side === "orange" ? -0.42 : 0.42,
      duration: duration * 1.3,
      ease: "power3.out",
      overwrite: true,
    });
    if (stage.reducedMotion) stage.render();
  };

  stage.run((time) => {
    const bob = Math.sin(time * 1.8);
    body.scale.y = 1 + bob * 0.012;
    hat.position.y = 0.92 + (bob + 1) * 0.01;
    potato.rotation.y = head.value + Math.sin(time * 0.7) * 0.04;

    for (const s of sides) {
      const focus = s.focus.value;
      const up = Math.max(focus, 0);
      // Each glove drifts on its own rhythm; the chosen one grows and comes forward.
      s.arm.scale.setScalar(1 + up * 0.2 - Math.max(-focus, 0) * 0.06);
      s.arm.position.y = s.home.y + Math.sin(time * 1.5 + s.direction) * 0.07 + up * 0.1;
      s.arm.position.z = s.home.z + up * 0.45;
      s.arm.rotation.z = Math.sin(time * 1.1 + s.direction * 2) * 0.05;
      s.glove.color.copy(s.rest).lerp(focus >= 0 ? s.lit : s.dim, Math.abs(focus));
      s.glow.opacity = up * 0.55;
      // The pill hovers over the palm, higher and livelier when its side is picked.
      s.pill.position.y = 0.34 + (Math.sin(time * 2.6 + s.direction) + 1) * (0.03 + up * 0.05) + up * 0.1;
      s.pill.rotation.y = 0.5 + time * (0.4 + up * 1.8);
    }
  });

  return {
    setHover,
    dispose() {
      sides.forEach((s) => gsap.killTweensOf(s.focus));
      gsap.killTweensOf(head);
      stage.dispose();
    },
  };
}
