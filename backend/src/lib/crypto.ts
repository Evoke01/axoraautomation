import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import { ValidationError } from "./errors.js";

const IV_LENGTH = 12;

function getKey() {
  return createHash("sha256").update(env.APP_ENCRYPTION_KEY).digest();
}

export function encryptValue(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptValue(payload: string): string {
  try {
    const decoded = Buffer.from(payload, "base64url");
    const iv = decoded.subarray(0, IV_LENGTH);
    const tag = decoded.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = decoded.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    throw new ValidationError("Failed to decrypt secure value.");
  }
}
