#!/usr/bin/env node
// patches/refund-policy-2026-05/revert.mjs
// Restore the .bak file produced by apply.mjs.

import { rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT = resolve(process.cwd());

const PRIMARY_TARGETS = [
  'src/app/terms/page.tsx',
  'src/app/terms/page.mdx',
  'src/app/terms/page.md',
  'src/app/(legal)/terms/page.tsx',
  'src/app/(legal)/terms/page.mdx',
  'src/content/terms.mdx',
  'content/terms.mdx',
];

async function main() {
  const cliArg = process.argv[2];
  let target;
  if (cliArg) {
    target = resolve(ROOT, cliArg);
  } else {
    target = PRIMARY_TARGETS.map((p) => join(ROOT, p)).find((p) => existsSync(p + '.bak'));
  }
  if (!target || !existsSync(target + '.bak')) {
    console.error('[refund-patch] no .bak file found; pass path explicitly');
    process.exitCode = 2;
    return;
  }
  await rename(target + '.bak', target);
  console.log('[refund-patch] reverted', relative(ROOT, target));
}

main().catch((err) => {
  console.error('[refund-patch] revert failed:', err.message);
  process.exitCode = 1;
});
