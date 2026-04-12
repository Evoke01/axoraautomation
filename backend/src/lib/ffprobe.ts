import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import ffprobe from "ffprobe-static";

import { AppError, ValidationError } from "./errors.js";

export type ProbedVideo = {
  durationSeconds: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrate: number | null;
  hasAudio: boolean;
  orientation: "portrait" | "landscape" | "square";
};

function runFfprobe(filePath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ffprobe.path) {
      reject(new AppError("ffprobe binary is unavailable.", 500, "ffprobe_missing"));
      return;
    }

    const child = spawn(ffprobe.path, [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-print_format",
      "json",
      filePath
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new ValidationError("Uploaded file is not a valid video.", { stderr }));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new ValidationError("Unable to inspect video metadata."));
      }
    });
  });
}

function parseFrameRate(raw?: string): number | null {
  if (!raw || !raw.includes("/")) {
    return null;
  }

  const [numerator, denominator] = raw.split("/").map(Number);
  if (!numerator || !denominator) {
    return null;
  }

  return Number((numerator / denominator).toFixed(2));
}

export async function probeVideoBuffer(buffer: Buffer, originalFileName: string): Promise<ProbedVideo> {
  const directory = await mkdtemp(join(tmpdir(), "axora-ffprobe-"));
  const filePath = join(directory, originalFileName);

  try {
    await writeFile(filePath, buffer);
    const payload = (await runFfprobe(filePath)) as {
      format?: { duration?: string; bit_rate?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number; avg_frame_rate?: string }>;
    };

    const videoStream = payload.streams?.find((stream) => stream.codec_type === "video");

    if (!videoStream) {
      throw new ValidationError("Uploaded file does not contain a video stream.");
    }

    const width = videoStream.width ?? null;
    const height = videoStream.height ?? null;
    const durationSeconds = Number(payload.format?.duration ?? "0");

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new ValidationError("Unable to read the uploaded video duration.");
    }

    const orientation =
      width === null || height === null
        ? "landscape"
        : width === height
          ? "square"
          : height > width
            ? "portrait"
            : "landscape";

    return {
      durationSeconds,
      width,
      height,
      fps: parseFrameRate(videoStream.avg_frame_rate),
      bitrate: payload.format?.bit_rate ? Number(payload.format.bit_rate) : null,
      hasAudio: Boolean(payload.streams?.some((stream) => stream.codec_type === "audio")),
      orientation
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
