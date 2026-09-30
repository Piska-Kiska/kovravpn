// tests/safe-error-text.test.mjs — run: npm test
//
// src/lib/safe-error-text.ts: an error as a log line without the Upstash
// command (keys, device UUIDs, script arguments) and without any UUID.
// UUIDs are made up.

import { test } from "node:test";
import assert from "node:assert/strict";

const { safeErrorText, SAFE_ERROR_MAX } = await import("../src/lib/safe-error-text.ts");

const ID = "0a1b2c3d-0000-4000-8000-00000000abcd";

class UpstashError extends Error {
  constructor(message) {
    super(message);
    this.name = "UpstashError";
  }
}

test("the command Upstash appends is cut off", () => {
  const err = new UpstashError(`ERR max requests limit exceeded, command was: ["zrem","kovra:uuidpool:taken","${ID}"]`);
  assert.equal(safeErrorText(err), "UpstashError: ERR max requests limit exceeded");
});

test("a UUID anywhere else is replaced, in any case", () => {
  assert.equal(safeErrorText(new Error(`key hy2:${ID.toUpperCase()} is busy`)), "Error: key hy2:<uuid> is busy");
  assert.equal(safeErrorText(`bare ${ID}`), "bare <uuid>");
});

test("with `stack`, the frames follow, cleaned the same way; the message is not repeated", () => {
  const err = new UpstashError(`WRONGTYPE, command was: ["set","hy2:${ID}","1"]`);
  err.stack = `UpstashError: WRONGTYPE, command was: ["set","hy2:${ID}","1"]\n    at set (/app/lib/${ID}.js:1:1)\n    at POST (/app/route.js:2:2)`;
  const text = safeErrorText(err, { stack: true });
  assert.equal(text, "UpstashError: WRONGTYPE\n    at set (/app/lib/<uuid>.js:1:1)\n    at POST (/app/route.js:2:2)");
});

test("long text is capped; odd values never throw", () => {
  assert.equal(safeErrorText(new Error("x".repeat(1000))).length, SAFE_ERROR_MAX);
  assert.equal(safeErrorText(new Error("abc"), { max: 5 }), "Error");
  assert.equal(safeErrorText(undefined), "undefined");
  assert.equal(safeErrorText(null), "null");
  const hostile = {
    toString() {
      throw new Error("no");
    },
  };
  assert.equal(safeErrorText(hostile), "unprintable error");
});
