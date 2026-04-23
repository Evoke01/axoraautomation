import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const all = await p.asset.groupBy({ by: ["status"], _count: true });
  console.log("All asset status counts:");
  for (const row of all) {
    console.log(`  ${row.status}: ${row._count}`);
  }
  await p.$disconnect();
}

main().catch(console.error);
