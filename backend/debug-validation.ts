import { buildApp } from "./src/app.js";
import { registerRecurringJobs } from "./src/queues/runtime.js";

async function main() {
  console.log("Building app...");
  const app = await buildApp();
  console.log("App built. Testing registerRecurringJobs...");
  
  try {
    await registerRecurringJobs(app.services);
    console.log("registerRecurringJobs success!");
  } catch (err) {
    console.error("registerRecurringJobs failed:", err);
  } finally {
    process.exit(0);
  }
}

main().catch(console.error);
