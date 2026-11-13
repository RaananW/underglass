/**
 * Strata Phase 0 probe P0.4 (docs/ui-library/plan.md): native controls drawn as 3D objects on one Babylon Lite
 * WebGPU engine, with PBR materials, a key light, ambient light and shadow maps. No Underglass runtime.
 *
 * World units are canvas CSS pixels, y up, +z away from the viewer. The panel's front lies on z = 0, and the
 * perspective camera is placed so that plane maps 1:1 onto the canvas, so the panel's canvas transform is a plain
 * translation. Each native control's box is the base of its object:
 * - the button is a tapered key (base = the button's box, top inset by `taper`) that travels on press, with the
 *   captured label on its top face;
 * - the switch is a track with a metal knob that slides when the native checkbox changes;
 * - the slider is a rail with a knob placed from the native range value.
 * Under perspective, raised geometry shifts away from the vanishing point by `drift(height)`; a taper at least
 * that large keeps every drawn pixel of a key inside its native box, so clicks on the drawn object land on the
 * original control. `window.objectsProbe` lets the browser test read pixels, drive states and measure cost.
 */
import {
  addToScene, captureScreenshot, composeMat4, createBox, createCapsule, createCylinder, createDirectionalLight,
  createDynamicTexture, createEngine, createFreeCamera, createHemisphericLight, createMeshFromData, createPbrMaterial,
  createPcfDirectionalShadowGenerator, createSceneContext, createSphere, eulerXYZToQuatTuple, markMaterialUboDirty, registerSceneWithShadowSupport,
  renderFrame, setMeshVisible, setPbrEmissive, setPbrUnlit, setShadowOnly, setShadowTaskCasterMeshes, setThinInstances, waitForGpuIdle,
  vec3, type DynamicTexture2D, type Material, type Mesh, type PbrMaterialProps,
} from "@babylonjs/lite";
import { hitAt, offsetWithin, type DrawableCanvas, type Point } from "./common.ts";

const canvas = document.getElementById("stage") as DrawableCanvas;
const face = document.getElementById("face") as HTMLElement;
const status = document.getElementById("status")!;
const key = document.getElementById("launch") as HTMLButtonElement;
const power = document.getElementById("power") as HTMLInputElement;
const level = document.getElementById("level") as HTMLInputElement;
const distanceInput = document.getElementById("distance") as HTMLInputElement;
const extraInput = document.getElementById("extra") as HTMLInputElement;
const cssWidth = 640, cssHeight = 420;
// Probe tokens (Phase 1 sets the real values).
const tokens = { light: [0.45, -0.6, 0.66] as [number, number, number], keyHeight: 8, keyTravel: 6, taper: 3, panelDepth: 12 };

interface DrawableQueue extends GPUQueue { drawElementImageToTexture(source: { source: Element }, destination: { texture: GPUTexture }): void }
interface Rect { x: number; y: number; width: number; height: number }

const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linear = (r: number, g: number, b: number): [number, number, number, number] => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1];
const asMaterial = (material: Partial<PbrMaterialProps>) => material as unknown as Material;

