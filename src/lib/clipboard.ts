// src/lib/clipboard.ts
//
// copyText(): the async Clipboard API first, then the legacy hidden-textarea
// + execCommand("copy") path for insecure contexts and older WebViews
// (Telegram in-app browser, some Android builds). Resolves to whether the
// text actually reached the clipboard, so the UI can say "Copied" only on
// success.

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  // Off-screen but still selectable; 16px avoids the iOS zoom on focus.
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "-9999px";
  ta.style.opacity = "0";
  ta.style.fontSize = "16px";
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    ta.remove();
    active?.focus({ preventScroll: true });
  }
  return ok;
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or not focused: try the legacy path below.
  }
  return legacyCopy(text);
}
