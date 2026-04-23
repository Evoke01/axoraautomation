import { z } from "zod";

export const planTierSchema = z.enum(["FREE", "PRO", "STUDIO"]);

export const uploadInitSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  workspaceId: z.string().min(1)
});

export const uploadPartUrlSchema = z.object({
  uploadSessionId: z.string().min(1),
  partNumber: z.number().int().min(1)
});

export const uploadCompleteSchema = z.object({
  uploadSessionId: z.string().min(1),
  parts: z.array(
    z
      .object({
        partNumber: z.number().int().min(1).optional(),
        etag: z.string().min(1).optional(),
        PartNumber: z.number().int().min(1).optional(),
        ETag: z.string().min(1).optional()
      })
      .transform((part) => ({
        partNumber: part.partNumber ?? part.PartNumber ?? 0,
        etag: part.etag ?? part.ETag ?? ""
      }))
      .refine((part) => part.partNumber > 0 && part.etag.length > 0, {
        message: "Each part must include partNumber and etag."
      })
  )
});

export const createAssetSchema = z.object({
  workspaceId: z.string().min(1),
  creatorId: z.string().min(1),
  uploadSessionId: z.string().min(1),
  title: z.string().min(1),
  rawNotes: z.string().optional()
});

export const overrideAssetSchema = z.object({
  scheduleFor: z.string().datetime().optional(),
  title: z.string().optional(),
  caption: z.string().optional(),
  thumbnailBrief: z.string().optional(),
  platform: z.enum(["YOUTUBE", "INSTAGRAM", "TIKTOK", "LINKEDIN", "X"]).optional(),
  archive: z.boolean().optional()
});

export type UploadInitInput = z.infer<typeof uploadInitSchema>;
export type UploadPartUrlInput = z.infer<typeof uploadPartUrlSchema>;
export type UploadCompleteInput = z.infer<typeof uploadCompleteSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type OverrideAssetInput = z.infer<typeof overrideAssetSchema>;
