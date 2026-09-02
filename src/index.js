require("dotenv").config();
const { App } = require("@slack/bolt");
const { extractTicketKeys } = require("./parseJira");
const { getIssue } = require("./jira");
const { upsertFromSlack, isTracked } = require("./db");
const { startSyncJob } = require("./syncStatuses");
const { startServer } = require("./server");
const { getBotToken, rotationConfigured } = require("./slackAuth");

const trackedChannels = (process.env.TRACK_CHANNEL_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const userNameCache = new Map();

async function displayNameFor(client, userId) {
  if (userNameCache.has(userId)) return userNameCache.get(userId);

  try {
    const { user } = await client.users.info({ user: userId });
    const name = user.real_name || user.name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

function registerMessageHandler(app) {
  app.message(async ({ message, client, logger }) => {
    // Skip edits, thread-broadcast subtypes, etc. - only plain human messages
    // carry a top-level `text` and `user` with no subtype and no bot_id. The
    // bot_id check matters: without it, the bot's own confirmation replies
    // (which mention the ticket key) would get re-tracked and re-confirmed
    // forever.
    if (message.subtype || message.bot_id || !message.text || !message.user) return;
    if (trackedChannels.length && !trackedChannels.includes(message.channel)) return;

    const keys = extractTicketKeys(message.text);
    if (keys.length === 0) return;

    const [postedBy, permalink] = await Promise.all([
      displayNameFor(client, message.user).catch(() => message.user),
      client.chat
        .getPermalink({ channel: message.channel, message_ts: message.ts })
        .then((r) => r.permalink)
        .catch(() => null),
    ]);

    const tracked = [];

    for (const key of keys) {
      try {
        // Already tracked - a repeat paste of the same link shouldn't spam a
        // fresh "Tracked in sheet" reply or burn another JIRA call; the cron
        // sync job already keeps its status current in the background.
        if (isTracked(key)) continue;

        const issue = await getIssue(key);
        if (!issue) {
          logger.warn(`JIRA ticket ${key} not found or not accessible`);
          continue;
        }

        upsertFromSlack(issue, { postedBy, slackLink: permalink });
        tracked.push(issue);
      } catch (err) {
        logger.error(`Failed to track ${key}: ${err.message}`);
      }
    }

    if (tracked.length && process.env.POST_CONFIRMATION_REPLY === "true") {
      const lines = tracked.map((i) => `${i.key} — ${i.status} (${i.assignee})`);
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: `Tracked in sheet:\n${lines.join("\n")}`,
      });
    }
  });
}

(async () => {
  const app = new App({
    token: await getBotToken(),
    appToken: process.env.SLACK_APP_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
  });

  registerMessageHandler(app);

  await app.start();
  app.logger.info("Slack Task Tracker is running (Socket Mode)");

  if (rotationConfigured) {
    // The access token expires roughly every 12 hours; check hourly and
    // hand the Bolt client a fresh one before that happens. getBotToken()
    // only actually calls Slack once the cached token is close to expiry.
    setInterval(async () => {
      try {
        app.client.token = await getBotToken(app.logger);
      } catch (err) {
        app.logger.error(`Failed to refresh Slack bot token: ${err.message}`);
      }
    }, 60 * 60 * 1000);
  }

  startSyncJob(app.logger);
  startServer(app.logger);
})();
