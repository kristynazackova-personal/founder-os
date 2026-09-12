import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-6 ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "good" | "warn" | "bad"; children: ReactNode }) {
  const cls = { info: "border-stone-200 bg-white", good: "border-emerald-200 bg-emerald-50 text-emerald-900", warn: "border-amber-200 bg-amber-50 text-amber-900", bad: "border-red-200 bg-red-50 text-red-900" }[kind];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function ModeBadge({ mode }: { mode: string }) {
  return mode === "live" ? <span className="badge badge-live">LIVE</span> : <span className="badge badge-test">TEST</span>;
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cls = confidence === "high" ? "badge-good" : confidence === "medium" ? "badge-warn" : "badge-bad";
  return <span className={`badge ${cls}`}>{confidence} confidence</span>;
}

export function Empty({ title, children, cta }: { title: string; children?: ReactNode; cta?: { href: string; label: string } }) {
  return (
    <div className="card p-10 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children ? <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{children}</p> : null}
      {cta ? (
        <Link href={cta.href} className="btn btn-primary mt-5">
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
