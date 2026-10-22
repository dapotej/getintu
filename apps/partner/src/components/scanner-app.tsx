"use client";
import { Button, cx, DECLINE_LABELS, Field, Input, Notice, Select, Textarea, Wordmark } from "@intu/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, NoSignal } from "@/lib/api";
import { scanAndStoreOffline } from "@/lib/offline";
import { allVisits, clearShift, getKv, setKv } from "@/lib/store";
import { REFRESH_MS, refreshBundle, refreshRevocations, syncPending } from "@/lib/sync";
import { outcomeFrom, type CodeProblem, type PendingVisit, type ScanOutcome, type ScanResponse, type Session, type TodayBooking, type TodayVisit, type VenueBundle } from "@/lib/types";
import { Camera } from "./camera";

declare global {
  interface Window {
    /** Hands a decoded QR code to the scanner, as the camera does. Used by the end-to-end tests. */
    __intuScan?: (text: string) => void;
  }
}

/** How long a scan waits for the server before checking offline instead. */
const ONLINE_SCAN_TIMEOUT_MS = 4000;

const PROBLEMS: Record<CodeProblem, string> = {
  malformed: "Not an intu pass",
  unknown_key: "Pass from an unknown key. Ask the member to reopen the app.",
  bad_pass_signature: "Pass can't be trusted",
  pass_expired: "Pass needs refreshing. Ask the member to open the app with signal.",
  bad_code_signature: "Pass can't be trusted",
  code_expired: "Code too old. Ask for the live code on screen, not a screenshot.",
  device_revoked: "This phone's pass was cancelled",
  unknown_backup_code: "Backup code not recognised",
  unknown_pass: "Pass not recognised",
  needs_signal: "Backup codes need signal. Scan the QR code instead.",
};

export function ScannerApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [bundle, setBundle] = useState<VenueBundle | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, b] = await Promise.all([getKv("session"), getKv("bundle")]);
        const live = s && Date.parse(s.expiresAt) > Date.now() ? s : null;
        setSession(live);
        setBundle(live && b ? b : null);
      } catch {
        // Storage unavailable (e.g. a private window): sign in again rather than hang.
        setSession(null);
      }
    })();
  }, []);

  const signOut = useCallback(async () => {
    await clearShift();
    setSession(null);
    setBundle(null);
  }, []);

  if (session === undefined) return <Splash />;
  if (!session || !bundle)
    return (
      <SignIn
        onSignedIn={(s, b) => {
          setSession(s);
          setBundle(b);
        }}
      />
    );
  return <Shift session={session} bundle={bundle} setBundle={setBundle} onSignOut={signOut} />;
}

function Splash() {
  return (
    <main className="flex min-h-safe items-center justify-center">
      <Wordmark className="h-8 text-fg" />
    </main>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (s: Session, b: VenueBundle) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-safe max-w-sm flex-col justify-center gap-8 px-5 py-10">
      <div>
        <Wordmark className="h-8 text-fg" />
        <h1 className="mt-6 text-2xl font-bold">intu scanner</h1>
        <p className="mt-1 text-muted">Sign in with your sign-in code and your own PIN. You stay signed in for the shift.</p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            const s = await api<Session>("/partner/session", { body: { venueCode: String(form.get("venueCode") ?? ""), pin: String(form.get("pin") ?? "") } });
            await setKv("session", s);
            const b = await refreshBundle(s);
            onSignedIn(s, b);
          } catch (err) {
            setError(err instanceof NoSignal ? "No signal. Signing in needs signal once; scanning works without it." : err instanceof Error ? err.message : "Couldn't sign in");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Sign-in code">
          <Input name="venueCode" required autoCapitalize="characters" autoComplete="off" spellCheck={false} className="h-12 text-lg uppercase tracking-widest" />
        </Field>
        <Field label="Your PIN">
          <Input name="pin" required type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off" className="h-12 text-lg tracking-[0.5em]" />
        </Field>
        {error ? <Notice>{error}</Notice> : null}
        <Button type="submit" disabled={busy} className="h-12 text-base">
          {busy ? "Signing in…" : "Start shift"}
        </Button>
      </form>
    </main>
  );
}

