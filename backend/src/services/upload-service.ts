import type { PrismaClient } from "@prisma/client";

import type { StorageService } from "../lib/storage.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { UploadCompleteInput, UploadInitInput, UploadPartUrlInput } from "../types/domain.js";

export class UploadService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService
  ) {}

  async initMultipartUpload(input: UploadInitInput) {
    const upload = await this.storage.initMultipartUpload({
      fileName: input.fileName,
      contentType: input.contentType
    });

    return this.prisma.uploadSession.create({
      data: {
        workspaceId: input.workspaceId,
        fileName: input.fileName,
        objectKey: upload.objectKey,
        multipartUploadId: upload.uploadId,
        contentType: input.contentType,
        fileSizeBytes: input.fileSizeBytes,
        status: "INITIATED"
      }
    });
  }

  async getPartUrl(input: UploadPartUrlInput) {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: input.uploadSessionId }
    });

    if (!session) {
      throw new NotFoundError("Upload session was not found.");
    }

    const url = await this.storage.getUploadPartUrl({
      objectKey: session.objectKey,
      uploadId: session.multipartUploadId,
      partNumber: input.partNumber
    });

    await this.prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "UPLOADING" }
    });

    return { url, expiresInSeconds: 900 };
  }

  async completeMultipartUpload(input: UploadCompleteInput) {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: input.uploadSessionId }
    });

    if (!session) {
      throw new NotFoundError("Upload session was not found.");
    }

    if (input.parts.length === 0) {
      throw new ValidationError("At least one uploaded part is required.");
    }

    await this.storage.completeMultipartUpload({
      objectKey: session.objectKey,
      uploadId: session.multipartUploadId,
      parts: input.parts
    });

    return this.prisma.uploadSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      }
    });
  }
}
