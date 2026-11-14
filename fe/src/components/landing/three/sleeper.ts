import * as THREE from "three";
import { AGENT_SHELL, createFlame, createGlowDisc, createSleeperHead, createSnoreSprite } from "./models";
import { createStage } from "./stage";

/** Blocks in the winner's exclusive window (contract default grace_blocks). */
export const WINDOW_BLOCKS = 150;

// One loop, in seconds. Each step matches a line of the failover list beside it.
const CYCLE = 10;
const WINDOW_OPEN = 1.0; // step 0 "due" → step 1, the timer starts
const WINDOW_SHUT = 6.5; // timer hits 0 → step 2 "slash", the head catches fire
const TAKEOVER = 8.6; // step 3: another keeper runs it, the fire dies down

export type SleeperState = { step: 0 | 1 | 2 | 3; left: number };

const CHAR = new THREE.Color(0x3a2a22);
const SHELL = new THREE.Color(AGENT_SHELL);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The scripted loop at `c` seconds into the cycle. */
function sample(c: number) {
  const step: SleeperState["step"] = c < WINDOW_OPEN ? 0 : c < WINDOW_SHUT ? 1 : c < TAKEOVER ? 2 : 3;
  const left = Math.round(WINDOW_BLOCKS * (1 - clamp01((c - WINDOW_OPEN) / (WINDOW_SHUT - WINDOW_OPEN))));
  const fire = c < WINDOW_SHUT ? 0 : c < WINDOW_SHUT + 0.5 ? (c - WINDOW_SHUT) / 0.5 : c < TAKEOVER ? 1 : clamp01(1 - (c - TAKEOVER) / 0.8);
  const char = c < WINDOW_SHUT + 0.1 ? 0 : c < WINDOW_SHUT + 0.9 ? (c - WINDOW_SHUT - 0.1) / 0.8 : c < CYCLE - 0.8 ? 1 : clamp01((CYCLE - c) / 0.8);
  return { step, left, fire, char };
}

/**
 * Hot potato: a keeper that won a job dozes off while its exclusive window
 * runs out, then gets burned (slashed). Reports the step and blocks left
 * whenever either changes. Returns a cleanup function.
 */
export function mountSleeper(host: HTMLElement, onState: (state: SleeperState) => void) {
  const stage = createStage(host, {
    fov: 30,
    cameraPosition: new THREE.Vector3(0, 2.4, 9.6),
    lookAt: new THREE.Vector3(0, 1.35, 0),
    halfWidth: 2.1,
  });
  const { scene } = stage;

  const shadow = createGlowDisc(1.7, "rgba(26,11,5,0.55)", "rgba(26,11,5,0)");
  shadow.position.y = 0.01;
  scene.add(shadow);
  const fireGlow = createGlowDisc(2.4, "rgba(255,211,138,0.9)", "rgba(255,138,42,0)");
  fireGlow.position.y = 0.02;
  scene.add(fireGlow);

  const { head, shell, asleep, awake, bulbMaterial } = createSleeperHead();
  const root = new THREE.Group();
  root.position.y = 1.05;
  root.add(head);
  scene.add(root);

  // Flames sit on the crown of the head and grow from nothing.
  const flames = [
    [-0.62, 0.7, 0.3, 1.1],
    [-0.2, 0.95, 0.45, 1.5],
    [0.28, 0.85, 0.4, 1.35],
    [0.7, 0.65, 0.28, 1.0],
    [-0.4, 0.75, -0.35, 0.9],
    [0.42, 0.7, -0.3, 0.95],
  ].map(([x, h, z, r]) => {
    const flame = createFlame(h, 0.32 * r);
    flame.position.set(x, 0.78, z);
    flame.scale.setScalar(0.001);
    head.add(flame);
    return flame;
  });

  const snores = Array.from({ length: 3 }, () => {
    const z = createSnoreSprite();
    scene.add(z);
    return z;
  });

  let reported = "";
  const report = (state: SleeperState) => {
    const key = `${state.step}:${state.left}`;
    if (key === reported) return;
    reported = key;
    onState(state);
  };

  stage.run((time) => {
    const c = time % CYCLE;
    const { step, left, fire, char } = sample(c);
    report({ step, left });

    // Dozing: a slow breath and a nod. Burning: it jolts upright and shakes.
    const dozing = 1 - clamp01(fire * 3);
    root.position.y = 1.05 + Math.sin(time * 1.6) * 0.05 * dozing + fire * 0.12;
    root.position.x = Math.sin(time * 55) * 0.035 * fire;
    head.rotation.z = (-0.14 + Math.sin(time * 0.8) * 0.03) * dozing;
    head.rotation.x = 0.12 * dozing;

    asleep.visible = fire < 0.05;
    awake.visible = !asleep.visible;
    shell.color.copy(SHELL).lerp(CHAR, char);
    bulbMaterial.color.setHex(fire > 0.05 ? (Math.sin(time * 22) > 0 ? 0xff6b5c : 0xffd38a) : 0xffb54a);

    flames.forEach((flame, i) => {
      const flicker = 0.82 + 0.22 * Math.sin(time * 13 + i * 1.9) + 0.08 * Math.sin(time * 29 + i);
      const s = Math.max(0.001, fire);
      flame.scale.set(s * (0.92 + 0.1 * Math.sin(time * 9 + i)), s * flicker, s);
      flame.rotation.z = Math.sin(time * 6 + i * 2.3) * 0.12;
    });
    fireGlow.scale.setScalar(0.6 + fire * 0.5 + Math.sin(time * 14) * 0.04 * fire);
    (fireGlow.material as THREE.MeshBasicMaterial).opacity = fire;

    // Three Zs drift up and fade while it sleeps.
    snores.forEach((z, k) => {
      const p = (time * 0.42 + k / snores.length) % 1;
      z.position.set(1.0 + p * 0.75, 2.05 + p * 1.15, 0.4);
      z.scale.setScalar(0.28 + p * 0.3);
      z.material.opacity = Math.sin(Math.PI * p) * dozing;
      z.visible = dozing > 0.01;
    });
  });

  return stage.dispose;
}
