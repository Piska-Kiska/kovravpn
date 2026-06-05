// src/lib/xpanel-sync.ts
//
// Multi-panel write wrappers. Primary (VDsina) is source of truth.
// Secondary (Stockholm) is best-effort mirror so failures don't break UX.
//
// Pattern: Promise.allSettled — both panels write in parallel, primary
// fulfilled = success, secondary rejected = warn-log only. This keeps
// user-facing latency at max(primary, secondary) not the sum.

import { addClient, deleteClient, updateClientExpiry } from "./xpanel";
import {
  addClient2,
  deleteClient2,
  updateClientExpiry2,
  isSecondaryEnabled,
} from "./xpanel-secondary";

function logSecondary(op: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[xpanel-sync] secondary ${op} failed (non-fatal):`, msg);
}

export async function addClientSync(
  inboundId: number,
  email: string,
  uuid: string,
  expiryTime = 0
) {
  const [primary, secondary] = await Promise.allSettled([
    addClient(inboundId, email, uuid, expiryTime),
    isSecondaryEnabled() ? addClient2(email, uuid, expiryTime) : Promise.resolve(null),
  ]);

  if (primary.status === "rejected") throw primary.reason;
  if (secondary.status === "rejected") logSecondary("addClient", secondary.reason);

  return primary.value;
}

export async function deleteClientSync(inboundId: number, uuid: string) {
  const [primary, secondary] = await Promise.allSettled([
    deleteClient(inboundId, uuid),
    isSecondaryEnabled() ? deleteClient2(uuid) : Promise.resolve(null),
  ]);

  if (primary.status === "rejected") throw primary.reason;
  if (secondary.status === "rejected") logSecondary("deleteClient", secondary.reason);

  return primary.value;
}

export async function updateClientExpirySync(
  inboundId: number,
  uuid: string,
  email: string,
  expiryTime: number
) {
  const [primary, secondary] = await Promise.allSettled([
    updateClientExpiry(inboundId, uuid, email, expiryTime),
    isSecondaryEnabled() ? updateClientExpiry2(uuid, email, expiryTime) : Promise.resolve(null),
  ]);

  if (primary.status === "rejected") throw primary.reason;
  if (secondary.status === "rejected") logSecondary("updateClientExpiry", secondary.reason);

  return primary.value;
}
