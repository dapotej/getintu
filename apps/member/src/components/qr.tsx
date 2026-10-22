// A QR code drawn as one SVG path, black on white for the scanner's camera.
import QRCode from "qrcode";
import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";

export function Qr({ value, size }: { value: string; size: number }) {
  const { path, cells } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { path: d, cells: n + 8 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${cells} ${cells}`} accessibilityLabel="Pass QR code">
      <Rect width={cells} height={cells} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
