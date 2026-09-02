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
5. Install the app to your workspace and copy the **Signing Secret**
   (`SLACK_SIGNING_SECRET`) from Basic Information. What you get for the bot
   token depends on whether your app has **Token Rotation** enabled:
   - **No rotation**: you get a permanent **Bot User OAuth Token**
     (`SLACK_BOT_TOKEN`, starts `xoxb-`). Set it and leave
     `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`/`SLACK_REFRESH_TOKEN` blank.
   - **Rotation enabled** (some newer apps default to this, and once it's on
     it can't be turned back off): the install page instead shows a
     short-lived (12h) access token *and* a refresh token. Ignore the 12h
     token — it'll be expired by the time you need it. Instead set:
     - `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` from Basic Information → App
       Credentials
     - `SLACK_REFRESH_TOKEN` to the refresh token (starts `xoxe-1-...`)

     `src/slackAuth.js` then refreshes the access token automatically in the
     background, well before each 12-hour expiry, and persists the rotated
     tokens to `data/slack-token.json` so a restart doesn't need reinstalling.
6. Invite the bot to the channel: `/invite @YourAppName`.

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
