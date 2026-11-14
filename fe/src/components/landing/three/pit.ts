import * as THREE from "three";
import { gsap } from "@/lib/gsap";
import { createAgents, createChairs, createGlowDisc, createPointer, createPotato } from "./models";
import { createStage } from "./stage";

const RING = 3.3;
const SEATS = 8;
const ORBIT_SPEED = 0.1; // radians per second: musical chairs, slowly
const PICK_EVERY = 2.6; // seconds between the potato choosing a new keeper

const AGENT_REST = new THREE.Color(0xcfc8be);
const AGENT_PICKED = new THREE.Color(0xff9a3d);

/**
 * The hero: keeper agents sit in a slowly turning ring of chairs, and the
 * potato keeps turning to point at one of them at random. Returns a cleanup function.
 */
export function mountPit(host: HTMLElement) {
  const stage = createStage(host, {
    fov: 30,
    cameraPosition: new THREE.Vector3(0, 4.6, 11.5),
    lookAt: new THREE.Vector3(0, 0.8, 0),
    halfWidth: 4.7,
    // Desktop: the pit sits right of centre and the headline overlays its left side.
    // Narrower screens: the pit drops below the headline.
    frame: (w, h) =>
      w >= 1024
        ? { halfWidth: 6.9, shiftX: 0.23, shiftY: 0.05 }
        : { halfWidth: 3.9, shiftY: w / h < 1 ? 0.27 : 0.2 },
  });
  const { scene, camera, canvas } = stage;

  // Lit floor, its rim, and soft blob shadows (no real shadow maps).
  scene.add(createGlowDisc(RING + 1.2, "rgba(255,181,74,0.55)", "rgba(230,80,43,0)"));
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(RING + 1.1, RING + 1.13, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffb54a, transparent: true, opacity: 0.35 }),
  );
  rim.position.y = 0.005;
  scene.add(rim);

  const { potato, body, hat, mustache } = createPotato();
  potato.scale.setScalar(0.98);
  scene.add(potato);
  const potatoShadow = createGlowDisc(1.05, "rgba(26,11,5,0.75)", "rgba(26,11,5,0)");
  potatoShadow.position.y = 0.02;
  scene.add(potatoShadow);

  // The pointing glove floats beside the potato and jabs at whoever is picked.
  const pointer = createPointer();
  const pointerRest = new THREE.Vector3(0.78, 1.05, 0.62);
  pointer.position.copy(pointerRest);
  potato.add(pointer);
  const jab = { value: 0 };

  const chairs = createChairs(SEATS);
  const agents = createAgents(SEATS);
  scene.add(chairs.wood, chairs.ink, agents.shell, agents.ink, agents.face);
  const seatShadows = Array.from({ length: SEATS }, () => {
    const shadow = createGlowDisc(0.55, "rgba(26,11,5,0.6)", "rgba(26,11,5,0)");
    scene.add(shadow);
    return shadow;
  });
  // A warm pool of light under the keeper that is currently picked.
  const pickGlow = createGlowDisc(1.0, "rgba(255,181,74,0.95)", "rgba(255,120,40,0)");
  pickGlow.position.y = 0.03;
  scene.add(pickGlow);

  const dummy = new THREE.Object3D();
  dummy.scale.setScalar(1.3);
  const seatPosition = Array.from({ length: SEATS }, () => new THREE.Vector3());
  const highlight = new Float32Array(SEATS);
  const tint = new THREE.Color();

  let picked = 0;
  let pickedAt = 0;
  let nextPick = PICK_EVERY * 0.6;
  const pick = (time: number) => {
    picked = (picked + 1 + Math.floor(Math.random() * (SEATS - 1))) % SEATS; // never the same seat twice
    pickedAt = time;
    nextPick = time + PICK_EVERY;
    gsap.fromTo(jab, { value: 0 }, { value: 1, duration: 0.22, ease: "power3.out", yoyo: true, repeat: 1 });
  };

  // Dragging: the potato can be pulled across the floor and springs back.
  const cursor = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const grabOffset = new THREE.Vector3();
  let dragging = false;
  let lean = 0;
  let previousX = 0;

  const aim = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    cursor.set(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(cursor, camera);
  };
  const overPotato = () => raycaster.intersectObject(body, true).length > 0;

  const onMove = (e: PointerEvent) => {
    aim(e);
    if (dragging && raycaster.ray.intersectPlane(ground, hit)) {
      hit.add(grabOffset).clampLength(0, RING - 1.3);
      potato.position.x = hit.x;
      potato.position.z = hit.z;
    } else if (!dragging) {
      canvas.style.cursor = overPotato() ? "grab" : "";
    }
  };
  const onDown = (e: PointerEvent) => {
    aim(e);
    if (!overPotato() || !raycaster.ray.intersectPlane(ground, hit)) return;
    dragging = true;
    gsap.killTweensOf(potato.position);
    grabOffset.copy(potato.position).setY(0).sub(hit);
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    canvas.style.touchAction = "none";
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "";
    canvas.style.touchAction = "pan-y";
    gsap.to(potato.position, { x: 0, z: 0, duration: 1.3, ease: "elastic.out(1, 0.45)" });
  };

  if (!stage.reducedMotion) {
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
  }

  let orbit = 0;
  stage.run((time, delta) => {
    orbit += delta * ORBIT_SPEED;
    if (delta > 0 && time > nextPick) pick(time);
    const ease = 1 - Math.exp(-delta * 7);
    const sincePick = time - pickedAt;

    for (let i = 0; i < SEATS; i++) {
      const angle = orbit + (i / SEATS) * Math.PI * 2 + 0.4;
      const x = Math.cos(angle) * RING;
      const z = Math.sin(angle) * RING;
      seatPosition[i].set(x, 0, z);
      seatShadows[i].position.set(x, 0.015, z);

      // Chairs face the centre and rock a little.
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, Math.atan2(-x, -z), Math.sin(time * 1.7 + i * 1.3) * 0.045);
      dummy.updateMatrix();
      chairs.wood.setMatrixAt(i, dummy.matrix);
      chairs.ink.setMatrixAt(i, dummy.matrix);

      // The picked keeper lights up and hops in its seat; the hop dies out.
      highlight[i] += ((i === picked ? 1 : 0) - highlight[i]) * (delta > 0 ? ease : 1);
      const hop =
        i === picked ? Math.abs(Math.sin(sincePick * 9)) * 0.22 * Math.max(0, 1 - sincePick / 1.1) : 0;
      dummy.position.y = hop;
      dummy.updateMatrix();
      agents.shell.setMatrixAt(i, dummy.matrix);
      agents.ink.setMatrixAt(i, dummy.matrix);
      agents.face.setMatrixAt(i, dummy.matrix);
      agents.shell.setColorAt(i, tint.copy(AGENT_REST).lerp(AGENT_PICKED, highlight[i]));
    }
    for (const mesh of [chairs.wood, chairs.ink, agents.shell, agents.ink, agents.face]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    agents.shell.instanceColor!.needsUpdate = true;

    const target = seatPosition[picked];
    pickGlow.position.set(target.x, 0.03, target.z);
    pickGlow.scale.setScalar(0.85 + highlight[picked] * 0.25 + Math.sin(time * 5) * 0.04);

    // Idle bob with a little squash and stretch.
    const bob = (Math.sin(time * 2.4) + 1) / 2;
    potato.position.y = bob * 0.16;
    body.scale.set(1 + (1 - bob) * 0.03, 1 - (1 - bob) * 0.04, 1 + (1 - bob) * 0.03);
    hat.position.y = 0.92 + bob * 0.025;
    mustache.rotation.z = Math.sin(time * 3.1) * 0.05;
    potatoShadow.position.set(potato.position.x, 0.02, potato.position.z);
    potatoShadow.scale.setScalar(1 - bob * 0.14);

    // Turn to face the picked keeper (shortest way round) and jab the glove at it.
    const wanted = Math.atan2(target.x - potato.position.x, target.z - potato.position.z);
    const turn = Math.atan2(Math.sin(wanted - potato.rotation.y), Math.cos(wanted - potato.rotation.y));
    potato.rotation.y += turn * (delta > 0 ? 1 - Math.exp(-delta * 5) : 1);
    pointer.position.set(pointerRest.x, pointerRest.y + Math.sin(time * 2.4 + 1) * 0.04, pointerRest.z + jab.value * 0.38);

    // Lean into the direction of travel while dragged.
    const velocity = delta > 0 ? (potato.position.x - previousX) / delta : 0;
    previousX = potato.position.x;
    lean += (THREE.MathUtils.clamp(-velocity * 0.07, -0.4, 0.4) - lean) * ease;
    potato.rotation.z = lean;
  });

  return () => {
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    gsap.killTweensOf(potato.position);
    gsap.killTweensOf(jab);
    stage.dispose();
  };
}
