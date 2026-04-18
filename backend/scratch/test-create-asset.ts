import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { AssetService } from "../src/services/asset-service.js";
import { AuditService } from "../src/services/audit-service.js";
import "dotenv/config";

const prisma = new PrismaClient();
const queue = new Queue("axora", { connection: { host: "localhost", port: 6379 } }); // Mock queue connection
const audit = new AuditService(prisma);
const assets = new AssetService(prisma, queue, audit);

async function testCreate() {
  console.log("Testing asset creation...");
  
  // Find a completed upload session
  const upload = await prisma.uploadSession.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { createdAt: "desc" }
  });
  
  if (!upload) {
    console.error("No completed upload session found. Please upload a file first.");
    return;
  }
  
  // Find a creator in that workspace
  const creator = await prisma.creator.findFirst({
    where: { workspaceId: upload.workspaceId }
  });
  
  if (!creator) {
    console.error("No creator found for workspace " + upload.workspaceId);
    return;
  }
  
  console.log(`Using session ${upload.id} and creator ${creator.id}`);
  
  try {
    const result = await assets.createAsset({
      workspaceId: upload.workspaceId,
      creatorId: creator.id,
      uploadSessionId: upload.id,
      title: "Diagnostic Test",
    });
    console.log("Success! Asset created:", result.id);
  } catch (err: any) {
    console.error("FAILED with error:");
    console.error(err);
    if (err.code) console.error("Code:", err.code);
    if (err.meta) console.error("Meta:", err.meta);
  } finally {
    await prisma.$disconnect();
    await queue.close();
  }
}

testCreate().catch(console.error);
