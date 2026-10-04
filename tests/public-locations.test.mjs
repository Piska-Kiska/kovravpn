// tests/public-locations.test.mjs — run: npm test
//
// The public pages list the countries Kovra connects to, read from the live
// registry (inbounds:registry). The registry carries connection parameters;
// this repository is public and its pages are crawled, so only a country may
// leave: a code, a flag and a name. These cases pin:
//   • flag <-> ISO code, and which entries become countries (enabled, a valid
//     flag, once, in priority order, Russia kept off the first screen);
//   • that nothing else of an entry reaches the result, whatever it carries;
//   • the bounded reader: any failure is null, never a made-up list, and a
//     slow source cannot hold a build;
//   • the live read of the registry: no fallback to the placeholder entry;
//   • that no client component can import the modules that read the registry.
//
// Entries, hosts and keys here are made up, and no address is written as a
// literal (tests/no-public-ipv4.test.mjs guards the repository).

import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { setRedisModule } from "./support/load-ts.mjs";

setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");
const loc = await import("../src/lib/public-locations.ts");
const read = await import("../src/lib/public-locations-read.ts");
const inbounds = await import("../src/lib/inbounds.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DE = "\u{1F1E9}\u{1F1EA}";
const GB = "\u{1F1EC}\u{1F1E7}";
const US = "\u{1F1FA}\u{1F1F8}";
const RU = "\u{1F1F7}\u{1F1FA}";

/** An entry as the registry holds it, with the kind of fields that must never leave. */
function entry(over = {}) {
  return {
    key: "de",
    label: "SENTINEL-LABEL",
    flag: DE,
    enabled: true,
    priority: 0,
    source: "static",
    address: "sentinel-node-host.invalid",
    port: 4433,
    serverName: "sentinel-sni.invalid",
    publicKey: "SENTINEL-PUBLIC-KEY",
    shortId: "SENTINEL-SHORT-ID",
    ...over,
  };
}

beforeEach(() => {
  mem.reset();
  mock.timers.reset();
});

// ─── flags and codes ───────────────────────────────────────────────

test("a flag emoji is read as its ISO code and written back", () => {
  assert.equal(loc.isoFromFlag(DE), "DE");
  assert.equal(loc.isoFromFlag(` ${GB} `), "GB", "whitespace around the flag is ignored");
  assert.equal(loc.flagFromIso("US"), US);
  for (const code of ["DE", "GB", "US", "RU", "TR", "KZ"]) assert.equal(loc.isoFromFlag(loc.flagFromIso(code)), code);
});

test("anything that is not exactly two regional indicators is no country", () => {
  for (const bad of [undefined, null, "", "DE", "D", `${DE}${GB}`, "\u{1F1E9}", "\u{1F600}", "x\u{1F1E9}"]) {
    assert.equal(loc.isoFromFlag(bad), null, JSON.stringify(bad));
  }
  assert.throws(() => loc.flagFromIso("de"), RangeError);
  assert.throws(() => loc.flagFromIso("DEU"), RangeError);
  assert.throws(() => loc.flagFromIso(""), RangeError);
});

// ─── which entries become countries ────────────────────────────────

test("enabled entries become distinct countries in priority order, the first entry of a country deciding its place", () => {
  const out = loc.publicCountries([
    entry({ key: "us2", flag: US, priority: 30 }),
    entry({ key: "uk", flag: GB, priority: 10 }),
    entry({ key: "de", flag: DE, priority: 0 }),
    entry({ key: "us1", flag: US, priority: 20 }),
  ]);
  assert.deepEqual(out, [
    { code: "DE", flag: DE },
    { code: "GB", flag: GB },
    { code: "US", flag: US },
  ]);
});

test("disabled entries, entries without a usable flag and an empty registry give no country", () => {
  assert.deepEqual(loc.publicCountries([]), []);
  assert.deepEqual(loc.publicCountries([entry({ enabled: false })]), []);
  assert.deepEqual(loc.publicCountries([entry({ flag: undefined })]), []);
  assert.deepEqual(loc.publicCountries([entry({ flag: "Germany" })]), [], "a label is never guessed into a country");
  assert.deepEqual(loc.publicCountries([entry({ label: "USA New York", flag: undefined })]), [], "a city label is ignored");
  assert.deepEqual(loc.publicCountries([null, undefined, entry()]), [{ code: "DE", flag: DE }], "holes in the array are skipped");
});

test("the input is not reordered or changed", () => {
  const input = [entry({ flag: GB, priority: 5 }), entry({ flag: DE, priority: 1 })];
  const before = JSON.stringify(input);
  loc.publicCountries(input);
  assert.equal(JSON.stringify(input), before);
});

test("exclude drops codes whatever their case; the first screen keeps Russia off, the full list keeps it", () => {
  const entries = [entry({ flag: RU, priority: 0 }), entry({ flag: DE, priority: 1 })];
  assert.deepEqual(loc.publicCountries(entries, { exclude: ["ru"] }), [{ code: "DE", flag: DE }]);
  const all = loc.publicCountries(entries);
  assert.deepEqual(all.map((c) => c.code), ["RU", "DE"], "the full list still has Russia");
  assert.deepEqual(loc.firstScreenCountries(all).map((c) => c.code), ["DE"]);
  assert.deepEqual(loc.FIRST_SCREEN_EXCLUDED, ["RU"]);
});

// ─── names ─────────────────────────────────────────────────────────

test("a country is named in every site language, with a fallback that never throws", () => {
  assert.equal(loc.countryName("DE", "en"), "Germany");
  assert.equal(loc.countryName("DE", "de"), "Deutschland");
  assert.equal(loc.countryName("DE", "ru"), "Германия");
  assert.equal(loc.countryName("DE", "es"), "Alemania");
  assert.equal(loc.countryName("DE", "fr"), "Allemagne");
  assert.equal(loc.countryName("GB", "en"), "United Kingdom");
  assert.equal(loc.countryName("DE", "xx"), "Germany", "an unknown language falls back to English");
  assert.equal(loc.countryName("DE", "!!"), "DE", "an invalid language tag falls back to the code");
});

test("nameCountries gives every site language its own name", () => {
  const [de] = loc.nameCountries([{ code: "DE", flag: DE }]);
  assert.deepEqual(Object.keys(de.names).sort(), ["de", "en", "es", "fr", "ru"]);
  assert.equal(de.names.en, "Germany");
  assert.equal(de.names.ru, "Германия");
});

// ─── nothing but a country leaves ──────────────────────────────────

test("only a code, a flag and names leave an entry; its connection parameters do not", async () => {
  const views = await read.readPublicCountries(async () => [entry(), entry({ key: "uk", flag: GB, priority: 1, address: "other-host.invalid", publicKey: "OTHER-KEY" })]);
  assert.ok(views && views.length === 2);
  for (const v of views) assert.deepEqual(Object.keys(v).sort(), ["code", "flag", "names"]);
  const json = JSON.stringify(views);
  for (const secret of ["SENTINEL", "sentinel", "other-host", "OTHER-KEY", "4433", "invalid", "static"]) {
    assert.ok(!json.includes(secret), `"${secret}" reached the result`);
  }
});

// ─── the bounded reader ────────────────────────────────────────────

test("the reader answers the countries of what the source returns", async () => {
  const views = await read.readPublicCountries(async () => [entry({ flag: GB, priority: 1 }), entry({ flag: DE, priority: 0 })]);
  assert.deepEqual(views.map((v) => v.code), ["DE", "GB"]);
});

test("any failure is null: nothing, an empty list, no usable flag, a throwing source", async () => {
  const quiet = mock.method(console, "error", () => {});
  try {
    assert.equal(await read.readPublicCountries(async () => null), null);
    assert.equal(await read.readPublicCountries(async () => []), null);
    assert.equal(await read.readPublicCountries(async () => [entry({ flag: undefined })]), null);
    assert.equal(await read.readPublicCountries(async () => [entry({ enabled: false })]), null);
    assert.equal(
      await read.readPublicCountries(async () => {
        throw new Error("redis is down");
      }),
      null,
    );
    assert.equal(quiet.mock.callCount(), 1, "only the thrown error is logged");
    assert.match(String(quiet.mock.calls[0].arguments.join(" ")), /redis is down/);
  } finally {
    quiet.mock.restore();
  }
});

test("a source slower than the timeout is null, and the timer is cleared when the source answers", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const slow = read.readPublicCountries(() => new Promise(() => {}), read.REGISTRY_READ_TIMEOUT_MS);
  mock.timers.tick(read.REGISTRY_READ_TIMEOUT_MS);
  assert.equal(await slow, null);

  const fast = await read.readPublicCountries(async () => [entry()], 10_000);
  assert.equal(fast.length, 1);
  mock.timers.tick(10_000); // a timer left behind would fire here; nothing may break
  assert.ok(read.REGISTRY_READ_TIMEOUT_MS > 0 && read.REGISTRY_READ_TIMEOUT_MS <= 5000, "a build is never held for long");
});

