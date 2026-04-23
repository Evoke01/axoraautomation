import { PrismaClient } from "@prisma/client";
import "dotenv/config";
const prisma = new PrismaClient();

async function main() {
  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      status: { in: ["ACTIVE", "DRAFT"] }
    },
    include: {
      asset: { select: { title: true, status: true } }
    }
  });
  
  console.log("Active Campaigns and Asset Status:");
  activeCampaigns.forEach(c => {
    console.log(`- ${c.asset.title}: [Campaign:${c.status}] [Asset:${c.asset.status}]`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
