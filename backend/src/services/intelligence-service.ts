import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import type { PrismaClient } from "@prisma/client";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { env } from "../config/env.js";
import { NotFoundError } from "../lib/errors.js";
import type { StorageService } from "../lib/storage.js";
import { MultiAgentService } from "./multi-agent-service.js";

type IntelligenceResult = {
  hook: string;
  mainPoint: string;
  vibe: string;
  keywords: string[];
  summary: string;
};

export class IntelligenceService {
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly fileManager: GoogleAIFileManager | null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly agents: MultiAgentService
  ) {
    this.genAI = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY) : null;
    this.fileManager = env.GEMINI_API_KEY ? new GoogleAIFileManager(env.GEMINI_API_KEY) : null;
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
    if (!file) {
      throw new NotFoundError("File not found.");
    }

    let analysis = this.buildHeuristicAnalysis({
      title: asset.title,
      rawNotes: asset.rawNotes,
      creatorNiche: asset.creator.niche,
      creatorName: asset.creator.name
    });
    let baseProvider: "gemini" | "heuristic" = "heuristic";

    if (this.genAI && this.fileManager) {
      try {
        analysis = await this.runGeminiAnalysis({
          fileName: file.fileName,
          mimeType: file.sniffedMimeType || "video/mp4",
          storageKey: file.storageKey,
          creatorName: asset.creator.name,
          creatorNiche: asset.creator.niche,
          fallback: analysis
        });
        baseProvider = "gemini";
      } catch (error) {
        console.error("Video intelligence analysis fell back to heuristic mode:", error);
      }
    }

    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        intelligence: {
          ...analysis,
          provider: baseProvider
        }
      }
    });

    return {
      ...analysis,
      provider: baseProvider
    };
  }

  private async runGeminiAnalysis(input: {
    fileName: string;
    mimeType: string;
    storageKey: string;
    creatorName: string;
    creatorNiche: string | null;
    fallback: IntelligenceResult;
  }): Promise<IntelligenceResult> {
    const tempDir = await mkdtemp(join(tmpdir(), "axora-analysis-"));
    const tempFilePath = join(tempDir, input.fileName);
    let uploadedFileName: string | null = null;

    try {
      const buffer = await this.storage.getObjectBuffer(input.storageKey);
      await writeFile(tempFilePath, buffer);

      const uploadResponse = await this.fileManager!.uploadFile(tempFilePath, {
        mimeType: input.mimeType,
        displayName: input.fileName
      });

      uploadedFileName = uploadResponse.file.name;
      let geminiFile = await this.fileManager!.getFile(uploadedFileName);

      while (geminiFile.state === FileState.PROCESSING) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        geminiFile = await this.fileManager!.getFile(uploadedFileName);
      }

      if (geminiFile.state !== FileState.ACTIVE) {
        throw new Error(`Gemini file processing failed: ${geminiFile.state}`);
      }

      const model = this.genAI!.getGenerativeModel({ model: env.GEMINI_MODEL });
      const prompt = `
Watch this video and provide a high-level creator analysis.

Creator: ${input.creatorName}
Niche: ${input.creatorNiche ?? "General"}

Return only JSON with keys:
- hook
- mainPoint
- vibe
- keywords
- summary

Focus on the first seconds, the central promise, the dominant energy, and the specific topics that appear on screen or in speech.
`;

      const result = await model.generateContent([
        {
          fileData: {
            mimeType: geminiFile.mimeType,
            fileUri: geminiFile.uri
          }
        },
        { text: prompt }
      ]);

      const responseText = result.response.text();
      const parsed = safeJsonParse(responseText);

      return {
        hook: asString(parsed?.hook, input.fallback.hook),
        mainPoint: asString(parsed?.mainPoint, input.fallback.mainPoint),
        vibe: asString(parsed?.vibe, input.fallback.vibe),
        keywords: normalizeKeywords(parsed?.keywords, input.fallback.keywords),
        summary: asString(parsed?.summary, input.fallback.summary)
      };
    } finally {
      if (uploadedFileName) {
        await this.fileManager?.deleteFile(uploadedFileName).catch(() => undefined);
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private buildHeuristicAnalysis(input: {
    title: string;
    rawNotes: string | null;
    creatorNiche: string | null;
    creatorName: string;
  }): IntelligenceResult {
    const keywords = extractKeywords([
      input.title,
      input.rawNotes ?? "",
      input.creatorNiche ?? "",
      input.creatorName
    ]);

    return {
      hook: input.title,
      mainPoint: input.rawNotes ?? `A ${input.creatorNiche ?? "general"} video from ${input.creatorName}.`,
      vibe: inferVibe(input.rawNotes ?? input.title),
      keywords,
      summary: [input.title, input.rawNotes ?? "", input.creatorNiche ?? ""]
        .filter(Boolean)
        .join(" ")
        .trim()
    };
  }
}

function safeJsonParse(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeKeywords(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);

  return cleaned.length > 0 ? cleaned : fallback;
}

function extractKeywords(source: string[]) {
  const text = source.join(" ").toLowerCase();
  const tokens = text
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3)
    .slice(0, 8);

  return [...new Set(tokens)];
}

function inferVibe(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("breakdown") || normalized.includes("tutorial") || normalized.includes("how to")) {
    return "educational";
  }
  if (normalized.includes("story") || normalized.includes("behind the scenes")) {
    return "storytelling";
  }
  if (normalized.includes("hot take") || normalized.includes("controvers")) {
    return "provocative";
  }
  return "high-energy";
}
