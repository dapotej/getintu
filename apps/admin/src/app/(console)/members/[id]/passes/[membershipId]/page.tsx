"use client";
// A TEST member's pass on this browser, standing in for the member app: open it on one phone
// and scan it with the partner scanner on another. The key that signs the codes is made here
// and never leaves the browser; the server only sees its public half.
import { fromBase64url, generateKeyPair, secondsUntilNextCode, signCode, toBase64url } from "@intu/qr";
import { Button, Card, Icon, Notice, PageHeader } from "@intu/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { api, errorMessage, useApi } from "@/lib/api";
import type { MemberDetail } from "@/lib/types";

interface StoredPass {
  deviceId: string;
  certificate: string;
  expiresAt: string;
  secretKey: string;
  backupCodes: { validOn: string; code: string }[];
}

const storageKey = (membershipId: string) => `intu-test-pass:${membershipId}`;

function load(membershipId: string): StoredPass | null {
  try {
    const raw = localStorage.getItem(storageKey(membershipId));
    const pass = raw ? (JSON.parse(raw) as StoredPass) : null;
    return pass && Date.parse(pass.expiresAt) > Date.now() + 60_000 ? pass : null;
  } catch {
    return null;
  }
}

export default function TestPassPage() {
  const { id, membershipId } = useParams<{ id: string; membershipId: string }>();
  const { data } = useApi<MemberDetail>(`/admin/members/${id}`);
  const [pass, setPass] = useState<StoredPass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [svg, setSvg] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => setPass(load(membershipId)), [membershipId]);

  // Redraw the code each 30-second window, and count down to the next one.
  useEffect(() => {
    if (!pass) return;
    const cert = fromBase64url(pass.certificate);
    const key = fromBase64url(pass.secretKey);
    let shown = "";
    const tick = async () => {
      const now = new Date();
      setSecondsLeft(secondsUntilNextCode(now));
      const code = signCode(cert, key, now);
      if (code === shown) return;
      shown = code;
      setSvg(await QRCode.toString(code, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0d0b1a", light: "#ffffff" } }));
      document.body.dataset.passCode = code;
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [pass]);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const device = generateKeyPair();
      const { pass: issued } = await api<{ pass: Omit<StoredPass, "secretKey"> }>(`/admin/memberships/${membershipId}/test-pass`, {
        method: "POST",
        body: { devicePublicKey: toBase64url(device.publicKey) },
      });
      const stored = { ...issued, secretKey: toBase64url(device.secretKey) };
      localStorage.setItem(storageKey(membershipId), JSON.stringify(stored));
      setPass(stored);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const membership = data?.memberships.find((m) => m.id === membershipId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const backup = pass?.backupCodes.find((b) => b.validOn === today)?.code;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/members/${id}`} className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> {data?.member.fullName ?? "Member"}
          </Link>
        }
        title="TEST pass"
        subtitle={membership ? `${membership.plan.name}${membership.passNumber ? ` · ${membership.passNumber}` : ""}` : undefined}
      />
      <Card className="mx-auto max-w-md">
        {!pass ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              This turns this browser into the member&apos;s phone for testing: it makes a key here, registers it as one of the member&apos;s devices, and shows the pass as the member app will, a QR code that changes every 30 seconds. Scan it with the partner scanner on another phone.
            </p>
            {error ? <Notice>{error}</Notice> : null}
            <Button onClick={issue} disabled={busy}>
              {busy ? "Setting up…" : "Show TEST pass on this browser"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-xl font-bold">{data?.member.fullName}</p>
            <div aria-label="Pass QR code" role="img" className="w-full max-w-80 overflow-hidden rounded-xl bg-white p-1 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="text-sm text-muted tabular-nums">New code in {secondsLeft}s</p>
            {backup ? (
              <div>
                <p className="text-sm text-muted">Backup code today</p>
                <p className="font-mono text-3xl font-bold tracking-[0.25em]" aria-label="Backup code">
                  {backup}
                </p>
              </div>
            ) : null}
            <p className="text-xs text-faint">
              TEST device {pass.deviceId.slice(0, 8)} · pass valid until {new Date(pass.expiresAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} Lagos time
            </p>
            <Button
              tone="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem(storageKey(membershipId));
                setPass(null);
              }}
            >
              Forget this pass
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
