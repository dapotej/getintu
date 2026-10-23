// A booking request: which pass, which day, how many people. The concierge confirms it with the
// venue; until then it shows as requested.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Field, Loading, Notice, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useCached } from "@/lib/data";
import { bookableDates, currentPass, formatDate, needsFlight } from "@/lib/logic";
import { colors, fonts, space } from "@/lib/theme";
import type { Membership, Venue } from "@/lib/types";

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={onPress} style={{ paddingHorizontal: space(4), paddingVertical: space(2.5), borderRadius: 999, borderWidth: 1, borderColor: selected ? colors.day : colors.line, backgroundColor: selected ? colors.day : colors.surface }}>
      <T variant="small" color={selected ? colors.ink : colors.cream} style={{ fontFamily: fonts.semibold }}>
        {label}
      </T>
    </Pressable>
  );
}

export default function Book() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const router = useRouter();
  const venue = useCached<{ venue: Venue }>(`venue.${venueId}`, `/venues/${venueId}`);
  const ms = useCached<{ memberships: Membership[] }>("memberships", "/me/memberships");
  const active = (ms.data?.memberships ?? []).filter((m) => m.status === "active");
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [party, setParty] = useState(1);
  const [notes, setNotes] = useState("");
  const [direction, setDirection] = useState<"arrival" | "departure">("arrival");
  const [flight, setFlight] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const v = venue.data?.venue;
  const pass = active.find((m) => m.id === membershipId) ?? currentPass(active, new Date());
  if (!v || !ms.data) return <Screen><Loading /></Screen>;
  if (!pass) return <Screen><Notice>You need an active pass to book.</Notice></Screen>;
  const dates = bookableDates(pass, new Date());
  // Airport services are met at a flight.
  const airport = needsFlight(v.offers, offerId);

  const send = async () => {
    if (!date) return setError("Choose a day");
    if (airport && (!flight.trim() || !/^\d{1,2}:\d{2}$/.test(time.trim()))) return setError("Add your flight number and its time, e.g. BA75 at 15:20");
    setBusy(true);
    setError(null);
    try {
      await api("/bookings", { body: { membershipId: pass.id, venueId: v.id, offerId, bookingDate: date, partySize: party, notes: notes.trim() || null, trip: airport ? { direction, flightNumber: flight.trim(), time: time.trim().padStart(5, "0") } : null } });
      router.dismissTo("/bookings");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="heading">{v.name}</T>
      {error ? <Notice>{error}</Notice> : null}
      {active.length > 1 ? (
        <>
          <T variant="label" color={colors.muted}>Pass</T>
          <View accessibilityRole="radiogroup" accessibilityLabel="Pass" style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
            {active.map((m) => <Chip key={m.id} label={m.plan.name} selected={m.id === pass.id} onPress={() => setMembershipId(m.id)} />)}
          </View>
        </>
      ) : null}
      <T variant="label" color={colors.muted}>Day</T>
      {dates.length === 0 ? <Notice tone="day">Your pass has no days left to book.</Notice> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel="Day" contentContainerStyle={{ gap: space(2) }}>
        {dates.map((d) => <Chip key={d} label={formatDate(d, { weekday: true, year: false })} selected={d === date} onPress={() => setDate(d)} />)}
      </ScrollView>
      {v.offers.length > 1 ? (
        <>
          <T variant="label" color={colors.muted}>What for</T>
          <View accessibilityRole="radiogroup" accessibilityLabel="What for" style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
            <Chip label="Anything" selected={offerId === null} onPress={() => setOfferId(null)} />
            {v.offers.map((o) => <Chip key={o.id} label={o.name} selected={o.id === offerId} onPress={() => setOfferId(o.id)} />)}
          </View>
        </>
      ) : null}
      {airport ? (
        <>
          <T variant="label" color={colors.muted}>Flight</T>
          <View accessibilityRole="radiogroup" accessibilityLabel="Arriving or departing" style={{ flexDirection: "row", gap: space(2) }}>
            <Chip label="Arriving" selected={direction === "arrival"} onPress={() => setDirection("arrival")} />
            <Chip label="Departing" selected={direction === "departure"} onPress={() => setDirection("departure")} />
          </View>
          <View style={{ flexDirection: "row", gap: space(3) }}>
            <View style={{ flex: 1 }}>
              <Field label="Flight number" value={flight} onChangeText={setFlight} autoCapitalize="characters" placeholder="BA75" />
            </View>
            <View style={{ width: 120 }}>
              <Field label={direction === "arrival" ? "Lands at" : "Takes off at"} value={time} onChangeText={setTime} placeholder="15:20" keyboardType="numbers-and-punctuation" maxLength={5} />
            </View>
          </View>
        </>
      ) : null}
      <T variant="label" color={colors.muted}>People</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(4) }}>
        <Button label="Fewer" tone="secondary" onPress={() => setParty((n) => Math.max(1, n - 1))} style={{ minHeight: 44, width: 90 }} />
        <T variant="heading" accessibilityRole="header">{`${party} ${party === 1 ? "person" : "people"}`}</T>
        <Button label="More" tone="secondary" onPress={() => setParty((n) => Math.min(20, n + 1))} style={{ minHeight: 44, width: 90 }} />
      </View>
      <Field label="Anything the venue should know" value={notes} onChangeText={setNotes} placeholder="e.g. Arriving at 8pm, a birthday" multiline />
      <Button label="Send request" onPress={send} busy={busy} disabled={!date || (airport && (!flight.trim() || !time.trim()))} />
      <T variant="small" color={colors.muted}>The concierge confirms it with the venue and lets you know.</T>
    </Screen>
  );
}
