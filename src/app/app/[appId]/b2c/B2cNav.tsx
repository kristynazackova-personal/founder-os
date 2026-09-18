"use client";

/**
 * The B2C analytics sub-nav and control bar. The window lives in the URL, so
 * a view is a link someone can paste: /app/<id>/b2c/acquisition?weeks=8.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { B2C_SECTIONS, WEEK_CHOICES } from "./meta";


export function B2cNav({ appId }: { appId: string }) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const base = `/app/${appId}/b2c`;
  const qs = params.toString();
  const weeks = Number(params.get("weeks") ?? "4");

  const setWeeks = (value: number) => {
    const next = new URLSearchParams(params.toString());
    if (value === 4) next.delete("weeks");
    else next.set("weeks", String(value));
    const q = next.toString();
    router.replace(`${path}${q ? `?${q}` : ""}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <nav className="tab-strip gap-1.5" aria-label="B2C analytics sections">
        {B2C_SECTIONS.map((s) => {
          const href = `${base}${s.seg}${qs ? `?${qs}` : ""}`;
          const active = s.seg === "" ? path === base : path === `${base}${s.seg}`;
          return (
            <Link
              key={s.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-[var(--muted)] hover:text-stone-900"}`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm">
        <label className="flex items-center gap-2 text-[var(--muted)]">
          <span className="text-xs font-semibold">Window</span>
          <select
            value={Number.isNaN(weeks) ? 4 : weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="input min-h-9 w-auto py-1 text-sm font-semibold"
            aria-label="Window in complete weeks"
          >
            {WEEK_CHOICES.map((w) => (
              <option key={w} value={w}>Last {w} complete week{w > 1 ? "s" : ""}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-[var(--muted)]">
          Complete ISO weeks only — the running week is excluded so a partial week never reads as a collapse.
        </span>
      </div>
    </div>
  );
}
