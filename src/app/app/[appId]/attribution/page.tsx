import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { channelReport } from "@/lib/services/attribution";
import { env } from "@/lib/env";
import { CHANNEL_LABEL } from "@/lib/domain/attribution";
import { formatMoney } from "@/lib/domain/money";
import { CopyButton } from "@/components/CopyButton";
import { Alert, PageHeader, fmtDate } from "@/components/ui";

export default async function AttributionPage({ params }: { params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  const report = await channelReport(app.id);
  const snippet = `<script async src="${env.appUrl}/fos.js" data-key="${app.siteKey}"></script>`;
  const activation = app.activationEvent ?? "the activation event";
  const lovablePrompt = `Add this script tag to index.html, inside <head>: ${snippet}
Then: when a user finishes sign-up, call window.fos('signup'). When a user ${activation}, call window.fos('activation'). Do not change anything else.`;

  return (
    <div className="space-y-6">
      <PageHeader title="Attribution" subtitle="One line in your app. It records where a visitor came from, and joins sign-ups, activation and purchases back to that source. Anonymous id only until someone pays." />
      {app.snippetInstalledAt ? <Alert kind="good">Snippet installed — first event received {fmtDate(app.snippetInstalledAt)}.</Alert> : <Alert kind="warn">No events received yet. Install the snippet below; the diagnosis fills in visitors, signups and conversion as soon as data arrives.</Alert>}

      <section className="card p-6">
        <h2 className="font-semibold">1. Install</h2>
        <p className="help">Paste into the &lt;head&gt; of your app. Under 5 KB, no cookies, no personal data.</p>
        <div className="mt-3 flex items-start gap-2">
          <pre className="code flex-1">{snippet}</pre>
          <CopyButton text={snippet} />
        </div>
        <h3 className="mt-5 text-sm font-semibold">Using Lovable or Bolt? Paste this prompt instead</h3>
        <div className="mt-2 flex items-start gap-2">
          <pre className="code flex-1">{lovablePrompt}</pre>
          <CopyButton text={lovablePrompt} label="Copy prompt" />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">2. Tell it about the moments that matter</h2>
        <p className="help">Page views and checkout views are automatic. Two calls from your code complete the funnel:</p>
        <pre className="code mt-3">{`window.fos('signup');            // when an account is created
window.fos('activation');        // when a user ${activation}
window.fos('purchase', { amount: 19 });  // optional; checkout through Founder OS records this for you`}</pre>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">Channels, last 90 days</h2>
        <p className="help">{report.visitors} visitors since {fmtDate(report.since)}. Revenue counts live purchases only.</p>
        {report.rows.length ? (
          <table className="data mt-3">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Visitors</th>
                <th>Signups</th>
                <th>Activated</th>
                <th>Checkout views</th>
                <th>Paid</th>
                <th>Returned 30d</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.channel}>
                  <td className="font-semibold">{CHANNEL_LABEL[r.channel]}</td>
                  <td>{r.visitors}</td>
                  <td>{r.signups}</td>
                  <td>{r.activations}</td>
                  <td>{r.checkoutViews}</td>
                  <td className="font-semibold">{r.purchases}</td>
                  <td>{r.returned}</td>
                  <td>{formatMoney(r.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">Nothing yet. Tip: add ?utm_source=reddit to the links you post so channels are unambiguous.</p>
        )}
      </section>
    </div>
  );
}
