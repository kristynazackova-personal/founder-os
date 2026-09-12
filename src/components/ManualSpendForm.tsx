import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate } from "@/components/ui";
import { formatMoney } from "@/lib/domain/money";
import type { ManualSpend } from "@/lib/domain/campaigns";

/**
 * Type in ad spend. GA4 only reports cost when the Google Ads link actually
 * delivers it, and it frequently does not for app campaigns, so this is the
 * one source of spend that always works. GA4 still wins for any campaign it
 * does report; these figures fill the rest.
 */
export function ManualSpendForm({ action, entries, windowDays }: { action: (formData: FormData) => void | Promise<void>; entries: ManualSpend[]; windowDays: number }) {
  return (
    <div className="mt-5 border-t border-stone-200 pt-4">
      <h3 className="text-sm font-semibold">Enter spend yourself</h3>
      <p className="help">
        What you spent in the last {windowDays} days. Leave the campaign blank for a single figure covering everything, or name a campaign to match a row above. Saving an empty or zero amount removes it.
      </p>

      {entries.length ? (
        <ul className="mt-3 space-y-1">
          {entries.map((e) => (
            <li key={e.campaign} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{e.campaign.trim() === "" ? "All campaigns" : e.campaign}</span>
              <span>{formatMoney(e.amountCents)}</span>
              <span className="text-xs text-[var(--muted)]">updated {fmtDate(e.updatedAt)}</span>
              <form action={action}>
                <input type="hidden" name="campaign" value={e.campaign} />
                <input type="hidden" name="amount" value="0" />
                <SubmitButton className="btn btn-secondary py-1 text-xs" pendingText="Removing…">
                  Remove
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="spend-campaign">
            Campaign (optional)
          </label>
          <input id="spend-campaign" name="campaign" className="input" placeholder="All campaigns" />
        </div>
        <div>
          <label className="label" htmlFor="spend-amount">
            Spend
          </label>
          <input id="spend-amount" name="amount" className="input" inputMode="decimal" placeholder="450" required />
        </div>
        <SubmitButton pendingText="Saving…">Save spend</SubmitButton>
      </form>
    </div>
  );
}
