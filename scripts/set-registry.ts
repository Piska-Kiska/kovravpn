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
//   • the file is MERGED by key: new keys are added, a stored key the file
//     does not mention is kept, never dropped;
//   • a stored key is updated only when named in --update=<keys>, field by
//     field (a stored field the file lacks stays); an update that changes
//     where or how clients connect (address, port, REALITY keys, ...) also
//     needs --allow-connection-change, since a stale local file would put a
//     dead address back;
//   • the output names changed fields, never their values, and never prints
//     an address (the file holds them; compare there);
//   • nothing is written without --write; with it, the previous value is
//     saved to a git-ignored backup file first and the result is read back.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/set-registry.ts                     # dry run
//   npx tsx --env-file=.env.local scripts/set-registry.ts --write             # add new keys
//   ... scripts/set-registry.ts --update=de,uk --write                         # also update de, uk
//   ... scripts/set-registry.ts --update=de --allow-connection-change --write  # new address for de
//   REGISTRY_FILE=path npx tsx --env-file=.env.local scripts/set-registry.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { redis } from "../src/lib/redis";
import {
  mergeRegistry,
  parseRegistryFile,
  parseStoredRegistry,
  parseUpdateKeys,
  writeRefusal,
  type EntryDiff,
  type RegistryEntry,
} from "./lib/registry-file";

const REGISTRY_KEY = "inbounds:registry";
const DEFAULT_FILE = "registry.local.json";

/** One line per entry, without its address. */
function describe(e: RegistryEntry): string {
  const where = e.source === "static" ? `static ${e.protocol ?? "vless"} port ${e.port}` : `panel inbound ${e.inboundId}`;
  return `${e.key} ${e.flag ?? ""} ${where} prio=${e.priority} enabled=${e.enabled}`;
}

function describeDiff(d: EntryDiff): string {
  return `${d.key}: ${d.fields.join(", ")}${d.connection.length > 0 ? ` (connection: ${d.connection.join(", ")})` : ""}`;
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

const KNOWN_FLAGS = /^--(write|allow-connection-change|update=.*)$/;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !KNOWN_FLAGS.test(a));
  if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(" ")}`);
  const write = args.includes("--write");
  const allowConnectionChange = args.includes("--allow-connection-change");
  const updateArg = args.find((a) => a.startsWith("--update="));
  const file = resolve(process.env.REGISTRY_FILE || DEFAULT_FILE);

  const incoming = parseRegistryFile(readDataFile(file), file);
  const update = updateArg === undefined ? new Set<string>() : parseUpdateKeys(updateArg.slice("--update=".length), incoming);
  const storedRaw: unknown = await redis.get(REGISTRY_KEY);
  const current = parseStoredRegistry(storedRaw);
  const plan = mergeRegistry(current, incoming, { update, allowConnectionChange });

  console.log(`${file}: ${incoming.length} entries; ${REGISTRY_KEY}: ${current.length} entries`);
  const byKey = new Map(plan.next.map((e) => [e.key, e]));
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(24)} ${text}`);
  for (const key of plan.added) line("add", describe(byKey.get(key) as RegistryEntry));
  for (const d of plan.updated) line("update", describeDiff(d));
  for (const d of plan.blocked) line("BLOCKED (connection)", describeDiff(d));
  for (const d of plan.held) line("differs, kept as stored", `${describeDiff(d)}  [--update=${d.key} to apply]`);
  for (const key of plan.unchanged) line("same", describe(byKey.get(key) as RegistryEntry));
  for (const key of plan.kept) line("keep (not in the file)", describe(byKey.get(key) as RegistryEntry));

  const refusal = writeRefusal(plan);
  if (refusal !== null) {
    if (write) throw new Error(refusal);
    console.log(`\n${refusal}`);
  }
  if (plan.added.length === 0 && plan.updated.length === 0) {
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
