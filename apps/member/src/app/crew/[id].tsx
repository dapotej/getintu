// A Crew pass: who's in, and (for the buyer) inviting the rest by phone. Each invite becomes a pass
// with the same dates once the person signs in to intu with that number and accepts.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Loading, Notice, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useCached } from "@/lib/data";
import { toE164 } from "@/lib/logic";
import { colors, space } from "@/lib/theme";
import type { CrewView } from "@/lib/types";

export default function Crew() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useCached<CrewView>(`crew.${id}`, `/me/crew/${id}`);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!data) return <Screen>{error ? <Notice>{error}</Notice> : <Loading />}</Screen>;

  const invite = async () => {
    const e164 = toE164(phone);
    if (name.trim().length < 2) return setProblem("Add their name");
    if (!e164) return setProblem("Add their number with the country code, e.g. +44 7700 900123");
    setBusy(true);
    setProblem(null);
    try {
      await api(`/me/crew/${id}/invites`, { body: { fullName: name.trim(), phone: e164 } });
      setName("");
      setPhone("");
      await reload();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="title" accessibilityRole="header">
        Your crew
      </T>
      <T color={colors.muted}>{`${data.plan.name}: up to ${data.plan.crewSize} people, sharing the crew's benefits.`}</T>
      <Card accent={colors.night}>
        {data.crew.map((m, i) => (
          <T key={i}>{`${m.fullName}${m.isMe ? " (you)" : ""}`}</T>
        ))}
        {data.invites.map((i) => (
          <View key={i.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space(2) }}>
            <T color={colors.muted} style={{ flex: 1 }}>{`${i.fullName} · invited`}</T>
            {data.isBuyer ? <Button label="Withdraw" tone="ghost" style={{ minHeight: 36 }} onPress={() => void api(`/me/invites/${i.id}/cancel`, { body: {} }).then(reload)} /> : null}
          </View>
        ))}
      </Card>
      {data.isBuyer && data.seatsLeft > 0 ? (
        <>
          <T variant="heading">{`Invite someone (${data.seatsLeft} ${data.seatsLeft === 1 ? "place" : "places"} left)`}</T>
          {problem ? <Notice>{problem}</Notice> : null}
          <Field label="Their name" value={name} onChangeText={setName} />
          <Field label="Their phone number" hint="They sign in to intu with this number and accept." value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Button label="Send invite" tone="night" busy={busy} onPress={() => void invite()} />
        </>
      ) : null}
      {data.isBuyer && data.seatsLeft === 0 ? <Notice tone="muted">Your crew is full.</Notice> : null}
    </Screen>
  );
}
