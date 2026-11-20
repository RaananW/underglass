/**
 * `@underglass/react/build`: the build-only generators of `@underglass/core/build`, re-exported so
 * existing build scripts keep their import. Do not import this entry into browser runtime code.
 * Named, not `export *`, so a new export of the core entry does not join this one unnoticed.
 */
export { compositionShader, layerShader, compileTimeline, parseTransform, affine, workerCompositorProgram } from "@underglass/core/build";
export type { CompiledAnimation, CompiledProgramSet } from "@underglass/core/build";