function Shift({ session, bundle, setBundle, onSignOut }: { session: Session; bundle: VenueBundle; setBundle: (b: VenueBundle) => void; onSignOut: () => void }) {
  const [tab, setTab] = useState<"scan" | "today">("scan");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const latest = useRef({ bundle, online });
  latest.current = { bundle, online };

  const countPending = useCallback(async () => setPending((await allVisits()).filter((v) => v.status === "pending").length), []);

  /** Sends offline visits and refreshes the cached data; marks the scanner offline if it can't. */
  const catchUp = useCallback(
    async (full: boolean) => {
      try {
        await syncPending(session);
        setBundle(full ? await refreshBundle(session) : await refreshRevocations(session, latest.current.bundle));
        setOnline(true);
      } catch (err) {
        if (err instanceof NoSignal) setOnline(false);
        else if (err instanceof ApiError && err.status === 401) onSignOut();
      }
      await countPending();
    },
    [session, setBundle, onSignOut, countPending],
  );

  useEffect(() => {
    countPending();
    setOnline(navigator.onLine);
    const goOnline = () => catchUp(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Every minute: send anything waiting, and refresh revocations; the whole bundle every 15.
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (navigator.onLine) catchUp(ticks % (REFRESH_MS / 60_000) === 0);
    }, 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, [catchUp, countPending]);

  return (
    <div className="mx-auto flex min-h-safe max-w-lg flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{bundle.venue.name}</p>
          <p className="truncate text-sm text-muted">{session.staff.fullName}</p>
        </div>
        <button type="button" onClick={onSignOut} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-fg">
          End shift
        </button>
      </header>
      {!online ? (
        <div role="status" className="mx-4 mb-2 rounded-xl bg-day-soft px-4 py-3 text-sm font-semibold text-day">
          Offline: scans are checked on this phone and sent when signal returns{pending ? ` (${pending} waiting)` : ""}.
        </div>
      ) : pending ? (
        <div role="status" className="mx-4 mb-2 rounded-xl bg-subtle px-4 py-3 text-sm text-muted">
          Sending {pending} offline {pending === 1 ? "visit" : "visits"}…
        </div>
      ) : null}
      <nav className="mx-4 mb-3 grid grid-cols-2 rounded-xl bg-subtle p-1" aria-label="Scanner">
        {(["scan", "today"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cx("rounded-lg py-2 text-sm font-semibold", tab === t ? "bg-surface text-fg shadow-xs" : "text-muted")}
          >
            {t === "scan" ? "Scan" : "Today"}
          </button>
        ))}
      </nav>
      <main className="flex-1 px-4 pb-8">
        {tab === "scan" ? (
          <ScanTab
            session={session}
            bundle={bundle}
            online={online}
            setOnline={setOnline}
            onSessionEnded={onSignOut}
            onStoredOffline={countPending}
          />
        ) : (
          <TodayTab session={session} online={online} />
        )}
      </main>
    </div>
  );
}

