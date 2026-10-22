import type { NextConfig } from "next";

// A static site: the scanner works from its service worker's cache when there's no signal,
// and needs no server of its own.
const config: NextConfig = {
  output: "export",
  transpilePackages: ["@intu/ui", "@intu/qr", "@intu/rules"],
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default config;
