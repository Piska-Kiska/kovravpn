"use client";
import { useState, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

export function QrToggle({ url }: { url: string }) {
  const [mode, setMode] = useState<"none" | "show" | "scan">("none");
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstance = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (scannerInstance.current) {
        try { scannerInstance.current.stop(); } catch {}
        scannerInstance.current = null;
      }
    };
  }, []);

  async function startScanner() {
    setMode("scan");
    setScanResult(null);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (scannerInstance.current) {
        try { await scannerInstance.current.stop(); } catch {}
      }
      const scanner = new Html5Qrcode("qr-scanner-region");
      scannerInstance.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text: string) => {
          setScanResult(text);
          try { scanner.stop(); } catch {}
          scannerInstance.current = null;
        },
        () => {}
      );
    } catch (err) {
      console.error("Scanner error:", err);
      setMode("none");
    }
  }

  function stopScanner() {
    if (scannerInstance.current) {
      try { scannerInstance.current.stop(); } catch {}
      scannerInstance.current = null;
    }
    setMode("none");
    setScanResult(null);
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <button
          onClick={() => (mode === "scan" ? stopScanner() : startScanner())}
          className="nm-btn px-2.5 py-1.5 text-xs text-nm-accent inline-flex items-center gap-1 cursor-pointer"
        >
          {mode === "scan" ? "Закрыть сканер" : "📱 Сканер для ТВ"}
        </button>
        <button
          onClick={() => setMode(mode === "show" ? "none" : "show")}
          className="nm-btn px-2.5 py-1.5 text-xs text-nm-accent inline-flex items-center gap-1 cursor-pointer"
        >
          {mode === "show" ? "Скрыть QR" : "📷 Показать QR"}
        </button>
      </div>

      {mode === "scan" && !scanResult && (
        <div className="mt-2 nm-pressed rounded-2xl overflow-hidden">
          <div id="qr-scanner-region" ref={scannerRef} style={{ width: "100%" }} />
          <p className="text-[10px] text-nm-text-secondary text-center py-2">
            Наведите камеру на QR-код на экране ТВ
          </p>
        </div>
      )}

      {mode === "scan" && scanResult && (
        <div className="mt-2 p-4 nm-pressed rounded-2xl">
          <p className="text-[10px] text-nm-text-secondary mb-2 uppercase tracking-wide">
            Результат сканирования
          </p>
          <code className="text-xs text-nm-text break-all block mb-3">{scanResult}</code>
          <div className="flex gap-2">
            <button onClick={() => handleCopy(scanResult)} className="nm-btn-accent flex-1 py-2 text-xs font-semibold cursor-pointer">
              {copied ? "✓ Скопировано" : "📋 Скопировать"}
            </button>
            <button onClick={() => { setScanResult(null); startScanner(); }} className="nm-btn flex-1 py-2 text-xs text-nm-accent cursor-pointer">
              🔄 Ещё
            </button>
          </div>
        </div>
      )}

      {mode === "show" && (
        <div className="flex flex-col items-center mt-2 p-4 nm-pressed rounded-2xl">
          <QRCodeSVG value={url} size={200} />
          <p className="text-[10px] text-nm-text-secondary mt-2">
            Отсканируйте в Happ или V2RayTun на Android TV
          </p>
        </div>
      )}
    </div>
  );
}
