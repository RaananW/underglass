/**
 * `@underglass/ui/tokens`: the Strata design tokens and their framework-neutral runtime. The token source is
 * W3C Design Tokens JSON (also exported as `@underglass/ui/tokens.json`); the stylesheet generated from it is
 * `@underglass/ui/css/tokens.css`.
 * It also holds the Strata rendering model (`docs/ui-library/rendering-model.md`): the scene format, its reference
 * implementation and the conformance suite.
 */
import { strataSource } from "./source.ts";
import type { TokenGroup } from "./model.ts";

/** The Strata token source (W3C Design Tokens format). */
export const strataTokens: TokenGroup = strataSource;

export { blend, flatten, namespace, numeric, resolve, themesOf, valueOf } from "./model.ts";
export type { ResolveOptions, ThemeInfo, Token, TokenGroup, TokenMeta, TokenNode, TokenValue } from "./model.ts";
export { contrast, luminance, nearBlack, onColour, parseHex, scale, textColour, toHex } from "./contrast.ts";
export type { Rgb } from "./contrast.ts";
export { validateTokens } from "./validate.ts";
export type { Issue } from "./validate.ts";
export { cssVariable, layerOrder, literal as tokenCssValue, tokensToCss } from "./css.ts";
export type { TokensCssOptions } from "./css.ts";
export { finish, finishGradient, finishRecipes } from "./finish.ts";
export type { FinishRecipe } from "./finish.ts";
export { StrataThemeError, createStrataTheme, loadStrataTheme, themeTokenPaths } from "./theme.ts";
export type { CreateThemeOptions, StrataTheme, StrataThemeInput, ThemedColour } from "./theme.ts";
export { sceneFaces, sceneObjects, bevelProfiles, isSceneObject, scenePrimitiveBudget, sceneSettings, validateScene } from "./scene.ts";
export type { BevelProfile, SceneEntry, SceneFace, SceneIssue, SceneMaterial, SceneObject, SceneObjectKind, ScenePrimitive, SceneSettings, SceneState, StrataReliefScene, StrataScene } from "./scene.ts";
export { cameraOf, domeHit, domeObjects, environmentTerm, objectDistance, objectDrawable, reliefEquivalent, resolveObject, sideNormal, solidObjects, studio } from "./objects.ts";
export type { DomeHit, ResolvedObject } from "./objects.ts";
export { bevelSlopeMax, drawnArea, guardRamp, lightVector, profileAngle, renderScene, roundedBoxDistance, shadePoint, shadingTerms } from "./shade.ts";
export type { CapturedColour, Rgb01, Rgba, ShadingTerms } from "./shade.ts";
export { buildConformance, buildObjectsConformance, buildSceneConformance, capturedFrom, conformanceCases, conformanceTolerance, objectsCases, sceneCases } from "./conformance.ts";
export { backdropColour, environmentColumns, environmentRows, environmentSample, particleAt, particleOrder, shadeStage, stageParticleBudget, validateEnvironmentMap, validateStageScene } from "./stage.ts";
export type { EnvironmentMap, StageIssue, StageParticle, StageScene } from "./stage.ts";
export type { CapturePaint, ConformanceCase, ConformanceSample, ConformanceSuite } from "./conformance.ts";
export {
  BOUNDS_TOLERANCE, CAMERA_FLOOR, CONTAINMENT_MARGIN, DIELECTRIC_F0, ENVIRONMENT_SAMPLES, INSTRUMENT_EMITTERS, PART_CONTRAST, PART_EXPOSURE, PREFILTER_MIPS,
  encodePart, environmentTurn, reflectanceTable, specularEnvironment, studioIrradiance, INSTRUMENT_MATERIALS, INSTRUMENT_MATERIALS_CEILING, INSTRUMENT_OBJECTS, INSTRUMENT_OBJECT_PARTS,
  INSTRUMENT_PARTS_PER_LAYER, INSTRUMENT_PROFILES, INSTRUMENT_PROTECTED, INSTRUMENT_SCENE_PARTS, InstrumentSceneError, REFERENCE_STAGE, STUDIO_DEFAULTS,
  bindingVertex, boxDistance, boxForTravel, cameraDistance, capColour, captureTexture, drift, emitterTerm, enc, faceEmitters, faceFactor, glassSample,
  instrumentFaceScene, lin, mapShadowed, multiply, objectContained, partCaster, partColour, partHit, partKinds, partMatrix, partShadow, partTerms,
  posedVertices, poseAt, poseMatrix, profileBounds, profileHeight, profileMesh, project, protectedDistance, rotate, shadeFace, shadeInstrument, shadePart,
  steppedDown, studioHdr, studioRadiance, studioRotation, transform, travelFootprint, travelSteps, validateInstrumentScene,
} from "./instrument.ts";
export type {
  Box, FaceFactor, GlassSample, InstrumentCaster, InstrumentEmitter, InstrumentObject, InstrumentPart, InstrumentPoint, InstrumentPose, InstrumentProfile,
  InstrumentRecipe, InstrumentScene, Matrix, ObjectContainment, PartHit, PartKind, PartMesh, PartShadingOptions, PartTerms, StudioTokens, TravelVertex, Vec2, Vec3,
} from "./instrument.ts";
export { applyVariant, buildInstrumentConformance, instrumentCases, instrumentExpectations, instrumentScales, instrumentTolerance } from "./instrument-conformance.ts";
export type { ExactSample, InstrumentCase, InstrumentCheck, InstrumentSuite, InstrumentVariant, RatioSample, SampledSeed, ScaledColour } from "./instrument-conformance.ts";
export { charactersToCss } from "./character-css.ts";
export { applyCharacter, characterNames, characterOf, defaultCharacter, instrumentSettings, isProvisional } from "./character.ts";
export type { AppliedCharacter, CharacterInfo, InstrumentSettings, StrataCharacter } from "./character.ts";
