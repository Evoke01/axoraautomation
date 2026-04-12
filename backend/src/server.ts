import { buildApp } from "./app.js";

async function start() {
  const app = await buildApp();
  const address = await app.listen({ port: app.services.env.PORT, host: "0.0.0.0" });
  app.log.info({ address }, "Axora backend started");
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
