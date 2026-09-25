// src/components/QrToggle.tsx
// Per-device QR code (to scan the link with Happ on a phone or TV) and a TV
// scanner (to read the QR a TV app shows and copy the link it contains).
// Renders the QR toggle after `leading` in one action row, and the open panel
// below a hairline. The toggle's label reserves the width of both of its
// states, so opening or closing the QR never reflows the row. The scanner is
// a one-off setup step: the parent opens it through the ref (the device
// card's "more" menu), and its panel carries its own "Close scanner" button.
"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Html5Qrcode } from "html5-qrcode";
import { QrCode, RotateCcw, X, type LucideIcon } from "lucide-react";
import { Button, CopyField, Icon, Notice } from "@/components/cabinet";
import { useDashLang } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";

type Mode = "none" | "show" | "scan";

export interface QrToggleHandle {
  /** Opens the TV scanner panel (or focuses it if it is already scanning). */
  openScanner(): void;
}

export interface QrToggleProps {
  url: string;
  /** Controls rendered first in the action row (e.g. "Open in Happ"). */
  leading?: ReactNode;
  ref?: Ref<QrToggleHandle>;
}

/**
 * Icon + `label`, with the (hidden) `alt` state stacked in the same grid cell
 * so the button is as wide as its wider state. Each state is centred as one
 * unit, so the icon stays next to its words.
 */
function StableLabel({ icon, label, alt }: { icon: LucideIcon; label: string; alt: string }) {
  return (
    <span className="kc-stable">
      <span className="kc-stable-cur">
        <Icon as={icon} size={18} />
        <span>{label}</span>
      </span>
      <span className="kc-stable-alt" aria-hidden="true">
        <Icon as={icon} size={18} />
        <span>{alt}</span>
      </span>
    </span>
  );
}

function stopQuietly(s: Html5Qrcode | null): void {
  if (!s) return;
  try {
    void s.stop().catch(() => undefined);
  } catch {
    // Not running: nothing to stop.
  }
}

export function QrToggle({ url, leading, ref }: QrToggleProps) {
  const { t } = useDashLang();
  const shell = useShellT();
  const [mode, setMode] = useState<Mode>("none");
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [camError, setCamError] = useState(false);
  const scannerInstance = useRef<Html5Qrcode | null>(null);
  const closeScanRef = useRef<HTMLButtonElement>(null);
  const qrBtnRef = useRef<HTMLButtonElement>(null);
  // Bumped when the scanner is opened from outside (the "more" menu, which
  // puts focus back on its trigger): the effect below runs after that and
  // moves focus into the scanner panel.
  const [scanFocusTick, setScanFocusTick] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const regionId = `qr-scanner-${uid}`;
  const panelId = `qr-panel-${uid}`;

  useEffect(() => {
    return () => {
      stopQuietly(scannerInstance.current);
      scannerInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (scanFocusTick > 0) closeScanRef.current?.focus();
  }, [scanFocusTick]);

  async function startScanner() {
    setMode("scan");
    setScanResult(null);
    setCamError(false);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const { Html5Qrcode: Scanner } = await import("html5-qrcode");
      stopQuietly(scannerInstance.current);
      const scanner = new Scanner(regionId);
      scannerInstance.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text: string) => {
          setScanResult(text);
          stopQuietly(scanner);
          scannerInstance.current = null;
        },
        () => undefined,
      );
    } catch (err) {
      console.error("Scanner error:", err);
      scannerInstance.current = null;
      setCamError(true);
    }
  }

  function stopScanner() {
    stopQuietly(scannerInstance.current);
    scannerInstance.current = null;
    setMode("none");
    setScanResult(null);
    setCamError(false);
  }

  // No dependency list: the handle is rebuilt each render, so it always sees
  // the current mode.
  useImperativeHandle(ref, () => ({
    openScanner() {
      // Already scanning: leave the camera running, just bring focus to it.
      if (!(mode === "scan" && scanResult === null && !camError)) void startScanner();
      setScanFocusTick((n) => n + 1);
    },
  }));

  function toggleQr() {
    if (mode === "scan") {
      stopQuietly(scannerInstance.current);
      scannerInstance.current = null;
      setScanResult(null);
      setCamError(false);
    }
    setMode((m) => (m === "show" ? "none" : "show"));
  }

  return (
    <>
      <div className="kc-dev-actions">
        {leading}
        <Button
          ref={qrBtnRef}
          variant="ghost"
          size="sm"
          className="kc-qr-toggle"
          title={mode === "show" ? t.hide_qr : t.show_qr}
          aria-expanded={mode === "show"} aria-controls={mode === "show" ? panelId : undefined} onClick={toggleQr}>
          <StableLabel icon={QrCode} label={mode === "show" ? t.hide_qr : t.show_qr} alt={mode === "show" ? t.show_qr : t.hide_qr} />
        </Button>
      </div>

      {mode === "show" ? (
        <div id={panelId} className="kc-dev-panel kc-enter">
          <div className="kc-qr" role="img" aria-label={t.qr_label}>
            <QRCodeSVG value={url} size={184} fgColor="#000000" bgColor="#ffffff" aria-hidden="true" />
          </div>
          <p className="kc-small kc-dev-panel-caption">{t.qr_caption}</p>
        </div>
      ) : null}

      {mode === "scan" ? (
        <div id={panelId} className="kc-dev-panel kc-dev-panel--scan kc-enter" role="region" aria-label={t.scan_tv}>
          {camError ? (
            <Notice tone="error">{t.scan_error}</Notice>
          ) : scanResult ? (
            <CopyField value={scanResult} label={t.scan_result} copyLabel={shell.copy} copiedLabel={shell.copied} failedLabel={shell.copy_failed} />
          ) : (
            <>
              <div id={regionId} className="kc-scan-region" />
              <p className="kc-small kc-dev-panel-caption">{t.scan_hint}</p>
            </>
          )}
          <div className="kc-dev-panel-actions">
            {scanResult ? (
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => void startScanner()}>
                {t.scan_again}
              </Button>
            ) : null}
            <Button
              ref={closeScanRef}
              variant="ghost"
              size="sm"
              icon={X}
              onClick={() => {
                // The panel (and this button) unmounts: keep focus in the card.
                stopScanner();
                qrBtnRef.current?.focus();
              }}
            >
              {t.close_scanner}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
