const cron = require("node-cron");
const { getIssue } = require("./jira");
const { getAllTrackedKeys, refreshExisting } = require("./sheets");

/** Re-polls JIRA for every tracked ticket so status/assignee changes show up
 * in the sheet even when nobody re-posts the link in Slack. */
async function syncAllTickets(logger) {
  const keys = await getAllTrackedKeys();
  logger.info(`Refreshing ${keys.length} tracked ticket(s) from JIRA`);

  for (const key of keys) {
    try {
      const issue = await getIssue(key);
      if (issue) await refreshExisting(issue);
    } catch (err) {
      logger.error(`Failed to refresh ${key}: ${err.message}`);
    }
  }
}

function startSyncJob(logger) {
  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES || 30);
  cron.schedule(`*/${minutes} * * * *`, () => syncAllTickets(logger));
  logger.info(`Scheduled JIRA status refresh every ${minutes} minute(s)`);
}

module.exports = { startSyncJob, syncAllTickets };
