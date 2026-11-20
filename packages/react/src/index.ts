/**
 * Public entry point of `@underglass/react`: the typed React components and hooks and the explicit
 * `mountCanvasApp` bootstrap, plus the framework-neutral host helpers, enrollment errors, trusted
 * local module adapter and public authoring, motion and effect types re-exported from
 * `@underglass/core`. Anything not re-exported here is internal. Build-time generators (`./build`)
 * and the experimental worker backend (`./experimental-worker`, `./experimental-worker/thread`)
 * are separate package entries.
 */
export { GPUHost, Surface, Box, NativeScroll, NativeOverlay, Presence, useSurfaceRef, useNativeOverlayHost, useGPUHost, mountCanvasApp, prerenderCanvasApp } from "./react.js";
export type { SurfaceProps, BoxProps, PresenceProps, MountCanvasOptions } from "./react.js";
// Named re-exports of core, the same as `@underglass/vue`'s plus `canvasHostsMarkup` (prerendering);
// `tests/unit/adapter-exports.unit.test.mjs` holds the two lists to each other.
export { createCanvasHosts, canvasHostsMarkup, EnrollmentError, mountApplicationModule, defineEffect } from "@underglass/core";
export type {
  CanvasController, CanvasHosts, EnrollmentOptions, EnrollmentErrorCode, Transform, TransformOrigin, Affine, Point,
  Layout, Appearance, LocalApplicationModule, AdmissionPolicy, LayerDefinition, RuntimeOptions, CanvasStatus,
  AnimationPlayback, ReleaseOptions, CSSAnimationSource, CompiledAnimation, CompiledProgramSet, Ripple,
  ApplicationEffect, ParameterRange, EffectDescriptor, EffectTime, EffectHandle, EffectResult, MaterialDescriptor, MaterialHandle, CustomMaterial, ReliefMaterial, ReliefScene, ReliefPrimitive, ReliefSceneMaterial,
  MotionKeyframe, MotionTiming, MotionDescriptor, MotionHandle, TransitionHandle, TransitionResult, CoordinatedMotion,
} from "@underglass/core";
