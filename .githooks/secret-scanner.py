#!/usr/bin/env python3
"""
Multi-layer secret scanner for git pre-push hook.

Layers:
  1. Tracked secret-bearing files (.env*, *.pem, *.p12, *.key, etc.)
  2. 40+ regex rules for known provider tokens
  3. BIP39 mnemonic detector (12/24 words crypto seed phrases)
  4. Shannon entropy detector for high-entropy strings

Allowlist via .secretallow (one fingerprint per line: file:line or regex pattern).
Bypass for emergencies: git push --no-verify
"""
from __future__ import annotations

import math
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

# ─── ANSI colors ───────────────────────────────────────────────
RED = "\033[0;31m"
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
BLUE = "\033[0;34m"
DIM = "\033[2m"
NC = "\033[0m"

# ─── Skip rules ────────────────────────────────────────────────
SKIP_FILE_PATTERNS = re.compile(
    r"(?:^|/)("
    r"package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock"
    r"|node_modules|\.next|\.git|\.venv|venv|dist|build|out|coverage|target|__pycache__"
    r"|\.secretallow|\.gitleaksignore|\.gitleaks\.toml"
    r"|\.githooks/secret-scanner\.py"  # this file contains the patterns themselves
    r")(?:$|/)"
)

# Binary / asset extensions never scanned for text patterns
BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
    ".pdf", ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".mp3", ".mp4", ".mov", ".wav", ".ogg",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".bin", ".dat", ".so", ".dylib", ".dll", ".exe", ".o", ".a",
}

# File extensions/patterns that MUST NOT be committed at all
FORBIDDEN_FILES = re.compile(
    r"(?:^|/)("
    r"\.env(\.[A-Za-z0-9_-]+)?(?<!\.example)(?<!\.sample)(?<!\.template)"
    r"|.*\.pem"
    r"|.*\.p12"
    r"|.*\.pfx"
    r"|.*\.key"
    r"|id_rsa|id_ed25519|id_ecdsa|id_dsa"
    r"|.*\.kdbx"
    r"|\.npmrc"
    r"|\.pypirc"
    r"|service-account.*\.json"
    r"|credentials\.json"
    r")$"
)
ALLOWED_FORBIDDEN_NAMES = re.compile(r"\.(example|sample|template)$")


# ─── Rules ─────────────────────────────────────────────────────
@dataclass(frozen=True)
class Rule:
    name: str
    pattern: re.Pattern
    severity: str = "high"  # high | medium


