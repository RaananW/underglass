/**
 * A library package's `prepack`: builds the package before `npm pack` or `npm publish`, unless
 * `UNDERGLASS_PREBUILT=1` says every workspace is already built. The Release workflow sets it on its pack
 * step: it builds everything first, and Changesets packs the workspaces in parallel, so a core rebuild
 * (which empties `dist`) raced the adapters' type checks against core's declarations and failed the pack.
 * Run from a package directory (npm runs `prepack` there).
 */
import { execSync } from "node:child_process";

if (process.env.UNDERGLASS_PREBUILT !== "1") execSync("npm run build", { stdio: "inherit" });
