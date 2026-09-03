# Slack Task Tracker

Watches a Slack channel for JIRA links (`ABC-123` or a full
`https://.../browse/ABC-123` URL). Whenever one is posted, it looks the
ticket up in JIRA and shows it on a live tracker webpage with summary,
status, priority, assignee, reporter, and raised date. A background job
also re-polls JIRA every N minutes so the page's status/assignee stays
current even if nobody re-posts the link.

No Google account, spreadsheet, or cloud setup required — everything runs
as one small Node process with data stored in a local JSON file.

## How it works

1. A Slack app (Socket Mode, no public URL needed) listens to messages in
   the channels you point it at.
2. When a message contains a JIRA key, `src/jira.js` calls the JIRA REST API
   for that ticket's fields.
3. `src/db.js` records a new ticket the first time it's seen, or refreshes
   it (status/assignee/etc.) on repeat mentions.
4. `src/syncStatuses.js` runs on a cron schedule and refreshes every tracked
   ticket, so a status change in JIRA (e.g. "picked up") shows up on the
   page without anyone touching Slack again.
5. `src/server.js` serves the dashboard at `http://localhost:3000` (or
   whatever host/port you deploy it to) — a searchable, sortable, filterable
   table of every tracked ticket, auto-refreshing every 20 seconds.

## Tracked fields

Ticket key & link, summary, status, priority, assignee, reporter, raised
date, who posted it in Slack (with a link to the message), and when it was
last synced.

## Setup

### 1. JIRA API token

1. Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens.
2. You'll authenticate as `JIRA_EMAIL` + `JIRA_API_TOKEN` (Basic auth), the
   same way `curl -u email:token` works against the JIRA Cloud REST API.

### 2. Slack app

1. Go to https://api.slack.com/apps → **Create New App** → From scratch.
2. **Socket Mode**: turn it on, generate an app-level token with the
   `connections:write` scope → this is `SLACK_APP_TOKEN` (starts `xapp-`).
3. **OAuth & Permissions** → add Bot Token Scopes:
   - `channels:history` (public channels)
   - `groups:history` (if the channel is private)
   - `chat:write`
   - `users:read`
4. **Event Subscriptions**: turn on, subscribe to bot events `message.channels`
   (and `message.groups` for private channels).
5. Copy the **Signing Secret** (`SLACK_SIGNING_SECRET`) from Basic
   Information → App Credentials. Also copy the **Client ID** and **Client
   Secret** from there into `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` — needed
   for the install step below regardless of whether rotation is on.
6. **Install the app to your workspace.** Some apps show a simple "Install
   to Workspace" button with the token right there; if your app's UI doesn't
   (it's changed over time, and can require a working OAuth redirect URL to
   complete), use the bundled helper instead:
   ```bash
   npm install     # if you haven't yet
   ```
   In **OAuth & Permissions → Redirect URLs**, set the redirect URL to
   `http://localhost:3001/slack/oauth_redirect` (replacing any old/dead one)
   and click **Save URLs**. Then run:
   ```bash
   npm run slack:install
   ```
   Open the URL it prints, choose your workspace, click **Allow**. The
   script prints a token to your terminal:
   - If your app has **Token Rotation** enabled (check the "OAuth Tokens"
     note on the OAuth & Permissions page — once on, it can't be turned back
     off), it prints `SLACK_REFRESH_TOKEN=xoxe-1-...` — copy that into
     `.env`. `src/slackAuth.js` then refreshes the actual access token
     automatically in the background before each ~12-hour expiry, persisting
     the rotated tokens to `data/slack-token.json` so a restart doesn't need
     reinstalling.
   - If rotation is **not** enabled, it prints a permanent
     `SLACK_BOT_TOKEN=xoxb-...` instead — copy that in and leave
     `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`/`SLACK_REFRESH_TOKEN` blank.

   Stop the script with Ctrl+C once you've copied the token — it's only
   needed for this one-time install.
7. Invite the bot to the channel: `/invite @YourAppName`.

### 3. Configure and run

```bash
npm install
cp .env.example .env
# fill in .env with the tokens from steps 1-2
npm start
```

Then open `http://localhost:3000` to see the tracker page.

Leave `TRACK_CHANNEL_IDS` empty to watch every channel the bot is invited
to, or set it to a comma-separated list of channel IDs to restrict it.

## Backfilling history

The bot only ever sees messages posted after it starts listening. To pull in
everything already posted before that (or before the bot was invited to the
channel), run the one-time backfill script:

```bash
npm run slack:backfill
```

It scans the full history of the channel(s) in `TRACK_CHANNEL_IDS` (or pass
a specific channel ID as an argument: `node scripts/backfill.js C0123456789`),
finds every JIRA link/key, and tracks anything not already in the tracker —
same logic as the live listener, so it's safe to re-run any time (already-
tracked tickets are skipped, not duplicated).

## Deploying so it stays running and is reachable by your team

Socket Mode keeps a persistent connection, so this needs a long-running
process rather than a serverless function — a small VM, a Railway/Render/
Fly.io service, or `pm2`/`systemd` on an internal server all work. No
inbound webhook is required for Slack, but if you want teammates to open
the tracker page from their own browsers, deploy it somewhere reachable on
your network (or a public host) and share that URL — the same process
serves both the Slack listener and the webpage.

The ticket data lives in `data/tickets.json` (path configurable via
`DB_PATH`). Back that file up or mount it on a persistent volume if you
deploy to a platform with an ephemeral filesystem (e.g. most container
platforms wipe local disk on redeploy).

## Prefer Google Sheets instead?

Swap `src/db.js` for a Google Sheets-backed version (Sheets API + a
service account) if you'd rather have the data in a spreadsheet than a
webpage — the rest of the app (Slack listener, JIRA fetch, cron refresh)
stays the same either way.
