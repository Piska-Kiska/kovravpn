// tests/node-uuids.test.mjs — run: node --test tests/
//
// The pure part of GET /api/internal/node-uuids (src/lib/node-uuids-body.ts),
// loaded under Node's type stripping.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  NODE_BODY_WINDOW_MS,
  NODE_MIN_ACTIVE_DEFAULT,
  NODE_NAME_RE,
  accessPairs,
  accessUntil,
  buildNodeUuidsBody,
  nodeBeatKey,
  nodeMinActive,
  normalizeUuid,
} from "../src/lib/node-uuids-body.ts";

const NOW = 1_790_000_000_000;
const DAY = 86_400_000;
const A = "0a1b2c3d-0000-4000-8000-00000000000a";
const B = "0a1b2c3d-0000-4000-8000-00000000000b";
const C = "0a1b2c3d-0000-4000-8000-00000000000c";

test("accessUntil takes the furthest date of any subscription, active or not", () => {
  assert.equal(accessUntil([{ expiresAt: NOW + DAY }, { expiresAt: NOW + 5 * DAY }, { expiresAt: NOW - DAY }]), NOW + 5 * DAY);
  assert.equal(accessUntil([{ expiresAt: NOW - 2 * DAY }]), NOW - 2 * DAY);
});

test("accessUntil ignores junk and gives null when nothing is usable", () => {
  assert.equal(accessUntil(undefined), null);
  assert.equal(accessUntil("[]"), null);
  assert.equal(accessUntil([]), null);
  assert.equal(accessUntil([null, 5, { expiresAt: "1790000000000" }, { expiresAt: -1 }, { expiresAt: Infinity }]), null);
  assert.equal(accessUntil([{ expiresAt: 9_999_999_999_999 }]), null, "a date past 2100 is corruption");
  assert.equal(accessUntil([{ expiresAt: NOW + 0.7 }]), NOW, "dates are whole milliseconds");
});

test("normalizeUuid lower-cases and rejects anything else", () => {
  assert.equal(normalizeUuid(A.toUpperCase()), A);
  assert.equal(normalizeUuid(` ${A} `), A);
  assert.equal(normalizeUuid("not-a-uuid"), null);
  assert.equal(normalizeUuid(42), null);
});

test("accessPairs gives every profile of a user the user's date, like syncAllExpiry does", () => {
  const { pairs, malformed } = accessPairs([
    { profiles: [{ uuid: A }, { uuid: B }], subs: [{ expiresAt: NOW + 30 * DAY }] },
    { profiles: [{ uuid: C }], subs: [] },
    { profiles: null, subs: [{ expiresAt: NOW + DAY }] },
  ]);
  assert.deepEqual(pairs, [
    { uuid: A, until: NOW + 30 * DAY },
    { uuid: B, until: NOW + 30 * DAY },
  ]);
  assert.equal(malformed, 0, "no subscription and no profiles are normal, not malformed");
});

test("accessPairs counts malformed profiles and keeps the rest", () => {
  const { pairs, malformed } = accessPairs([
    { profiles: [{ uuid: "x" }, null, { uuid: A }], subs: [{ expiresAt: NOW + DAY }] },
    { profiles: { uuid: B }, subs: [{ expiresAt: NOW + DAY }] },
  ]);
  assert.deepEqual(pairs, [{ uuid: A, until: NOW + DAY }]);
  assert.equal(malformed, 3);
});

test("buildNodeUuidsBody: sorted `<uuid> <date>` lines, trailing newline, ETag of the body", () => {
  const built = buildNodeUuidsBody(
    [
      { uuid: B, until: NOW + DAY },
      { uuid: A, until: NOW + 2 * DAY },
    ],
    NOW,
    1,
  );
  assert.equal(built.ok, true);
  assert.equal(built.body, `${A} ${NOW + 2 * DAY}\n${B} ${NOW + DAY}\n`);
  assert.equal(built.etag, `"${createHash("sha256").update(built.body).digest("hex").slice(0, 32)}"`);
  assert.equal(built.live, 2);
  assert.equal(built.total, 2);
});

test("buildNodeUuidsBody keeps a lapsed device for a day, then drops it", () => {
  const built = buildNodeUuidsBody(
    [
      { uuid: A, until: NOW + DAY },
      { uuid: B, until: NOW - DAY + 1000 },
      { uuid: C, until: NOW - NODE_BODY_WINDOW_MS },
    ],
    NOW,
    1,
  );
  assert.equal(built.ok, true);
  assert.equal(built.live, 1);
  assert.equal(built.total, 2);
  assert.match(built.body, new RegExp(`^${B} ${NOW - DAY + 1000}$`, "m"));
  assert.doesNotMatch(built.body, new RegExp(C));
});

test("buildNodeUuidsBody: a UUID listed twice keeps its latest date", () => {
  const built = buildNodeUuidsBody(
    [
      { uuid: A, until: NOW + DAY },
      { uuid: A.toUpperCase(), until: NOW + 3 * DAY },
    ],
    NOW,
    1,
  );
  assert.equal(built.body, `${A} ${NOW + 3 * DAY}\n`);
});

test("buildNodeUuidsBody refuses rather than answer an empty or thin list", () => {
  assert.deepEqual(buildNodeUuidsBody([], NOW, 1), { ok: false, reason: "too-few-live", live: 0, total: 0, min: 1 });
  const lapsed = buildNodeUuidsBody([{ uuid: A, until: NOW - 1000 }], NOW, 1);
  assert.equal(lapsed.ok, false, "only lapsed devices: nobody live, refuse");
  assert.equal(buildNodeUuidsBody([{ uuid: A, until: NOW + DAY }], NOW, 2).ok, false);
});

test("the ETag does not move while nothing changes", () => {
  const pairs = [{ uuid: A, until: NOW + 10 * DAY }];
  assert.equal(buildNodeUuidsBody(pairs, NOW, 1).etag, buildNodeUuidsBody(pairs, NOW + 60_000, 1).etag);
});

test("nodeMinActive: a whole number of at least 1, else the default", () => {
  assert.equal(NODE_MIN_ACTIVE_DEFAULT, 1);
  assert.equal(nodeMinActive(undefined), 1);
  assert.equal(nodeMinActive(""), 1);
  assert.equal(nodeMinActive("0"), 1);
  assert.equal(nodeMinActive("-3"), 1);
  assert.equal(nodeMinActive("2.5"), 1);
  assert.equal(nodeMinActive(" 5 "), 5);
});

test("node names are short, lower-case, no path or key tricks", () => {
  for (const ok of ["pl", "ru", "kovra-se", "a1"]) assert.ok(NODE_NAME_RE.test(ok), ok);
  for (const bad of ["", "-pl", "PL", "pl:x", "pl/x", "a".repeat(33), "pl\n"]) assert.ok(!NODE_NAME_RE.test(bad), JSON.stringify(bad));
  assert.equal(nodeBeatKey("pl"), "nodebeat:pl");
});
