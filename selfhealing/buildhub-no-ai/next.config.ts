import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only. The comparison demo is accessed over loopback by both
  // `localhost` and `127.0.0.1`; Next blocks dev resources from non-localhost
  // origins unless explicitly allowed (see BLOCKED_ORIGIN "127.0.0.1").
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
