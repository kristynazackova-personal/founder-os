import Link from "next/link";
import { Brand } from "@/components/Brand";
import { PricingInterview } from "@/components/PricingInterview";

export const metadata = { title: "Free pricing engine" };

export default function PricingEnginePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <Brand />
        <Link href="/signup" className="btn btn-secondary">
          Create account
        </Link>
      </div>
      <h1 className="text-3xl font-bold tracking-tight">What should your app charge?</h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">Eight questions. A pricing model, tiers and price points, with the reasoning spelled out, plus a pricing page block you can paste into Lovable or Bolt. Free, no account.</p>
      <div className="mt-8">
        <PricingInterview mode="standalone" />
      </div>
    </main>
  );
}
