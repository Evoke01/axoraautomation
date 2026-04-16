import { Platform, type PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { env } from "../config/env.js";
import type { StorageService } from "../lib/storage.js";
import { NotFoundError } from "../lib/errors.js";

export class IntelligenceService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService
  ) {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || "");
    this.fileManager = new GoogleAIFileManager(env.GEMINI_API_KEY || "");
  }

  async analyzeVideo(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { files: true, creator: true }
    });

    if (!asset || asset.files.length === 0) {
      throw new NotFoundError("Asset or file not found.");
    }

    const file = asset.files[0];
    if (!file) throw new NotFoundError("File not found.");

    // 1. Download video to a temporary file
    const tempDir = await mkdtemp(join(tmpdir(), "axora-analysis-"));
    const tempFilePath = join(tempDir, file.fileName);
    
    try {
      const buffer = await this.storage.getObjectBuffer(file.storageKey);
      await writeFile(tempFilePath, buffer);

      // 2. Upload to Gemini File API
      const uploadResponse = await this.fileManager.uploadFile(tempFilePath, {
        mimeType: file.sniffedMimeType || "video/mp4",
        displayName: file.fileName,
      });

      const fileName = uploadResponse.file.name;

      // 3. Wait for processing (Gemini requires the file to be ACTIVE)
      let geminiFile = await this.fileManager.getFile(fileName);
      while (geminiFile.state === FileState.PROCESSING) {
        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        geminiFile = await this.fileManager.getFile(fileName);
      }

      if (geminiFile.state !== FileState.ACTIVE) {
        throw new Error(`File processing failed: ${geminiFile.state}`);
      }

      // 4. Run Analysis
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
        Watch this video and provide a high-level analysis for a YouTube creator.
        
        Creator: ${asset.creator.name}
        Niche: ${asset.creator.niche ?? "General"}
        
        Focus on:
        1. THE HOOK: What happens in the first 5 seconds?
        2. THE VALUE: What is the main point of this video?
        3. THE VIBE: What is the energy level? (High, chill, educational, provactive?)
        4. KEYWORDS: What are 5-8 specific topics seen or heard in the video?
        
        Return ONLY a JSON object with keys: hook, mainPoint, vibe, keywords, summary.
      `;

      const result = await model.generateContent([
        {
          fileData: {
            mimeType: geminiFile.mimeType,
            fileUri: geminiFile.uri,
          },
        },
        { text: prompt },
      ]);

      const responseText = result.response.text();
      const cleanedJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const analysisJson = JSON.parse(cleanedJson);

      // 5. Save results to Database
      await this.prisma.asset.update({
        where: { id: assetId },
        data: {
          intelligence: analysisJson
        }
      });

      // 6. Cleanup Gemini file
      await this.fileManager.deleteFile(fileName);

      return analysisJson;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
