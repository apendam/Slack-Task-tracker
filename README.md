# Slack Task Tracker

Watches a Slack channel for JIRA links (`ABC-123` or a full
`https://.../browse/ABC-123` URL). Whenever one is posted, it looks the
ticket up in JIRA and writes/updates a row in a Google Sheet with the
summary, status, priority, assignee, reporter, and raised date. A background
job also re-polls JIRA every N minutes so the sheet's status/assignee stays
current even if nobody re-posts the link.

## How it works

1. A Slack app (Socket Mode, no public URL needed) listens to messages in
   the channels you point it at.
2. When a message contains a JIRA key, `src/jira.js` calls the JIRA REST API
   for that ticket's fields.
3. `src/sheets.js` appends a new row the first time a ticket is seen, or
   updates the existing row (status/assignee/etc.) on repeat mentions.
4. `src/syncStatuses.js` runs on a cron schedule and refreshes every tracked
   ticket, so a status change in JIRA (e.g. "picked up") shows up in the
   sheet without anyone touching Slack again.

## Sheet columns

`Ticket Key | Link | Summary | Status | Priority | Assignee | Reporter | Raised Date | Posted By | Slack Link | Last Synced`

The header row is created automatically on first run if the sheet is empty.

## Setup

### 1. Create the Google Sheet

Create a new (or reuse an existing) Google Sheet. Note the spreadsheet ID
from its URL: `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`.
Note the tab name too (e.g. `Tracker`).

### 2. Google service account

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project and enable the **Google Sheets API**.
2. Create a **Service Account**, then create a JSON key for it and download
   it as `service-account.json` (keep it out of git — it's already in
   `.gitignore`).
3. Open the Google Sheet and **Share** it with the service account's email
   (looks like `xxx@yyy.iam.gserviceaccount.com`) as **Editor**.

### 3. JIRA API token

1. Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens.
2. You'll authenticate as `JIRA_EMAIL` + `JIRA_API_TOKEN` (Basic auth), the
   same way `curl -u email:token` works against the JIRA Cloud REST API.

### 4. Slack app

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
5. Install the app to your workspace → copy the **Bot User OAuth Token**
   (`SLACK_BOT_TOKEN`, starts `xoxb-`) and the **Signing Secret**
   (`SLACK_SIGNING_SECRET`) from Basic Information.
6. Invite the bot to the channel: `/invite @YourAppName`.

### 5. Configure and run

```bash
npm install
cp .env.example .env
# fill in .env with the tokens/IDs from steps 1-4
npm start
```

Leave `TRACK_CHANNEL_IDS` empty to watch every channel the bot is invited
to, or set it to a comma-separated list of channel IDs to restrict it.

## Deploying so it stays running

Socket Mode keeps a persistent connection, so this needs a long-running
process rather than a serverless function — a small VM, a Railway/Render/
Fly.io worker, or `pm2`/`systemd` on an internal server all work. No inbound
webhook or public URL is required.

## Alternative: skip Slack, poll JIRA directly

If capturing "who posted it in Slack" doesn't matter and you'd rather not
run a bot, `src/syncStatuses.js` + `src/jira.js` can be run standalone (or
pointed at a JIRA JQL search instead of the sheet's existing keys) to build
a pure JIRA → Google Sheet sync with no Slack piece at all.
