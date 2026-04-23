import { buildApp } from "./src/app.js";

async function main() {
  console.log("Building app...");
  const app = await buildApp();
  console.log("App built. Calling ready()...");
  await app.ready();
  
  try {
    console.log("Running validation on cmo4zajpz001ydi1tikojsown...");
    await app.services.validation.inspect("cmo4zajpz001ydi1tikojsown");
    console.log("Validation success!");
  } catch (err) {
    console.error("Validation failed but caught by caller:", err);
  } finally {
    process.exit(0);
  }
}

main().catch(console.error);
