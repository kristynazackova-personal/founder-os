import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Founder OS", template: "%s · Founder OS" },
  description: "Diagnose, price, charge. The monetization layer for AI-built apps.",
};

/**
 * Explicit rather than relying on the framework default: `maximumScale` is
 * deliberately left alone so the page can still be pinch-zoomed, which
 * locking it would take away from anyone who needs it.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafaf9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
