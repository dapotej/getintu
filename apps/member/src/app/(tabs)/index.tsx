// The pass: the member's photo beside a QR code that changes every 30 seconds. It keeps working
// with no signal for a day after it was last renewed, and the screen stays on while it's open.
import { useKeepAwake } from "expo-keep-awake";
import { useEffect, useState } from "react";
import { Image, Linking, useWindowDimensions, View } from "react-native";
import { Qr } from "@/components/qr";
import { Badge, Button, Card, Loading, Notice, Screen, T, Wordmark } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useCached } from "@/lib/data";
import { backupCodeFor, currentPass, formatDate, formatLagosTime, lagosDate, passUsable, whatsappLink } from "@/lib/logic";
import { currentCode, ensurePass } from "@/lib/pass";
import { photoForPass } from "@/lib/photo";
import { useSession } from "@/lib/session";
import { colors, space } from "@/lib/theme";
import type { Membership, StoredPass } from "@/lib/types";
import { secondsUntilNextCode } from "@intu/qr";

export default function PassScreen() {
  useKeepAwake();
  const { me } = useSession();
  const { data, offline, loading } = useCached<{ memberships: Membership[] }>("memberships", "/me/memberships");
  const [now, setNow] = useState(() => new Date());
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const memberships = data?.memberships ?? [];
  const shown = memberships.find((m) => m.id === chosen) ?? currentPass(memberships, now);
  if (!data && loading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        {offline ? <Badge label="Offline" tone="day" /> : null}
      </View>
      {!shown ? (
        <Card>
          <T variant="heading" accessibilityRole="header">No pass yet</T>
          <T color={colors.muted}>When you buy a pass at getintu.com, or the concierge sets one up for you, it appears here.</T>
        </Card>
      ) : (
        <>
          {memberships.length > 1 ? (
            <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
              {memberships.map((m) => (
                <Button key={m.id} label={m.plan.name} tone={m.id === shown.id ? "day" : "secondary"} onPress={() => setChosen(m.id)} style={{ minHeight: 40 }} />
              ))}
            </View>
          ) : null}
          <LivePass membership={shown} name={me?.member?.fullName ?? ""} photoUrl={me?.member?.photoUrl ?? null} now={now} />
        </>
      )}
      <View style={{ gap: space(3) }}>
        {me?.concierge ? <Button label="Message the concierge" tone="secondary" onPress={() => Linking.openURL(whatsappLink(me.concierge?.whatsapp ?? "", { fullName: me.member?.fullName ?? "", passNumber: shown?.passNumber ?? null }))} /> : null}
        {me?.doctorOnCall ? <Button label="Doctor on call" tone="secondary" onPress={() => Linking.openURL(`tel:${me.doctorOnCall?.phone ?? ""}`)} /> : null}
      </View>
    </Screen>
  );
}

function LivePass({ membership: m, name, photoUrl, now }: { membership: Membership; name: string; photoUrl: string | null; now: Date }) {
  const { width } = useWindowDimensions();
  const [pass, setPass] = useState<StoredPass | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const windowStart = Math.floor(now.getTime() / 30_000);
  // Checked again each hour while the screen is open: renewed if it's getting old and there's signal.
  const hour = Math.floor(now.getTime() / 3_600_000);

  useEffect(() => {
    let live = true;
    setProblem(null);
    ensurePass(m.id)
      .then((p) => live && setPass(p))
      .catch((err: unknown) => live && setProblem(errorText(err)));
    return () => {
      live = false;
    };
  }, [m.id, hour]);

  useEffect(() => {
    let live = true;
    void photoForPass(photoUrl).then((p) => live && setPhoto(p));
    return () => {
      live = false;
    };
  }, [photoUrl]);

  // A new code each 30-second window.
  useEffect(() => {
    if (!pass || !passUsable(pass, new Date())) return setCode(null);
    let live = true;
    void currentCode(pass).then((c) => live && setCode(c));
    return () => {
      live = false;
    };
  }, [pass, windowStart]);

  useEffect(() => {
    if (typeof document !== "undefined" && code) document.body.dataset["passCode"] = code;
  }, [code]);

  const today = lagosDate(now);
  const notYet = m.startsOn > today;
  const ended = m.endsOn < today;
  const size = Math.min(width - space(10) * 2, 300);
  const backup = backupCodeFor(pass, now);

  return (
    <Card style={{ alignItems: "center", gap: space(4), paddingVertical: space(6) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(4), alignSelf: "stretch" }}>
        {photo ? <Image source={{ uri: photo }} accessibilityLabel="Your photo" style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.day }} /> : <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.raised }} />}
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="heading" numberOfLines={1}>
            {name}
          </T>
          <T variant="small" color={colors.muted}>
            {m.plan.name}
            {m.passNumber ? ` · ${m.passNumber}` : ""}
          </T>
          <T variant="small" color={colors.muted}>
            {formatDate(m.startsOn, { year: false })} – {formatDate(m.endsOn)}
          </T>
        </View>
      </View>

      {m.status !== "active" ? <Notice>This pass is {m.status}. Venues will decline it. Message the concierge for help.</Notice> : null}
      {notYet ? <Notice tone="day">Your pass starts on {formatDate(m.startsOn)}. Venues will decline it until then.</Notice> : null}
      {ended ? <Notice>This pass ended on {formatDate(m.endsOn)}.</Notice> : null}
      {problem && !pass ? <Notice>{problem}</Notice> : null}

      <View style={{ padding: space(3), backgroundColor: "#FFFFFF", borderRadius: 20 }}>{code ? <Qr value={code} size={size} /> : <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}><Loading /></View>}</View>
      {code ? (
        <T variant="small" color={colors.muted} accessibilityRole="header">
          New code in {secondsUntilNextCode(now)}s · show this at the door
        </T>
      ) : null}
      {backup ? (
        <T variant="small" color={colors.faint}>
          Camera trouble? Backup code <T variant="small" color={colors.cream} style={{ letterSpacing: 2 }}>{backup}</T>
        </T>
      ) : null}
      {pass ? (
        <T variant="small" color={colors.faint}>
          Works offline until {formatLagosTime(pass.expiresAt)}
        </T>
      ) : null}
    </Card>
  );
}
