// tests/registry-file.test.mjs — run: npm test
//
// scripts/set-registry.ts used to hold node addresses as a literal and
// replace the whole live `inbounds:registry` with them on every run, so a
// run from an old checkout took every other location offline. It now reads
// the git-ignored registry.local.json, validates it and MERGES it by key
// (scripts/lib/registry-file.ts): entries are added or updated, stored keys
// the file does not mention are kept.
//
// All addresses here are documentation addresses; keys are made up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseRegistryFile, parseStoredRegistry, mergeRegistry } = await import("../scripts/lib/registry-file.ts");

const vless = (key, over = {}) => ({
  key,
  label: key.toUpperCase(),
  flag: "",
  enabled: true,
  priority: 0,
  source: "static",
  address: "203.0.113.10",
  port: 8443,
  serverName: "example.com",
  publicKey: "pk",
  shortId: "ab",
  spiderX: "/",
  fingerprint: "firefox",
  encryption: "none",
  flow: "xtls-rprx-vision",
  ...over,
});
const parse = (value) => parseRegistryFile(JSON.stringify(value), "registry.local.json");

test("the committed example parses: it is the documented shape", () => {
  const raw = readFileSync(new URL("../registry.example.json", import.meta.url), "utf8");
  const entries = parseRegistryFile(raw, "registry.example.json");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, "de");
});

test("valid vless, hysteria2 and panel entries pass", () => {
  const entries = parse([
    vless("de"),
    { key: "nl-hy2", label: "NL", enabled: true, priority: 1, source: "static", protocol: "hysteria2", address: "198.51.100.4", port: 443 },
    { key: "vienna", label: "Austria", enabled: false, priority: 2, source: "panel", inboundId: 1 },
  ]);
  assert.deepEqual(entries.map((e) => e.key), ["de", "nl-hy2", "vienna"]);
});

test("broken files are refused with the reason", () => {
  assert.throws(() => parseRegistryFile("{", "f.json"), /not valid JSON/);
  assert.throws(() => parse([]), /non-empty array/);
  assert.throws(() => parse({}), /non-empty array/);
  assert.throws(() => parse([vless("de"), vless("de")]), /appears twice/);
  assert.throws(() => parse([vless("DE")]), /key must match/);
  assert.throws(() => parse([vless("de", { port: 70000 })]), /out of range/);
  assert.throws(() => parse([vless("de", { port: "8443" })]), /out of range/);
  assert.throws(() => parse([vless("de", { publicKey: "" })]), /publicKey is missing/);
  assert.throws(() => parse([vless("de", { address: "203.0.113.10/32 x" })]), /address/);
  assert.throws(() => parse([vless("de", { enabled: "yes" })]), /enabled/);
  assert.throws(() => parse([vless("de", { source: "ftp" })]), /source/);
  assert.throws(() => parse([{ key: "p", label: "P", enabled: true, priority: 0, source: "panel" }]), /inboundId/);
});

test("an empty shortId is allowed (REALITY accepts it)", () => {
  assert.equal(parse([vless("de", { shortId: "" })]).length, 1);
});

test("merge: add and update by key, never drop a stored key", () => {
  const stored = [vless("de"), vless("pl", { port: 9443 }), vless("uk")];
  const plan = mergeRegistry(stored, [vless("de"), vless("uk", { port: 443 }), vless("se")]);
  assert.deepEqual(plan.unchanged, ["de"]);
  assert.deepEqual(plan.changed, ["uk"]);
  assert.deepEqual(plan.added, ["se"]);
  assert.deepEqual(plan.kept, ["pl"], "a location the local file does not know stays");
  assert.deepEqual(plan.next.map((e) => `${e.key}:${e.port}`), ["de:8443", "pl:9443", "uk:443", "se:8443"]);
});

test("merge into an empty store adds everything", () => {
  const plan = mergeRegistry(parseStoredRegistry(null), [vless("de")]);
  assert.deepEqual(plan.added, ["de"]);
  assert.equal(plan.next.length, 1);
});

test("the stored value is read as Upstash returns it, and junk is refused", () => {
  assert.deepEqual(parseStoredRegistry(JSON.stringify([vless("de")])).map((e) => e.key), ["de"]);
  assert.deepEqual(parseStoredRegistry([vless("de")]).map((e) => e.key), ["de"]);
  assert.throws(() => parseStoredRegistry({ de: 1 }), /not an array/);
});
