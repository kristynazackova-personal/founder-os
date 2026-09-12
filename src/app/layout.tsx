import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Founder OS", template: "%s · Founder OS" },
  description: "Diagnose, price, charge. The monetization layer for AI-built apps.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
