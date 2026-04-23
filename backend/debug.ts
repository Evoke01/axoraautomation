import { probeVideoBuffer } from "./src/lib/ffprobe.js";
import { readFileSync } from "fs";

async function main() {
  try {
    const file = readFileSync("package.json");
    console.log("Running probeVideoBuffer...");
    await probeVideoBuffer(file, "test.mp4");
    console.log("Success");
  } catch (e) {
    console.error("Error running probeVideoBuffer:", e);
  }
}

main().catch(console.error);
