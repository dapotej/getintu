// The member's photo: taken with the front camera, made small for Nigerian networks, and kept on
// the phone so the pass shows it with no signal.
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { cache } from "./storage";

/** Opens the front camera. Null if they cancel; throws if the camera isn't allowed. */
export async function takeSelfie(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Allow the camera in Settings to take your photo.");
  const shot = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, allowsEditing: true, aspect: [1, 1], quality: 0.9 });
  if (shot.canceled || !shot.assets[0]) return null;
  // About 600px square at 70% quality: a sharp face in 40–80 KB.
  const small = await manipulateAsync(shot.assets[0].uri, [{ resize: { width: 600 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!small.base64) throw new Error("Couldn't read the photo");
  return small.base64;
}

const PHOTO = "intu.photo";

/**
 * The photo to show on the pass: a copy kept on the phone, refreshed when the signed link points
 * at a different photo. Links change every time (they expire), so the path is what's compared.
 */
export async function photoForPass(signedUrl: string | null): Promise<string | null> {
  const kept = await cache.get<{ source: string; dataUrl: string }>(PHOTO);
  if (!signedUrl) return kept?.dataUrl ?? null;
  const source = signedUrl.split("?")[0] ?? signedUrl;
  if (kept && kept.source === source) return kept.dataUrl;
  try {
    if (signedUrl.startsWith("data:")) {
      await cache.set(PHOTO, { source, dataUrl: signedUrl });
      return signedUrl;
    }
    const blob = await (await fetch(signedUrl)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the photo"));
      reader.readAsDataURL(blob);
    });
    await cache.set(PHOTO, { source, dataUrl });
    return dataUrl;
  } catch {
    return kept?.dataUrl ?? signedUrl;
  }
}
