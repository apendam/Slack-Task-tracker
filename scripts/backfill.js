// One-time backfill: scans a channel's full message history for JIRA links
// and tracks anything found. The live bot only sees messages posted after
// it starts listening - run this once (or any time you want to catch up
// history the bot missed, e.g. before it was invited to the channel).
//
// Usage: npm run slack:backfill
// Or target a specific channel: node scripts/backfill.js C0123456789
require("dotenv").config();
const { WebClient } = require("@slack/web-api");
const { extractTicketKeys } = require("../src/parseJira");
const { getIssue } = require("../src/jira");
const { upsertFromSlack, isTracked } = require("../src/db");
const { getBotToken } = require("../src/slackAuth");

const channel = process.argv[2] || (process.env.TRACK_CHANNEL_IDS || "").split(",")[0].trim();

if (!channel) {
  console.error(
    "No channel specified. Pass one as an argument (node scripts/backfill.js C0123456789) " +
      "or set TRACK_CHANNEL_IDS in .env."
  );
  process.exit(1);
}

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

async function run() {
  const client = new WebClient(await getBotToken());

  let cursor;
  let messageCount = 0;
  let trackedCount = 0;
  let skippedCount = 0;

  do {
    const res = await client.conversations.history({ channel, cursor, limit: 200 });

    for (const message of res.messages) {
      messageCount++;

      // Same filtering the live listener applies - skip edits/bot messages/
      // messages with no text or author.
      if (message.subtype || message.bot_id || !message.text || !message.user) continue;

      const keys = extractTicketKeys(message.text);
      if (keys.length === 0) continue;

      const newKeys = keys.filter((key) => !isTracked(key));
      if (newKeys.length === 0) continue;

      const [postedBy, permalinkResp] = await Promise.all([
        displayNameFor(client, message.user),
        client.chat.getPermalink({ channel, message_ts: message.ts }).catch(() => null),
      ]);

      for (const key of newKeys) {
        try {
          const issue = await getIssue(key);
          if (!issue) {
            console.warn(`Skipping ${key} - not found or not accessible in JIRA`);
            skippedCount++;
            continue;
          }

          upsertFromSlack(issue, { postedBy, slackLink: permalinkResp?.permalink || null });
          trackedCount++;
          console.log(`Tracked ${key} (posted by ${postedBy})`);
        } catch (err) {
          console.error(`Failed on ${key}: ${err.message}`);
          skippedCount++;
        }
      }
    }

    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  console.log(
    `\nDone. Scanned ${messageCount} message(s), newly tracked ${trackedCount}, skipped ${skippedCount}.`
  );
}

run().catch((err) => {
  console.error(err.data || err.message || err);
  process.exit(1);
});
