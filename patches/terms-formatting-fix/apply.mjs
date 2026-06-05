#!/usr/bin/env node
// patches/terms-formatting-fix/apply.mjs
// Fix: restore <section> tags around §5, add Tailwind classes to <h2> and
// <p>, format paragraphs to ~85-char lines like the rest of the file.
// Idempotent. Backup written next to the target file.

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const ROOT = resolve(process.cwd());
const TARGET = resolve(ROOT, 'src/app/terms/page.tsx');

const OLD_BLOCK = `            <h2>5. Возврат средств</h2>
            <p>В связи с цифровым нематериальным характером услуг возврат денежных средств после фактического оказания услуг не производится. Возврат возможен исключительно в случае, если услуга не была оказана по технической вине Сервиса и эта вина подтверждена обращением Пользователя в поддержку.</p>
            <p>Заявление на возврат принимается в течение 14 (четырнадцати) календарных дней с даты совершения платежа, по которому запрашивается возврат. Заявления, поступившие по истечении этого срока, не рассматриваются.</p>
            <p>Заявление направляется через Telegram-бота @proxysvpn_bot или на адрес support@proxysvpn.com. В обращении указываются: email или Telegram-аккаунт Пользователя, дата и сумма платежа, описание причины возврата.</p>
            <p>Сервис рассматривает заявление в течение 10 (десяти) рабочих дней с момента его поступления. О принятом решении Пользователь уведомляется тем же каналом, через который было подано обращение.</p>
            <p>При положительном решении возврат осуществляется в течение 10 (десяти) рабочих дней с даты его принятия. Фактическое поступление средств зависит от регламента банка-эмитента и платёжной системы и может занять дополнительное время.</p>
            <p>Возврат производится исключительно на те же реквизиты и тем же способом оплаты, которым был произведён исходный платёж. Возврат на иные карты, счета или кошельки не производится.</p>
            <p>Перед оплатой долгого периода Пользователю рекомендуется воспользоваться пробным периодом или минимальным платежом для проверки совместимости Сервиса с устройствами и сетью Пользователя.</p>
            <p>Пользователь подтверждает, что обязуется не инициировать процедуру возврата платежа (chargeback) через банк или платёжную систему, не обратившись предварительно в службу поддержки Сервиса. Инициирование chargeback в обход поддержки является основанием для блокировки аккаунта без возврата средств.</p>

            <h2 className="text-lg font-semibold text-nm-text mb-3">6. Качество услуг</h2>`;

const NEW_BLOCK = `            <h2 className="text-lg font-semibold text-nm-text mb-3">5. Возврат средств</h2>
            <p>
              В связи с цифровым нематериальным характером услуг возврат денежных средств
              после фактического оказания услуг не производится. Возврат возможен исключительно
              в случае, если услуга не была оказана по технической вине Сервиса и эта вина
              подтверждена обращением Пользователя в поддержку.
            </p>
            <p className="mt-2">
              Заявление на возврат принимается в течение 14 (четырнадцати) календарных дней
              с даты совершения платежа, по которому запрашивается возврат. Заявления,
              поступившие по истечении этого срока, не рассматриваются.
            </p>
            <p className="mt-2">
              Заявление направляется через Telegram-бота @proxysvpn_bot или на адрес
              support@proxysvpn.com. В обращении указываются: email или Telegram-аккаунт
              Пользователя, дата и сумма платежа, описание причины возврата.
            </p>
            <p className="mt-2">
              Сервис рассматривает заявление в течение 10 (десяти) рабочих дней с момента
              его поступления. О принятом решении Пользователь уведомляется тем же каналом,
              через который было подано обращение.
            </p>
            <p className="mt-2">
              При положительном решении возврат осуществляется в течение 10 (десяти) рабочих
              дней с даты его принятия. Фактическое поступление средств зависит от регламента
              банка-эмитента и платёжной системы и может занять дополнительное время.
            </p>
            <p className="mt-2">
              Возврат производится исключительно на те же реквизиты и тем же способом оплаты,
              которым был произведён исходный платёж. Возврат на иные карты, счета или
              кошельки не производится.
            </p>
            <p className="mt-2">
              Перед оплатой долгого периода Пользователю рекомендуется воспользоваться
              пробным периодом или минимальным платежом для проверки совместимости Сервиса
              с устройствами и сетью Пользователя.
            </p>
            <p className="mt-2">
              Пользователь подтверждает, что обязуется не инициировать процедуру возврата
              платежа (chargeback) через банк или платёжную систему, не обратившись
              предварительно в службу поддержки Сервиса. Инициирование chargeback в обход
              поддержки является основанием для блокировки аккаунта без возврата средств.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3">6. Качество услуг</h2>`;

// Anchor that exists ONLY in the formatted version.
const IDEMPOTENT_MARKER = '<h2 className="text-lg font-semibold text-nm-text mb-3">5. Возврат средств</h2>';

async function main() {
  if (!existsSync(TARGET)) {
    console.error('[fix-terms] target not found:', relative(ROOT, TARGET));
    process.exitCode = 2;
    return;
  }

  const src = await readFile(TARGET, 'utf8');

  if (src.includes(IDEMPOTENT_MARKER)) {
    console.log('[fix-terms] already applied, nothing to do.');
    return;
  }

  if (!src.includes(OLD_BLOCK)) {
    console.error('[fix-terms] could not find the broken block to replace.');
    console.error('[fix-terms] file may have diverged from the expected state.');
    console.error('[fix-terms] open src/app/terms/page.tsx around section 5 and fix manually.');
    process.exitCode = 3;
    return;
  }

  const updated = src.replace(OLD_BLOCK, NEW_BLOCK);
  if (updated === src) {
    console.error('[fix-terms] replace produced no change — aborting.');
    process.exitCode = 4;
    return;
  }

  await copyFile(TARGET, TARGET + '.bak');
  await writeFile(TARGET, updated, 'utf8');
  console.log('[fix-terms] applied to', relative(ROOT, TARGET));
  console.log('[fix-terms] backup:', relative(ROOT, TARGET) + '.bak');
  console.log('[fix-terms] run `git diff -- src/app/terms` to review.');
}

main().catch((err) => {
  console.error('[fix-terms] failed:', err.message);
  process.exitCode = 1;
});
