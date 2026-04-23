import { PrismaClient } from "@prisma/client";
import "dotenv/config";
const prisma = new PrismaClient();

async function main() {
  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      status: { in: ["ACTIVE", "DRAFT"] }
    },
    include: {
      asset: { select: { title: true } },
      waves: {
        where: { waveNumber: 1 },
        select: { scheduledFor: true, status: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log("Active/Draft Campaigns Schedule:");
  activeCampaigns.forEach(c => {
    const wave = c.waves[0];
    console.log(`- ${c.asset.title}: [${c.status}] Wave 1 ${wave?.status} for ${wave?.scheduledFor?.toISOString() ?? 'N/A'}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
