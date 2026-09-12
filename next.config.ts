import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the zero-setup local database) ships WASM and touches the
  // filesystem; it must not be bundled by Turbopack.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        // The attribution snippet and its collector are loaded cross-origin
        // from founders' apps.
        source: "/fos.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
