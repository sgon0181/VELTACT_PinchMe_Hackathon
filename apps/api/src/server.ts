import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./env.js";
import { attachRealtime } from "./realtime.js";

const server = createServer(app);
attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(`Veltact API listening on http://localhost:${env.PORT}`);
});
