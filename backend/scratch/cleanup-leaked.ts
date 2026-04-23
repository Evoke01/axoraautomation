import { PrismaClient } from "@prisma/client";
import "dotenv/config";
const prisma = new PrismaClient();

async function main() {
  const leaked = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
      asset: { status: "ARCHIVED" }
    }
  });

  console.log(`Found ${leaked.length} leaked campaigns for archived assets. Cleaning up...`);

  const result = await prisma.campaign.updateMany({
    where: {
      id: { in: leaked.map(c => c.id) }
    },
    data: { status: "ARCHIVED" }
  });

  console.log(`Successfully archived ${result.count} leaked campaigns.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
