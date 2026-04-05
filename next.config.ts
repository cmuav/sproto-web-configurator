import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  typescript: {
    // WebUSB/WebSerial polyfill types may conflict with strict mode.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
