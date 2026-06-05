// src/app/p/[token]/page.tsx
//
// One-tap subscription import page. Open this URL on iPhone/Android in any
// browser → page redirects to `happ://crypt4/<base64>` → Happ opens and
// imports the subscription. Wording is intentionally neutral — no "encrypted"
// or "🔒" badge — this is just the standard import flow.

import { redirect } from "next/navigation";
import { encryptHappLink } from "@/lib/happ-crypto";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://proxysvpn.com";

export const metadata: Metadata = {
  title: "Подключение",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function HappImportPage({ params }: PageProps) {
  const { token } = await params;

  if (!token || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    redirect("/dashboard");
  }

  let deepLink: string | null = null;
  let errorMessage: string | null = null;
  const plainUrl = `${ORIGIN}/api/sub/${token}/vless`;

  try {
    const { link } = await encryptHappLink(plainUrl, token);
    deepLink = link;
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Не удалось получить ссылку";
  }

  const safeDeepLink = deepLink?.replace(/"/g, "&quot;") ?? "";

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="nm-raised p-8 max-w-md w-full text-center">
        <div className="nm-circle w-16 h-16 mx-auto mb-5 flex items-center justify-center text-3xl">
          🚀
        </div>
        <h1 className="font-heading text-2xl font-bold text-nm-text mb-2">
          Открываем Happ…
        </h1>
        <p className="text-sm text-nm-text-secondary mb-6">
          Если приложение не открылось автоматически, нажмите кнопку ниже.
        </p>

        {deepLink && (
          <>
            <a
              href={deepLink}
              className="nm-btn-accent block w-full py-3.5 font-semibold mb-3"
            >
              Открыть в Happ
            </a>
            <details className="text-left mt-4">
              <summary className="text-xs text-nm-text-secondary cursor-pointer">
                Скопировать ссылку вручную
              </summary>
              <div className="nm-pressed p-3 rounded-2xl mt-2">
                <code className="text-[10px] break-all text-nm-accent block">
                  {deepLink}
                </code>
              </div>
            </details>
          </>
        )}

        {!deepLink && errorMessage && (
          <div className="nm-pressed p-4 rounded-2xl text-left">
            <p className="text-sm text-red-400 mb-2">
              Сервис временно недоступен.
            </p>
            <p className="text-xs text-nm-text-secondary mb-3">
              Используйте стандартную ссылку подписки:
            </p>
            <code className="text-[10px] text-nm-accent break-all block">
              {plainUrl}
            </code>
          </div>
        )}

        <script
          dangerouslySetInnerHTML={{
            __html: safeDeepLink
              ? `setTimeout(function(){window.location.href="${safeDeepLink}"},200);`
              : "",
          }}
        />
      </div>
    </div>
  );
}
