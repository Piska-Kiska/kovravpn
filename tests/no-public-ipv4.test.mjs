// tests/no-public-ipv4.test.mjs — run: npm test
//
// KS-3: this repository is public, and node addresses are never published.
// scripts/set-registry.ts used to carry five node addresses as a literal,
// and registry.local.json, where they moved, was not git-ignored. The data
// now lives only in git-ignored files, and this test fails when a public IPv4
// address appears in any file git would commit: tracked files, and untracked
// files that are not ignored (so a registry.local.json that lost its ignore
// rule fails here before it can be added).
//
// Allowed: private, loopback, link-local, shared (CGNAT), documentation,
// multicast, reserved and unspecified ranges; well-known public DNS
// resolvers; the Freekassa notification senders (src/lib/freekassa.ts
// FK_IPS, published by Freekassa).
// .gitleaks.toml carries the same rule for scans of history.
//
// SVG files are scanned too, but only where a person could read or follow an
// address: text nodes, comments and href / xlink:href values. Their path
// data is full of dotted quads (four short coordinates written back to back
// read as one), and
// .gitleaks.toml skips SVG under public/ altogether, so this test is the
// guard for SVG.
//
// On failure the message names file:line and the first octet only, so the
// test output does not republish the address.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "./support/load-ts.mjs";

const { FK_IPS } = await import("../src/lib/freekassa.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Binary assets and the lockfile: never hand-written. SVG is scanned in part (svgReadable). */
const SKIP = /(?:^|\/)package-lock\.json$|\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|mp4|zip)$/i;
const SVG = /\.svg$/i;

const PUBLIC_RESOLVERS = new Set(["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4", "9.9.9.9", "77.88.8.8", "77.88.8.1"]);

const DOTTED_QUAD = /(?<![0-9.])((?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3})(?![0-9]|\.[0-9])/g;

/** True for addresses that are not routable on the internet or are documentation. */
function isNonPublic(ip) {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function allowed(ip) {
  return isNonPublic(ip) || PUBLIC_RESOLVERS.has(ip) || FK_IPS.has(ip);
}

/**
 * The parts of an SVG a person reads or follows: text nodes, comments and
 * link targets, each with its offset in the file. Path data, transforms and
 * the other numeric attributes are left out. O(n).
 */
function svgReadable(text) {
  const parts = [];
  for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) parts.push({ index: m.index + 4, value: m[1] });
  const noComments = text.replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length));
  for (const m of noComments.matchAll(/>([^<]+)</g)) parts.push({ index: m.index + 1, value: m[1] });
  for (const m of noComments.matchAll(/\s(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const value = m[1] ?? m[2];
    parts.push({ index: m.index + m[0].length - value.length - 1, value });
  }
  return parts;
}

/** Public addresses in one file, as "file:line (first octet.x.x.x)". */
function findPublic(file, text) {
  const parts = SVG.test(file) ? svgReadable(text) : [{ index: 0, value: text }];
  const hits = [];
  for (const part of parts) {
    for (const m of part.value.matchAll(DOTTED_QUAD)) {
      if (allowed(m[1])) continue;
      const line = text.slice(0, part.index + m.index).split("\n").length;
      hits.push(`${file}:${line} (${m[1].split(".")[0]}.x.x.x)`);
    }
  }
  return hits;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

let gitWorks = true;
try {
  git(["rev-parse", "--is-inside-work-tree"]);
} catch {
  gitWorks = false;
}

test("the classifier: private and documentation ranges pass, a public address does not", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.5.4", "172.31.255.255", "192.168.1.1", "169.254.1.1", "100.64.0.1", "192.0.2.10", "198.51.100.7", "203.0.113.10", "0.0.0.0", "255.255.255.255"]) {
    assert.equal(isNonPublic(ip), true, ip);
  }
  // Built at run time, so this file itself holds no public literal.
  const quad = (...octets) => octets.join(".");
  for (const ip of [quad(172, 32, 0, 1), quad(11, 0, 0, 1), quad(100, 128, 0, 1), quad(192, 0, 3, 1), quad(203, 0, 114, 1), "8.8.8.8"]) {
    assert.equal(isNonPublic(ip), false, ip);
  }
  assert.equal(allowed(quad(11, 0, 0, 1)), false);
  assert.ok(allowed("1.1.1.1") && allowed("77.88.8.8"), "public resolvers are allowed by name");
});

test("SVG: an address in text, a comment or a link is found; path data is not an address", () => {
  const quad = (...octets) => octets.join(".");
  const addr = quad(45, 12, 34, 56);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">`,
    `  <path d="M${addr} ${quad(12, 5, 3, 8)}L${quad(1, 2, 3, 4)}z" transform="matrix(${addr})"/>`,
    `  <text x="1" y="2">${addr}</text>`,
    `  <!-- node ${addr} -->`,
    `  <a xlink:href="http://${addr}/x"><circle r="1"/></a>`,
    `  <image href='https://${addr}/i.png'/>`,
    `</svg>`,
  ].join("\n");
  assert.deepEqual(findPublic("public/x.svg", svg), [
    "public/x.svg:4 (45.x.x.x)",
    "public/x.svg:3 (45.x.x.x)",
    "public/x.svg:5 (45.x.x.x)",
    "public/x.svg:6 (45.x.x.x)",
  ]);
  assert.equal(findPublic("public/x.svg", svg.replace(/<text[^]*$/, "</svg>")).length, 0, "path data and transforms alone: nothing");
  assert.equal(findPublic("src/x.ts", `const a = "${addr}";`).length, 1, "other files: every line");
});

test("no public IPv4 address in any file git would commit", { skip: !gitWorks && "git is not available" }, () => {
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  assert.ok(files.length > 100, "the file list looks wrong");
  const hits = [];
  for (const file of files) {
    if (SKIP.test(file)) continue;
    let text;
    try {
      const buf = readFileSync(join(ROOT, file));
      if (buf.subarray(0, 8000).includes(0)) continue;
      text = buf.toString("utf8");
    } catch {
      continue; // listed but deleted in the worktree
    }
    hits.push(...findPublic(file, text));
  }
  assert.deepEqual(hits, [], "public IPv4 addresses found; node addresses go into registry.local.json");
});

test("the local registry files are git-ignored", { skip: !gitWorks && "git is not available" }, () => {
  for (const f of ["registry.local.json", "registry.backup-2026-01-01T00-00-00-000Z.local.json"]) {
    // check-ignore exits 0 when the path is ignored, 1 when it is not.
    assert.doesNotThrow(() => git(["check-ignore", "-q", "--no-index", f]), `${f} must be ignored`);
  }
  assert.throws(() => git(["check-ignore", "-q", "--no-index", "registry.example.json"]), "the example stays tracked");
});
