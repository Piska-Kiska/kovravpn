// src/components/dashboard/SetupSteps.tsx
// Three numbered steps shown right after a device is created: install Happ,
// add the link, connect. Scrolled into view with focus on its heading.
"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, Check, Copy, Download } from "lucide-react";
import { Button, ButtonLink } from "@/components/cabinet";
import { fmt } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { incyLinkFor } from "@/lib/dashboard/apps";
import { DEVICE_DEFS, type DeviceId } from "@/lib/dashboard/devices";

export interface SetupStepsProps {
  t: DashDict;
  device: DeviceId;
  subUrl: string;
  happEncrypted: boolean;
  copied: boolean;
  onCopy(): void;
  onDone(): void;
}

export function SetupSteps({ t, device, subUrl, happEncrypted, copied, onCopy, onDone }: SetupStepsProps) {
  const shell = useShellT();
  const def = DEVICE_DEFS[device];
  const name = t[def.nameKey];
  const titleRef = useRef<HTMLHeadingElement>(null);
  const boxRef = useRef<HTMLElement>(null);

  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: "nearest" });
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const isWindowsExe = device === "windows";

  return (
    <section ref={boxRef} className="kc-panel kc-panel--accent kc-setup kc-enter" aria-labelledby="kc-setup-title">
      <h3 id="kc-setup-title" ref={titleRef} tabIndex={-1} className="kc-h2">
        {fmt(t.setup_title, { device: name })}
      </h3>
      <ol className="kc-steps">
        <li className="kc-step">
          <span className="kc-step-n" aria-hidden="true">01</span>
          <div className="kc-step-body">
            <p className="kc-h3">{t.step1_t}</p>
            <p className="kc-small">{fmt(t.step1_b, { device: name })}</p>
            <div className="kc-step-actions">
              <ButtonLink
                variant="ghost"
                size="sm"
                href={def.happ}
                icon={isWindowsExe ? Download : undefined}
                iconEnd={isWindowsExe ? undefined : ArrowUpRight}
                iconSize={16}
                target={isWindowsExe ? undefined : "_blank"}
                rel={isWindowsExe ? undefined : "noopener noreferrer"}
              >
                {t.get_happ}
              </ButtonLink>
              <ButtonLink variant="quiet" size="sm" href={incyLinkFor(device)} target="_blank" rel="noopener noreferrer">
                {t.step_incy}
              </ButtonLink>
            </div>
          </div>
        </li>
        <li className="kc-step">
          <span className="kc-step-n" aria-hidden="true">02</span>
          <div className="kc-step-body">
            <p className="kc-h3">{t.step2_t}</p>
            <p className="kc-small">{t.step2_b}</p>
            <div className="kc-step-actions">
              {happEncrypted && subUrl ? (
                <ButtonLink variant="ghost" size="sm" href={subUrl} iconEnd={ArrowUpRight} iconSize={16} target="_blank" rel="noopener noreferrer">
                  {t.open_in_happ}
                </ButtonLink>
              ) : null}
              <Button variant="ghost" size="sm" icon={copied ? Check : Copy} iconSize={16} onClick={onCopy} disabled={!subUrl}>
                {copied ? shell.copied : shell.copy}
              </Button>
              <span className="kc-sr" aria-live="polite">
                {copied ? shell.copied : ""}
              </span>
            </div>
          </div>
        </li>
        <li className="kc-step">
          <span className="kc-step-n" aria-hidden="true">03</span>
          <div className="kc-step-body">
            <p className="kc-h3">{t.step3_t}</p>
            <p className="kc-small">{t.step3_b}</p>
          </div>
        </li>
      </ol>
      <div className="kc-setup-foot">
        <Button variant="quiet" size="sm" onClick={onDone}>
          {t.done}
        </Button>
      </div>
    </section>
  );
}
