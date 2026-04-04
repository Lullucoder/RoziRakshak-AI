/**
 * POST /api/upload/face
 *   Returns a presigned R2 PUT URL for uploading the worker's face photo.
 *   The x-worker-uid request header identifies the worker.
 *
 * GET /api/upload/face?uid={uid}
 *   Returns a presigned R2 GET URL so admins can view the stored face photo.
 *
 * Auth: reads uid from header (POST) or query param (GET).
 * In production you'd verify a real session cookie.
 */

import { NextRequest } from "next/server";
import crypto from "crypto";

// ── Env helpers ───────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

// ── AWS4 presigned URL (manual, no SDK) ──────────────────────────────────────
// Cloudflare R2 is S3-compatible, so we use the S3 presign algorithm.

function hmacBuf(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function hmacHex(key: Buffer | string, data: string): string {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate    = hmacBuf("AWS4" + secretKey, dateStamp);
  const kRegion  = hmacBuf(kDate, region);
  const kService = hmacBuf(kRegion, service);
  const kSigning = hmacBuf(kService, "aws4_request");
  return kSigning;
}

interface PresignParams {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  key: string;
  method: "PUT" | "GET";
  region?: string;
  expiresIn?: number;
  /** Only required for PUT */
  contentType?: string;
}

function buildPresignedUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucketName,
  key,
  method,
  region = "auto",
  expiresIn = 300,
  contentType,
}: PresignParams): string {
  const service = "s3";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}/${bucketName}/${key}`;

  const now = new Date();
  // Format: 20060102T150405Z
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  // Canonical headers and signed headers differ by method
  const isPut = method === "PUT";
  const canonicalHeaders = isPut && contentType
    ? `content-type:${contentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const signedHeaders = isPut && contentType ? "content-type;host" : "host";

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join("&");

  const canonicalUri = `/${bucketName}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = hmacHex(signingKey, stringToSign);

  return `${endpoint}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// ── GET handler (worker self-fetch OR admin photo viewer) ─────────────────────
//
//  • Worker self-fetch: include `x-worker-uid` header → 2-minute presigned URL
//    (short for security — worker fetches their own face for re-verification)
//  • Admin viewer:     include `uid` query param    → 15-minute presigned URL

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const accountId       = requireEnv("R2_ACCOUNT_ID");
    const accessKeyId     = requireEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
    const bucketName      = requireEnv("R2_BUCKET_NAME");

    // ── Worker self-fetch path (2-minute URL) ─────────────────────────────
    const workerUid = request.headers.get("x-worker-uid")?.trim();
    if (workerUid) {
      const key = `faces/${workerUid}.jpg`;
      const presignedUrl = buildPresignedUrl({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucketName,
        key,
        method: "GET",
        expiresIn: 120, // 2 minutes for security
      });
      return Response.json({ presignedUrl, key });
    }

    // ── Admin viewer path (15-minute URL) ─────────────────────────────────
    const uid = request.nextUrl.searchParams.get("uid")?.trim();
    if (!uid) {
      return Response.json(
        { error: "Missing uid query parameter or x-worker-uid header" },
        { status: 400 }
      );
    }

    const key = `faces/${uid}.jpg`;
    const presignedUrl = buildPresignedUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      key,
      method: "GET",
      expiresIn: 900, // 15 minutes for admin viewing
    });

    return Response.json({ presignedUrl, key });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// ── POST handler (worker upload) ──────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const uid = request.headers.get("x-worker-uid")?.trim();
    if (!uid) {
      return Response.json({ error: "Missing x-worker-uid header" }, { status: 401 });
    }

    const accountId       = requireEnv("R2_ACCOUNT_ID");
    const accessKeyId     = requireEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
    const bucketName      = requireEnv("R2_BUCKET_NAME");

    const key = `faces/${uid}.jpg`;

    const presignedUrl = buildPresignedUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      key,
      method: "PUT",
      expiresIn: 300, // 5 minutes
      contentType: "image/jpeg",
    });

    return Response.json({ presignedUrl, key });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
