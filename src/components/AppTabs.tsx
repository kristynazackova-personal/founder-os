"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { seg: "", label: "Diagnosis" },
  { seg: "/connect", label: "Connect" },
  { seg: "/pricing", label: "Pricing" },
  { seg: "/checkout", label: "Checkout" },
  { seg: "/attribution", label: "Attribution" },
  { seg: "/pmf", label: "Product Market Fit" },
  { seg: "/b2c", label: "B2C analytics" },
  { seg: "/settings", label: "Settings" },
];

export function AppTabs({ appId }: { appId: string }) {
  const path = usePathname();
  const base = `/app/${appId}`;
  return (
    <nav className="tab-strip border-b border-stone-200" aria-label="App sections">
      {TABS.map((t) => {
        const href = `${base}${t.seg}`;
        const active = t.seg === "" ? path === base : path.startsWith(href);
        return (
          <Link key={t.seg} href={href} aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm ${active ? "border-stone-900 font-semibold" : "border-transparent text-[var(--muted)] hover:text-stone-900"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
