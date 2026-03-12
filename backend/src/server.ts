import { createApp } from "./app/app.js";
import { env } from "./config/env.js";
import { closePrisma } from "./lib/prisma.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});

async function shutdown(signal: "SIGINT" | "SIGTERM") {
  console.log(`[Server] stopping (${signal})`);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  await closePrisma();
  console.log("[Server] stopped");
}

function registerShutdown(signal: "SIGINT" | "SIGTERM") {
  process.once(signal, () => {
    void shutdown(signal).catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(`[Server] shutdown failed: ${message}`);
      process.exitCode = 1;
    });
  });
}

registerShutdown("SIGINT");
registerShutdown("SIGTERM");