// ─── the live registry ─────────────────────────────────────────────

const REGISTRY_KEY = "inbounds:registry";

test("the live registry: enabled entries, lowest priority first", async () => {
  mem.store.set(
    REGISTRY_KEY,
    JSON.stringify([entry({ key: "us", flag: US, priority: 20 }), entry({ key: "off", flag: RU, enabled: false, priority: 0 }), entry({ key: "de", flag: DE, priority: 5 })]),
  );
  const live = await inbounds.getLiveEnabledInbounds();
  assert.deepEqual(live.map((e) => e.key), ["de", "us"]);
});

test("an empty or unusable registry is null, never the placeholder entry", async () => {
  assert.equal(await inbounds.getLiveEnabledInbounds(), null, "no key");
  mem.store.set(REGISTRY_KEY, "not json");
  assert.equal(await inbounds.getLiveEnabledInbounds(), null, "malformed");
  mem.store.set(REGISTRY_KEY, JSON.stringify([{ key: "x" }]));
  assert.equal(await inbounds.getLiveEnabledInbounds(), null, "only invalid entries");
  mem.store.set(REGISTRY_KEY, JSON.stringify([entry({ enabled: false })]));
  assert.deepEqual(await inbounds.getLiveEnabledInbounds(), [], "valid but all disabled: an empty list, which the reader turns into null");
  assert.equal(await read.readPublicCountries(inbounds.getLiveEnabledInbounds), null);
});

