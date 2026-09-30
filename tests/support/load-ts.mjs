// tests/support/load-ts.mjs
//
// Lets a test import app modules that bare type stripping cannot load.
//
// Node strips types from .ts files by itself, but the app's modules import
// through the `@/` alias and without file extensions, which Node does not
// resolve. These resolve hooks map both to real files under src/. They also
// swap src/lib/redis.ts for a stub that throws on any use, so no imported
// module can reach the real database from a test.
//
// Import it BEFORE the modules that need it, and load those with a dynamic
// `await import(...)`: static imports are all resolved before any module runs,
// so hooks registered here would come too late for them.
//
// A test that needs a working store swaps the throwing stub for the in-memory
// one in tests/support/memory-redis.mjs with setRedisModule(), before its
// dynamic imports.

import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../../src/", import.meta.url);
const REDIS_MODULE = new URL("lib/redis.ts", SRC).href;
const REDIS_STUB =
  "data:text/javascript," +
  encodeURIComponent(
    "export const redis = new Proxy({}, { get(_target, prop) { " +
      "throw new Error(`redis.${String(prop)} called from a unit test: tests must not touch Redis`); } });",
  );

const isFile = (path) => existsSync(path) && statSync(path).isFile();

/** The .ts/.tsx file an extensionless module URL points at, or null. */
function resolveSourceFile(url) {
  const path = fileURLToPath(url);
  if (isFile(path)) return url;
  for (const candidate of [`${path}.ts`, `${path}.tsx`, `${path}/index.ts`, `${path}/index.tsx`]) {
    if (isFile(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

let redisModuleUrl = REDIS_STUB;

/**
 * Serve the module at `url` (it must export `redis`) in place of
 * src/lib/redis.ts. Call it before the dynamic imports that load app modules.
 */
export function setRedisModule(url) {
  redisModuleUrl = String(url);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = null;
    if (specifier.startsWith("@/")) {
      target = new URL(specifier.slice(2), SRC).href;
    } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      target = new URL(specifier, context.parentURL).href;
    }
    if (target !== null) {
      const resolved = resolveSourceFile(target);
      if (resolved === REDIS_MODULE) return { url: redisModuleUrl, shortCircuit: true };
      if (resolved !== null) return { url: resolved, shortCircuit: true };
    }
    // `next/server` has no exports map, so Node's ESM resolver wants the file
    // name; the bundler adds it by itself. Needed by tests that call a route
    // handler directly.
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
