"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { EventSettings } from "@/lib/domain/eventSettings";
import type { CatalogEvent } from "@/lib/services/eventCatalog";

/**
 * "Read all events / selected events" + "all time / from now on". Plain form
 * fields (mode, events[], history) posted to saveEventSettingsAction; the
 * only client state is the mode toggle that reveals the checkbox list and
 * the select-all helpers.
 */
export function EventSettingsForm({ action, events, current, catalogError }: { action: (formData: FormData) => void | Promise<void>; events: CatalogEvent[]; current: EventSettings | null; catalogError: string | null }) {
  const [mode, setMode] = useState<"all" | "selected">(current?.mode ?? "all");
  const [checked, setChecked] = useState<Set<string>>(new Set(current?.selected ?? []));
  // Events chosen earlier that the catalog no longer lists stay selectable so a quiet event is never silently dropped.
  const known = new Set(events.map((e) => e.name));
  const extra = [...checked].filter((n) => !known.has(n)).map((name) => ({ name, count: null }));
  const list = [...events, ...extra];
  const toggle = (name: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });

  return (
    <form action={action} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="font-semibold">Which events should Founder OS read?</legend>
        <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-3">
          <input type="radio" name="mode" value="all" checked={mode === "all"} onChange={() => setMode("all")} className="mt-1" />
          <span>
            <span className="font-semibold">All events</span>
            <span className="block text-sm text-[var(--muted)]">Everything the tool has collected{events.length ? ` — ${events.length} event type${events.length === 1 ? "" : "s"} today` : ""}, and anything new you add later.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-3">
          <input type="radio" name="mode" value="selected" checked={mode === "selected"} onChange={() => setMode("selected")} className="mt-1" />
          <span>
            <span className="font-semibold">Selected events</span>
            <span className="block text-sm text-[var(--muted)]">Tick the ones Founder OS may read. Everything else is never requested.</span>
          </span>
        </label>
      </fieldset>

      {mode === "selected" ? (
        <div className="rounded-xl border border-stone-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {checked.size} of {list.length} selected
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary py-1 text-xs" onClick={() => setChecked(new Set(list.map((e) => e.name)))}>
                Select all
              </button>
              <button type="button" className="btn btn-secondary py-1 text-xs" onClick={() => setChecked(new Set())}>
                Clear
              </button>
            </span>
          </div>
          {catalogError ? <p className="mt-3 text-sm text-red-700">The event list could not be loaded: {catalogError}</p> : null}
          {list.length === 0 && !catalogError ? <p className="mt-3 text-sm text-[var(--muted)]">No events collected yet. Choose &quot;All events&quot; for now and come back once data arrives.</p> : null}
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {list.map((e) => (
              <li key={e.name}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50">
                  <input type="checkbox" name="events" value={e.name} checked={checked.has(e.name)} onChange={(ev) => toggle(e.name, ev.target.checked)} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.name}</span>
                  {e.count !== null ? <span className="text-xs tabular-nums text-[var(--muted)]">{e.count.toLocaleString("en-US")}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="font-semibold">How far back?</legend>
        <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-3">
          <input type="radio" name="history" value="all_time" defaultChecked={(current?.history ?? "all_time") === "all_time"} className="mt-1" />
          <span>
            <span className="font-semibold">All collected events</span>
            <span className="block text-sm text-[var(--muted)]">Read history as far back as the tool keeps it.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-3">
          <input type="radio" name="history" value="forward" defaultChecked={current?.history === "forward"} className="mt-1" />
          <span>
            <span className="font-semibold">Only from now on</span>
            <span className="block text-sm text-[var(--muted)]">Ignore anything recorded before today. Reports that look back 30 days start at today instead.</span>
          </span>
        </label>
      </fieldset>

      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}
