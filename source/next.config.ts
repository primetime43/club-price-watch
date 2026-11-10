import type { NextConfig } from "next";
import { APP } from "./core/config.ts";

const nextConfig: NextConfig = {
  // Vinext matches the origin hostname, which is the ID for chrome-extension URLs.
  allowedDevOrigins: [APP.extensionId],
};

export default nextConfig;
