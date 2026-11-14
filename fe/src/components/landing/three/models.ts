import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Every model is built from primitives at runtime: no model files to download,
// a few thousand triangles in total, and one cartoon look (toon shading plus
// an ink outline) that matches the 2D brand art.

const INK = 0x1a0b05;

let gradient: THREE.DataTexture | undefined;
function gradientMap() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([120, 185, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export function toon(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...extra });
}

/** Ink outline: the same mesh drawn inside-out and pushed out along its normals. */
function outlineMaterial(thickness: number) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { thickness: { value: thickness }, ink: { value: new THREE.Color(INK) } },
    vertexShader: /* glsl */ `
      uniform float thickness;
      void main() {
        vec4 p = vec4(position + normal * thickness, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 ink;
      void main() { gl_FragColor = vec4(ink, 1.0); }`,
  });
}

export function outlined(geometry: THREE.BufferGeometry, material: THREE.Material, thickness = 0.022) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.add(new THREE.Mesh(geometry, outlineMaterial(thickness)));
  return mesh;
}

// ── Potato ────────────────────────────────────────────────────────────────

/** Maps a point on the unit sphere to the potato's lumpy, bottom-heavy skin. */
function potatoSkin(d: THREE.Vector3, out = new THREE.Vector3()) {
  const widen = 1 - 0.16 * d.y;
  const lump =
    1 + 0.035 * Math.sin(d.x * 3.1 + 1) * Math.cos(d.y * 2.3) + 0.03 * Math.sin(d.z * 2.7 + d.y * 1.9);
  return out.set(d.x * 0.8 * widen * lump, d.y * 1.12, d.z * 0.72 * widen * lump);
}

const onSkin = (x: number, y: number, z: number) => potatoSkin(new THREE.Vector3(x, y, z).normalize());

function mustacheHalf(side: 1 | -1) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.18 * side, -0.07, 0),
    new THREE.Vector3(0.38 * side, -0.05, -0.03),
    new THREE.Vector3(0.54 * side, 0.05, -0.1),
    new THREE.Vector3(0.53 * side, 0.18, -0.14),
  ]);
  const segments = 24;
  const radial = 10;
  const geometry = new THREE.TubeGeometry(curve, segments, 0.095, radial, false);
  // Taper the tube toward the curled tip.
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const centre = curve.getPointAt(i / segments);
    const keep = 1 - 0.82 * Math.pow(i / segments, 1.3);
    for (let j = 0; j <= radial; j++) {
      const index = i * (radial + 1) + j;
      v.fromBufferAttribute(position, index).sub(centre).multiplyScalar(keep).add(centre);
      position.setXYZ(index, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createPotato() {
  const potato = new THREE.Group();
  // The body pivots at the ground so squash and lean look planted.
  const body = new THREE.Group();
  body.position.y = 1.12;
  potato.add(body);

  const skin = new THREE.SphereGeometry(1, 48, 32);
  skin.rotateY(-Math.PI / 2); // keep the UV seam at the back
  const position = skin.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    potatoSkin(v.fromBufferAttribute(position, i), v);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  skin.computeVertexNormals();
  body.add(outlined(skin, toon(0xe6ab42), 0.028));

  const spot = new THREE.SphereGeometry(0.05, 12, 8);
  const spotMaterial = toon(0xb9791f);
  for (const [x, y, z, s] of [
    [-0.45, -0.25, 0.85, 1],
    [-0.3, -0.5, 0.8, 0.7],
    [0.5, -0.6, 0.6, 1.1],
    [0.42, -0.35, 0.82, 0.6],
    [-0.1, -0.75, 0.6, 0.8],
  ]) {
    const mesh = new THREE.Mesh(spot, spotMaterial);
    mesh.position.copy(onSkin(x, y, z));
    mesh.scale.set(s, s, 0.4 * s);
    body.add(mesh);
  }

  // Sunglasses
  const lensGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 28).rotateX(Math.PI / 2);
  const lensMaterial = toon(0x17120f);
  const glint = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
  );
  for (const side of [-1, 1]) {
    const lens = outlined(lensGeometry, lensMaterial, 0.018);
    lens.position.copy(onSkin(0.3 * side, 0.36, 0.88)).add(new THREE.Vector3(0, 0, 0.05));
    lens.rotation.y = 0.3 * side;
    const shine = glint.clone();
    shine.position.set(-0.05, 0.02, 0.035);
    shine.rotation.z = -0.6;
    lens.add(shine);
    body.add(lens);
  }
  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.2, 8).rotateZ(Math.PI / 2),
    lensMaterial,
  );
  bridge.position.copy(onSkin(0, 0.36, 0.93)).add(new THREE.Vector3(0, 0.03, 0.05));
  body.add(bridge);

  // Mustache
  const mustache = new THREE.Group();
  const hair = toon(0x6e3b1c);
  mustache.add(outlined(mustacheHalf(1), hair, 0.016), outlined(mustacheHalf(-1), hair, 0.016));
  mustache.add(outlined(new THREE.SphereGeometry(0.1, 16, 12), hair, 0.016));
  mustache.position.copy(onSkin(0, 0.06, 1)).add(new THREE.Vector3(0, 0, 0.06));
  body.add(mustache);

  // Fedora, turned on a lathe: brim, crown, pinched top.
  const hat = new THREE.Group();
  const profile = [
    [0.7, 0.05],
    [0.68, 0.0],
    [0.4, 0.02],
    [0.37, 0.07],
    [0.33, 0.32],
    [0.27, 0.4],
    [0.12, 0.36],
    [0, 0.33],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  hat.add(
    outlined(new THREE.LatheGeometry(profile, 40), toon(0xe6622b, { side: THREE.DoubleSide }), 0.02),
  );
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.385, 0.08, 40, 1, true), toon(0x9c2f1a));
  band.position.y = 0.1;
  hat.add(band);
  hat.position.set(0, 0.92, 0.02);
  hat.rotation.set(-0.06, 0, -0.1);
  hat.scale.z = 0.92;
  body.add(hat);

  return { potato, body, hat, mustache };
}

