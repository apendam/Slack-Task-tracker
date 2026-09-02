require("dotenv").config();
const { App } = require("@slack/bolt");
const { extractTicketKeys } = require("./parseJira");
const { getIssue } = require("./jira");
const { upsertFromSlack } = require("./db");
const { startSyncJob } = require("./syncStatuses");
const { startServer } = require("./server");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
});

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

app.message(async ({ message, client, logger }) => {
  // Skip edits, bot messages, thread-broadcast subtypes, etc. - only plain
  // human messages carry a top-level `text` and `user`.
  if (message.subtype || !message.text || !message.user) return;
  if (trackedChannels.length && !trackedChannels.includes(message.channel)) return;

  const keys = extractTicketKeys(message.text);
  if (keys.length === 0) return;

  const [postedBy, permalinkResp] = await Promise.all([
    displayNameFor(client, message.user),
    client.chat.getPermalink({ channel: message.channel, message_ts: message.ts }),
  ]);

  const tracked = [];

  for (const key of keys) {
    try {
      const issue = await getIssue(key);
      if (!issue) {
        logger.warn(`JIRA ticket ${key} not found or not accessible`);
        continue;
      }

      upsertFromSlack(issue, { postedBy, slackLink: permalinkResp.permalink });
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

(async () => {
  await app.start();
  app.logger.info("Slack Task Tracker is running (Socket Mode)");
  startSyncJob(app.logger);
  startServer(app.logger);
})();
