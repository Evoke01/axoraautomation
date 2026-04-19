import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkTables() {
  const models = [
    'workspace', 'user', 'membership', 'planEntitlement', 'creator', 
    'connectedAccount', 'uploadSession', 'asset', 'assetFile', 'assetTag', 
    'metadataVariant', 'campaign', 'campaignWave', 'distributionDecision', 
    'platformPost', 'postMetricsSnapshot', 'platformQuotaLedger', 
    'optimizationSnapshot', 'competitorChannel', 'competitorObservation', 
    'opportunityReport', 'youtubeChannel', 'youtubeVideo', 'youtubeVideoSnapshot', 
    'channelTrendWindow', 'accountHealthEvent', 'override', 'auditLog', 'oauthState'
  ];

  console.log("Checking table existence for each model...");
  for (const model of models) {
    try {
      // @ts-ignore
      await prisma[model].count();
      console.log(`[OK] ${model}`);
    } catch (err: any) {
      console.log(`[MISSING/ERROR] ${model}: ${err.message?.split('\n')[0]}`);
    }
  }

  await prisma.$disconnect();
}

checkTables();