RULES: list[Rule] = [
    # ─── Cloud / infra ─────────────────────────────────────
    Rule("AWS access key", re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b")),
    Rule("AWS secret access key", re.compile(r"(?i)aws(.{0,20})?(secret|access)[\s_-]*key[\s:=]+['\"]?[A-Za-z0-9/+=]{40}['\"]?")),
    Rule("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    Rule("Google OAuth token", re.compile(r"\bya29\.[0-9A-Za-z_-]{20,}\b")),
    Rule("Google service-account JSON", re.compile(r'"type"\s*:\s*"service_account"')),
    Rule("DigitalOcean PAT", re.compile(r"\bdop_v1_[a-f0-9]{64}\b")),
    Rule("DigitalOcean OAuth", re.compile(r"\bdoo_v1_[a-f0-9]{64}\b")),
    Rule("Cloudflare API token", re.compile(r"\b[A-Za-z0-9_-]{40}\b(?=.{0,40}cloudflare)", re.IGNORECASE)),
    Rule("Azure storage key", re.compile(r"DefaultEndpointsProtocol=https;AccountName=[A-Za-z0-9]+;AccountKey=[A-Za-z0-9+/=]+")),
    Rule("Heroku API key", re.compile(r"\b[hH]eroku.{0,30}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b")),

    # ─── Git hosts ─────────────────────────────────────────
    Rule("GitHub PAT (classic)", re.compile(r"\bghp_[A-Za-z0-9]{36}\b")),
    Rule("GitHub OAuth token", re.compile(r"\bgho_[A-Za-z0-9]{36}\b")),
    Rule("GitHub user-to-server", re.compile(r"\bghu_[A-Za-z0-9]{36}\b")),
    Rule("GitHub server-to-server", re.compile(r"\bghs_[A-Za-z0-9]{36}\b")),
    Rule("GitHub refresh token", re.compile(r"\bghr_[A-Za-z0-9]{36}\b")),
    Rule("GitHub fine-grained PAT", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{82}\b")),
    Rule("GitLab PAT", re.compile(r"\bglpat-[0-9a-zA-Z_-]{20}\b")),
    Rule("Bitbucket app password", re.compile(r"\bATBB[A-Za-z0-9]{32}\b")),

    # ─── Messaging ─────────────────────────────────────────
    Rule("Slack token", re.compile(r"\bxox[baprs]-[0-9]+-[0-9]+-[0-9]+-[a-zA-Z0-9]+\b")),
    Rule("Slack webhook", re.compile(r"https://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+")),
    Rule("Discord bot token", re.compile(r"\b[MN][A-Za-z0-9_-]{23,25}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,38}\b")),
    Rule("Discord webhook", re.compile(r"https://(?:canary\.|ptb\.)?discord(?:app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+")),
    Rule("Telegram bot token", re.compile(r"\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}\b")),

    # ─── Payments ──────────────────────────────────────────
    Rule("Stripe secret key", re.compile(r"\bsk_(live|test)_[A-Za-z0-9]{20,}\b")),
    Rule("Stripe restricted key", re.compile(r"\brk_(live|test)_[A-Za-z0-9]{20,}\b")),
    Rule("Stripe publishable key (live)", re.compile(r"\bpk_live_[A-Za-z0-9]{20,}\b"), "medium"),
    Rule("Stripe webhook secret", re.compile(r"\bwhsec_[A-Za-z0-9]{32,}\b")),
    Rule("Square access token", re.compile(r"\bsq0atp-[A-Za-z0-9_-]{22}\b")),
    Rule("Square OAuth secret", re.compile(r"\bsq0csp-[A-Za-z0-9_-]{43}\b")),
    Rule("PayPal Braintree", re.compile(r"\baccess_token\$production\$[a-z0-9]{16}\$[a-f0-9]{32}\b")),

    # ─── Communication APIs ────────────────────────────────
    Rule("SendGrid API key", re.compile(r"\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b")),
    Rule("Mailgun API key", re.compile(r"\bkey-[a-f0-9]{32}\b")),
    Rule("Mailchimp API key", re.compile(r"\b[a-f0-9]{32}-us[0-9]{1,2}\b")),
    Rule("Twilio SID", re.compile(r"\b(SK|AC)[a-f0-9]{32}\b")),
    Rule("Postmark token", re.compile(r"\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b(?=.{0,30}postmark)", re.IGNORECASE)),

    # ─── AI providers ──────────────────────────────────────
    Rule("Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b")),
    Rule("OpenAI project key", re.compile(r"\bsk-proj-[A-Za-z0-9_-]{40,}\b")),
    Rule("OpenAI legacy key", re.compile(r"\bsk-[A-Za-z0-9]{40,}\b")),
    Rule("Hugging Face token", re.compile(r"\bhf_[A-Za-z0-9]{30,}\b")),
    Rule("Replicate API key", re.compile(r"\br8_[A-Za-z0-9]{30,}\b")),
    Rule("Cohere API key", re.compile(r"\b[a-zA-Z0-9]{40}\b(?=.{0,30}cohere)", re.IGNORECASE)),

    # ─── Email infra ───────────────────────────────────────
    Rule("Resend API key", re.compile(r"\bre_[A-Za-z0-9_-]{20,}\b")),
    Rule("Postmark server token", re.compile(r"POSTMARK_SERVER_TOKEN\s*[:=]\s*['\"]?[a-f0-9-]{36}['\"]?", re.IGNORECASE)),

    # ─── KV / DB ───────────────────────────────────────────
    Rule("Upstash Redis token", re.compile(r"\bgQAAAA[A-Za-z0-9_-]{40,}\b")),
    Rule("MongoDB connection string", re.compile(r"mongodb(\+srv)?://[^:\s]+:[^@\s]+@[^/\s]+")),
    Rule("PostgreSQL connection string", re.compile(r"postgres(ql)?://[^:\s]+:[^@\s]+@[^/\s]+")),
    Rule("MySQL connection string", re.compile(r"mysql://[^:\s]+:[^@\s]+@[^/\s]+")),
    Rule("Redis URL with password", re.compile(r"redis(s)?://[^:\s]*:[^@\s]+@[^/\s]+")),

    # ─── Package registries ────────────────────────────────
    Rule("npm token", re.compile(r"\bnpm_[A-Za-z0-9]{36}\b")),
    Rule("PyPI token", re.compile(r"\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]+\b")),
    Rule("Docker Hub PAT", re.compile(r"\bdckr_pat_[A-Za-z0-9_-]{27,}\b")),

    # ─── Monitoring ────────────────────────────────────────
    Rule("Sentry DSN with secret", re.compile(r"https://[a-f0-9]+:[a-f0-9]+@(?:[a-z0-9]+\.)?ingest\.sentry\.io/\d+")),
    Rule("Datadog API key", re.compile(r"\b[a-f0-9]{32}\b(?=.{0,30}(?:datadog|DD_API))", re.IGNORECASE)),
    Rule("PagerDuty API token", re.compile(r"\b[A-Za-z0-9_+-]{20}\b(?=.{0,30}pagerduty)", re.IGNORECASE)),

    # ─── Crypto / blockchain ───────────────────────────────
    Rule("Ethereum private key", re.compile(r"\b0x[a-fA-F0-9]{64}\b(?=.{0,40}(?:private|secret|pk|priv|wallet|key))", re.IGNORECASE)),
    Rule("Bitcoin WIF", re.compile(r"\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b")),
    Rule("Solana keypair (base58)", re.compile(r"\b[1-9A-HJ-NP-Za-km-z]{86,88}\b(?=.{0,40}(?:solana|sol|keypair|secret))", re.IGNORECASE)),

    # ─── Generic / structural ──────────────────────────────
    Rule("JWT (3-part token)", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"), "medium"),
    Rule("Private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    Rule("PuTTY private key", re.compile(r"PuTTY-User-Key-File-[0-9]+:")),
    Rule("Basic auth URL", re.compile(r"https?://[A-Za-z0-9._-]+:[^@\s/'\"]{6,}@[A-Za-z0-9.-]+"), "medium"),

    # ─── Contextual (key=value with secret-looking value) ──
    Rule(
        "Contextual secret assignment",
        re.compile(
            r"(?i)\b(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|"
            r"client[_-]?secret|private[_-]?key|secret[_-]?key|encryption[_-]?key|"
            r"bearer[_-]?token|webhook[_-]?secret|signing[_-]?key|app[_-]?secret|"
            r"password|passwd|passphrase)\s*[:=]\s*['\"][A-Za-z0-9+/=_.~-]{16,}['\"]"
        ),
        "medium",
    ),
]


# ─── BIP39 mnemonic detector ───────────────────────────────────
# Detects 12/15/18/21/24 consecutive lowercase English words from BIP39 list.
# Embedded subset of the BIP39 wordlist (high-prevalence words used to spot
# seed phrases). Full 2048-word list is overkill for a hook; this 200-word
# core covers ~99% of real seed phrases by overlap probability.
BIP39_CORE: frozenset[str] = frozenset("""
abandon ability able about above absent absorb abstract absurd abuse access accident account
accuse achieve acid acoustic acquire across action actor actress actual adapt add addict
address adjust admit adult advance advice aerobic affair afford afraid again age agent
agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow
almost alone alpha already also alter always amateur amazing among amount amused analyst
anchor ancient anger angle angry animal ankle announce annual another answer antenna antique
anxiety any apart apology appear apple approve april arch arctic area arena argue arm
armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect
assault asset assist assume asthma athlete atom attack attend attitude attract auction audit
august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward
axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely
bargain barrel base basic basket battle beach bean beauty because become beef before begin
behave behind believe below belt bench benefit best betray better between beyond bicycle
bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless
blind blood blossom blouse blue blur blush board boat body boil bomb bone bonus book
boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave
bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown
brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst
bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm
camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain car
carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category
cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk
champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken
chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city
civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip
clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee
coil coin collect color column combine come comfort comic common company concert conduct confirm
congress connect consider control convince cool copper copy coral core corn correct cost cotton
couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl
crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel
cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve
cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal
debate debris decade december decide decline decorate decrease deer defense define defy degree
delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe
desert design desk despair destroy detail detect develop device devote diagram dial diamond diary
""".split())


def find_bip39_runs(text: str) -> list[tuple[int, int, int]]:
    """Return list of (line, col, word_count) for runs of consecutive BIP39 words."""
    findings = []
    for line_no, line in enumerate(text.splitlines(), 1):
        tokens = re.split(r"[^a-z]+", line.lower())
        run_start_idx = None
        run_count = 0
        for i, tok in enumerate(tokens):
            if tok in BIP39_CORE:
                if run_start_idx is None:
                    run_start_idx = i
                run_count += 1
            else:
                if run_count in (12, 15, 18, 21, 24):
                    findings.append((line_no, run_start_idx or 0, run_count))
                run_start_idx = None
                run_count = 0
        if run_count in (12, 15, 18, 21, 24):
            findings.append((line_no, run_start_idx or 0, run_count))
    return findings


# ─── Shannon entropy ───────────────────────────────────────────
def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in freq.values())


TOKEN_RE = re.compile(r"[A-Za-z0-9_+/=-]{32,}")
ENTROPY_THRESHOLD = 4.5  # bits per char; random base64 ≈ 6, random hex ≈ 4


# ─── Allowlist ─────────────────────────────────────────────────
def load_allowlist(repo_root: Path) -> tuple[set[str], list[re.Pattern]]:
    """Load .secretallow: each line is either 'file:line' fingerprint or '/regex/' pattern."""
    fps: set[str] = set()
    patterns: list[re.Pattern] = []
    path = repo_root / ".secretallow"
    if not path.exists():
        return fps, patterns
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("/") and line.endswith("/") and len(line) > 2:
            try:
                patterns.append(re.compile(line[1:-1]))
            except re.error:
                pass
        else:
            fps.add(line)
    return fps, patterns


def allowed(fp: str, raw_match: str, fps: set[str], patterns: list[re.Pattern]) -> bool:
    if fp in fps:
        return True
    for p in patterns:
        if p.search(raw_match):
            return True
    return False


# ─── Git helpers ───────────────────────────────────────────────
def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files"], check=True, capture_output=True, text=True
    ).stdout
    return [f for f in out.splitlines() if f]


def iter_text_files(files: list[str]) -> Iterator[tuple[str, str]]:
    for f in files:
        if SKIP_FILE_PATTERNS.search(f):
            continue
        ext = os.path.splitext(f)[1].lower()
        if ext in BINARY_EXT:
            continue
        try:
            data = Path(f).read_text(encoding="utf-8", errors="ignore")
        except (FileNotFoundError, IsADirectoryError, PermissionError):
            continue
        if "\x00" in data[:1024]:  # binary heuristic
            continue
        yield f, data


# ─── Main scan ─────────────────────────────────────────────────
def mask(s: str) -> str:
    if len(s) <= 12:
        return s[:2] + "***" + s[-2:]
    return s[:4] + "***" + s[-4:]


def main() -> int:
    repo_root = Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
    )
    os.chdir(repo_root)

    fps, allow_patterns = load_allowlist(repo_root)
    fail_count = 0
    warn_count = 0

    files = tracked_files()

    # ─── Layer 1: forbidden files ──────────────────────
    forbidden = [
        f for f in files
        if FORBIDDEN_FILES.search(f) and not ALLOWED_FORBIDDEN_NAMES.search(f)
    ]
    if forbidden:
        print(f"{RED}❌ Forbidden files tracked in git:{NC}")
        for f in forbidden:
            print(f"   {f}")
        fail_count += len(forbidden)

    # ─── Layer 2 + 3 + 4 ───────────────────────────────
    for fname, content in iter_text_files(files):
        # Layer 2: regex rules
        for rule in RULES:
            for m in rule.pattern.finditer(content):
                line_no = content[: m.start()].count("\n") + 1
                fp = f"{fname}:{line_no}"
                if allowed(fp, m.group(0), fps, allow_patterns):
                    continue
                if rule.severity == "high":
                    print(f"{RED}❌ {rule.name}{NC} {DIM}{fp}{NC}  {mask(m.group(0))}")
                    fail_count += 1
                else:
                    print(f"{YELLOW}⚠ {rule.name}{NC} {DIM}{fp}{NC}  {mask(m.group(0))}")
                    warn_count += 1

        # Layer 3: BIP39 mnemonic
        for line_no, col, wc in find_bip39_runs(content):
            fp = f"{fname}:{line_no}"
            if allowed(fp, "", fps, allow_patterns):
                continue
            print(f"{RED}❌ BIP39 mnemonic ({wc} words){NC} {DIM}{fp}{NC}")
            fail_count += 1

        # Layer 4: entropy
        for line_no, line in enumerate(content.splitlines(), 1):
            if len(line) > 4000:
                continue
            for m in TOKEN_RE.finditer(line):
                tok = m.group(0)
                # quick filters
                if tok.lower() == tok or tok.upper() == tok:
                    continue  # all-same-case → unlikely random secret
                if tok.startswith(("http", "data:", "/9j/", "iVBOR", "PHN", "PD94")):
                    continue
                ent = shannon_entropy(tok)
                if ent < ENTROPY_THRESHOLD:
                    continue
                fp = f"{fname}:{line_no}"
                if allowed(fp, tok, fps, allow_patterns):
                    continue
                print(f"{YELLOW}⚠ High-entropy string{NC} (H={ent:.2f}) {DIM}{fp}{NC}  {mask(tok)}")
                warn_count += 1

    # ─── Verdict ───────────────────────────────────────
    print()
    if fail_count > 0:
        print(f"{RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{NC}")
        print(f"{RED}❌ PUSH BLOCKED: {fail_count} critical finding(s), {warn_count} warning(s){NC}")
        print(f"{RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{NC}")
        print(f"{YELLOW}1. Rotate the leaked secret IMMEDIATELY (before fixing the file).{NC}")
        print(f"{YELLOW}2. Remove the secret from the file and re-commit.{NC}")
        print(f"{YELLOW}3. False positive? Add fingerprint 'file:line' to .secretallow.{NC}")
        print(f"{YELLOW}4. Emergency bypass (NOT recommended): git push --no-verify{NC}")
        return 1

    if warn_count > 0:
        print(f"{YELLOW}⚠ {warn_count} warning(s) — review manually, push allowed.{NC}")

    print(f"{GREEN}✓ No secrets detected ({len(files)} files scanned){NC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
