import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "intu scanner",
  description: "The intu scanner for partner venues and services",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "intu scanner", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0d0b1a", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Registers the service worker that keeps the scanner working with no signal.
const registerWorker = `if("serviceWorker"in navigator){addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`;

// Partner staff often work at night: the scanner is always the dark "Lagos after dusk" theme.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: registerWorker }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
