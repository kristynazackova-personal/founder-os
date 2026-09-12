import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { channelReport } from "@/lib/services/attribution";
import { fetchInstalls } from "@/lib/services/sources";
import { env } from "@/lib/env";
import { CHANNEL_LABEL } from "@/lib/domain/attribution";
import { formatMoney } from "@/lib/domain/money";
import { CopyButton } from "@/components/CopyButton";
import { InstallGuideDialog } from "@/components/InstallGuideDialog";
import { Alert, PageHeader, fmtDate } from "@/components/ui";

export default async function AttributionPage({ params }: { params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();
  const [report, installs] = await Promise.all([channelReport(app.id), fetchInstalls(app)]);
  const snippet = `<script async src="${env.appUrl}/fos.js" data-key="${app.siteKey}"></script>`;
  const activation = app.activationEvent ?? "the activation event";
  const lovablePrompt = `Add this script tag to index.html, inside <head>: ${snippet}
Then: when a user finishes sign-up, call window.fos('signup'). When a user ${activation}, call window.fos('activation'). Do not change anything else.`;

  const installSnippet = `fetch('${env.appUrl}/api/collect', {
  method: 'POST',
  headers: { 'content-type': 'text/plain' },
  body: JSON.stringify({
    key: '${app.siteKey}',
    anonId: installId,                    // random id generated on first launch, kept on the device
    event: 'install',                     // then 'signup' | 'activation' | 'purchase' with the same anonId
    source: { utmSource: Platform.OS === 'ios' ? 'app_store' : 'play_store', utmMedium: 'app' },
  }),
});`;

  // The install guide sits inline until the snippet reports its first event;
  // after that it moves behind a "How to install" button so the report leads.
  const installed = !!app.snippetInstalledAt;
  const guide = (
    <>
      <section className={installed ? "" : "card p-6"}>
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

      <section className={installed ? "" : "card p-6"}>
        <h2 className="font-semibold">2. Tell it about the moments that matter</h2>
        <p className="help">Page views and checkout views are automatic. Two calls from your code complete the funnel:</p>
        <pre className="code mt-3">{`window.fos('signup');            // when an account is created
window.fos('activation');        // when a user ${activation}
window.fos('purchase', { amount: 19 });  // optional; checkout through Founder OS records this for you`}</pre>
      </section>

      <section className={installed ? "" : "card p-6"}>
        <h2 className="font-semibold">3. Running app campaigns? Report installs from the app</h2>
        <p className="help">A native app can&apos;t load the snippet, so it posts events to the same collector. Send <code>install</code> once on first launch, then the same signup / activation / purchase calls with the same id, so the store funnel joins up. Use one random id generated on first launch and stored on the device — never a hardware identifier.</p>
        <div className="mt-3 flex items-start gap-2">
          <pre className="code flex-1">{installSnippet}</pre>
          <CopyButton text={installSnippet} />
        </div>
        <p className="help mt-2">Installs show as &quot;App Store / Play Store&quot;. Which campaign drove an install isn&apos;t knowable from inside the app (that needs SKAdNetwork or an attribution SDK) — compare the installs row against campaign spend for the period.</p>
      </section>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attribution"
        subtitle="One line in your app. It records where a visitor came from, and joins sign-ups, activation and purchases back to that source. Anonymous id only until someone pays."
        actions={installed ? <InstallGuideDialog>{guide}</InstallGuideDialog> : undefined}
      />
      {installed ? (
        <Alert kind="good">Snippet installed — first event received {fmtDate(app.snippetInstalledAt)}.</Alert>
      ) : (
        <>
          <Alert kind="warn">No events received yet. Install the snippet below; the diagnosis fills in visitors, signups and conversion as soon as data arrives.</Alert>
          {guide}
        </>
      )}

      <section className="card p-6">
        <h2 className="font-semibold">App installs, last {installs.days} days</h2>
        <p className="help">
          Firebase&apos;s automatic <code>first_open</code> from your connected GA4 property, by the user&apos;s first-touch source — this is the install count Google Ads App campaigns report against. Installs can&apos;t be joined to the snippet&apos;s ids, so they sit next to the channel table rather than in it; the app&apos;s own <code>install</code> calls (step 3) are what fill the Installs column below.
        </p>
        {!installs.connected ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Not connected.{" "}
            <Link href={`/app/${app.id}/connect/ga4`} className="font-semibold underline">
              Connect Google Analytics 4
            </Link>{" "}
            to see installs here.
          </p>
        ) : installs.error ? (
          <div className="mt-3">
            <Alert kind="bad">GA4 could not be read: {installs.error}</Alert>
          </div>
        ) : installs.rows.length ? (
          <>
            <p className="mt-3 text-sm">
              <span className="text-2xl font-bold tracking-tight">{installs.total}</span> <span className="text-[var(--muted)]">installs</span>
            </p>
            <table className="data mt-3">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Installs</th>
                  <th>Campaigns</th>
                </tr>
              </thead>
              <tbody>
                {installs.rows.map((r) => (
                  <tr key={r.channel}>
                    <td className="font-semibold">{CHANNEL_LABEL[r.channel]}</td>
                    <td>{r.installs}</td>
                    <td className="text-[var(--muted)]">{r.campaigns.length ? r.campaigns.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">No first_open events in the last {installs.days} days.</p>
        )}
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
                <th>Installs</th>
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
                  <td>{r.installs}</td>
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
