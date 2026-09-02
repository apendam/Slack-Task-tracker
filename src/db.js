const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "tickets.json");

function load() {
  if (!fs.existsSync(DB_PATH)) return {};
  const raw = fs.readFileSync(DB_PATH, "utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (err) {
    // A hand-edited or partially-written file shouldn't wedge every future
    // message and cron tick - fail safe to an empty store instead.
    console.error(`Ignoring unreadable ${DB_PATH}: ${err.message}`);
    return {};
  }
}

function save(tickets) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(tickets, null, 2));
}

/**
 * Called when a JIRA link is posted in Slack. Creates the tracker entry the
 * first time a ticket is seen; on a repeat mention it refreshes the live
 * JIRA fields but keeps the original "who posted it" / "raised date".
 */
function upsertFromSlack(issue, { postedBy, slackLink }) {
  const tickets = load();
  const existing = tickets[issue.key];
  const now = new Date().toISOString();

  tickets[issue.key] = {
    ...issue,
    raisedDate: existing?.raisedDate || issue.created,
    postedBy: existing?.postedBy || postedBy,
    slackLink: existing?.slackLink || slackLink,
    lastSynced: now,
  };

  save(tickets);
  return { created: !existing };
}

/** Refreshes the live JIRA fields for a ticket already in the tracker. */
function refreshExisting(issue) {
  const tickets = load();
  if (!tickets[issue.key]) return;

  tickets[issue.key] = { ...tickets[issue.key], ...issue, lastSynced: new Date().toISOString() };
  save(tickets);
}

function getAllTrackedKeys() {
  return Object.keys(load());
}

function isTracked(key) {
  return key in load();
}

function getAllTickets() {
  return Object.values(load()).sort((a, b) => (b.lastSynced || "").localeCompare(a.lastSynced || ""));
}

module.exports = { upsertFromSlack, refreshExisting, getAllTrackedKeys, getAllTickets, isTracked };
