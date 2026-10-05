import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // The tracker is private: keep it out of frames and search results.
  async headers() {
    const privateHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/tracker/:path*", headers: privateHeaders },
      { source: "/api/tracker/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
