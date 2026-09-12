"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { seg: "", label: "Diagnosis" },
  { seg: "/connect", label: "Connect" },
  { seg: "/pricing", label: "Pricing" },
  { seg: "/checkout", label: "Checkout" },
  { seg: "/attribution", label: "Attribution" },
  { seg: "/settings", label: "Settings" },
];

export function AppTabs({ appId }: { appId: string }) {
  const path = usePathname();
  const base = `/app/${appId}`;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-stone-200">
      {TABS.map((t) => {
        const href = `${base}${t.seg}`;
        const active = t.seg === "" ? path === base : path.startsWith(href);
        return (
          <Link key={t.seg} href={href} className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? "border-stone-900 font-semibold" : "border-transparent text-[var(--muted)] hover:text-stone-900"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
