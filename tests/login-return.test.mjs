// tests/login-return.test.mjs
//
// Sign-in that comes back to the page that asked for it (src/lib/login-return.ts).
// The Kovra app for iPhone and iPad opens /dashboard/account/delete; without a session the
// middleware sends the person to /login?next=…, and /login returns there.
//
// `next` comes from a URL anyone can craft, so the rule is an allow-list of
// whole paths with nothing but a supported `lang`. Pinned here: the accepted
// values, a table of open-redirect spellings that must all fall back to
// /dashboard, and (at source level) that the middleware and both sign-in
// paths of /login go through these functions.
//
// Run: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./support/load-ts.mjs";

const { safeReturnPath, loginUrlFor, afterLoginPath, LOGIN_RETURN_PATHS, DEFAULT_AFTER_LOGIN } = await import(
  "../src/lib/login-return.ts"
);

const PAGE = "/dashboard/account/delete";

describe("safeReturnPath", () => {
  test("the deletion page is the one page /login returns to", () => {
    assert.deepEqual([...LOGIN_RETURN_PATHS], [PAGE]);
    assert.equal(safeReturnPath(PAGE), PAGE);
  });

  test("a supported ?lang= survives, normalised", () => {
    for (const lang of ["en", "ru", "es", "de", "fr"]) {
      assert.equal(safeReturnPath(`${PAGE}?lang=${lang}`), `${PAGE}?lang=${lang}`, lang);
    }
  });

  const REFUSED = [
    // Not a string, empty, too long.
    undefined,
    null,
    42,
    "",
    `${PAGE}?lang=en${"&".repeat(300)}`,
    // Other hosts in every spelling a browser accepts.
    "//evil.example/dashboard/account/delete",
    "/\\evil.example",
    "\\\\evil.example",
    "https://evil.example/dashboard/account/delete",
    "https:evil.example",
    "javascript:alert(1)",
    "/\t/evil.example",
    "/\n/evil.example",
    " /dashboard/account/delete",
    // Our host, other pages.
    "/dashboard",
    "/dashboard/",
    "/dashboard/account/delete/",
    "/dashboard/account/delete/x",
    "/Dashboard/account/delete",
    "/%64ashboard/account/delete",
    "/dashboard/account/delete%2F..%2F..%2Flogin",
    "/api/account/delete",
    "/login",
    // Query and fragment beyond one supported lang.
    `${PAGE}?lang=xx`,
    `${PAGE}?lang=zh`,
    `${PAGE}?lang=en&lang=ru`,
    `${PAGE}?lang=en&next=//evil.example`,
    `${PAGE}?utm_source=app`,
    `${PAGE}#code`,
  ];

  test("every other value is refused", () => {
    for (const raw of REFUSED) assert.equal(safeReturnPath(raw), null, JSON.stringify(raw));
  });

  test("dot segments that resolve to the page itself are the page", () => {
    // The URL parser resolves them before the comparison: still our own page, never another.
    assert.equal(safeReturnPath("/dashboard/x/../account/delete"), PAGE);
  });
});

describe("loginUrlFor (middleware)", () => {
  test("the deletion page gets ?next= and its language", () => {
    assert.equal(loginUrlFor(PAGE, ""), `/login?next=${encodeURIComponent(PAGE)}`);
    assert.equal(
      loginUrlFor(PAGE, "?lang=de"),
      `/login?next=${encodeURIComponent(`${PAGE}?lang=de`)}&lang=de`,
    );
  });

  test("the rest of /dashboard keeps the bare /login it always had", () => {
    assert.equal(loginUrlFor("/dashboard", ""), "/login");
    assert.equal(loginUrlFor("/dashboard", "?lang=en"), "/login");
    assert.equal(loginUrlFor("/dashboard/anything", "?topup=1"), "/login");
    assert.equal(loginUrlFor(PAGE, "?lang=en&utm=x"), "/login");
  });

  test("what the middleware writes, /login reads back", () => {
    const url = new URL(loginUrlFor(PAGE, "?lang=fr"), "https://kovravpn.com");
    assert.equal(afterLoginPath(url.search), `${PAGE}?lang=fr`);
  });
});

describe("afterLoginPath (/login)", () => {
  test("no next, or a bad one, lands on /dashboard as before", () => {
    assert.equal(DEFAULT_AFTER_LOGIN, "/dashboard");
    assert.equal(afterLoginPath(""), "/dashboard");
    assert.equal(afterLoginPath("?lang=en"), "/dashboard");
    assert.equal(afterLoginPath("?next=%2F%2Fevil.example"), "/dashboard");
    assert.equal(afterLoginPath("?next=https%3A%2F%2Fevil.example"), "/dashboard");
  });

  test("a good next is followed", () => {
    assert.equal(afterLoginPath(`?next=${encodeURIComponent(PAGE)}`), PAGE);
  });
});

describe("wiring (source)", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

  test("every /login redirect of the middleware goes through redirectLogin", () => {
    const src = read("src/middleware.ts");
    assert.doesNotMatch(src, /new URL\("\/login", req\.url\)/, "a bare /login redirect is left");
    assert.match(src, /new URL\(loginUrlFor\(req\.nextUrl\.pathname, req\.nextUrl\.search\), req\.url\)/);
    assert.equal((src.match(/NextResponse\.redirect\(/g) ?? []).length, 1, "one redirect, inside redirectLogin");
    assert.ok((src.match(/return redirectLogin\(req(, true)?\)/g) ?? []).length >= 6);
  });

  test("both sign-in paths of /login return through afterLoginPath", () => {
    const src = read("src/app/login/page.tsx");
    assert.doesNotMatch(src, /window\.location\.href = "\/dashboard"/);
    assert.equal((src.match(/window\.location\.href = afterLoginPath\(window\.location\.search\)/g) ?? []).length, 2);
  });
});