// ── Chair ─────────────────────────────────────────────────────────────────

/** One merged geometry, so a whole ring of chairs is a single instanced draw call. */
export function createChairGeometry() {
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.3).translate(x, y, z);
  const parts = [
    part(0.54, 0.08, 0.52, 0, 0.5, 0), // seat
    part(0.5, 0.15, 0.06, 0, 1.04, -0.21), // top rail
  ];
  for (const x of [-0.22, 0.22]) {
    parts.push(part(0.07, 0.5, 0.07, x, 0.25, 0.2)); // front legs
    parts.push(part(0.07, 1.12, 0.07, x, 0.56, -0.21)); // back legs run up into the backrest
  }
  for (const x of [-0.11, 0, 0.11]) parts.push(part(0.055, 0.44, 0.04, x, 0.76, -0.21)); // slats
  const geometry = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return geometry;
}

export function createChairs(count: number) {
  const geometry = createChairGeometry();
  const wood = new THREE.InstancedMesh(geometry, toon(0xe89a3c), count);
  const ink = new THREE.InstancedMesh(geometry, outlineMaterial(0.016), count);
  return { wood, ink };
}

// ── Hand and pill ─────────────────────────────────────────────────────────

/**
 * A floating cartoon glove, palm up, fingers along +z, with no wrist or sleeve.
 * Mirror it with scale.x = -1. Returns the glove material so a scene can tint it.
 */
