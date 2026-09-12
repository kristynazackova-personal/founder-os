# Switching Google Ads on for a Founder OS deployment

One-time operator setup. It produces three server variables:

```
GOOGLE_ADS_DEVELOPER_TOKEN
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
```

They belong to the deployment, not to a founder: one approved developer
token serves every customer, and each founder supplies only their own
customer id and a refresh token (see the in-app guide on
`/app/<id>/connect/googleads`).

## 1. Developer token — from Google Ads, not Cloud

Google Ads → a **manager (MCC) account** → *Admin* → *API Center*. Apply if
there is no token. **Basic access is enough for reporting**; test access
only reaches test accounts. Approval takes days to weeks and reviews the
tool, so start it first.

The token is per manager account, so check any existing deployment's
variables before applying — a token already in use elsewhere works here.

## 2. Cloud project + OAuth client

The Cloud project only identifies the application. It does not need to be
the project behind any other integration, and its owner does not need
access to the ads account.

1. **New project** — [console.cloud.google.com](https://console.cloud.google.com/) →
   project picker → *New project*. Name it anything (`founder-os`).
2. **Enable the Google Ads API** —
   [API library → Google Ads API](https://console.cloud.google.com/apis/library/googleads.googleapis.com)
   → *Enable*. Check the project picker first; enabling it on the wrong
   project is the commonest mistake here.
3. **Consent screen** — *APIs & Services* → *OAuth consent screen* (newer
   consoles file this under *Google Auth Platform*).
   - **User type `Internal` if the account is in a Google Workspace
     organisation.** That skips verification and the 7-day limit below, and
     is the right answer whenever it is available.
   - Otherwise `External`. Fill in app name, support email, developer
     contact.
   - Add exactly one scope: `https://www.googleapis.com/auth/adwords`.
   - **Then set publishing status to *In production*.** See the warning
     below — leaving it on *Testing* silently breaks the integration weekly.
     An unverified app in production shows a "Google hasn't verified this
     app" screen you click through; that is fine for your own account and
     needs no security audit.
4. **OAuth client** — *APIs & Services* → *Credentials* → *Create
   credentials* → *OAuth client ID* → application type **Web application**.
   Under *Authorized redirect URIs* add:

   ```
   https://developers.google.com/oauthplayground
   ```

   That URI is what lets the playground complete the exchange; without it
   the grant fails with `redirect_uri_mismatch`. Copy the client id and
   secret.

## ⚠️ The 7-day trap

A consent screen with user type **External** and publishing status
**Testing** issues refresh tokens that **Google revokes after 7 days**.
Everything works, then stops, and the symptom is `invalid_grant` — which
reads like a bad token rather than a project setting. Either publish to
production, or use `Internal` on a Workspace account. Verified against
Google's own documentation, September 2026.

## 3. Set the variables

Put all three on the deployment (Railway → the service → *Variables*). The
client id and secret **must be the same pair used to mint each founder's
refresh token**, because a refresh token is bound to the client that issued
it; a mismatched pair fails as `invalid_grant`. Railway redeploys on save.

Until they are set, the Google Ads connect page says so at the top and
refuses to connect, rather than failing obscurely after a founder has
fetched a token.

## 4. Check it

Connect a founder's account on `/app/<id>/connect/googleads`. Connecting
runs a one-campaign probe, so a wrong developer token, an unapproved token
or a scope-less refresh token fails there with Google's own wording.
