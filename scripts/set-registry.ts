// scripts/set-registry.ts
//
// Merges the inbound registry from a LOCAL, UNTRACKED data file into Redis
// (`inbounds:registry`).
//
// The node addresses and their REALITY parameters used to live in this file
// as a literal, and it overwrote the whole live registry with them on every
// run. The repository is public, so that published the node addresses, and a
// run from a stale checkout replaced the live locations with dead ones. Now:
//   • the data comes from `registry.local.json` (git-ignored; the shape is in
//     registry.example.json) or the file named by REGISTRY_FILE;
//   • every entry is validated (scripts/lib/registry-file.ts);
//   • the file is MERGED by key: entries are added or updated, a stored key
//     the file does not mention is kept, never dropped;
//   • nothing is written without --write; with it, the previous value is
//     saved to a git-ignored backup file first and the result is read back.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/set-registry.ts            # dry run
//   npx tsx --env-file=.env.local scripts/set-registry.ts --write    # merge
//   REGISTRY_FILE=path npx tsx --env-file=.env.local scripts/set-registry.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { redis } from "../src/lib/redis";
import {
  mergeRegistry,
  parseRegistryFile,
  parseStoredRegistry,
  type RegistryEntry,
} from "./lib/registry-file";

const REGISTRY_KEY = "inbounds:registry";
const DEFAULT_FILE = "registry.local.json";

function describe(e: RegistryEntry): string {
  const where = e.source === "static" ? `${e.address}:${e.port}` : `panel inbound ${e.inboundId}`;
  return `${e.key} ${e.flag ?? ""} ${where} prio=${e.priority} enabled=${e.enabled}`;
}

function readDataFile(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `no data file: ${file}\n` +
          `Copy registry.example.json to ${DEFAULT_FILE} and fill in the entries. ` +
          `That file is git-ignored and never goes into the repository.`,
      );
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const file = resolve(process.env.REGISTRY_FILE || DEFAULT_FILE);

  const incoming = parseRegistryFile(readDataFile(file), file);
  const storedRaw: unknown = await redis.get(REGISTRY_KEY);
  const current = parseStoredRegistry(storedRaw);
  const plan = mergeRegistry(current, incoming);

  console.log(`${file}: ${incoming.length} entries; ${REGISTRY_KEY}: ${current.length} entries`);
  const byKey = new Map(plan.next.map((e) => [e.key, e]));
  for (const [label, keys] of [
    ["add", plan.added],
    ["update", plan.changed],
    ["same", plan.unchanged],
    ["keep (not in the file)", plan.kept],
  ] as const) {
    for (const key of keys) {
      const entry = byKey.get(key);
      console.log(`  ${label.padEnd(22)} ${entry ? describe(entry) : key}`);
    }
  }

  if (plan.added.length === 0 && plan.changed.length === 0) {
    console.log("\nnothing to change");
    return;
  }
  if (!write) {
    console.log("\n--- dry run, Redis untouched; add --write to apply ---");
    return;
  }

  // The backup name matches `registry*.local.json` in .gitignore.
  const backup = resolve(`registry.backup-${new Date().toISOString().replace(/[:.]/g, "-")}.local.json`);
  writeFileSync(backup, JSON.stringify(current, null, 2) + "\n", { mode: 0o600 });
  console.log(`\nprevious registry saved to ${backup}`);

  await redis.set(REGISTRY_KEY, JSON.stringify(plan.next));

  const after = parseStoredRegistry(await redis.get(REGISTRY_KEY));
  if (JSON.stringify(after) !== JSON.stringify(plan.next)) {
    throw new Error(`read-back does not match what was written; restore from ${backup}`);
  }
  console.log(`written and read back: ${after.length} entries`);
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
