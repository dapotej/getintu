// Sends visits approved offline once there's signal, and keeps the cached venue bundle and
// revocation list fresh (the spec's 15 minutes).
import { api } from "./api";
import { allVisits, putVisit, setKv } from "./store";
import type { PendingVisit, Revocations, Session, VenueBundle } from "./types";

export const REFRESH_MS = 15 * 60_000;

type SyncResult = { id: string; status: "recorded" | "already_synced"; flagged: boolean } | { id: string; status: "rejected"; error: string };

/** Returns how many visits are still waiting. Throws NoSignal if the server can't be reached. */
export async function syncPending(session: Session): Promise<number> {
  const pending = (await allVisits()).filter((v) => v.status === "pending");
  for (let i = 0; i < pending.length; i += 100) {
    const batch = pending.slice(i, i + 100);
    const { results } = await api<{ results: SyncResult[] }>("/scan/sync", {
      token: session.token,
      body: {
        sentAt: new Date().toISOString(),
        visits: batch.map((v) => ({ id: v.id, code: v.code, offerId: v.offerId, partySize: v.partySize, occurredAt: v.occurredAt, ...(v.vehicleId ? { vehicleId: v.vehicleId } : {}) })),
      },
      timeoutMs: 20_000,
    });
    for (const r of results) {
      const visit = batch.find((v) => v.id === r.id);
      if (!visit) continue;
      const next: PendingVisit = r.status === "rejected" ? { ...visit, status: "rejected", error: r.error } : { ...visit, status: r.flagged ? "flagged" : "synced" };
      await putVisit(next);
    }
  }
  return (await allVisits()).filter((v) => v.status === "pending").length;
}

export async function refreshBundle(session: Session): Promise<VenueBundle> {
  const bundle = await api<VenueBundle>("/partner/venue", { token: session.token });
  const withTime = { ...bundle, fetchedAt: new Date().toISOString() };
  await setKv("bundle", withTime);
  return withTime;
}

export async function refreshRevocations(session: Session, bundle: VenueBundle): Promise<VenueBundle> {
  const revocations = await api<Revocations>("/revocations", { token: session.token });
  const next = { ...bundle, revocations };
  await setKv("bundle", next);
  return next;
}
