#!/usr/bin/perl
use strict;
use warnings;
use utf8;

my $f = $ARGV[0] or die "usage: perl patch-dashboard.pl <path-to-page.tsx>\n";
local $/;
open my $in, '<:encoding(UTF-8)', $f or die "open $f: $!\n";
my $s = <$in>;
close $in;

# ---- helper: read literal heredoc-ish blocks (one trailing newline trimmed) ----
sub L { my $x = shift; $x =~ s/\n\z//; return $x; }

my @edits;

# --- E1: inject renewal-mode label maps after DEVICE_ORDER ---
push @edits, [
L(<<'OLD'),
const DEVICE_ORDER = ["android", "iphone", "mac", "windows", "tv"] as const;
OLD
L(<<'NEW'),
const DEVICE_ORDER = ["android", "iphone", "mac", "windows", "tv"] as const;

// Renewal-mode labels (localized to the same languages as dash-i18n).
const RENEW_TITLE: Record<string, string> = {
  en: "Renew your plan", ru: "Продление подписки", es: "Renovar tu plan", de: "Plan verlängern", fr: "Renouveler le forfait",
};
const RENEW_BTN: Record<string, string> = {
  en: "Renew with crypto", ru: "Продлить криптой", es: "Renovar con cripto", de: "Mit Krypto verlängern", fr: "Renouveler en crypto",
};
const RENEW_CURRENT: Record<string, string> = {
  en: "Current plan · active until", ru: "Текущий план · активен до", es: "Plan actual · activo hasta", de: "Aktueller Plan · aktiv bis", fr: "Forfait actuel · actif jusqu'au",
};
const RENEW_NOTE: Record<string, string> = {
  en: "Extends your current plan (adds time, not devices). To add a device, use Add device below.",
  ru: "Продлевает текущий план (добавляет время, не устройства). Чтобы добавить устройство — кнопка «Добавить устройство» ниже.",
  es: "Extiende tu plan actual (añade tiempo, no dispositivos). Para añadir un dispositivo, usa Añadir dispositivo abajo.",
  de: "Verlängert deinen aktuellen Plan (mehr Zeit, keine Geräte). Für ein weiteres Gerät nutze unten Gerät hinzufügen.",
  fr: "Prolonge votre forfait actuel (ajoute du temps, pas d'appareils). Pour ajouter un appareil, utilisez Ajouter un appareil ci-dessous.",
};
NEW
];

# --- E2: lock plan tier to active plan (renewal). Add effect after referral effect ---
push @edits, [
L(<<'OLD'),
  useEffect(() => {
    if (!userId) return;
    fetch("/api/referral").then((r) => r.json()).then((d) => { if (d.code) setReferral(d); }).catch(() => {});
  }, [userId]);
OLD
L(<<'NEW'),
  useEffect(() => {
    if (!userId) return;
    fetch("/api/referral").then((r) => r.json()).then((d) => { if (d.code) setReferral(d); }).catch(() => {});
  }, [userId]);

  // Renewal mode: lock the plan tier to the user's currently active plan.
  useEffect(() => {
    const n = Date.now();
    const subs = account?.subs || [];
    const ak = subs.some((x) => x.kind === "plan3" && x.expiresAt > n) ? "plan3"
      : subs.some((x) => x.kind === "plan1" && x.expiresAt > n) ? "plan1" : null;
    if (ak) setPlanKind(ak as "plan1" | "plan3");
  }, [account]);
NEW
];

# --- E3: derive activePlanKind / isRenewal / effectiveKind; price off effectiveKind ---
push @edits, [
L(<<'OLD'),
  const price1 = pricing?.plan1?.[String(term)];
  const price3 = pricing?.plan3?.[String(term)];
  const selPrice = planKind === "plan3" ? price3 : price1;
OLD
L(<<'NEW'),
  const nowTs = Date.now();
  const activePlanKind: "plan1" | "plan3" | null =
    (account?.subs || []).some((x) => x.kind === "plan3" && x.expiresAt > nowTs) ? "plan3"
    : (account?.subs || []).some((x) => x.kind === "plan1" && x.expiresAt > nowTs) ? "plan1"
    : null;
  const isRenewal = activePlanKind !== null;
  const effectiveKind: "plan1" | "plan3" = isRenewal && activePlanKind ? activePlanKind : planKind;
  const price1 = pricing?.plan1?.[String(term)];
  const price3 = pricing?.plan3?.[String(term)];
  const selPrice = effectiveKind === "plan3" ? price3 : price1;
NEW
];

# --- E4: title reacts to renewal ---
push @edits, [
L(<<'OLD'),
                <h3 className="font-bold text-nm-text text-sm mb-3">{t.choose_plan}</h3>
OLD
L(<<'NEW'),
                <h3 className="font-bold text-nm-text text-sm mb-3">{isRenewal ? (RENEW_TITLE[lang] ?? RENEW_TITLE.en) : t.choose_plan}</h3>
NEW
];

# --- E5: locked tier card on renewal + open !isRenewal wrapper around the kind toggle ---
push @edits, [
L(<<'OLD'),
                {/* plan kind toggle */}
                <div className="grid grid-cols-2 gap-2 mb-3">
OLD
L(<<'NEW'),
                {/* Renewal: locked tier card (cannot re-buy a different/new plan) */}
                {isRenewal && (
                  <div className="p-3 rounded-xl nm-pressed-sm mb-3">
                    <div className="text-base font-bold text-nm-text">{effectiveKind === "plan3" ? t.plan_3dev : t.plan_1dev}</div>
                    <div className="text-sm mt-0.5 text-nm-text-secondary">{(RENEW_CURRENT[lang] ?? RENEW_CURRENT.en)} {fmtDate(account!.maxExpiry, lang)}</div>
                  </div>
                )}

                {/* plan kind toggle — new buyers only */}
                {!isRenewal && (
                <div className="grid grid-cols-2 gap-2 mb-3">
NEW
];

# --- E6: close the !isRenewal wrapper right before the term selector ---
push @edits, [
L(<<'OLD'),
                </div>

                {/* term selector */}
OLD
L(<<'NEW'),
                </div>
                )}

                {/* term selector */}
NEW
];

# --- E7: term discount uses effectiveKind ---
push @edits, [
L(<<'OLD'),
                    const pr = (planKind === "plan3" ? pricing.plan3 : pricing.plan1)[String(tm)];
OLD
L(<<'NEW'),
                    const pr = (effectiveKind === "plan3" ? pricing.plan3 : pricing.plan1)[String(tm)];
NEW
];

# --- E8: pay button label reacts to renewal ---
push @edits, [
L(<<'OLD'),
                  {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <>🪙 {t.pay_crypto}</>}
OLD
L(<<'NEW'),
                  {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <>🪙 {isRenewal ? (RENEW_BTN[lang] ?? RENEW_BTN.en) : t.pay_crypto}</>}
NEW
];

# --- E9: note reacts to renewal ---
push @edits, [
L(<<'OLD'),
                <p className="text-xs text-nm-text-secondary text-center mt-2">{t.renews_note}</p>
OLD
L(<<'NEW'),
                <p className="text-xs text-nm-text-secondary text-center mt-2">{isRenewal ? (RENEW_NOTE[lang] ?? RENEW_NOTE.en) : t.renews_note}</p>
NEW
];

my $i = 0;
for my $e (@edits) {
  $i++;
  my ($o, $n) = @$e;
  my $count = () = ($s =~ /\Q$o\E/g);
  die "Edit $i: anchor matched $count times (need exactly 1). Anchor head:\n  " . substr($o, 0, 60) . "...\n" unless $count == 1;
  $s =~ s/\Q$o\E/$n/;
}

open my $out, '>:encoding(UTF-8)', $f or die "write $f: $!\n";
print $out $s;
close $out;
print "OK: applied $i edits to $f\n";
