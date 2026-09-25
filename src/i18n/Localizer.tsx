// src/i18n/Localizer.tsx
"use client";

import { useEffect } from "react";
import { dict } from "./dict";
import {
  applyTranslations,
  detectLang,
  LANG_CHANGE_EVENT,
} from "./runtime";
import { isCabinetPath, resolveCabinetLang } from "./resolve";

/**
 * Mount once at the document root (in `RootLayout`). Walks the DOM,
 * applies the active-language dictionary, and re-applies on language
 * change events fired by `setLang()`.
 *
 * Uses `useEffect` (not `useLayoutEffect`): pages that server-render RU
 * markup accept a brief RU flash for visitors in other languages in
 * exchange for SSR markup that Yandex/Google index correctly.
 *
 * Cabinet pages (/login, /register, /dashboard) render every string from
 * typed React dictionaries, so there the Localizer only keeps <html lang>
 * and data-lang in sync with resolveCabinetLang() and never walks the DOM.
 * The path is checked on every call because this component is mounted once
 * in the root layout and survives client-side navigation.
 */
export default function Localizer() {
  useEffect(() => {
    // Observer reference is hoisted so `apply()` can pause it while
    // it writes to the DOM. Without this pause, our own innerHTML
    // writes — even ones that produce identical markup — would emit
    // childList mutations that re-trigger the observer, creating a
    // tight feedback loop that pegs the main thread and starves
    // touch-event delivery on iOS Safari.
    let observer: MutationObserver | null = null;

    // Track any pending requestAnimationFrame so a new lang-change
    // event can cancel a stale apply that was scheduled by a previous
    // event. Without this, fast EN→RU→EN→RU clicks queue several
    // apply() calls, each of which reads detectLang() at execution
    // time — and those reads can race with React re-renders and DOM
    // mutations from the previous apply, leaving the page in a mixed
    // state where some elements render in one language and some in
    // the other.
    let pendingRaf: number | null = null;
    let currentLang = detectLang();
    // True while currentLang came from the cabinet resolver rather than an
    // explicit switch; a later non-cabinet page then re-detects with its
    // own (original) rules instead of inheriting the cabinet result.
    let langFromCabinet = isCabinetPath(window.location.pathname);

    const OBSERVER_OPTS: MutationObserverInit = {
      childList: true,
      subtree: true,
    };

    /**
     * Apply translations for the *latest* known language. Lang is
     * captured once at the top of this function (from the parameter,
     * not from re-reading URL/localStorage) so that all writes within
     * a single apply call use a consistent target. The observer is
     * paused for the duration of the writes.
     */
    const apply = (requested: typeof currentLang) => {
      // /guides is server-rendered English only and has no data-i18n markup:
      // keep <html lang> English whatever language is saved, so a screen
      // reader does not read the English text with another language's voice.
      if (/^\/guides(\/|$)/.test(window.location.pathname)) {
        document.documentElement.setAttribute("lang", "en");
        document.documentElement.setAttribute("data-lang", "en");
        return;
      }
      if (isCabinetPath(window.location.pathname)) {
        const cabinetLang = resolveCabinetLang();
        document.documentElement.setAttribute("lang", cabinetLang);
        document.documentElement.setAttribute("data-lang", cabinetLang);
        return;
      }
      let lang = requested;
      if (langFromCabinet) {
        lang = detectLang();
        currentLang = lang;
        langFromCabinet = false;
      }
      document.documentElement.setAttribute("lang", lang);
      document.documentElement.setAttribute("data-lang", lang);
      observer?.disconnect();
      applyTranslations(lang, dict);
      observer?.takeRecords();
      if (observer) observer.observe(document.body, OBSERVER_OPTS);
    };

    /**
     * Schedule an apply for the next frame, cancelling any previously
     * queued one. This collapses bursts of lang-change events (or
     * back-to-back observer-triggered re-walks) into a single apply
     * with the latest target language. The result: no matter how fast
     * the user clicks the RU/EN toggle, the final visible state
     * matches the final clicked value.
     */
    const scheduleApply = () => {
      if (pendingRaf !== null) cancelAnimationFrame(pendingRaf);
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = null;
        apply(currentLang);
      });
    };

    // Initial paint — synchronous so SSR Russian text is replaced as
    // early as possible for EN visitors.
    apply(currentLang);

    const onLangChange = (e: Event) => {
      // `setLang()` fires a CustomEvent carrying the new lang in its
      // detail. Use that as the source of truth instead of re-reading
      // storage, which could lag behind because of cross-tab sync or
      // a different write order on iOS Safari.
      const detail = (e as CustomEvent<{ lang: typeof currentLang }>).detail;
      currentLang = detail?.lang ?? detectLang();
      langFromCabinet = false;
      scheduleApply();
    };

    const onPopState = () => {
      // Back/forward navigation: re-read URL.
      currentLang = detectLang();
      langFromCabinet = isCabinetPath(window.location.pathname);
      scheduleApply();
    };

    window.addEventListener(LANG_CHANGE_EVENT, onLangChange);
    window.addEventListener("popstate", onPopState);

    // React re-renders subtrees with fresh DOM nodes (opening an
    // accordion, switching a guide tab, etc.). New nodes carry
    // data-i18n attributes but the initial Localizer walk has already
    // run, so without an observer they would stay in Russian until
    // the user switched language again. The observer just schedules
    // an apply for the next frame and the scheduler dedupes — no
    // pending flag needed because cancelAnimationFrame guarantees at
    // most one queued apply at a time.
    observer = new MutationObserver((mutations) => {
      // Cabinet pages carry no data-i18n markup: skip the DOM walks.
      if (isCabinetPath(window.location.pathname)) return;
      const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0);
      if (!hasNewNodes) return;
      scheduleApply();
    });
    observer.observe(document.body, OBSERVER_OPTS);

    return () => {
      if (pendingRaf !== null) cancelAnimationFrame(pendingRaf);
      window.removeEventListener(LANG_CHANGE_EVENT, onLangChange);
      window.removeEventListener("popstate", onPopState);
      observer?.disconnect();
    };
  }, []);

  return null;
}