function ScanTab({
  session,
  bundle,
  online,
  setOnline,
  onSessionEnded,
  onStoredOffline,
}: {
  session: Session;
  bundle: VenueBundle;
  online: boolean;
  setOnline: (v: boolean) => void;
  onSessionEnded: () => void;
  onStoredOffline: () => void;
}) {
  const offers = bundle.offers.filter((o) => o.active);
  const [offerId, setOfferId] = useState<string>(offers[0]?.id ?? "");
  const [partySize, setPartySize] = useState(1);
  const [result, setResult] = useState<ScanOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const state = useRef({ offerId, partySize, online, busy });
  state.current = { offerId, partySize, online, busy };

  useEffect(() => {
    getKv("offerId").then((saved) => saved && offers.some((o) => o.id === saved) && setOfferId(saved));
  }, []);

  const submit = useCallback(
    async (scan: { code: string } | { backupCode: string }) => {
      const { offerId, partySize } = state.current;
      if (state.current.busy || !offerId) return;
      setBusy(true);
      setNotice(null);
      const offline = async () => {
        setOnline(false);
        if ("backupCode" in scan) return setResult({ kind: "invalid", problem: "needs_signal" });
        setResult(await scanAndStoreOffline(bundle, { code: scan.code, offerId, partySize }));
        onStoredOffline();
      };
      try {
        if (!navigator.onLine) await offline();
        else {
          const res = await api<ScanResponse>("/scan", { token: session.token, body: { ...scan, offerId, partySize }, timeoutMs: ONLINE_SCAN_TIMEOUT_MS });
          setOnline(true);
          setResult(outcomeFrom(res));
        }
      } catch (err) {
        if (err instanceof NoSignal) await offline();
        else if (err instanceof ApiError && err.status === 401) onSessionEnded();
        else setNotice(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [bundle, session.token, setOnline, onSessionEnded, onStoredOffline],
  );

  useEffect(() => {
    window.__intuScan = (text) => submit({ code: text });
    return () => {
      delete window.__intuScan;
    };
  }, [submit]);

  if (!offers.length) return <Notice tone="warning">This venue has no active offers yet. Ask intu to add them.</Notice>;

  return (
    <div className="flex flex-col gap-4">
      {offers.length > 1 ? (
        <div role="group" aria-label="Offer" className="flex flex-wrap gap-2">
          {offers.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={o.id === offerId}
              onClick={() => {
                setOfferId(o.id);
                setKv("offerId", o.id);
              }}
              className={cx("rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset", o.id === offerId ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-fg ring-line")}
            >
              {o.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Scanning for <span className="font-semibold text-fg">{offers[0]?.name}</span>
        </p>
      )}

      <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
        <span className="text-sm font-semibold">Party size</span>
        <div className="flex items-center gap-4">
          <button type="button" aria-label="Fewer people" onClick={() => setPartySize((n) => Math.max(1, n - 1))} className="size-10 rounded-full bg-subtle text-xl font-bold">
            −
          </button>
          <span aria-live="polite" aria-label="Party size" className="w-6 text-center text-xl font-bold tabular-nums">
            {partySize}
          </span>
          <button type="button" aria-label="More people" onClick={() => setPartySize((n) => Math.min(20, n + 1))} className="size-10 rounded-full bg-subtle text-xl font-bold">
            +
          </button>
        </div>
      </div>

      {result ? (
        <Result
          outcome={result}
          onNext={() => {
            setResult(null);
            setPartySize(1);
          }}
        />
      ) : (
        <>
          <Camera onCode={(text) => submit({ code: text })} paused={busy || typing} />
          {busy ? <p className="text-center text-sm text-muted">Checking…</p> : null}
          {notice ? <Notice>{notice}</Notice> : null}
          {typing ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const code = String(new FormData(e.currentTarget).get("backup") ?? "");
                setTyping(false);
                submit({ backupCode: code });
              }}
            >
              <Input name="backup" aria-label="Backup code" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoFocus placeholder="6-digit code" className="h-12 flex-1 text-lg tracking-[0.3em]" />
              <Button type="submit" className="h-12">
                Check
              </Button>
            </form>
          ) : (
            <Button tone="secondary" onClick={() => setTyping(true)} className="h-12">
              Enter backup code
            </Button>
          )}
          {!online ? <p className="text-center text-xs text-muted">Backup codes need signal.</p> : null}
        </>
      )}
    </div>
  );
}

function Result({ outcome, onNext }: { outcome: ScanOutcome; onNext: () => void }) {
  useEffect(() => {
    const t = setTimeout(onNext, 10_000);
    return () => clearTimeout(t);
  }, [onNext]);

  if (outcome.kind === "invalid") {
    return (
      <section aria-live="assertive" className="flex flex-col gap-4 rounded-2xl bg-danger-soft p-6 text-center">
        <p className="text-4xl font-extrabold text-danger">Not valid</p>
        <p className="text-lg font-semibold">{PROBLEMS[outcome.problem]}</p>
        <Button onClick={onNext} className="h-12 text-base">
          Next scan
        </Button>
      </section>
    );
  }
  const { decision, member, offerName, partySize, offline } = outcome;
  const approved = decision.result === "approved";
  const initials = member.name
    .replace(/^TEST /, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return (
    <section aria-live="assertive" className={cx("flex flex-col items-center gap-4 rounded-2xl p-6 text-center", approved ? "bg-night-soft" : "bg-danger-soft")}>
      <p className={cx("text-5xl font-extrabold", approved ? "text-night" : "text-danger")}>{approved ? "Approved" : "Declined"}</p>
      {member.photoUrl ? (
        <img src={member.photoUrl} alt="" className="size-40 rounded-2xl object-cover" />
      ) : (
        <div aria-hidden className="flex size-28 items-center justify-center rounded-2xl bg-surface text-4xl font-bold text-muted">
          {initials}
        </div>
      )}
      <div>
        <p className="text-2xl font-bold">{member.name}</p>
        <p className="mt-1 text-lg">
          {offerName}
          {partySize > 1 ? ` · party of ${partySize}` : ""}
        </p>
      </div>
      {decision.result === "declined" ? (
        <p className="text-lg font-semibold text-danger">
          {DECLINE_LABELS[decision.reason] ?? decision.reason}
          {decision.reason === "DUPLICATE_SCAN" ? ` at ${decision.claimedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}` : ""}
        </p>
      ) : decision.remaining !== null ? (
        <p className="text-muted">{decision.remaining} left on this pass</p>
      ) : null}
      {offline ? <p className="rounded-full bg-day-soft px-3 py-1 text-sm font-semibold text-day">Offline approval: checked on this phone</p> : null}
      <Button onClick={onNext} className="h-12 w-full text-base">
        Next scan
      </Button>
    </section>
  );
}

const REPORT_KINDS = { wrong_person: "Wrong person", behaviour: "Behaviour", dispute: "Dispute", other: "Something else" };

function TodayTab({ session, online }: { session: Session; online: boolean }) {
  const [data, setData] = useState<{ date: string; visits: TodayVisit[]; bookings: TodayBooking[] } | null>(null);
  const [local, setLocal] = useState<PendingVisit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLocal((await allVisits()).filter((v) => v.status === "pending" || v.status === "rejected"));
    try {
      setData(await api("/partner/visits", { token: session.token }));
      setError(null);
    } catch (err) {
      setError(err instanceof NoSignal ? "No signal: showing only visits on this phone." : err instanceof Error ? err.message : "Couldn't load today's list");
    }
  }, [session.token]);

  useEffect(() => {
    load();
  }, [load, online]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
  const declines = data?.visits.filter((v) => v.result === "declined").length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {local.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">On this phone, not sent yet</h2>
          <ul className="flex flex-col gap-2">
            {local.map((v) => (
              <li key={v.id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                <p className="font-semibold">{v.memberName}</p>
                <p className="text-sm text-muted">
                  {time(v.occurredAt)} · {v.offerName} · {v.status === "rejected" ? `Refused by intu (${v.error})` : "Offline approval"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data ? (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">Bookings today</h2>
            {data.bookings.length ? (
              <ul className="flex flex-col gap-2">
                {data.bookings.map((b) => (
                  <li key={b.id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{b.memberName}</p>
                      <span className={cx("shrink-0 text-sm font-semibold", b.used ? "text-night" : "text-day")}>{b.used ? "Done" : "Expected"}</span>
                    </div>
                    <p className="text-sm text-muted">
                      {[b.offerName ?? b.eventName, b.partySize > 1 ? `party of ${b.partySize}` : null, b.notes].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None today.</p>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">
              Visits · {data.visits.length - declines} approved{declines ? `, ${declines} declined` : ""}
            </h2>
            {data.visits.length ? (
              <ul className="flex flex-col gap-2">
                {data.visits.map((v) => (
                  <li key={v.id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{v.memberName}</p>
                        <p className="text-sm text-muted">
                          {time(v.occurredAt)} · {v.offerName}
                          {v.partySize > 1 ? ` · party of ${v.partySize}` : ""}
                          {v.method === "offline" ? " · offline" : ""}
                        </p>
                        <p className={cx("text-sm font-semibold", v.result === "approved" ? "text-night" : "text-danger")}>
                          {v.result === "approved" ? "Approved" : (DECLINE_LABELS[v.reason ?? ""] ?? "Declined")}
                          {v.flagged ? <span className="font-normal text-muted"> · sent to intu</span> : null}
                        </p>
                      </div>
                      {v.result === "approved" && online ? (
                        <button type="button" onClick={() => setReporting(reporting === v.id ? null : v.id)} className="shrink-0 text-sm font-semibold text-accent">
                          Report
                        </button>
                      ) : null}
                    </div>
                    {reporting === v.id ? (
                      <form
                        className="mt-3 flex flex-col gap-3"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const form = new FormData(e.currentTarget);
                          try {
                            await api(`/partner/visits/${v.id}/report`, { token: session.token, body: { kind: form.get("kind"), note: form.get("note") } });
                            setReporting(null);
                            load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Couldn't send the report");
                          }
                        }}
                      >
                        <Field label="What happened">
                          <Select name="kind">
                            {Object.entries(REPORT_KINDS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Details for intu">
                          <Textarea name="note" required minLength={3} />
                        </Field>
                        <Button type="submit">Send to intu</Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No visits yet today.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
