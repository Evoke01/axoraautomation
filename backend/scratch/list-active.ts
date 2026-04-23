import { PrismaClient } from "@prisma/client";
import "dotenv/config";
const prisma = new PrismaClient();

async function main() {
  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      status: { in: ["ACTIVE", "DRAFT"] }
    },
    include: {
      asset: { select: { title: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log("Active/Draft Campaigns:");
  activeCampaigns.forEach(c => {
    console.log(`- [${c.status}] ${c.asset.title} (Created: ${c.createdAt.toISOString()})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
