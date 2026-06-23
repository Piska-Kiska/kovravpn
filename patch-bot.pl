#!/usr/bin/perl
use strict;
use warnings;
use utf8;

# Usage: perl patch-bot.pl [repo_root]   (default ".")
my $root = $ARGV[0] // ".";
my $ROUTE = "$root/src/app/api/auth/telegram/webhook/route.ts";
my $I18N  = "$root/src/lib/bot-i18n.ts";

sub slurp {
  my $p = shift;
  open my $fh, '<:encoding(UTF-8)', $p or die "open $p: $!\n";
  local $/; my $s = <$fh>; close $fh; return $s;
}
sub spew {
  my ($p, $s) = @_;
  open my $fh, '>:encoding(UTF-8)', $p or die "write $p: $!\n";
  print $fh $s; close $fh;
}
sub L { my $x = shift; $x =~ s/\n\z//; return $x; }

# literal, non-regex replace with exactly-one-occurrence guard
sub repl {
  my ($sref, $old, $new, $tag) = @_;
  my $pos = index($$sref, $old);
  die "[$tag] anchor not found:\n  " . substr($old, 0, 70) . "...\n" if $pos < 0;
  die "[$tag] anchor found more than once\n" if index($$sref, $old, $pos + 1) >= 0;
  substr($$sref, $pos, length($old), $new);
}

# ───────────────────────── route.ts ─────────────────────────
my $r = slurp($ROUTE);

# R1: replace screenBuyPlan -> activePlanKind helper + renewal-aware screenBuyPlan
repl(\$r,
L(<<'OLD'),
async function screenBuyPlan(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  await edit(chatId, msgId, t("buy.title", lang), [
    [{ text: t("buy.plan1", lang), callback_data: "buyplan_plan1" }],
    [{ text: t("buy.plan3", lang), callback_data: "buyplan_plan3" }],
    backBtn("menu", lang),
  ]);
}
OLD
L(<<'NEW'),
// Currently active main-plan tier, or null. Re-buying the same tier only
// extends time (applyPlanPurchase stacks expiry), so when a plan is active we
// switch the buy flow into renewal mode and lock it to that tier; extra device
// capacity comes from the Add-device add-on, not from re-buying the plan.
async function activePlanKind(userId: string): Promise<PlanKind | null> {
  const now = Date.now();
  const subs = await getSubscriptions(userId);
  if (subs.some((s) => s.kind === "plan3" && s.expiresAt > now)) return "plan3";
  if (subs.some((s) => s.kind === "plan1" && s.expiresAt > now)) return "plan1";
  return null;
}

async function screenBuyPlan(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const ak = await activePlanKind(userId);
  if (ak) { await screenBuyTerm(chatId, msgId, ak); return; }
  await edit(chatId, msgId, t("buy.title", lang), [
    [{ text: t("buy.plan1", lang), callback_data: "buyplan_plan1" }],
    [{ text: t("buy.plan3", lang), callback_data: "buyplan_plan3" }],
    backBtn("menu", lang),
  ]);
}
NEW
"R1 screenBuyPlan");

# R2: renewal-aware screenBuyTerm (renewal title + back-to-menu when extending)
repl(\$r,
L(<<'OLD'),
async function screenBuyTerm(chatId: number, msgId: number, kind: PlanKind) {
  const lang = await resolveLang(await getUserId(chatId));
  const planName = t(`buy.${kind}.name`, lang);
  const rows: InlineBtn[][] = ([1, 6, 12] as Term[]).map((term) => {
    const pr = PLAN_PRICES[kind][term];
    return [{
      text: t(`buy.term.${term}`, lang, { total: pr.total.toFixed(2), perMonth: pr.perMonth.toFixed(2) }),
      callback_data: `buyterm_${kind}_${term}`,
    }];
  });
  rows.push(backBtn("buyplan", lang));
  await edit(chatId, msgId, t("buy.term.title", lang, { plan: planName }), rows);
}
OLD
L(<<'NEW'),
async function screenBuyTerm(chatId: number, msgId: number, kind: PlanKind) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const now = Date.now();
  const subs = await getSubscriptions(userId);
  const planSub = subs
    .filter((s) => s.kind === kind && s.expiresAt > now)
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];
  const isRenewal = !!planSub;
  const planName = t(`buy.${kind}.name`, lang);
  const rows: InlineBtn[][] = ([1, 6, 12] as Term[]).map((term) => {
    const pr = PLAN_PRICES[kind][term];
    return [{
      text: t(`buy.term.${term}`, lang, { total: pr.total.toFixed(2), perMonth: pr.perMonth.toFixed(2) }),
      callback_data: `buyterm_${kind}_${term}`,
    }];
  });
  rows.push(backBtn(isRenewal ? "menu" : "buyplan", lang));
  if (isRenewal) {
    const until = new Date(planSub.expiresAt).toISOString().slice(0, 10);
    await edit(chatId, msgId, t("buy.renew.title", lang, { plan: planName, until }), rows);
  } else {
    await edit(chatId, msgId, t("buy.term.title", lang, { plan: planName }), rows);
  }
}
NEW
"R2 screenBuyTerm");

spew($ROUTE, $r);
print "OK route.ts: 2 edits\n";

# ───────────────────────── bot-i18n.ts ─────────────────────────
my $j = slurp($I18N);

# I1..I5: insert "buy.renew.title" right after each language's "buy.term.title"
# (anchors are unique per language because the translated text differs).
my @i18n = (
  [ q{  "buy.term.title": "💳 <b>{plan}</b>\n\nChoose a term:",},
    q{  "buy.renew.title": "🔄 <b>{plan}</b>\n\nRenewal. Active until {until}.\nChoose how long to extend. This adds time, not devices. To add a device use ➕ Add device.",},
    "I1 EN" ],
  [ q{  "buy.term.title": "💳 <b>{plan}</b>\n\nВыберите срок:",},
    q{  "buy.renew.title": "🔄 <b>{plan}</b>\n\nПродление. Активно до {until}.\nВыберите, на сколько продлить. Добавляет время, не устройства. Чтобы добавить устройство, нажмите ➕ Добавить устройство.",},
    "I2 RU" ],
  [ q{  "buy.term.title": "💳 <b>{plan}</b>\n\nElige una duración:",},
    q{  "buy.renew.title": "🔄 <b>{plan}</b>\n\nRenovación. Activo hasta {until}.\nElige cuánto extender. Añade tiempo, no dispositivos. Para añadir un dispositivo usa ➕ Añadir dispositivo.",},
    "I3 ES" ],
  [ q{  "buy.term.title": "💳 <b>{plan}</b>\n\nLaufzeit wählen:",},
    q{  "buy.renew.title": "🔄 <b>{plan}</b>\n\nVerlängerung. Aktiv bis {until}.\nWähle die Verlängerung. Mehr Zeit, keine Geräte. Für ein Gerät nutze ➕ Gerät hinzufügen.",},
    "I4 DE" ],
  [ q{  "buy.term.title": "💳 <b>{plan}</b>\n\nChoisissez une durée :",},
    q{  "buy.renew.title": "🔄 <b>{plan}</b>\n\nRenouvellement. Actif jusqu'au {until}.\nChoisissez la durée. Ajoute du temps, pas d'appareils. Pour ajouter un appareil, utilisez ➕ Ajouter un appareil.",},
    "I5 FR" ],
);

for my $e (@i18n) {
  my ($anchor, $add, $tag) = @$e;
  repl(\$j, $anchor, $anchor . "\n" . $add, $tag);
}

spew($I18N, $j);
print "OK bot-i18n.ts: 5 edits\n";
print "DONE\n";
