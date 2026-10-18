/// <reference types="@types/webxr" preserve="true" />
/**
 * Public entry point of `@underglass/core`: the framework-neutral runtime that framework adapters
 * (`@underglass/react`, or your own) and plain-DOM applications build on. It holds the shared GPU
 * engine, the mount boundary, enrollment, motion, effects and the typed style compiler, and never
 * imports a UI framework. Anything not re-exported here is internal. Build-time generators
 * (`./build`) and the experimental worker backend (`./experimental-worker`,
 * `./experimental-worker/thread`) are separate package entries.
 */
export { CanvasRuntime } from "./runtime.js";
export type { AdmissionPolicy, LayerDefinition, RuntimeOptions, CanvasController } from "./runtime.js";
export { createCanvasHosts } from "./hosts.js";
export type { CanvasHosts } from "./hosts.js";
export { EnrollmentError } from "./enrollment.js";
export type { EnrollmentOptions, EnrollmentErrorCode } from "./enrollment.js";
export { affine, pivot } from "./affine.js";
export type { Transform, TransformOrigin, Affine, Point } from "./affine.js";
export { compileStyle } from "./compiler.js";
export type { Layout, Appearance, CompiledStyle } from "./compiler.js";
export { mountApplicationModule } from "./module.js";
export type { LocalApplicationModule } from "./module.js";
export type { RendererStatus as CanvasStatus } from "./renderer.js";
export type { AnimationPlayback, ReleaseOptions } from "./animation.js";
export type { CSSAnimationSource } from "./css-animation.js";
export type { CompiledAnimation, CompiledProgramSet } from "./compiled.js";
export type { Ripple } from "./ripple.js";
export { defineEffect } from "./effects.js";
export type { ApplicationEffect, ParameterRange, EffectDescriptor, EffectTime, EffectHandle, EffectResult, MaterialDescriptor, MaterialHandle, CustomMaterial, ReliefMaterial, ObjectsMaterial, StageMaterial, InstrumentMaterial } from "./effects.js";
export type { InstrumentScene, InstrumentObject, InstrumentPart, InstrumentProfile, InstrumentPose, InstrumentRecipe, InstrumentEmitter, InstrumentCaster, InstrumentMeshProfile, InstrumentMeshSource } from "./instrument.js";
export type { ReliefScene, ReliefPrimitive, ReliefObject, ReliefMaterial as ReliefSceneMaterial } from "./relief.js";
export type { SceneEmitter, ProtectedRects } from "./emitters.js";
export type { StageScene, StageParticle } from "./stage.js";
export type { MotionKeyframe, MotionTiming, MotionDescriptor, MotionHandle, TransitionHandle, TransitionResult, CoordinatedMotion } from "./motion.js";
