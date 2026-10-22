// The member's photo. Door staff compare it with the person in front of them, so it must be a
// clear, current photo of their face.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, View } from "react-native";
import { Button, Notice, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { takeSelfie } from "@/lib/photo";
import { useSession } from "@/lib/session";
import { colors, space } from "@/lib/theme";

export default function Photo() {
  const { me, refreshMe } = useSession();
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async () => {
    setError(null);
    try {
      const jpeg = await takeSelfie();
      if (jpeg) setPreview(jpeg);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await api("/me/photo", { method: "PUT", body: { jpegBase64: preview } });
      await refreshMe();
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const current = preview ? `data:image/jpeg;base64,${preview}` : (me?.member?.photoUrl ?? null);
  return (
    <Screen>
      <T variant="title" accessibilityRole="header">{me?.member?.hasPhoto ? "Change your photo" : "Add your photo"}</T>
      <T color={colors.muted}>Venues check it against you at the door. Face the camera in good light, with nothing covering your face.</T>
      {error ? <Notice>{error}</Notice> : null}
      <View style={{ alignItems: "center", paddingVertical: space(4) }}>
        {current ? (
          <Image source={{ uri: current }} accessibilityLabel="Your photo" style={{ width: 220, height: 220, borderRadius: 110, borderWidth: 3, borderColor: colors.day }} />
        ) : (
          <View style={{ width: 220, height: 220, borderRadius: 110, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.line, borderStyle: "dashed" }} />
        )}
      </View>
      <Button label={preview ? "Take it again" : "Take photo"} tone={preview ? "secondary" : "primary"} onPress={take} />
      {preview ? <Button label="Use this photo" onPress={save} busy={busy} /> : null}
    </Screen>
  );
}