test("a Redis error rejects, so the cached read is not stored", async () => {
  mem.store.set(REGISTRY_KEY, JSON.stringify([entry()]));
  mem.failNext("get", { key: REGISTRY_KEY });
  await assert.rejects(inbounds.getLiveEnabledInbounds());
  const quiet = mock.method(console, "error", () => {});
  try {
    mem.failNext("get", { key: REGISTRY_KEY });
    assert.equal(await read.readPublicCountries(inbounds.getLiveEnabledInbounds), null, "through the reader it is null");
  } finally {
    quiet.mock.restore();
  }
  const ok = await read.readPublicCountries(inbounds.getLiveEnabledInbounds);
  assert.deepEqual(ok.map((v) => v.code), ["DE"], "and the next read works");
});

// ─── no client component can import the registry ───────────────────

/** Modules that read the registry: nothing that ships to a browser may reach them. */
const SERVER_ONLY = ["src/lib/public-locations-server.ts", "src/lib/inbounds.ts"];

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** The module specifiers a file imports at run time (type-only imports are erased and skipped). */
function runtimeImports(text) {
  const specs = [];
  // The clause may span lines but never a quote or a semicolon, so a bare
  // `import "x"` cannot swallow the statements after it.
  for (const m of text.matchAll(/(?:^|\n)\s*import\s+(?:([^"';]*?)\s+from\s+)?["']([^"']+)["']/g)) {
    const clause = (m[1] ?? "").trim();
    if (clause.startsWith("type ")) continue;
    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (named && named[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
    specs.push(m[2]);
  }
  for (const m of text.matchAll(/(?:^|[^\w.])import\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
  for (const m of text.matchAll(/\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g)) specs.push(m[1]);
  return specs;
}

function resolveSpec(from, spec, files) {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (files.has(cand)) return cand;
  }
  return null;
}

test("the scanner finds run-time imports and skips type-only ones", () => {
  const text = [
    `import { a } from "./a";`,
    `import type { B } from "./b";`,
    `import { type C } from "./c";`,
    `import { type D, e } from "./d";`,
    `import "./side";`,
    `const x = await import("./lazy");`,
    `export { f } from "./f";`,
    `import {`,
    `  g,`,
    `  type H,`,
    `} from "./multi";`,
    `import * as ns from "./star";`,
    `import def, { type I } from "./mixed";`,
    `import {`,
    `  type J,`,
    `  type K,`,
    `} from "./all-types";`,
  ].join("\n");
  const specs = runtimeImports(text);
  for (const want of ["./a", "./d", "./side", "./lazy", "./f", "./multi", "./star", "./mixed"]) assert.ok(specs.includes(want), want);
  for (const skip of ["./b", "./c", "./all-types"]) assert.ok(!specs.includes(skip), skip);
});

test("no client component reaches a module that reads the registry", () => {
  const files = new Set(sourceFiles(join(ROOT, "src")));
  const text = new Map([...files].map((f) => [f, readFileSync(f, "utf8")]));
  const forbidden = new Set(SERVER_ONLY.map((p) => join(ROOT, p)));
  for (const f of forbidden) assert.ok(files.has(f), `${relative(ROOT, f)} exists`);

  const clients = [...files].filter((f) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text.get(f)));
  assert.ok(clients.length > 20, "the client components are found");

  const offenders = [];
  for (const client of clients) {
    // Walk what the client component imports, through every module it pulls in.
    const seen = new Set([client]);
    const queue = [[client, [relative(ROOT, client)]]];
    while (queue.length) {
      const [file, path] = queue.shift();
      for (const spec of runtimeImports(text.get(file))) {
        const target = resolveSpec(file, spec, files);
        if (!target || seen.has(target)) continue;
        seen.add(target);
        const next = [...path, relative(ROOT, target)];
        if (forbidden.has(target)) offenders.push(next.join(" -> "));
        else queue.push([target, next]);
      }
    }
  }
  assert.deepEqual(offenders, [], "a client component must never import the registry readers");
});
