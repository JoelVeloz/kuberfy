import { createServer } from "node:http";

const port = process.env.PORT ?? 3000;

createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: "ok", path: req.url, hostname: process.env.HOSTNAME, time: new Date().toISOString() }));
}).listen(port, () => console.log(`test-node-api listening on ${port}`));
