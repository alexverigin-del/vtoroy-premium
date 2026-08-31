// Loopback-only UI fixture entry. A file (not node -e) is required because
// Next's static-path workers inherit execArgv from the parent process.
const path = require("node:path");
const { startServer } = require("next/dist/server/lib/start-server.js");

startServer({
  dir: path.resolve(__dirname, "../apps/web"),
  hostname: "127.0.0.1",
  port: Number(process.argv[2]),
  isDev: true,
  allowRetry: false,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
