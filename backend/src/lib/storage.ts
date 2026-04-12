import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";

import { env } from "../config/env.js";

type CompletedPart = { partNumber: number; etag: string };

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export class StorageService {
  readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY
      }
    });
  }

  async initMultipartUpload(input: { fileName: string; contentType: string }) {
    const extension = extname(input.fileName) || ".bin";
    const objectKey = `uploads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeFileName(input.fileName)}${extension.startsWith(".") ? "" : extension}`;

    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        ContentType: input.contentType
      })
    );

    if (!response.UploadId) {
      throw new Error("Failed to initialize multipart upload.");
    }

    return { objectKey, uploadId: response.UploadId };
  }

  async getUploadPartUrl(input: { objectKey: string; uploadId: string; partNumber: number }) {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: env.S3_BUCKET,
        Key: input.objectKey,
        UploadId: input.uploadId,
        PartNumber: input.partNumber
      }),
      { expiresIn: 900 }
    );
  }

  async completeMultipartUpload(input: { objectKey: string; uploadId: string; parts: CompletedPart[] }) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: env.S3_BUCKET,
        Key: input.objectKey,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: input.parts.map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber
          }))
        }
      })
    );
  }

  async headObject(objectKey: string) {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey
      })
    );

    return {
      contentType: response.ContentType ?? "application/octet-stream",
      contentLength: Number(response.ContentLength ?? 0)
    };
  }

  async getObjectBuffer(objectKey: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey
      })
    );

    const buffer = Buffer.from(await response.Body!.transformToByteArray());
    return buffer;
  }

  async getObjectStream(objectKey: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey
      })
    );

    return response.Body as NodeJS.ReadableStream;
  }

  async getObjectSample(objectKey: string, byteLength = 4100) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        Range: `bytes=0-${byteLength - 1}`
      })
    );

    return Buffer.from(await response.Body!.transformToByteArray());
  }

  async sniffMimeType(objectKey: string) {
    const sample = await this.getObjectSample(objectKey);
    return fileTypeFromBuffer(sample);
  }

  async deleteObject(objectKey: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey
      })
    );
  }

  getPublicUrl(objectKey: string) {
    if (env.S3_PUBLIC_BASE_URL) {
      return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectKey}`;
    }

    if (!env.S3_ENDPOINT) {
      return null;
    }

    return `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.S3_BUCKET}/${objectKey}`;
  }
}
