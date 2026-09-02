const express = require("express");
const path = require("path");
const { getAllTickets } = require("./db");

function startServer(logger) {
  const app = express();
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/tickets", (req, res) => {
    res.json(getAllTickets());
  });

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => logger.info(`Tracker webpage running on http://localhost:${port}`));
}

module.exports = { startServer };
