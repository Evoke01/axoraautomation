import { PrismaClient } from "@prisma/client";
import "dotenv/config";
const prisma = new PrismaClient();

async function main() {
  const asset = await prisma.asset.findFirst({
    where: { title: { contains: 'metrocrowd' } },
    include: {
      campaigns: {
        include: {
          waves: true
        }
      }
    }
  });
  console.log(JSON.stringify(asset, null, 2));
  
  const activeCampaignsCount = await prisma.campaign.count({
    where: {
      status: { in: ["ACTIVE", "DRAFT"] }
    }
  });
  console.log("Active Campaigns Count:", activeCampaignsCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
