"use client";
// The back camera, read for QR codes. Uses the browser's built-in BarcodeDetector where there
// is one (Chrome on Android) and jsQR on the video frames elsewhere (Safari).
import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

const SCAN_EVERY_MS = 120;
/** The same code read twice within this time is one scan. */
const SAME_CODE_MS = 4000;

export function Camera({ onCode, paused }: { onCode: (text: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef({ onCode, paused });
  latest.current = { onCode, paused };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const last = { text: "", at: 0 };
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;

    const read = async (v: HTMLVideoElement): Promise<string | null> => {
      if (detector) return (await detector.detect(v))[0]?.rawValue ?? null;
      if (!ctx || !v.videoWidth) return null;
      // Read a centred square at most 640px wide: enough detail, little work per frame.
      const side = Math.min(v.videoWidth, v.videoHeight);
      const size = Math.min(side, 640);
      canvas.width = canvas.height = size;
      ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
      return jsQR(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: "dontInvert" })?.data ?? null;
    };

    const tick = async () => {
      const v = video.current;
      if (stopped) return;
      if (v && !latest.current.paused && v.readyState >= 2) {
        try {
          const text = await read(v);
          const now = Date.now();
          if (text && (text !== last.text || now - last.at > SAME_CODE_MS)) {
            last.text = text;
            last.at = now;
            latest.current.onCode(text);
          }
        } catch {
          // A frame that can't be read; try the next one.
        }
      }
      timer = setTimeout(tick, SCAN_EVERY_MS);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        tick();
      } catch (err) {
        const name = (err as { name?: string }).name;
        setProblem(name === "NotAllowedError" ? "Camera blocked. Allow the camera in your browser settings, or enter the backup code." : "No camera available. Enter the backup code instead.");
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
      <video ref={video} muted playsInline className="h-full w-full object-cover" aria-label="Camera" />
      {problem ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/85">{problem}</p>
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
      )}
    </div>
  );
}
