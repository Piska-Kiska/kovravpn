// src/app/api/payment/lava-webhook/route.ts
//
// Приём событий lava.top. Сам обработчик — в lib/lava-webhook-handler.ts: его
// же вызывает админ-бот, когда владелец зачисляет застрявшую оплату кнопкой.
// Отсюда уходит null: событие снаружи проверяется по заголовкам, как и прежде.

import type { NextRequest } from "next/server";
import { handleLavaWebhook } from "@/lib/lava-webhook-handler";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleLavaWebhook(req, null);
}
