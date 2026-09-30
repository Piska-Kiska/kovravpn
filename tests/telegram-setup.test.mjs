// tests/telegram-setup.test.mjs — run: npm test
//
// scripts/telegram-setup.mjs (bot commands and the Mini App menu button) is a
// dry run unless --apply, needs explicit targets, and refuses --apply without
// a well-formed token, so these tests never reach the network. Chat ids are
// made up.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/telegram-setup.mjs", import.meta.url));

function run(args) {
  const env = { ...process.env };
  delete env.TELEGRAM_BOT_TOKEN;
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: "utf8", timeout: 20_000 });
}

describe("scripts/telegram-setup.mjs", () => {
  test("dry run by default: prints the calls, sends nothing, needs no token", () => {
    const r = run(["--chat", "100000001"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN: 6 call\(s\) planned, nothing sent/);
    assert.match(r.stdout, /setMyCommands .*"scope":\{"type":"chat","chat_id":100000001\}/);
    assert.match(r.stdout, /"language_code":"ru"/);
    assert.match(r.stdout, /setChatMenuButton \{"chat_id":100000001,"menu_button":\{"type":"web_app","text":"Kovra","web_app":\{"url":"https:\/\/kovravpn.com\/tg"\}\}\}/);
  });

  test("everyone only on request, with a warning", () => {
    const r = run(["--default", "--only", "menu"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /EVERY chat/);
    assert.match(r.stdout, /setChatMenuButton \{"menu_button"/);
  });

  test("--reset undoes what it sets", () => {
    const r = run(["--chat", "100000001", "--reset"]);
    assert.match(r.stdout, /deleteMyCommands/);
    assert.match(r.stdout, /"menu_button":\{"type":"default"\}/);
  });

  test("refuses: no target, a bad chat id, a non-https URL, --apply without a token", () => {
    for (const args of [[], ["--chat", "abc"], ["--chat", "-1001234567"], ["--chat", "100000001", "--url", "http://x.test"], ["--chat", "100000001", "--apply"]]) {
      const r = run(args);
      assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}`);
      assert.doesNotMatch(r.stdout, /^ok /m);
    }
  });
});
