import * as THREE from "three";
import { gsap } from "@/lib/gsap";

type StageOptions = {
  fov: number;
  cameraPosition: THREE.Vector3;
  lookAt: THREE.Vector3;
  /** Half of the world width that must stay visible; the camera backs off on narrow screens. */
  halfWidth: number;
  /**
   * Optional per-size framing. Overrides halfWidth, and can slide the scene
   * within the canvas (fractions of its width/height; positive moves it right/down)
   * so DOM content can sit over the empty part.
   */
  frame?: (width: number, height: number) => { halfWidth: number; shiftX?: number; shiftY?: number };
};

export type Stage = ReturnType<typeof createStage>;

/**
 * One small WebGL canvas with the cost controls every scene here needs:
 * capped pixel ratio, no shadows or post-processing, a render loop that only
 * runs while the canvas is on screen, and a single static frame under
 * prefers-reduced-motion.
 */
export function createStage(host: HTMLElement, options: StageOptions) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
    // The page scrolls by transforming ScrollSmoother's wrapper. When Chrome
    // re-rasters the canvas during that scroll, a cleared drawing buffer
    // showed up as transparent horizontal strips. Keeping the last frame
    // means any re-raster reads a complete image.
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  const canvas = renderer.domElement;
  // Own compositor layer, so the canvas is never painted into the tiles of the
  // (very tall, constantly transformed) smooth-scroll content layer.
  canvas.style.cssText =
    "display:block;width:100%;height:100%;touch-action:pan-y;transform:translateZ(0);will-change:transform";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(options.fov, 1, 0.1, 100);
  const direction = options.cameraPosition.clone().sub(options.lookAt);
  const baseDistance = direction.length();
  direction.normalize();

  scene.add(new THREE.HemisphereLight(0xfff1e0, 0x4a2414, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-3, 6, 5);
  scene.add(key);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let update: (time: number, delta: number) => void = () => {};
  let visible = false;
  let lastTime = 0;

  const render = () => {
    update(lastTime, 0);
    renderer.render(scene, camera);
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const frame = options.frame?.(w, h) ?? { halfWidth: options.halfWidth };
    const needed =
      frame.halfWidth / (Math.tan(THREE.MathUtils.degToRad(options.fov / 2)) * camera.aspect);
    camera.position
      .copy(options.lookAt)
      .addScaledVector(direction, Math.max(baseDistance, needed));
    camera.lookAt(options.lookAt);
    if (frame.shiftX || frame.shiftY) {
      // Rendering a window offset the other way moves the scene inside the canvas.
      camera.setViewOffset(w, h, -(frame.shiftX ?? 0) * w, -(frame.shiftY ?? 0) * h, w, h);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    render();
  };

  const tick = (time: number, deltaMs: number) => {
    if (!visible) return;
    lastTime = time;
    update(time, Math.min(deltaMs, 50) / 1000);
    renderer.render(scene, camera);
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const visibility = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
  visibility.observe(host);

  return {
    scene,
    camera,
    canvas,
    reducedMotion,
    /** Draws one frame now. Use it for changes made outside the loop. */
    render,
    /** Sets the per-frame update and starts the loop (or draws once if motion is reduced). */
    run(fn: (time: number, delta: number) => void) {
      update = fn;
      resize();
      if (!reducedMotion) gsap.ticker.add(tick);
    },
    dispose() {
      gsap.ticker.remove(tick);
      resizeObserver.disconnect();
      visibility.disconnect();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        for (const material of [mesh.material].flat()) {
          if (!material) continue;
          (material as THREE.MeshBasicMaterial).map?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}
