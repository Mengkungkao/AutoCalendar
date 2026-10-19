import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Lets an iPhone on the home network use the dev server (e.g. http://192.168.0.x:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
