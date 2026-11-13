/**
 * Backend comparison used by `probe.ts` (`probe.html`, exposed as `window.nativeProbe.backend`). It captures two
 * DOM elements into 2D staging canvases and uploads them as textures to either the Lite WebGPU engine or the Lite
 * WebGL2 engine, then draws both layers with one shader. Tests use it to compare capture and upload cost and to
 * check that every engine, texture, effect, snapshot and canvas is released again (`resources` counts).
 * Only one backend may be live at a time.
 */
import type { DrawableCanvas } from "./native";
import { isDrawableContext, waitForPaint } from "./native";
import {
  createEngine, disposeEngine, createDynamicTexture, updateDynamicTexture, releaseTexture,
  createEffectWrapper, disposeEffectWrapper, setEffectTexture, createEffectRenderer,
  registerEffectRenderer, unregisterEffectRenderer, disposeEffectRenderer, setEngineSize,
  setEffectUniforms, renderFrame,
} from "@babylonjs/lite";
import {
  createGLEngine, disposeGLEngine, createDynamicTexture as createGLTexture,
  updateDynamicTexture as updateGLTexture, clearDynamicTextureSource, disposeTexture,
  createEffectWrapper as createGLEffect, disposeEffectWrapper as disposeGLEffect,
  isEffectReady, setViewport, applyEffectWrapper, setEffectTexture as setGLTexture,
  setEffectFloat, drawEffect,
} from "@babylonjs/lite-gl";

// The two Lite backends expose different entry points; each is gathered into one object so `start` can pick a
// set and share the capture and upload code.
const gpuApi = {
  createEngine, disposeEngine, createDynamicTexture, updateDynamicTexture, releaseTexture,
  createEffectWrapper, disposeEffectWrapper, setEffectTexture, createEffectRenderer,
  registerEffectRenderer, unregisterEffectRenderer, disposeEffectRenderer, setEngineSize,
  setEffectUniforms, renderFrame,
};
const glApi = {
  createGLEngine, disposeGLEngine, createDynamicTexture: createGLTexture, updateDynamicTexture: updateGLTexture,
  clearDynamicTextureSource, disposeTexture, createEffectWrapper: createGLEffect,
  disposeEffectWrapper: disposeGLEffect, isEffectReady, setViewport, applyEffectWrapper,
  setEffectTexture: setGLTexture, setEffectFloat, drawEffect,
};

/** Which Lite engine to drive. */
type Backend = "webgpu" | "webgl2";
// Resolves with the next animation-frame timestamp.
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/**
 * Creates the probe for a drawable `host` canvas and the `elements` to capture (the first two are used as the
 * two shader layers). Returns `start`, `update`, `frames`, `dispose` and the `resources`/`metrics` counters.
 */