export function createHand(color: THREE.ColorRepresentation) {
  const hand = new THREE.Group();
  const glove = toon(color);

  hand.add(outlined(new RoundedBoxGeometry(1, 0.3, 1, 4, 0.14), glove));

  const lengths = [0.5, 0.62, 0.58, 0.44];
  lengths.forEach((length, i) => {
    const knuckle = new THREE.Group();
    knuckle.position.set(-0.36 + i * 0.24, 0, 0.42);
    knuckle.rotation.set(-0.22, (i - 1.5) * -0.09, 0); // slight fan, tips curled up
    const finger = outlined(
      new THREE.CapsuleGeometry(0.115, length, 6, 14).rotateX(Math.PI / 2).translate(0, 0, length / 2 + 0.06),
      glove,
    );
    knuckle.add(finger);
    hand.add(knuckle);
  });

  const thumbJoint = new THREE.Group();
  thumbJoint.position.set(-0.46, 0.02, -0.12);
  thumbJoint.rotation.set(-0.25, -0.95, 0);
  thumbJoint.add(
    outlined(new THREE.CapsuleGeometry(0.13, 0.36, 6, 14).rotateX(Math.PI / 2).translate(0, 0, 0.26), glove),
  );
  hand.add(thumbJoint);

  // A rounded heel closes the back of the palm, so the glove ends cleanly.
  const heel = outlined(new THREE.SphereGeometry(0.5, 24, 16), glove);
  heel.scale.set(1, 0.3, 0.5);
  heel.position.z = -0.42;
  hand.add(heel);

  return { hand, glove };
}

/** Two-tone capsule, split across its length with vertex colours. */
export function createPill(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation) {
  const geometry = new THREE.CapsuleGeometry(0.13, 0.26, 8, 20).rotateZ(Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const first = new THREE.Color(a);
  const second = new THREE.Color(b);
  for (let i = 0; i < position.count; i++) {
    (position.getX(i) < 0 ? first : second).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return outlined(geometry, toon(0xffffff, { vertexColors: true }), 0.02);
}

// ── Ground helpers ────────────────────────────────────────────────────────

/** Soft radial disc, used for the lit floor and for blob shadows. */
export function createGlowDisc(radius: number, inner: string, outer: string) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const fill = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  fill.addColorStop(0, inner);
  fill.addColorStop(1, outer);
  context.fillStyle = fill;
  context.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
  return disc;
}

// ── Keeper agents ─────────────────────────────────────────────────────────

/**
 * Little robot keepers that sit on the chairs. Shares a chair's local space
 * (seat at y = 0.54, facing +z), so a chair's matrix places its agent too.
 * `shell` takes a per-instance colour, which is how the picked one lights up.
 */
export function createAgents(count: number) {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.32).translate(x, y, z);

  const shellParts = [
    box(0.32, 0.34, 0.26, 0, 0.73, -0.02), // body
    box(0.31, 0.25, 0.27, 0, 1.07, 0), // head
    box(0.03, 0.14, 0.03, 0, 1.26, 0), // antenna
    box(0.08, 0.08, 0.08, 0, 1.36, 0),
  ];
  for (const side of [-1, 1]) {
    shellParts.push(box(0.09, 0.27, 0.09, 0.09 * side, 0.43, 0.25)); // legs dangle off the seat
    shellParts.push(box(0.07, 0.24, 0.07, 0.2 * side, 0.71, 0)); // arms
  }
  const shellGeometry = mergeGeometries(shellParts);
  shellParts.forEach((p) => p.dispose());

  const paint = (geometry: THREE.BufferGeometry, color: number) => {
    const c = new THREE.Color(color);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    return geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  };
  const faceParts = [
    paint(box(0.25, 0.13, 0.03, 0, 1.08, 0.135), INK),
    paint(box(0.05, 0.055, 0.02, -0.06, 1.08, 0.15), 0xffd38a),
    paint(box(0.05, 0.055, 0.02, 0.06, 1.08, 0.15), 0xffd38a),
  ];
  const faceGeometry = mergeGeometries(faceParts);
  faceParts.forEach((p) => p.dispose());

  const shell = new THREE.InstancedMesh(shellGeometry, toon(0xffffff), count);
  const ink = new THREE.InstancedMesh(shellGeometry, outlineMaterial(0.014), count);
  const face = new THREE.InstancedMesh(
    faceGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    count,
  );
  return { shell, ink, face };
}

