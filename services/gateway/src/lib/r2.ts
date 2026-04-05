/**
 * R2 (S3-compatible) client for Cloudflare R2.
 * Used when video-pipeline is unavailable and the gateway handles recording storage.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream } from "node:fs";
import { createLogger } from "./logger.js";
import { get } from "./config.js";

const logger = createLogger("r2");

function getR2Endpoint(): string {
  const endpoint = get("R2_ENDPOINT");
  if (endpoint) return endpoint;
  const accountId = get("R2_ACCOUNT_ID");
  if (accountId) {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }
  return "";
}

function isR2Configured(): boolean {
  return !!(
    get("R2_ACCESS_KEY_ID") &&
    get("R2_SECRET_ACCESS_KEY") &&
    get("R2_BUCKET_NAME") &&
    getR2Endpoint()
  );
}

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    const endpoint = getR2Endpoint();
    r2Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: get("R2_ACCESS_KEY_ID") ?? "",
        secretAccessKey: get("R2_SECRET_ACCESS_KEY") ?? "",
      },
      forcePathStyle: true,
    });
  }
  return r2Client;
}

/**
 * Upload a local file to R2.
 * @param localPath - Absolute path to the file
 * @param r2Key - R2 object key (e.g. tenants/t1/cameras/c1/recordings/rec-id.mp4)
 */
export async function uploadToR2(
  localPath: string,
  r2Key: string,
): Promise<void> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }
  const bucket = get("R2_BUCKET_NAME") ?? "";
  const client = getR2Client();
  const body = createReadStream(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: body,
      ContentType: "video/mp4",
    }),
  );
  logger.info("Uploaded recording to R2", { r2Key });
}

/**
 * Upload a Buffer/Uint8Array directly to R2 (no local file needed).
 */
export async function uploadBufferToR2(
  buffer: Buffer | Uint8Array,
  r2Key: string,
  contentType = "image/jpeg",
): Promise<void> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }
  const bucket = get("R2_BUCKET_NAME") ?? "";
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  logger.info("Uploaded buffer to R2", { r2Key });
}

/**
 * Generate a presigned GET URL for an R2 object.
 */
export async function getPresignedPlaybackUrl(
  r2Key: string,
  expiresInSec = 3600,
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }
  const bucket = get("R2_BUCKET_NAME") ?? "";
  const client = getR2Client();

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: r2Key }),
    { expiresIn: expiresInSec },
  );
  return url;
}

export function isR2StoragePath(storagePath: string): boolean {
  return storagePath.startsWith("tenants/") && !storagePath.includes("..");
}

export { isR2Configured };