export function createBackendProbe(host: DrawableCanvas, elements: readonly HTMLElement[]) {
  // `resources` counts live objects and must return to zero after `dispose`; `metrics` accumulates timings and
  // byte counts and is reset by each `start`.
  const resources = { engines: 0, textures: 0, effects: 0, stagingCanvases: 0, snapshots: 0, outputCanvases: 0 };
  const metrics = { captures: 0, pixelCopies: 0, generatedSources: 0, uploads: 0, uploadBytes: 0, captureMs: [] as number[], uploadMs: [] as number[], frameWorkMs: [] as number[], frameIntervalsMs: [] as number[] };
  let release: (() => void) | undefined;
  let draw: ((offset: number, phase: number) => void) | undefined;
  let upload: ((index: number) => void) | undefined;
  let staging: HTMLCanvasElement[] = [];
  // `starting` also covers the late-engine case: after a timeout the flag is only cleared once the engine
  // creation that timed out has settled (the engine is disposed, or creation failed).
  let starting = false;
  // How pixels reach the staging canvases: "native" draws the element snapshot into the staging 2D context,
  // "generated" paints synthetic colours (upload smoke test, no capture API), and "owning-staged" draws the
  // snapshot on the host canvas first, then copies those pixels.
  let sourceMode: "native" | "generated" | "owning-staged" = "native";

  // Refreshes `staging[index]` from `elements[index]`. Snapshots are closed in `finally` so none stay live.
  async function capture(index: number) {
    const element = elements[index];
    const canvas = staging[index];
    if (!element || !canvas) throw new Error("Unknown capture layer");
    if (sourceMode === "generated") {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Generated-pixel context unavailable");
      context.fillStyle = index === 0 ? "rgb(240,30,60)" : "rgb(20,200,90)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (index === 0) {
        context.fillStyle = "white";
        context.font = "16px sans-serif";
        context.fillText(`Upload smoke ${metrics.generatedSources}`, 0, 20);
      }
      metrics.generatedSources++;
      return;
    }
    // Wait for a paint before capturing the element.
    await waitForPaint(host);
    const started = performance.now();
    const snapshot = host.captureElementImage(element);
    resources.snapshots++;
    metrics.captures++;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Pixel staging context unavailable");
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (sourceMode === "owning-staged") {
        const owner = host.getContext("2d");
        if (!owner || !isDrawableContext(owner)) throw new Error("Owning native 2D context unavailable");
        owner.clearRect(0, 0, host.width, host.height);
        try {
          owner.drawElementImage(snapshot, 0, 0, { preserveElementGeometry: true });
          context.drawImage(host, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
          metrics.pixelCopies++;
        } finally { owner.clearRect(0, 0, host.width, host.height); }
      } else {
        if (!isDrawableContext(context)) throw new Error("Staging drawElementImage unavailable");
        context.drawElementImage(snapshot, 0, 0, { preserveElementGeometry: true });
      }
    } finally {
      snapshot.close();
      resources.snapshots--;
      metrics.captureMs.push(performance.now() - started);
    }
  }

  // Uploads one staging canvas to its texture and records time and bytes (RGBA, 4 bytes per pixel).
  function push(index: number) {
    if (!upload) throw new Error("Backend is not initialized");
    const started = performance.now();
    upload(index);
    metrics.uploadMs.push(performance.now() - started);
    metrics.uploads++;
    metrics.uploadBytes += staging[index].width * staging[index].height * 4;
  }

  return {
    resources, metrics,
    // Builds the backend: output canvas, staging canvases, a first capture of every layer, the engine, textures and
    // shader, then uploads and draws once. Everything created is registered in `cleanup` (run in reverse) so a
    // failure at any step releases what was built so far.
    async start(backend: Backend, mode: "native" | "generated" | "owning-staged" = "native") {
      if (release || starting) throw new Error("Serial lifetimes required: dispose the previous backend first");
      starting = true;
      sourceMode = mode;
      metrics.captures = metrics.pixelCopies = metrics.generatedSources = metrics.uploads = metrics.uploadBytes = 0;
      metrics.captureMs.length = metrics.uploadMs.length = metrics.frameWorkMs.length = metrics.frameIntervalsMs.length = 0;
      const cleanup: (() => void)[] = [];
      let awaitingLateEngine = false;
      try {
        const output = document.createElement("canvas");
        output.id = "backend-output";
        output.width = 480;
        output.height = 300;
        output.style.cssText = "width:480px;height:300px;display:block;margin:20px";
        document.body.append(output);
        resources.outputCanvases++;
        cleanup.push(() => { output.remove(); resources.outputCanvases--; });
        staging = elements.map((element) => {
          const canvas = document.createElement("canvas");
          canvas.width = element.offsetWidth;
          canvas.height = element.offsetHeight;
          resources.stagingCanvases++;
          return canvas;
        });
        cleanup.push(() => {
          for (const canvas of staging) { canvas.width = 0; canvas.height = 0; resources.stagingCanvases--; }
          staging = [];
        });
        for (let index = 0; index < elements.length; index++) await capture(index);

        if (backend === "webgpu") {
          const api = gpuApi;
          let timedOut = false;
          let timer: ReturnType<typeof setTimeout> | undefined;
          // Race engine creation against a 5 s timer. If it finishes after the timeout, dispose that engine as soon as
          // it arrives so it does not leak.
          const pending = api.createEngine(output, { msaaSamples: 1, maxDevicePixelRatio: 1 }).then((engine) => {
            if (timedOut) {
              api.disposeEngine(engine);
              starting = false;
            }
            return engine;
          }, (error: unknown) => {
            if (timedOut) starting = false;
            throw error;
          });
          let engine;
          try {
            engine = await Promise.race([
              pending,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  timedOut = true;
                  awaitingLateEngine = true;
                  reject(new Error("Lite WebGPU initialization timed out after 5000 ms"));
                }, 5000);
              }),
            ]);
          } finally { clearTimeout(timer); }
          resources.engines++;
          cleanup.push(() => { api.disposeEngine(engine); resources.engines--; });
          const textures = staging.map((source) => {
            const texture = api.createDynamicTexture(engine, source.width, source.height);
            resources.textures++;
            cleanup.push(() => { api.releaseTexture(texture); resources.textures--; });
            return texture;
          });
          // WebGPU shader: layer `first` is drawn at (40 + offset, 40) sized 200x140 and `second` at (270, 40) sized 30x30
          // (output pixels). `state.x` is the horizontal offset and `state.y` darkens the second layer.
          const effect = api.createEffectWrapper(engine, {
            name: "native-layer-probe",
            bindings: [
              { binding: 0, kind: "texture", name: "first" },
              { binding: 1, kind: "sampler", textureBinding: "first" },
              { binding: 2, kind: "texture", name: "second" },
              { binding: 3, kind: "sampler", textureBinding: "second" },
              { binding: 4, kind: "uniform", uniformByteLength: 16 },
            ],
            fragmentWGSL: `
@group(0) @binding(0) var first: texture_2d<f32>;
@group(0) @binding(1) var firstSampler: sampler;
@group(0) @binding(2) var second: texture_2d<f32>;
@group(0) @binding(3) var secondSampler: sampler;
@group(0) @binding(4) var<uniform> state: vec4<f32>;
@fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4<f32> {
  let p = input.position.xy;
  let a = (p - vec2<f32>(40.0 + state.x, 40.0)) / vec2<f32>(200.0, 140.0);
  let b = (p - vec2<f32>(270.0, 40.0)) / vec2<f32>(30.0, 30.0);
  var color = vec4<f32>(1.0);
  if (all(a >= vec2<f32>(0.0)) && all(a < vec2<f32>(1.0))) {
    color = textureSampleLevel(first, firstSampler, a, 0.0);
  }
  if (all(b >= vec2<f32>(0.0)) && all(b < vec2<f32>(1.0))) {
    color = textureSampleLevel(second, secondSampler, b, 0.0);
    color = vec4<f32>(color.rgb * (1.0 - 0.5 * state.y), color.a);
  }
  return color;
}`,
          });
          resources.effects++;
          cleanup.push(() => { api.disposeEffectWrapper(effect); resources.effects--; });
          api.setEffectTexture(effect, "first", textures[0]);
          api.setEffectTexture(effect, "second", textures[1]);
          const renderer = api.createEffectRenderer(engine.surfaces[0], effect);
          api.registerEffectRenderer(renderer);
          cleanup.push(() => { api.unregisterEffectRenderer(renderer); api.disposeEffectRenderer(renderer); });
          api.setEngineSize(engine, 480, 300);
          upload = (index) => api.updateDynamicTexture(engine, textures[index], staging[index], { invertY: false });
          draw = (offset, phase) => {
            api.setEffectUniforms(effect, new Float32Array([offset, phase, 0, 0]));
            api.renderFrame(engine, 16.67);
          };
        } else {
          const api = glApi;
          // `preserveDrawingBuffer` keeps the last frame readable after drawing so tests can sample pixels.
          const engine = api.createGLEngine(output, { preserveDrawingBuffer: true });
          resources.engines++;
          cleanup.push(() => { api.disposeGLEngine(engine); resources.engines--; });
          const textures = staging.map((source) => {
            const texture = api.createDynamicTexture(engine, source.width, source.height);
            resources.textures++;
            cleanup.push(() => { api.clearDynamicTextureSource(texture); api.disposeTexture(texture); resources.textures--; });
            return texture;
          });
          const effect = api.createEffectWrapper(engine, {
            name: "native-layer-probe",
            uniformNames: ["offset", "phase"],
            samplerNames: ["first", "second"],
            fragmentSource: `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D first;
uniform sampler2D second;
uniform float offset;
uniform float phase;
out vec4 outColor;
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * vec2(480.0, 300.0);
  vec2 a = (p - vec2(40.0 + offset, 40.0)) / vec2(200.0, 140.0);
  vec2 b = (p - vec2(270.0, 40.0)) / vec2(30.0, 30.0);
  outColor = vec4(1.0);
  if (all(greaterThanEqual(a, vec2(0.0))) && all(lessThan(a, vec2(1.0)))) outColor = texture(first, a);
  if (all(greaterThanEqual(b, vec2(0.0))) && all(lessThan(b, vec2(1.0)))) {
    outColor = texture(second, b);
    outColor.rgb *= 1.0 - 0.5 * phase;
  }
}`,
          });
          resources.effects++;
          cleanup.push(() => { api.disposeEffectWrapper(effect); resources.effects--; });
          // Wait until the effect reports ready, polling once per frame, with a 1.5 s limit.
          const deadline = performance.now() + 1500;
          while (!api.isEffectReady(effect.effect)) {
            if (performance.now() > deadline) throw new Error("Lite GL shader compilation timed out");
            await nextFrame();
          }
          // The GL fragment shader flips Y itself (`1.0 - vUv.y`) when computing pixel coordinates.
          upload = (index) => api.updateDynamicTexture(textures[index], staging[index], { invertY: false, premultiplyAlpha: false });
          draw = (offset, phase) => {
            api.setViewport(engine);
            api.applyEffectWrapper(effect);
            api.setEffectTexture(effect.effect, "first", textures[0]);
            api.setEffectTexture(effect.effect, "second", textures[1]);
            api.setEffectFloat(effect.effect, "offset", offset);
            api.setEffectFloat(effect.effect, "phase", phase);
            api.drawEffect(engine);
          };
        }
        for (let index = 0; index < elements.length; index++) push(index);
        // Reverse-order disposal; clears the hooks so a new backend can start.
        release = () => {
          for (const dispose of cleanup.reverse()) dispose();
          release = undefined; draw = undefined; upload = undefined;
        };
        draw(0, 0);
        await nextFrame();
        return { backend, sourceMode, resources: { ...resources }, metrics: structuredClone(metrics) };
      } catch (error) {
        for (const dispose of cleanup.reverse()) dispose();
        draw = undefined; upload = undefined;
        throw error;
      } finally {
        if (!awaitingLateEngine) starting = false;
      }
    },
    async update(index: number) {
      await capture(index);
      push(index);
      if (!draw) throw new Error("Backend is not initialized");
      draw(0, 0);
      await nextFrame();
    },
    // Draws `count` animation frames with a sinusoidal offset and alternating darkening, recording frame interval
    // and CPU work per frame. It never captures or uploads; the returned counts show that stayed unchanged.
    async frames(count = 300) {
      if (!draw) throw new Error("Backend is not initialized");
      const before = { captures: metrics.captures, uploads: metrics.uploads };
      let last = await nextFrame();
      for (let index = 0; index < count; index++) {
        const now = await nextFrame();
        metrics.frameIntervalsMs.push(now - last);
        last = now;
        const start = performance.now();
        draw(Math.sin(index / 20) * 20, index % 2);
        metrics.frameWorkMs.push(performance.now() - start);
      }
      draw(0, 1);
      await nextFrame();
      return { frames: count, newCaptures: metrics.captures - before.captures, newUploads: metrics.uploads - before.uploads, metrics: structuredClone(metrics) };
    },
    // Synchronous release of all resources; refused while `start` is still waiting on the engine.
    dispose() {
      if (starting) throw new Error("Cannot dispose while backend initialization is pending");
      release?.();
      return { ...resources };
    },
  };
}