async function start() {
  for (const name of ["requestPaint", "updateElementGeometry", "getElementImageDefaultSize"]) {
    if (typeof Reflect.get(canvas, name) !== "function") throw new Error(`HTML-in-Canvas: canvas.${name} is missing`);
  }
  if (!navigator.gpu) throw new Error("WebGPU unavailable");
  const dpr = window.devicePixelRatio;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const engine = await createEngine(canvas, { msaaSamples: 4 });
  const device = (canvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
  const queue = device.queue as DrawableQueue;
  if (typeof queue.drawElementImageToTexture !== "function") throw new Error("HTML-in-Canvas: drawElementImageToTexture is missing");

  // Face-local CSS pixels to world: the face is centred on the canvas, the canvas centre is the world origin.
  const origin = { x: (cssWidth - face.offsetWidth) / 2, y: (cssHeight - face.offsetHeight) / 2 };
  const world = (x: number, y: number, z = 0): [number, number, number] => [origin.x + x - cssWidth / 2, cssHeight / 2 - (origin.y + y), z];
  const rectOf = (element: HTMLElement): Rect => ({ ...offsetWithin(element, face), width: element.offsetWidth, height: element.offsetHeight });

  const scene = createSceneContext(engine);
  scene.clearColor = { r: 1, g: 1, b: 1, a: 1 };
  // No tone mapping: unlit captured faces must keep their exact colours.
  scene.imageProcessing = { exposure: 1, contrast: 1, toneMappingEnabled: false };
  let distance = Number(distanceInput.value);
  const camera = createFreeCamera(vec3(0, 0, -distance), vec3(0, 0, 0));
  camera.nearPlane = 1;
  camera.farPlane = 20000;
  // Vertical field of view that maps the z = 0 plane 1:1 onto the canvas.
  const placeCamera = () => { camera.position.set(0, 0, -distance); camera.fov = 2 * Math.atan(cssHeight / 2 / distance); };
  placeCamera();
  scene.camera = camera;

  const light = createDirectionalLight(tokens.light, 1.6);
  const ambient = createHemisphericLight([0, 0, -1], 0.55);
  const shadows = createPcfDirectionalShadowGenerator(engine, light, { mapSize: 2048, bias: 2e-4, normalBias: 0.02 });
  light.shadowGenerator = shadows;
  addToScene(scene, light);
  addToScene(scene, ambient);

  // A quad facing the camera, from face-local rect `r` at height z, with UVs from the capture.
  // The capture texture exists before the scene is registered, sized for the face's native grid at this DPR.
  const capture: DynamicTexture2D = createDynamicTexture(engine, Math.ceil(face.offsetWidth * dpr), Math.ceil(face.offsetHeight * dpr), { minFilter: "linear", magFilter: "linear", srgb: true });
  let captured = false;
  function quad(name: string, r: Rect, z: number, uv: Rect, extent: { width: number; height: number }): Mesh {
    const [x0, y0] = world(r.x, r.y), [x1, y1] = world(r.x + r.width, r.y + r.height);
    const u0 = uv.x / extent.width, v0 = uv.y / extent.height, u1 = (uv.x + uv.width) / extent.width, v1 = (uv.y + uv.height) / extent.height;
    return createMeshFromData(engine, name,
      new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]),
      new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]),
      new Uint32Array([0, 1, 2, 0, 2, 3]),
      new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]));
  }
  // Tapered key sides: base `r` on z = 0, top inset by `taper` at z = -height. Flat-shaded, no bottom.
  function keySides(r: Rect, height: number, taper: number): Mesh {
    const base = [world(r.x, r.y), world(r.x + r.width, r.y), world(r.x + r.width, r.y + r.height), world(r.x, r.y + r.height)];
    const top = [world(r.x + taper, r.y + taper, -height), world(r.x + r.width - taper, r.y + taper, -height),
      world(r.x + r.width - taper, r.y + r.height - taper, -height), world(r.x + taper, r.y + r.height - taper, -height)];
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      const corners = [base[side]!, base[next]!, top[next]!, top[side]!];
      const [a, b, c] = corners as [number, number, number][];
      const u = [b![0] - a![0], b![1] - a![1], b![2] - a![2]], v = [c![0] - a![0], c![1] - a![1], c![2] - a![2]];
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const length = Math.hypot(n[0]!, n[1]!, n[2]!);
      // Outward normals face the viewer (negative z); flip if the winding produced the inward one.
      const sign = n[2]! > 0 ? -1 : 1;
      const start = positions.length / 3;
      for (const corner of corners) { positions.push(...corner); normals.push(sign * n[0]! / length, sign * n[1]! / length, sign * n[2]! / length); }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    return createMeshFromData(engine, "key-sides", new Float32Array(positions), new Float32Array(normals), new Uint32Array(indices));
  }

  const panelColour = linear(233, 235, 239), accent = linear(37, 99, 235);
  const casters: Mesh[] = [];
  const add = (mesh: Mesh, material: Partial<PbrMaterialProps>, cast = true) => { mesh.material = asMaterial(material); addToScene(scene, mesh); if (cast) casters.push(mesh); return mesh; };

  // Background shadow catcher, the panel slab, the captured panel face and a shadow catcher on it.
  const backdrop = createBox(engine, { width: 4000, height: 4000, depth: 1 });
  backdrop.position.set(0, 0, tokens.panelDepth + 0.5);
  backdrop.receiveShadows = true;
  const backdropMaterial = createPbrMaterial({ baseColorFactor: [1, 1, 1, 1] });
  setShadowOnly(backdropMaterial, { color: [0, 0, 0], opacity: 0.35 });
  add(backdrop, backdropMaterial, false);
  const slab = createBox(engine, { width: face.offsetWidth, height: face.offsetHeight, depth: tokens.panelDepth });
  slab.position.set(...world(face.offsetWidth / 2, face.offsetHeight / 2, tokens.panelDepth / 2 + 0.2));
  add(slab, createPbrMaterial({ baseColorFactor: panelColour, metallicFactor: 0, roughnessFactor: 0.8 }));

  const faceExtent = { width: face.offsetWidth, height: face.offsetHeight };
  const unlit = () => { const material = createPbrMaterial({ doubleSided: true, baseColorTexture: capture }); setPbrUnlit(material); return material; };
  const faceMaterial = unlit();
  add(quad("face", { x: 0, y: 0, ...faceExtent }, -0.05, { x: 0, y: 0, ...faceExtent }, faceExtent), faceMaterial, false);
  const faceShadow = quad("face-shadow", { x: 0, y: 0, ...faceExtent }, -0.1, { x: 0, y: 0, ...faceExtent }, faceExtent);
  faceShadow.receiveShadows = true;
  const faceShadowMaterial = createPbrMaterial({ doubleSided: true });
  setShadowOnly(faceShadowMaterial, { color: [0, 0, 0], opacity: 0.4 });
  add(faceShadow, faceShadowMaterial, false);

  // Key: tapered PBR sides plus the captured button region on its top face, moved together on press.
  const keyRect = rectOf(key);
  const keyBody = add(keySides(keyRect, tokens.keyHeight, tokens.taper), createPbrMaterial({ baseColorFactor: accent, metallicFactor: 0, roughnessFactor: 0.45, doubleSided: true }));
  const topRect = { x: keyRect.x + tokens.taper, y: keyRect.y + tokens.taper, width: keyRect.width - 2 * tokens.taper, height: keyRect.height - 2 * tokens.taper };
  const keyTopMaterial = unlit();
  const keyTop = add(quad("key-top", topRect, -tokens.keyHeight - 0.05, topRect, faceExtent), keyTopMaterial, false);

  // Switch: a flattened capsule track (inset in the checkbox box) and a metal knob.
  const switchRect = rectOf(power);
  const trackMaterial = createPbrMaterial({ baseColorFactor: linear(150, 156, 168), metallicFactor: 0, roughnessFactor: 0.7 });
  const track = add(createCapsule(engine, { height: switchRect.width - 4, radius: switchRect.height / 2 - 2, tessellation: 32 }), trackMaterial);
  track.rotation.set(0, 0, Math.PI / 2);
  track.scaling.set(1, 1, 0.35);
  track.position.set(...world(switchRect.x + switchRect.width / 2, switchRect.y + switchRect.height / 2, 0));
  const knobMaterial = createPbrMaterial({ baseColorFactor: linear(236, 238, 242), metallicFactor: 0.1, roughnessFactor: 0.25 });
  const knob = add(createSphere(engine, { diameter: switchRect.height - 8, segments: 32 }), knobMaterial);
  knob.scaling.set(1, 1, 0.6);

  // Slider: a metal rail between the thumb centres and an anodised puck.
  const sliderRect = rectOf(level);
  const thumb = sliderRect.height;
  const rail = add(createCylinder(engine, { height: sliderRect.width - thumb, diameter: 6, tessellation: 24 }), createPbrMaterial({ baseColorFactor: linear(190, 194, 202), metallicFactor: 0.1, roughnessFactor: 0.3 }));
  rail.rotation.set(0, 0, Math.PI / 2);
  rail.position.set(...world(sliderRect.x + sliderRect.width / 2, sliderRect.y + sliderRect.height / 2, -2));
  const puckMaterial = createPbrMaterial({ baseColorFactor: accent, metallicFactor: 0.1, roughnessFactor: 0.3 });
  const puck = add(createCylinder(engine, { height: 8, diameter: thumb - 4, tessellation: 40 }), puckMaterial);
  puck.rotation.set(Math.PI / 2, 0, 0);

  // Cost probe: thin instances of a small box in the empty lower-left of the panel.
  const extraRegion = { x: 24, y: 190, width: 220, height: 70 };
  const extra = add(createBox(engine, { size: 4 }), createPbrMaterial({ baseColorFactor: linear(120, 128, 140), metallicFactor: 0.2, roughnessFactor: 0.6 }));
  setMeshVisible(extra, false);
  function setExtra(count: number) {
    setMeshVisible(extra, count > 0);
    if (!count) return;
    const columns = Math.ceil(Math.sqrt(count * extraRegion.width / extraRegion.height));
    const rows = Math.ceil(count / columns);
    const matrices = new Float32Array(count * 16);
    const [qx, qy, qz, qw] = eulerXYZToQuatTuple(0.4, 0.6, 0);
    for (let index = 0; index < count; index++) {
      const [x, y] = world(extraRegion.x + (index % columns + 0.5) * extraRegion.width / columns, extraRegion.y + (Math.floor(index / columns) + 0.5) * extraRegion.height / rows);
      matrices.set(composeMat4(x, y, -2, qx, qy, qz, qw, 1, 1, 1) as unknown as ArrayLike<number>, index * 16);
    }
    setThinInstances(extra, matrices, count);
  }

  // Focusable objects get an emissive colour before the scene is built. Lite keeps the array by reference and
  // re-reads it every frame, so the focus glow writes into it in place.
  const glows = new Map<unknown, [number, number, number]>();
  for (const material of [keyBody.material, knobMaterial, puckMaterial]) {
    const glow: [number, number, number] = [0, 0, 0];
    glows.set(material, glow);
    setPbrEmissive(material as unknown as PbrMaterialProps, glow);
  }
  setShadowTaskCasterMeshes(shadows, casters);
  await registerSceneWithShadowSupport(scene);

  // State from the native controls, eased towards each frame's target.
  const state = { keyDepth: 0, knob: power.checked ? 1 : 0, puck: Number(level.value) / 100 };
  const target = () => ({ keyDepth: keyPressed ? tokens.keyTravel : 0, knob: power.checked ? 1 : 0, puck: (Number(level.value) - Number(level.min)) / (Number(level.max) - Number(level.min)) });
  let keyPressed = false;
  function place() {
    keyBody.position.set(0, 0, state.keyDepth);
    keyTop.position.set(0, 0, state.keyDepth);
    const inset = switchRect.height / 2;
    knob.position.set(...world(switchRect.x + inset + state.knob * (switchRect.width - 2 * inset), switchRect.y + switchRect.height / 2, -4));
    puck.position.set(...world(sliderRect.x + thumb / 2 + state.puck * (sliderRect.width - thumb), sliderRect.y + sliderRect.height / 2, -4));
    const trackColour = state.knob > 0.5 ? linear(120, 160, 240) : linear(150, 156, 168);
    if (trackMaterial.baseColorFactor?.some((value, index) => value !== trackColour[index])) {
      trackMaterial.baseColorFactor = trackColour;
      markMaterialUboDirty(trackMaterial as unknown as Material);
    }
  }
  // Material values change in place and are re-uploaded once marked dirty.
  const focusGlow = (material: unknown, on: boolean) => {
    const glow = glows.get(material);
    if (!glow) return;
    glow.splice(0, 3, ...(on ? [0.05, 0.12, 0.45] : [0, 0, 0]));
    markMaterialUboDirty(material as Material);
  };

  const counts = { uploads: 0, frames: 0 };
  let screenshot: { width: number; height: number; data: Uint8ClampedArray } | undefined;
  let renderQueued = false;
  function step(): boolean {
    const goal = target();
    let moving = false;
    for (const name of ["keyDepth", "knob", "puck"] as const) {
      const difference = goal[name] - state[name];
      state[name] = Math.abs(difference) < 1e-3 ? goal[name] : state[name] + difference * 0.35;
      if (state[name] !== goal[name]) moving = true;
    }
    place();
    return moving;
  }
  function frame() {
    renderQueued = false;
    if (!captured) return;
    const moving = step();
    renderFrame(engine, 16.67);
    counts.frames++;
    if (moving) requestRender();
  }
  function requestRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(frame); } }

  canvas.addEventListener("paint", () => {
    const size = canvas.getElementImageDefaultSize(face);
    if (size.width > capture.width || size.height > capture.height) throw new Error("Native grid outgrew the capture texture");
    captured = true;
    queue.drawElementImageToTexture({ source: face }, { texture: capture.texture });
    counts.uploads++;
    requestRender();
  });

  key.addEventListener("pointerdown", () => { keyPressed = true; requestRender(); });
  for (const type of ["pointerup", "pointerleave"]) key.addEventListener(type, () => { keyPressed = false; requestRender(); });
  key.addEventListener("keydown", event => { if (event.key === " " || event.key === "Enter") { keyPressed = true; requestRender(); } });
  key.addEventListener("keyup", () => { keyPressed = false; requestRender(); });
  power.addEventListener("change", requestRender);
  level.addEventListener("input", requestRender);
  for (const [control, material] of [[key, keyBody.material], [power, knobMaterial], [level, puckMaterial]] as const) {
    control.addEventListener("focus", () => { focusGlow(material, control.matches(":focus-visible")); requestRender(); });
    control.addEventListener("blur", () => { focusGlow(material, false); requestRender(); });
  }
  distanceInput.addEventListener("input", () => { distance = Number(distanceInput.value); placeCamera(); requestRender(); });
  extraInput.addEventListener("input", () => { setExtra(Number(extraInput.value)); requestRender(); });

  canvas.updateElementGeometry(face, { canvasTransform: new DOMMatrix().translate(origin.x, origin.y) });
  await new Promise<void>(resolve => { canvas.addEventListener("paint", () => resolve(), { once: true }); canvas.requestPaint(); });
  place();

  /** Largest on-screen shift of a point `height` above the panel, over the panel's area, at the current camera. */
  const drift = (height: number) => {
    const corners = [world(0, 0), world(face.offsetWidth, 0), world(0, face.offsetHeight), world(face.offsetWidth, face.offsetHeight)];
    return Math.max(...corners.map(([x, y]) => Math.hypot(x, y))) * height / (distance - height);
  };
  const box = () => canvas.getBoundingClientRect();
  status.textContent = `Objects probe ready. Key drift at the panel corner: ${drift(tokens.keyHeight).toFixed(2)} px, taper ${tokens.taper} px.`;
  return {
    dpr,
    tokens: () => tokens,
    /** Finishes any easing, then renders one more frame and reads it back. */
    async settle() {
      for (let guard = 0; guard < 200 && step(); guard++) { renderFrame(engine, 16.67); counts.frames++; }
      // A screenshot completes over later rendered frames, so frames are drained until it resolves (as core does).
      let done = false;
      const shot = captureScreenshot(engine.surfaces[0]!).then(result => { done = true; return result; });
      for (let guard = 0; !done && guard < 120; guard++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (!done) { renderFrame(engine, 16.67); counts.frames++; }
      }
      if (!done) throw new Error("GPU readback did not complete");
      screenshot = await shot;
    },
    project(local: Point): Point { const b = box(); return { x: b.left + canvas.clientLeft + origin.x + local.x, y: b.top + canvas.clientTop + origin.y + local.y }; },
    pixels: (points: Point[]) => points.map(point => {
      const b = box();
      const x = Math.floor((point.x - b.left - canvas.clientLeft) * dpr), y = Math.floor((point.y - b.top - canvas.clientTop) * dpr);
      const offset = (y * screenshot!.width + x) * 4;
      return [...screenshot!.data.subarray(offset, offset + 4)];
    }),
    hits: (points: Point[]) => points.map(hitAt),
    extent: () => ({ ...faceExtent }),
    controls: () => [key, power, level].map(control => ({ id: control.id, ...rectOf(control), radius: parseFloat(getComputedStyle(control).borderTopLeftRadius) || 0 })),
    state: () => ({ ...state, checked: power.checked, value: Number(level.value) }),
    counts: () => ({ ...counts }),
    drift,
    setDistance(value: number) { distance = value; distanceInput.value = String(value); placeCamera(); },
    /** Cost probe: `frames` frames with `count` extra thin instances, timed from render to GPU idle. */
    async measure(count: number, frames: number) {
      setExtra(count);
      const uploads = counts.uploads, times: number[] = [];
      for (let index = 0; index < frames; index++) {
        state.puck = 0.5 + 0.5 * Math.sin(index / 8);
        place();
        const started = performance.now();
        renderFrame(engine, 16.67);
        counts.frames++;
        await waitForGpuIdle(engine);
        times.push(performance.now() - started);
      }
      setExtra(0);
      times.sort((a, b) => a - b);
      return { meshes: casters.length + count, extra: count, frames, uploads: counts.uploads - uploads, drawCalls: engine.drawCallCount,
        mean: times.reduce((sum, time) => sum + time, 0) / frames, p95: times[Math.floor(frames * 0.95)]! };
    },
  };
}

declare global { interface Window { objectsProbe: { ready: Promise<Awaited<ReturnType<typeof start>>>; error?: string } } }
const ready = start();
window.objectsProbe = { ready };
ready.catch(error => { window.objectsProbe.error = String(error); status.textContent = `Probe unavailable: ${error}`; });