/** The potato's floating glove: a fist with one finger out, pointing along +z. */
export function createPointer() {
  const pointer = new THREE.Group();
  const glove = toon(0xf5efe9);
  pointer.add(outlined(new THREE.SphereGeometry(0.17, 20, 14), glove, 0.018));
  pointer.add(
    outlined(
      new THREE.CapsuleGeometry(0.06, 0.24, 6, 12).rotateX(Math.PI / 2).translate(0, 0.03, 0.24),
      glove,
      0.016,
    ),
  );
  const thumb = outlined(new THREE.CapsuleGeometry(0.055, 0.1, 6, 12), glove, 0.016);
  thumb.position.set(-0.13, 0.1, 0.03);
  thumb.rotation.z = 0.5;
  pointer.add(thumb);
  return pointer;
}

// ── Sleeping keeper (Hot potato section) ─────────────────────────────────

export const AGENT_SHELL = 0xcfc8be;

/**
 * A big keeper head, same build as the agents above: rounded shell, dark
 * visor, amber eyes, antenna. Two sets of eyes: closed arcs while it dozes,
 * wide open once it catches fire. The shell material is returned so the
 * scene can char it.
 */
export function createSleeperHead() {
  const head = new THREE.Group();
  const shell = toon(AGENT_SHELL);
  const box = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 4, r);

  head.add(outlined(box(2, 1.6, 1.7, 0.36), shell, 0.03));

  const visor = new THREE.Mesh(box(1.58, 0.82, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: INK }));
  visor.position.set(0, 0.02, 0.83);
  head.add(visor);

  const eyeLight = new THREE.MeshBasicMaterial({ color: 0xffd38a });

  // Closed: a downward arc per eye, like ‿.
  const asleep = new THREE.Group();
  for (const side of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 24, Math.PI), eyeLight);
    arc.rotation.z = Math.PI;
    arc.position.set(0.37 * side, 0.08, 0.9);
    asleep.add(arc);
  }
  head.add(asleep);

  // Open: round and startled, with an ink pupil.
  const awake = new THREE.Group();
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), eyeLight);
    white.position.set(0.37 * side, 0.04, 0.9);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: INK }));
    pupil.position.set(0.37 * side, 0.04, 0.905);
    awake.add(white, pupil);
  }
  awake.visible = false;
  head.add(awake);

  const metal = toon(0x9a9188);
  for (const side of [-1, 1]) {
    const bolt = outlined(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 24).rotateZ(Math.PI / 2), metal, 0.02);
    bolt.position.set(1.04 * side, 0, 0);
    head.add(bolt);
  }

  const stalk = outlined(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 12), metal, 0.015);
  stalk.position.set(0, 1.0, 0);
  head.add(stalk);
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffb54a });
  const bulb = outlined(new THREE.SphereGeometry(0.13, 20, 14), bulbMaterial, 0.018);
  bulb.position.set(0, 1.27, 0);
  head.add(bulb);

  return { head, shell, asleep, awake, bulbMaterial };
}

/** A cartoon flame: a round-bottomed teardrop with a pale core, base at y = 0. */
export function createFlame(height: number, radius: number) {
  const profile = (r: number, h: number) =>
    Array.from({ length: 18 }, (_, i) => {
      const t = i / 17;
      return new THREE.Vector2(r * Math.sqrt(Math.sin(Math.PI * t)) * Math.pow(1 - t, 0.6), h * t);
    });
  const flame = new THREE.Group();
  flame.add(outlined(new THREE.LatheGeometry(profile(radius, height), 20), new THREE.MeshBasicMaterial({ color: 0xff8a2a }), 0.02));
  const core = new THREE.Mesh(
    new THREE.LatheGeometry(profile(radius * 0.55, height * 0.62), 16),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  core.position.z = radius * 0.3;
  flame.add(core);
  return flame;
}

/** A "Z" drawn on a sprite, for the snoring. */
export function createSnoreSprite() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#1a0b05";
  context.font = "900 104px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("Z", size / 2, size / 2 + 6);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
}
