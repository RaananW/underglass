/**
 * Writes the Strata rendering model's conformance suites, `conformance/relief-1.json`, `conformance/objects-2.json`,
 * `conformance/scene-3.json` and `conformance/instrument-4.json`, from the cases in `src/tokens/conformance.ts` and
 * `src/tokens/instrument-conformance.ts` and the reference implementation. Run after changing the model or the cases
 * (`npm run build:conformance` in this package); the unit tests fail while a committed suite is out of date.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { buildConformance, buildObjectsConformance, buildSceneConformance } from "../src/tokens/conformance.ts";
import { buildInstrumentConformance } from "../src/tokens/instrument-conformance.ts";

const directory = new URL("../conformance/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, suite] of [["relief-1.json", buildConformance()], ["objects-2.json", buildObjectsConformance()], ["scene-3.json", buildSceneConformance()]]) {
  await writeFile(new URL(name, directory), `${JSON.stringify(suite, null, 2)}\n`);
  console.log(`strata conformance: wrote conformance/${name} (${suite.cases.length} cases, ${suite.cases.reduce((total, entry) => total + entry.samples.length, 0)} samples)`);
}
const instrument = buildInstrumentConformance();
await writeFile(new URL("instrument-4.json", directory), `${JSON.stringify(instrument, null, 2)}\n`);
const checks = instrument.cases.flatMap(entry => entry.checks);
const kinds = Object.entries(Object.groupBy(checks, check => check.kind)).map(([kind, list]) => `${list.length} ${kind}`).join(", ");
const points = checks.reduce((total, check) => total + (check.samples?.length ?? 0), 0);
console.log(`strata conformance: wrote conformance/instrument-4.json (${instrument.cases.length} cases, ${checks.length} checks: ${kinds}; ${points} points at ${instrument.scales.length} scales)`);
