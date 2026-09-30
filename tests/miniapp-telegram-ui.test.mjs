// tests/miniapp-telegram-ui.test.mjs — run: npm test
//
// The Telegram bindings the Mini App cabinet added after the review
// (src/app/tg/telegram-webapp-client.ts), against a fake WebApp:
//   • the bottom button (MainButton) shows Kovra's gold action, greys out
//     while a request runs, and its unbind removes the handler and hides it,
//     so a view that goes away never leaves a live button that pays;
//   • an old client (< 6.0) or one without the button: nothing is touched;
//   • sharing goes through Telegram's own picker (t.me/share/url).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";

globalThis.window = globalThis.window ?? { location: { href: "https://kovravpn.com/tg" }, open: () => null };

const { bindMainButton, hasMainButton, shareViaTelegram, KOVRA_CTA } = await import("../src/app/tg/telegram-webapp-client.ts");

function fakeWebApp(version = "8.0", withButton = true) {
  const log = { params: [], shown: 0, hidden: 0, progress: 0, handlers: new Set(), links: [], tgLinks: [] };
  const [maj, min] = version.split(".").map(Number);
  const wa = {
    version,
    isVersionAtLeast: (v) => {
      const [a, b] = v.split(".").map(Number);
      return maj > a || (maj === a && (min ?? 0) >= (b ?? 0));
    },
    openLink: (u) => log.links.push(u),
    openTelegramLink: (u) => log.tgLinks.push(u),
    ...(withButton
      ? {
          MainButton: {
            isVisible: false,
            setParams: (p) => log.params.push(p),
            show: () => (log.shown += 1),
            hide: () => (log.hidden += 1),
            showProgress: () => (log.progress += 1),
            hideProgress: () => undefined,
            onClick: (h) => log.handlers.add(h),
            offClick: (h) => log.handlers.delete(h),
          },
        }
      : {}),
  };
  return { wa, log };
}

describe("Telegram's bottom button", () => {
  test("shows the gold action and runs the handler", () => {
    const { wa, log } = fakeWebApp();
    let paid = 0;
    const off = bindMainButton(wa, { text: "Pay $11.99 from balance", active: true, loading: false, onClick: () => (paid += 1) });
    assert.deepEqual(log.params.at(-1), {
      text: "Pay $11.99 from balance",
      color: KOVRA_CTA.color,
      text_color: KOVRA_CTA.text,
      is_active: true,
      is_visible: true,
    });
    for (const h of log.handlers) h();
    assert.equal(paid, 1);
    off();
    assert.equal(log.handlers.size, 0, "the handler is gone");
    assert.ok(log.hidden >= 1, "and the button hidden");
  });

  test("while a request runs: greyed out with Telegram's spinner", () => {
    const { wa, log } = fakeWebApp();
    bindMainButton(wa, { text: "Pay", active: true, loading: true, onClick: () => undefined });
    assert.equal(log.params.at(-1).is_active, false);
    assert.equal(log.progress, 1);
  });

  test("a label longer than Telegram takes is cut at 64", () => {
    const { wa, log } = fakeWebApp();
    bindMainButton(wa, { text: "x".repeat(100), active: true, loading: false, onClick: () => undefined });
    assert.equal(log.params.at(-1).text.length, 64);
  });

  test("an old client or one without it: nothing happens", () => {
    for (const { wa, log } of [fakeWebApp("5.9"), fakeWebApp("8.0", false)]) {
      assert.equal(hasMainButton(wa), false);
      const off = bindMainButton(wa, { text: "Pay", active: true, loading: false, onClick: () => assert.fail("never") });
      off();
      assert.equal(log.params.length, 0);
    }
  });

  test("null hides it", () => {
    const { wa, log } = fakeWebApp();
    bindMainButton(wa, null);
    assert.equal(log.hidden, 1);
  });
});

describe("sharing an invite", () => {
  test("Telegram's own chat picker, the link and the text encoded", () => {
    const { wa, log } = fakeWebApp();
    shareViaTelegram(wa, "https://t.me/KovraVPN_bot?start=ref_abcd1234", "Join me on Kovra:");
    assert.deepEqual(log.tgLinks, [
      "https://t.me/share/url?url=https%3A%2F%2Ft.me%2FKovraVPN_bot%3Fstart%3Dref_abcd1234&text=Join%20me%20on%20Kovra%3A",
    ]);
    assert.deepEqual(log.links, []);
  });
});
