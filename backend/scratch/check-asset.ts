import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const assets = await prisma.asset.findMany({
    where: { title: { contains: "Smart Safety Slipper" } },
    select: { id: true, title: true, status: true }
  });
  console.log("Assets:", JSON.stringify(assets, null, 2));

  if (assets.length > 0) {
    const variants = await prisma.metadataVariant.findMany({
      where: { assetId: assets[0].id },
      select: { id: true, variantKey: true, modelVersion: true, title: true }
    });
    console.log("Variants:", JSON.stringify(variants, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
