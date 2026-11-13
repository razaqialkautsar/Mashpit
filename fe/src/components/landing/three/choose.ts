import * as THREE from "three";
import { gsap } from "@/lib/gsap";
import { createGlowDisc, createHand, createPill, createPotato } from "./models";
import { createStage } from "./stage";

export type Side = "orange" | "mono";

const TONES = {
  orange: { rest: 0xc4623f, lit: 0xff5a26, dim: 0x7a4532, pill: [0xffd38a, 0x802d18] },
  mono: { rest: 0xa9a6a2, lit: 0xffffff, dim: 0x6b6966, pill: [0xffffff, 0x1a0b05] },
} as const;

const HAND_SCALE = 0.78;
const ARM_YAW = 0.75; // how far each arm swings out from straight ahead
const PALM_TILT = 0.36; // tips the palm toward the viewer
// In the hand's own space the sleeve ends this far behind the palm.
const SLEEVE_REACH = 1.9 * HAND_SCALE;

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

    // Each arm is placed so the far end of its sleeve lands on the potato's
    // shoulder, which keeps hand and body reading as one character.
    const shoulder = new THREE.Vector3(direction * 0.62, 0.8, -1.0);
    const yaw = direction * ARM_YAW;
    const back = new THREE.Vector3(0, Math.sin(PALM_TILT), -Math.cos(PALM_TILT))
      .multiplyScalar(SLEEVE_REACH)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const arm = new THREE.Group();
    arm.add(hand);
    arm.position.copy(shoulder).sub(back);
    arm.rotation.y = yaw;
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
      // Growing from the palm pushes the sleeve deeper into the body, so the
      // arm stays attached while the hand comes forward.
      s.arm.scale.setScalar(1 + up * 0.16 - Math.max(-focus, 0) * 0.05);
      s.arm.position.y = s.home.y + Math.sin(time * 1.5 + s.direction) * 0.03 + up * 0.08;
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
