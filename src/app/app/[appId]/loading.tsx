/**
 * Shown the instant a business card is tapped.
 *
 * The dashboard runs the assessment, the diagnosis and the benchmark bands
 * before it can render, which is hundreds of milliseconds of nothing. Without
 * this the click looks like it missed, and the honest fix for "the button does
 * not work" is to make the button visibly respond rather than to make it
 * bigger.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-stone-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card p-6">
            <div className="h-3 w-24 animate-pulse rounded bg-stone-200" />
            <div className="mt-3 h-7 w-32 animate-pulse rounded bg-stone-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
