// tests/registry-file.test.mjs — run: npm test
//
// scripts/set-registry.ts used to hold node addresses as a literal and
// replace the whole live `inbounds:registry` with them on every run, so a
// run from an old checkout took every other location offline. It now reads
// the git-ignored registry.local.json, validates it and MERGES it by key
// (scripts/lib/registry-file.ts): new keys are added, stored keys the file
// does not mention are kept, and a stored key is updated only when named in
// --update (field by field), with --allow-connection-change on top when its
// address or REALITY parameters change, since a stale local file would put a
// dead address back.
//
// All addresses here are documentation addresses; keys are made up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseRegistryFile, parseStoredRegistry, mergeRegistry, writeRefusal, parseUpdateKeys, CONNECTION_FIELDS } = await import(
  "../scripts/lib/registry-file.ts"
);

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

const opts = (keys, allowConnectionChange = false) => ({ update: new Set(keys), allowConnectionChange });

test("merge: add new keys, never drop a stored key", () => {
  const stored = [vless("de"), vless("pl", { port: 9443 })];
  const plan = mergeRegistry(stored, [vless("de"), vless("se")]);
  assert.deepEqual(plan.unchanged, ["de"]);
  assert.deepEqual(plan.added, ["se"]);
  assert.deepEqual(plan.kept, ["pl"], "a location the local file does not know stays");
  assert.deepEqual(plan.next.map((e) => `${e.key}:${e.port}`), ["de:8443", "pl:9443", "se:8443"]);
});

test("a stale file does not roll a live location back: without --update a differing key is kept as stored", () => {
  // The live registry moved de to a new address and rotated its key; the local file still has the old ones.
  const live = vless("de", { address: "198.51.100.20", publicKey: "pk-new" });
  const plan = mergeRegistry([live], [vless("de", { label: "Germany" })]);
  assert.deepEqual(plan.next, [live], "nothing of the stale file reaches the registry");
  assert.deepEqual(plan.held, [{ key: "de", fields: ["address", "label", "publicKey"], connection: ["address", "publicKey"] }]);
  assert.deepEqual(plan.updated, []);
  assert.equal(writeRefusal(plan), null, "held keys are not an error: new keys can still be added");
});

test("--update applies label, priority and enabled field by field; a stored field the file lacks stays", () => {
  const live = vless("uk", { hy2Sni: "cdn.example.com", priority: 3 });
  const file = vless("uk", { priority: 1, enabled: false });
  const plan = mergeRegistry([live], [file], opts(["uk"]));
  assert.deepEqual(plan.updated, [{ key: "uk", fields: ["enabled", "priority"], connection: [] }]);
  assert.equal(plan.next[0].priority, 1);
  assert.equal(plan.next[0].enabled, false);
  assert.equal(plan.next[0].hy2Sni, "cdn.example.com", "not in the file, not dropped");
  assert.equal(writeRefusal(plan), null);
});

test("a changed address under --update without --allow-connection-change is refused for --write", () => {
  const live = vless("de", { address: "198.51.100.20" });
  const plan = mergeRegistry([live, vless("uk")], [vless("de"), vless("uk", { priority: 2 })], opts(["de", "uk"]));
  assert.deepEqual(plan.blocked, [{ key: "de", fields: ["address"], connection: ["address"] }]);
  assert.deepEqual(plan.next[0], live, "the blocked entry stays as stored in the plan");
  assert.deepEqual(plan.updated.map((d) => d.key), ["uk"]);
  const refusal = writeRefusal(plan);
  assert.match(refusal, /refusing to write/);
  assert.match(refusal, /de \(address\)/);
  assert.doesNotMatch(refusal, /198\.51|203\.0/, "the refusal names fields, never addresses");
});

test("with --allow-connection-change the new address is applied", () => {
  const live = vless("de", { address: "198.51.100.20", shortId: "cd" });
  const plan = mergeRegistry([live], [vless("de")], opts(["de"], true));
  assert.deepEqual(plan.updated, [{ key: "de", fields: ["address", "shortId"], connection: ["address", "shortId"] }]);
  assert.equal(plan.next[0].address, "203.0.113.10");
  assert.equal(writeRefusal(plan), null);
});

test("every REALITY and endpoint field counts as a connection change; the label does not", () => {
  for (const f of ["address", "port", "publicKey", "shortId", "serverName", "source", "inboundId", "protocol", "hy2Pin"]) {
    assert.ok(CONNECTION_FIELDS.includes(f), f);
  }
  for (const f of ["label", "flag", "priority", "enabled"]) assert.ok(!CONNECTION_FIELDS.includes(f), f);
});

test("--update keys must be real keys of the file", () => {
  const file = [vless("de"), vless("uk")];
  assert.deepEqual([...parseUpdateKeys("de, uk,", file)], ["de", "uk"]);
  assert.throws(() => parseUpdateKeys("pl", file), /not in the file/);
  assert.throws(() => parseUpdateKeys("DE", file), /not a registry key/);
  assert.throws(() => parseUpdateKeys("", file), /at least one key/);
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
