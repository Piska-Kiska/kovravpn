#!/usr/bin/env node
// patches/refund-policy-2026-05/apply.mjs
// Patch: rewrite "5. Возврат средств" in /terms — add filing / review / payout
// deadlines and the same-method return clause.
//
// Idempotent: detects an anchor phrase that exists only in the new version
// and exits cleanly if already applied.
// Backups: writes <target>.bak next to the modified file.
// Run from the project root: `node patches/refund-policy-2026-05/apply.mjs`

import { readFile, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
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

const SCAN_ROOTS = ['src', 'content'];
const SCAN_EXT = new Set(['.tsx', '.ts', '.mdx', '.md']);

const SECTION_HEAD = '5. Возврат средств';
const NEXT_SECTION_HEAD = '6. Качество услуг';

// Anchor phrase that appears ONLY in the new version — guarantees idempotency.
const IDEMPOTENT_MARKER = 'на те же реквизиты и тем же способом';

const NEW_PARAGRAPHS = [
  'В связи с цифровым нематериальным характером услуг возврат денежных средств после фактического оказания услуг не производится. Возврат возможен исключительно в случае, если услуга не была оказана по технической вине Сервиса и эта вина подтверждена обращением Пользователя в поддержку.',
  'Заявление на возврат принимается в течение 14 (четырнадцати) календарных дней с даты совершения платежа, по которому запрашивается возврат. Заявления, поступившие по истечении этого срока, не рассматриваются.',
  'Заявление направляется через Telegram-бота @proxysvpn_bot или на адрес support@proxysvpn.com. В обращении указываются: email или Telegram-аккаунт Пользователя, дата и сумма платежа, описание причины возврата.',
  'Сервис рассматривает заявление в течение 10 (десяти) рабочих дней с момента его поступления. О принятом решении Пользователь уведомляется тем же каналом, через который было подано обращение.',
  'При положительном решении возврат осуществляется в течение 10 (десяти) рабочих дней с даты его принятия. Фактическое поступление средств зависит от регламента банка-эмитента и платёжной системы и может занять дополнительное время.',
  'Возврат производится исключительно на те же реквизиты и тем же способом оплаты, которым был произведён исходный платёж. Возврат на иные карты, счета или кошельки не производится.',
  'Перед оплатой долгого периода Пользователю рекомендуется воспользоваться пробным периодом или минимальным платежом для проверки совместимости Сервиса с устройствами и сетью Пользователя.',
  'Пользователь подтверждает, что обязуется не инициировать процедуру возврата платежа (chargeback) через банк или платёжную систему, не обратившись предварительно в службу поддержки Сервиса. Инициирование chargeback в обход поддержки является основанием для блокировки аккаунта без возврата средств.',
];

async function findTarget() {
  // 1. Explicit CLI argument wins.
  const cliArg = process.argv[2];
  if (cliArg) {
    const abs = resolve(ROOT, cliArg);
    if (existsSync(abs)) return abs;
    throw new Error(`explicit path not found: ${cliArg}`);
  }

  // 2. Try the primary candidates.
  for (const rel of PRIMARY_TARGETS) {
    const abs = join(ROOT, rel);
    if (existsSync(abs)) return abs;
  }

  // 3. Walk the source roots and find any file that contains both anchors.
  const matches = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root);
    if (!existsSync(abs)) continue;
    await walk(abs, async (file) => {
      const ext = file.slice(file.lastIndexOf('.'));
      if (!SCAN_EXT.has(ext)) return;
      const content = await readFile(file, 'utf8');
      if (content.includes(SECTION_HEAD) && content.includes(NEXT_SECTION_HEAD)) {
        matches.push(file);
      }
    });
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `multiple candidates found, pass explicit path:\n${matches
        .map((m) => '  ' + relative(ROOT, m))
        .join('\n')}`
    );
  }
  throw new Error('terms page not found; pass explicit path as first CLI arg');
}

async function walk(dir, onFile) {
  const entries = await readdir(dir);
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const abs = join(dir, name);
    const st = await stat(abs);
    if (st.isDirectory()) await walk(abs, onFile);
    else if (st.isFile()) await onFile(abs);
  }
}

function detectFormat(block) {
  if (/<(h\d|p|section)\b/i.test(block)) return 'jsx';
  if (/^\s*#{1,6}\s/m.test(block)) return 'markdown';
  return 'plain';
}

function buildReplacement(format, indent, oldBlock) {
  // All branches return a string that ends with a single trailing `\n`.
  // The replacement is then followed by the next section's first line, so we
  // need exactly one blank line of separation — that means the joined block
  // must end with two newlines.
  if (format === 'jsx') {
    const headingTag = oldBlock.match(/<(h\d)\b/i)?.[1] ?? 'h2';
    const lines = [
      `${indent}<${headingTag}>${SECTION_HEAD}</${headingTag}>`,
      ...NEW_PARAGRAPHS.map((p) => `${indent}<p>${jsxEscape(p)}</p>`),
      '',
      '',
    ];
    return lines.join('\n');
  }
  if (format === 'markdown') {
    const lines = [`${indent}## ${SECTION_HEAD}`, ''];
    for (const p of NEW_PARAGRAPHS) {
      lines.push(`${indent}${p}`, '');
    }
    lines.push('');
    return lines.join('\n');
  }
  // plain
  const lines = [`${indent}${SECTION_HEAD}`, ''];
  for (const p of NEW_PARAGRAPHS) {
    lines.push(`${indent}${p}`, '');
  }
  lines.push('');
  return lines.join('\n');
}

function jsxEscape(s) {
  // Inside JSX text nodes, only `{` and `}` need escaping; angle brackets
  // are treated as JSX so we escape them defensively. Ampersand left intact
  // for HTML entities the author may want.
  return s.replace(/[<>{}]/g, (ch) => `{'${ch}'}`);
}

async function main() {
  const target = await findTarget();
  const rel = relative(ROOT, target);
  const src = await readFile(target, 'utf8');

  if (src.includes(IDEMPOTENT_MARKER)) {
    console.log(`[refund-patch] already applied in ${rel}, nothing to do.`);
    return;
  }

  const startIdx = src.indexOf(SECTION_HEAD);
  const endIdx = src.indexOf(NEXT_SECTION_HEAD);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(
      `cannot locate section bounds in ${rel}; expected to find both "${SECTION_HEAD}" and "${NEXT_SECTION_HEAD}"`
    );
  }

  const sectionStart = src.lastIndexOf('\n', startIdx) + 1;
  const sectionEnd = src.lastIndexOf('\n', endIdx) + 1;
  const oldBlock = src.slice(sectionStart, sectionEnd);
  const indent = (oldBlock.match(/^[ \t]*/) ?? [''])[0];
  const format = detectFormat(oldBlock);
  const newBlock = buildReplacement(format, indent, oldBlock);

  const updated = src.slice(0, sectionStart) + newBlock + src.slice(sectionEnd);
  await copyFile(target, target + '.bak');
  await writeFile(target, updated, 'utf8');

  console.log(`[refund-patch] applied to ${rel}`);
  console.log(`[refund-patch] format detected: ${format}`);
  console.log(`[refund-patch] backup: ${rel}.bak`);
  console.log(`[refund-patch] run \`git diff -- ${rel}\` to review.`);
}

main().catch((err) => {
  console.error('[refund-patch] failed:', err.message);
  process.exitCode = 1;
});
