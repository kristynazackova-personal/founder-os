import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { channelReport } from "@/lib/services/attribution";
import { fetchCampaigns, fetchGoogleAdsCampaigns, fetchInstalls } from "@/lib/services/sources";
import { latestAssessment } from "@/lib/services/diagnosis";
import { summarizeCampaigns, UNATTRIBUTED_CAMPAIGN } from "@/lib/domain/campaigns";
import { listAdSpend, toManualSpend } from "@/lib/services/adSpend";
import { saveAdSpendAction } from "@/app/actions/adSpend";
import { ManualSpendForm } from "@/components/ManualSpendForm";
import { fmtDate as fmtDay } from "@/components/ui";
import type { Metrics } from "@/lib/domain/metrics";
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
  const [report, installs, campaignsRaw, googleAds, assessment, spendRows] = await Promise.all([channelReport(app.id), fetchInstalls(app), fetchCampaigns(app), fetchGoogleAdsCampaigns(app), latestAssessment(app.id), listAdSpend(app.id)]);
  // Google Ads is the authoritative record of spend; GA4 only sees cost when
  // its Ads link delivers it, and typed figures fill whatever neither has.
  const adSource = googleAds.rows.length ? ("googleads" as const) : ("ga4" as const);
  const adRows = googleAds.rows.length ? googleAds.rows : campaignsRaw.ads;
  const manualSpend = toManualSpend(spendRows);
  const saveSpend = saveAdSpendAction.bind(null, app.id);
  // Payback needs what a paying customer is worth per month: MRR ÷ paying customers from the latest diagnosis.
  const m = (assessment?.metrics ?? null) as Metrics | null;
  const monthlyRevenuePerPayingCents = m && m.payingUsers > 0 && m.mrrUsdCents > 0 ? Math.round(m.mrrUsdCents / m.payingUsers) : null;
  const campaigns = summarizeCampaigns(adRows, campaignsRaw.events, { monthlyRevenuePerPayingCents, manualSpend, adSource });
  const money = (cents: number | null) => (cents === null ? "—" : formatMoney(cents));
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
        <h2 className="font-semibold">Paid campaigns, last {campaignsRaw.days} days</h2>
        <p className="help">
          Ad spend from the Google Ads account linked to your GA4 property, next to the installs, trials and purchases GA4 attributes to each campaign&apos;s first touch. Spend is in the property&apos;s currency. Payback = cost per paid customer ÷ monthly revenue per paying customer{monthlyRevenuePerPayingCents ? ` (${formatMoney(monthlyRevenuePerPayingCents)} from your diagnosis)` : " (run the diagnosis with a revenue source connected to see it)"}.
        </p>
        {campaignsRaw.connected && campaignsRaw.error && !campaigns.rows.length ? (
          <div className="mt-3">
            <Alert kind="bad">GA4 could not be read: {campaignsRaw.error}</Alert>
          </div>
        ) : !campaignsRaw.connected && !campaigns.rows.length ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Not connected.{" "}
            <Link href={`/app/${app.id}/connect/ga4`} className="font-semibold underline">
              Connect Google Analytics 4
            </Link>{" "}
            (linked to your Google Ads account) to read the funnel automatically. For spend, connect{" "}
            <Link href={`/app/${app.id}/connect/googleads`} className="font-semibold underline">
              Google Ads
            </Link>{" "}
            or type it in below.
          </p>
        ) : campaigns.rows.length ? (
          <>
            {campaigns.total.spendCents === 0 ? (
              <div className="mt-3">
                <Alert kind="warn">
                  GA4 reported no ad cost for property <span className="font-mono">{campaignsRaw.propertyId}</span>, on any campaign dimension or as a property-wide total. The funnel below is real; only spend is missing, so cost per install, CAC and payback stay unknown rather than $0. Connect Google Ads for the real figure, or type it in at the bottom of this card.{campaignsRaw.notes.length ? " What GA4 said about each query it refused is listed under the table." : " If the Google Ads link is in place, check that the linked account runs these campaigns and that the window covers days after the link was created."}
                </Alert>
              </div>
            ) : null}
            <p className="mt-3 text-sm">
              <span className="text-2xl font-bold tracking-tight">{formatMoney(campaigns.total.spendCents)}</span> <span className="text-[var(--muted)]">spent · {campaigns.total.installs} installs · {campaigns.total.paid} paid · CAC {money(campaigns.total.cacCents)}</span>
            </p>
            <table className="data mt-3">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Spend</th>
                  <th>Clicks</th>
                  <th>Installs</th>
                  <th>Trials</th>
                  <th>Paid</th>
                  <th>Cost / install</th>
                  <th>Cost / trial</th>
                  <th>CAC</th>
                  <th>Payback</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.rows.map((r) => (
                  <tr key={r.campaign} className={r.campaign === UNATTRIBUTED_CAMPAIGN ? "text-[var(--muted)]" : undefined}>
                    <td className="font-semibold">{r.campaign}</td>
                    <td>
                      {formatMoney(r.spendCents)}
                      {r.spendSource === "manual" ? <span className="ml-1 text-xs text-[var(--muted)]">entered</span> : null}
                      {r.spendSource === "googleads" ? <span className="ml-1 text-xs text-[var(--muted)]">Google Ads</span> : null}
                    </td>
                    <td>{r.clicks}</td>
                    <td>{r.installs}</td>
                    <td>{r.trials}</td>
                    <td className="font-semibold">{r.paid}</td>
                    <td>{money(r.costPerInstallCents)}</td>
                    <td>{money(r.costPerTrialCents)}</td>
                    <td>{money(r.cacCents)}</td>
                    <td>{r.paybackMonths === null ? "—" : `${r.paybackMonths} mo`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {adSource === "googleads" ? (
              <p className="help mt-2">
                Spend from Google Ads account <span className="font-mono">{googleAds.customerId}</span>, which is the authoritative figure. The funnel beside it stays GA4&apos;s, attributed to each campaign&apos;s first touch.
              </p>
            ) : campaignsRaw.scope === "total" ? (
              <p className="help mt-2">GA4 would not break this spend down by campaign, so it is shown as one unattributed total. That is normal for iOS App campaigns, where per-user campaign attribution never reaches GA4.</p>
            ) : campaignsRaw.scope ? (
              <p className="help mt-2">
                Spend read on <span className="font-mono">{campaignsRaw.scope}</span>.
              </p>
            ) : null}
            {campaignsRaw.error ? <p className="help mt-2">GA4 could not be read: {campaignsRaw.error}</p> : null}
            {googleAds.error ? <p className="help mt-2">Google Ads could not be read: {googleAds.error}</p> : null}
            {campaignsRaw.notes.map((n) => (
              <p key={n.request} className="help mt-2">
                GA4 refused the spend query on <span className="font-mono">{n.request}</span>: {n.message}
              </p>
            ))}
          </>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <p>
              GA4 property <span className="font-mono">{campaignsRaw.propertyId}</span> returned {campaignsRaw.ads.length} ad row{campaignsRaw.ads.length === 1 ? "" : "s"} and {campaignsRaw.events.length} event row{campaignsRaw.events.length === 1 ? "" : "s"} for {campaignsRaw.from ? fmtDay(campaignsRaw.from) : "—"} → today
              {campaignsRaw.scope && campaignsRaw.scope !== "total" ? ` (spend read on ${campaignsRaw.scope})` : ""}.
            </p>
            {googleAds.error ? <p>Google Ads could not be read: {googleAds.error}</p> : null}
            {campaignsRaw.notes.map((n) => (
              <p key={n.request}>
                GA4 refused the spend query on <span className="font-mono">{n.request}</span>: {n.message}
              </p>
            ))}
            <p>
              {campaignsRaw.eventSettings?.history === "forward"
                ? `Your event settings read only from ${fmtDay(new Date(campaignsRaw.eventSettings.since))} on — earlier spend is deliberately ignored. Change that under Connect → GA4 → Change.`
                : campaignsRaw.ads.length === 0
                  ? "No ad rows at all usually means this property is not the one linked to the Google Ads account — for an app, that is the Firebase project's GA4 property, not the website's. Check the property id under Connect → Google Analytics 4."
                  : "Rows came back but carried no spend, clicks or funnel users in the window."}
            </p>
          </div>
        )}
        <ManualSpendForm action={saveSpend} entries={manualSpend} windowDays={campaignsRaw.days} />
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
