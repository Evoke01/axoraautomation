import { PrismaClient } from "@prisma/client";
import { DashboardService } from "../src/services/dashboard-service.js";

const prisma = new PrismaClient();
const dashboardService = new DashboardService(prisma);

async function test() {
  const workspace = await prisma.workspace.findFirst({
    orderBy: { createdAt: "asc" }
  });

  if (!workspace) {
    console.error("No workspace found");
    return;
  }

  console.log(`Testing listAssets for workspace: ${workspace.id}`);
  try {
    const assets = await dashboardService.listAssets(workspace.id);
    console.log(`Successfully fetched ${assets.length} assets`);
    if (assets.length > 0) {
      console.log("First asset:", JSON.stringify(assets[0], null, 2));
    }
  } catch (err) {
    console.error("Error in listAssets:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
