import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the zero-setup local database) ships WASM and touches the
  // filesystem; it must not be bundled by Turbopack.
  // PDF and Word parsing reach for Node APIs and their own assets; bundled by
  // Turbopack they fail at runtime with nothing useful in the message. The
  // unit tests import them directly and passed, so only running the real app
  // showed this.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pdfjs-dist", "mammoth"],
  experimental: {
    serverActions: {
      // A business case is uploaded through a server action, and the default
      // cap is 1MB. This is the 10MB file limit from domain/businessCase.ts
      // plus room for the multipart envelope; the real limit is enforced in
      // the service, which can say WHY a file was refused.
      bodySizeLimit: "12mb",
    },
  },
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
