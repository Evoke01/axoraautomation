import { PrismaClient } from "@prisma/client";
import { extname } from "node:path";

const prisma = new PrismaClient();

async function diag() {
  console.log("Starting diagnostics...");
  
  // 1. Check for COMPLETED upload sessions without assets
  const sessions = await prisma.uploadSession.findMany({
    where: { status: "COMPLETED" },
    include: { assets: true }
  });
  
  console.log(`Found ${sessions.length} completed upload sessions.`);
  for (const s of sessions) {
    if (s.assets.length === 0) {
      console.log(`- Session ${s.id} (${s.fileName}) has no asset.`);
      
      // Check if an AssetFile with this objectKey already exists
      const existingFile = await prisma.assetFile.findUnique({
        where: { storageKey: s.objectKey }
      });
      
      if (existingFile) {
        console.log(`  ! ALERT: AssetFile with storageKey ${s.objectKey} ALREADY EXISTS (linked to asset ${existingFile.assetId}).`);
      }
    }
  }

  // 2. Check for creators
  const creators = await prisma.creator.findMany();
  console.log(`Found ${creators.length} creators.`);
  
  // 3. Check for workspaces
  const workspaces = await prisma.workspace.findMany();
  console.log(`Found ${workspaces.length} workspaces.`);

  await prisma.$disconnect();
}

diag().catch(console.error);
