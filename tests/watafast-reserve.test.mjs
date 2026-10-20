// tests/watafast-reserve.test.mjs
//
// The reserve path of the app (src/lib/watafast-reserve.ts): which nodes a
// deployment has, out of WATAFAST_RESERVE_NODES, and the order one device is
// given them in; and who is given them at all
// (src/lib/watafast-reserve-gate.ts).
//
// Every name, address and key below is synthetic: names under `.example`,
// addresses of RFC 5737 (203.0.113.0/24) and RFC 3849 (2001:db8::/32), keys
// that are one repeated byte. Nothing here is a node of ours.
//
// No Redis: the gate is asked through a store of its own. The parsing and
// ordering tests are ProxysVPN's, unchanged: the module is the same.
//
// Run: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";

const { reserveNodesFromEnv, reserveOrderFor, MAX_RESERVE_NODES } = await import("../src/lib/watafast-reserve.ts");
const gateLib = await import("../src/lib/watafast-reserve-gate.ts");

const KEY_A = "a1".repeat(32);
const KEY_B = "b2".repeat(32);

const entry = (change = {}) => ({
  id: "r1",
  wire: 2,
  server: "site.example:443",
  path: "/assets/stream",
  node_public_key: KEY_A,
  ...change,
});

const read = (entries) => reserveNodesFromEnv(JSON.stringify(entries));

