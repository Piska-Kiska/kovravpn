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

/** Assets and lockfiles: never hand-written, and SVG path data looks like dotted quads. */
const SKIP = /(?:^|\/)package-lock\.json$|\.(?:png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|pdf|mp4|zip)$/i;

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
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(DOTTED_QUAD)) {
        if (!allowed(m[1])) hits.push(`${file}:${i + 1} (${m[1].split(".")[0]}.x.x.x)`);
      }
    });
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