describe("WATAFAST_RESERVE_NODES", () => {
  test("unset or blank is no reserve, and nothing to warn about", () => {
    for (const value of [undefined, "", "   ", "\n"]) {
      assert.deepEqual(reserveNodesFromEnv(value), { nodes: [], ignored: 0 });
    }
  });

  test("the shortest entry reads, and says what it does not carry", () => {
    assert.deepEqual(read([entry()]), {
      nodes: [
        {
          id: "r1",
          protocol: "watafast",
          carrier: "h2",
          wire: 2,
          server: "site.example:443",
          path: "/assets/stream",
          node_public_key: KEY_A,
          udp: false,
        },
      ],
      ignored: 0,
    });
  });

  test("the fullest entry reads, in the field order the manifest carries", () => {
    const settings = read([
      entry({
        label: "Амстердам",
        flag: "🇳🇱",
        addresses: ["203.0.113.5:443", "[2001:DB8::5]:8443"],
        look: "plain",
        udp: true,
      }),
    ]);
    assert.equal(settings.ignored, 0);
    assert.equal(
      JSON.stringify(settings.nodes[0]),
      JSON.stringify({
        id: "r1",
        label: "Амстердам",
        flag: "🇳🇱",
        protocol: "watafast",
        carrier: "h2",
        wire: 2,
        server: "site.example:443",
        addresses: ["203.0.113.5:443", "[2001:db8::5]:8443"],
        path: "/assets/stream",
        node_public_key: KEY_A,
        look: "plain",
        udp: true,
      }),
    );
  });

  test("a place name is carried trimmed, with or without a flag; without one the entry is what it was", () => {
    const [named] = read([entry({ label: "  Вена ", flag: "🇦🇹" })]).nodes;
    assert.equal(named.label, "Вена");
    assert.equal(named.flag, "🇦🇹");
    const [bare] = read([entry({ label: "Amsterdam 2" })]).nodes;
    assert.equal(bare.label, "Amsterdam 2");
    assert.equal("flag" in bare, false);
    // No name: not a field more than before the name existed.
    const [plain] = read([entry()]).nodes;
    assert.equal("label" in plain, false);
    assert.equal("flag" in plain, false);
    // As long as a name may be, counted in characters and not in bytes.
    assert.equal(read([entry({ label: "я".repeat(40) })]).nodes.length, 1);
  });

  test("a place name that does not read refuses the entry", () => {
    const refused = [
      "",
      "   ",
      "я".repeat(41),
      "Амстердам · резерв", // the app splits a name from its note at the dot
      "🇳🇱 Амстердам", // a flag goes in `flag`
      "Амстер\nдам",
      "Амстер\u0000дам",
      "Амстер\u200Bдам", // drawn as nothing
      "Амстер\u202Eдам", // turns the rest of the line around
      "Амстер\uD800дам", // half a character: the app's reader refuses the whole list over it
      "Амстер\uE000дам", // private use: drawn as whatever the font likes
      "Амстер\u0378дам", // not a character at all
      42,
      null,
      ["Амстердам"],
    ];
    for (const label of refused) {
      assert.deepEqual(read([entry({ label })]), { nodes: [], ignored: 1 }, JSON.stringify(label));
    }
  });

  test("a flag is one country flag, and only beside a place name", () => {
    for (const flag of ["", "NL", "🇳", "🇳🇱🇦🇹", "🏴", "⭐", " 🇳🇱", 1, null]) {
      assert.deepEqual(read([entry({ label: "Амстердам", flag })]), { nodes: [], ignored: 1 }, JSON.stringify(flag));
    }
    assert.deepEqual(read([entry({ flag: "🇳🇱" })]), { nodes: [], ignored: 1 });
  });

  test("a name and a key are carried in lower case, whatever case they were written in", () => {
    const [node] = read([entry({ server: "Site.Example:8443", node_public_key: KEY_A.toUpperCase() })]).nodes;
    assert.equal(node.server, "site.example:8443");
    assert.equal(node.node_public_key, KEY_A);
  });

  test("an address written twice is carried once; an empty list is no list", () => {
    const [twice] = read([entry({ addresses: ["203.0.113.5:443", "203.0.113.5:443"] })]).nodes;
    assert.deepEqual(twice.addresses, ["203.0.113.5:443"]);
    const [none] = read([entry({ addresses: [] })]).nodes;
    assert.equal("addresses" in none, false);
  });

  test("the version of the protocol is carried as written, from the first to the last", () => {
    for (const wire of [1, 2, 255]) {
      assert.equal(read([entry({ wire })]).nodes[0].wire, wire);
    }
    // Two kinds side by side, while nodes are moved from one to the next.
    const both = read([entry({ id: "old", wire: 2 }), entry({ id: "new", wire: 3 })]);
    assert.deepEqual(both.nodes.map((node) => [node.id, node.wire]), [["old", 2], ["new", 3]]);
  });

  test("udp is true only when the entry says exactly true", () => {
    assert.equal(read([entry({ udp: true })]).nodes[0].udp, true);
    assert.equal(read([entry({ udp: false })]).nodes[0].udp, false);
    assert.equal(read([entry()]).nodes[0].udp, false);
    for (const udp of ["true", 1, null, "yes"]) {
      assert.deepEqual(read([entry({ udp })]), { nodes: [], ignored: 1 }, JSON.stringify(udp));
    }
  });

  test("a value that is not a list of entries gives nothing and counts one", () => {
    for (const value of ["{", "null", "42", '"r1"', JSON.stringify(entry()), "[".repeat(40)]) {
      assert.deepEqual(reserveNodesFromEnv(value), { nodes: [], ignored: 1 }, value.slice(0, 12));
    }
  });

  test("a text longer than a list of nodes can be is not read at all", () => {
    const long = JSON.stringify([entry({ path: `/${"a".repeat(100)}` })]).padEnd(16 * 1024 + 1, " ");
    assert.deepEqual(reserveNodesFromEnv(long), { nodes: [], ignored: 1 });
  });

  test("an entry the protocol's own client would refuse is left out, alone, and counted", () => {
    const bad = [
      ["not an object", "r1"],
      ["null", null],
      ["a list", [entry()]],
      ["no id", entry({ id: undefined })],
      ["an id with a capital", entry({ id: "R1" })],
      ["an id with a space", entry({ id: "r 1" })],
      ["an id too long", entry({ id: "r".repeat(33) })],
      ["an id that is a number", entry({ id: 1 })],
      ["no server", entry({ server: undefined })],
      ["a server without a port", entry({ server: "site.example" })],
      ["a server with port 0", entry({ server: "site.example:0" })],
      ["a server with a port above 65535", entry({ server: "site.example:65536" })],
      ["a server with a port that starts with 0", entry({ server: "site.example:0443" })],
      ["a server that is an address", entry({ server: "203.0.113.5:443" })],
      ["a server of one label", entry({ server: "localhost:443" })],
      ["a server with a scheme", entry({ server: "https://site.example:443" })],
      ["a server with a path", entry({ server: "site.example:443/x" })],
      ["a server with an underscore", entry({ server: "my_site.example:443" })],
      ["a label that starts with a hyphen", entry({ server: "-site.example:443" })],
      ["a name that ends with a dot", entry({ server: "site.example.:443" })],
      ["a name of digits alone", entry({ server: "123.456:443" })],
      ["a name longer than a name can be", entry({ server: `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.example:443` })],
      ["addresses that are not a list", entry({ addresses: "203.0.113.5:443" })],
      ["an address without a port", entry({ addresses: ["203.0.113.5"] })],
      ["an address that is a name", entry({ addresses: ["site.example:443"] })],
      ["an address that is no address", entry({ addresses: ["0.0.0.0:443"] })],
      ["an IPv6 address that is no address", entry({ addresses: ["[::]:443"] })],
      ["an IPv6 address without brackets", entry({ addresses: ["2001:db8::5:443"] })],
      ["an address with port 0", entry({ addresses: ["203.0.113.5:0"] })],
      ["one bad address among good ones", entry({ addresses: ["203.0.113.5:443", "nope"] })],
      ["more addresses than the client takes", entry({ addresses: Array.from({ length: 9 }, (_, i) => `203.0.113.${i + 1}:443`) })],
      ["no path", entry({ path: undefined })],
      ["a path without its slash", entry({ path: "assets/stream" })],
      ["a path that is the slash alone", entry({ path: "/" })],
      ["a path with a query", entry({ path: "/assets?x=1" })],
      ["a path with a space", entry({ path: "/assets stream" })],
      ["a path longer than the client takes", entry({ path: `/${"a".repeat(128)}` })],
      ["no key", entry({ node_public_key: undefined })],
      ["a short key", entry({ node_public_key: KEY_A.slice(2) })],
      ["a key that is not hex", entry({ node_public_key: "zz".repeat(32) })],
      ["a key in base64", entry({ node_public_key: Buffer.alloc(32, 0xa1).toString("base64") })],
      ["a look the client does not know", entry({ look: "firefox" })],
      ["no version of the protocol", entry({ wire: undefined })],
      ["version zero", entry({ wire: 0 })],
      ["a version past the last", entry({ wire: 256 })],
      ["a version that is not whole", entry({ wire: 2.5 })],
      ["a version written as text", entry({ wire: "2" })],
      ["a version that is a yes", entry({ wire: true })],
      ["a field this module does not know", entry({ address: ["203.0.113.5:443"] })],
      ["a misspelt field", entry({ adresses: ["203.0.113.5:443"] })],
    ];
    for (const [what, raw] of bad) {
      assert.deepEqual(read([raw]), { nodes: [], ignored: 1 }, what);
      // One bad entry costs itself and nothing else.
      const beside = read([raw, entry({ id: "r2", node_public_key: KEY_B })]);
      assert.equal(beside.ignored, 1, what);
      assert.deepEqual(beside.nodes.map((node) => node.id), ["r2"], what);
    }
  });

  test("the longest name, path and list the client takes are read", () => {
    const name = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(58)}.io`;
    assert.equal(name.length, 253);
    const settings = read([
      entry({
        id: "r".repeat(32),
        server: `${name}:65535`,
        path: `/${"a".repeat(127)}`,
        addresses: Array.from({ length: 8 }, (_, i) => `203.0.113.${i + 1}:1`),
      }),
    ]);
    assert.equal(settings.ignored, 0);
    assert.equal(settings.nodes[0].server, `${name}:65535`);
    assert.equal(settings.nodes[0].path.length, 128);
    assert.equal(settings.nodes[0].addresses.length, 8);
  });

  test("the second entry under one id is left out: the first is the one written first", () => {
    const settings = read([entry(), entry({ server: "other.example:443" }), entry({ id: "r2" })]);
    assert.equal(settings.ignored, 1);
    assert.deepEqual(settings.nodes.map((node) => `${node.id} ${node.server}`), ["r1 site.example:443", "r2 site.example:443"]);
  });

  test("a manifest carries at most eight nodes; the ninth is counted, not carried", () => {
    const many = Array.from({ length: MAX_RESERVE_NODES + 2 }, (_, i) => entry({ id: `r${i + 1}` }));
    const settings = read(many);
    assert.equal(settings.nodes.length, MAX_RESERVE_NODES);
    assert.equal(settings.ignored, 2);
    assert.deepEqual(settings.nodes.map((node) => node.id), ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"]);
  });

  test("nothing of a refused entry is in what the module gives back", () => {
    const secretPath = "/very/secret/path";
    const settings = read([entry({ path: secretPath, server: "203.0.113.77:443" })]);
    assert.equal(JSON.stringify(settings).includes("secret"), false);
    assert.equal(JSON.stringify(settings).includes("203.0.113.77"), false);
  });
});

describe("the order one device tries the nodes in", () => {
  const nodes = read([entry({ id: "r1" }), entry({ id: "r2" }), entry({ id: "r3" })]).nodes;
  const uuid = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
  const idsFor = (device, list = nodes) => reserveOrderFor(list, device).map((node) => node.id);

  test("the same nodes, each once, and the list handed in is left as it was", () => {
    const before = JSON.stringify(nodes);
    const ordered = reserveOrderFor(nodes, uuid(1));
    assert.deepEqual([...ordered].map((node) => node.id).sort(), ["r1", "r2", "r3"]);
    assert.equal(JSON.stringify(nodes), before);
    assert.deepEqual(reserveOrderFor([], uuid(1)), []);
  });

  test("a device keeps its order from one manifest to the next, however the setting lists the nodes", () => {
    const reversed = [...nodes].reverse();
    for (let n = 0; n < 50; n += 1) {
      assert.deepEqual(idsFor(uuid(n)), idsFor(uuid(n)));
      assert.deepEqual(idsFor(uuid(n)), idsFor(uuid(n), reversed));
    }
  });

  test("devices spread over the nodes: none is everybody's first, none is nobody's", () => {
    const first = new Map(nodes.map((node) => [node.id, 0]));
    const devices = 3000;
    for (let n = 0; n < devices; n += 1) first.set(idsFor(uuid(n))[0], first.get(idsFor(uuid(n))[0]) + 1);
    for (const [id, count] of first) {
      // A third each, give or take; 20 % either way is many standard deviations.
      assert.ok(count > devices / 3 * 0.8 && count < devices / 3 * 1.2, `${id} is first for ${count} of ${devices}`);
    }
  });

  test("a node taken away moves only the devices that had it first", () => {
    const without = nodes.filter((node) => node.id !== "r2");
    for (let n = 0; n < 300; n += 1) {
      const before = idsFor(uuid(n));
      const after = idsFor(uuid(n), without);
      assert.deepEqual(after, before.filter((id) => id !== "r2"), uuid(n));
    }
  });
});


describe("who is given the reserve", () => {
  const OWNER = gateLib.WATAFAST_RESERVE_OWNER_ID;
  const OWNER_TG = OWNER.slice(3);
  const ask = gateLib.watafastReserveForUser;

  /** A store holding `members`, or throwing `members` when it is an Error; counts its reads. */
  const storeOf = (members) => {
    const store = {
      reads: 0,
      asked: [],
      async smismember(key, wanted) {
        store.reads += 1;
        store.asked.push({ key, wanted });
        if (members instanceof Error) throw members;
        return wanted.map((m) => (members.includes(m) ? 1 : 0));
      },
    };
    return store;
  };

  const quiet = async (run) => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      return await run();
    } finally {
      console.warn = warn;
    }
  };

  test("the set has a name of its own, and the owner is the admin account", () => {
    assert.equal(gateLib.WATAFAST_RESERVE_USERS_KEY, "wf:reserve:users");
    assert.match(OWNER, /^tg_\d+$/);
  });

  test("the owner is given it without a read, by its id or by the Telegram id linked to it", async () => {
    const store = storeOf(new Error("down"));
    assert.equal(await ask(store, OWNER, null), true);
    assert.equal(await ask(store, "em_owner@example.invalid", { telegramId: OWNER_TG }), true);
    assert.equal(store.reads, 0);
  });

  test("an empty set is the owner alone", async () => {
    const store = storeOf([]);
    for (const userId of ["tg_100200300", "em_someone@example.invalid"]) {
      assert.equal(await ask(store, userId, null), false, userId);
    }
  });

  test("a listed account is given it, its neighbours are not; one read asks the id and `*`", async () => {
    const store = storeOf(["tg_100200300"]);
    assert.equal(await ask(store, "tg_100200300", null), true);
    assert.equal(await ask(store, "tg_100200301", null), false);
    assert.equal(await ask(store, "tg_10020030", null), false);
    assert.deepEqual(store.asked[0], { key: "wf:reserve:users", wanted: ["tg_100200300", "*"] });
  });

  test("`*` is everyone", async () => {
    const store = storeOf(["*"]);
    for (const userId of ["tg_100200300", "em_someone@example.invalid"]) {
      assert.equal(await ask(store, userId, null), true, userId);
    }
  });

  test("an account is given it when the Telegram account linked to it is listed", async () => {
    const store = storeOf(["tg_100200300"]);
    assert.equal(await ask(store, "em_a@example.invalid", { telegramId: "100200300" }), true);
    assert.equal(await ask(store, "em_a@example.invalid", { telegramId: "100200301" }), false);
    assert.deepEqual(store.asked[0].wanted, ["em_a@example.invalid", "*", "tg_100200300"]);
  });

  test("a linked id that is not a Telegram id opens nothing and is not asked", async () => {
    const store = storeOf(["tg_100200300", "tg_*", "tg_"]);
    for (const telegramId of ["*", "", "100200300 ", "tg_100200300", "1".repeat(21), 100200300, {}]) {
      assert.equal(await ask(store, "em_a@example.invalid", { telegramId }), false, String(telegramId));
    }
    for (const { wanted } of store.asked) assert.deepEqual(wanted, ["em_a@example.invalid", "*"]);
  });

  test("a value that is not an account is given nothing, even with `*` in the set", async () => {
    const store = storeOf(["*"]);
    for (const userId of [null, undefined, "", "*"]) assert.equal(await ask(store, userId, null), false, String(userId));
    assert.equal(store.reads, 0);
  });

  test("a failed read is 'no', never an error to the caller", async () => {
    assert.equal(await quiet(() => ask(storeOf(new Error("down")), "tg_100200300", null)), false);
  });
});
