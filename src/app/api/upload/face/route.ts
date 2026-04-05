/**
 * POST /api/upload/face
 *   Uploads the worker face photo to Cloudinary.
 *   The x-worker-uid request header identifies the worker.
 *
 * GET /api/upload/face?uid={uid}
 *   Returns the Cloudinary image URL for the worker face photo.
 *
 * Auth: reads uid from header (POST) or query param (GET).
 * In production you'd verify a real session cookie.
 */

import { NextRequest } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

// ── Env helpers ───────────────────────────────────────────────────────────────

type CloudinaryEnv = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function getCloudinaryEnv(): { values: CloudinaryEnv | null; missing: string[] } {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  const missing: string[] = [];
  if (!cloudName) {
    missing.push("CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  }
  if (!process.env.CLOUDINARY_API_KEY) {
    missing.push("CLOUDINARY_API_KEY");
  }
  if (!process.env.CLOUDINARY_API_SECRET) {
    missing.push("CLOUDINARY_API_SECRET");
  }

  if (missing.length > 0) {
    return { values: null, missing };
  }

  return {
    values: {
      cloudName: cloudName!,
      apiKey: process.env.CLOUDINARY_API_KEY!,
      apiSecret: process.env.CLOUDINARY_API_SECRET!,
    },
    missing: [],
  };
}

function configureCloudinary(env: CloudinaryEnv): void {
  cloudinary.config({
    cloud_name: env.cloudName,
    api_key: env.apiKey,
    api_secret: env.apiSecret,
    secure: true,
  });
}

function getFacePublicId(uid: string): string {
  return `faces/${uid}`;
}

async function uploadFaceBufferToCloudinary(buffer: Buffer, uid: string): Promise<{
  publicId: string;
  secureUrl: string;
}> {
  const publicId = getFacePublicId(uid);

  const uploadResult = await new Promise<any>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        invalidate: true,
        format: "jpg",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed."));
          return;
        }
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });

  return {
    publicId: uploadResult.public_id,
    secureUrl: uploadResult.secure_url,
  };
}

// ── GET handler (worker self-fetch OR admin photo viewer) ─────────────────────

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { values, missing } = getCloudinaryEnv();
    if (!values) {
      return Response.json(
        {
          code: "CLOUDINARY_ENV_MISSING",
          error: `Missing Cloudinary configuration: ${missing.join(", ")}`,
          missing,
          hint: "Set these variables in .env.local and restart the Next.js dev server.",
        },
        { status: 500 }
      );
    }
    configureCloudinary(values);

    const workerUid = request.headers.get("x-worker-uid")?.trim();
    const uid = request.nextUrl.searchParams.get("uid")?.trim();
    const resolvedUid = workerUid || uid;

    // Worker self-fetch can use header; admin viewer uses query param.
    if (!workerUid && !uid) {
      return Response.json(
        { error: "Missing uid query parameter or x-worker-uid header" },
        { status: 400 }
      );
    }

    if (!resolvedUid) {
      return Response.json({ error: "Missing uid" }, { status: 400 });
    }

    const publicId = getFacePublicId(resolvedUid);

    try {
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: "image",
        type: "upload",
      });

      return Response.json({
        key: resource.public_id,
        secureUrl: resource.secure_url,
        // Keep old response key for backward compatibility with existing UI.
        presignedUrl: resource.secure_url,
      });
    } catch (err) {
      const errorObj = err as { http_code?: number; message?: string };
      if (errorObj?.http_code === 404) {
        return Response.json(
          { error: "Face photo not found for this user." },
          { status: 404 }
        );
      }

      throw err;
    }
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

    const { values, missing } = getCloudinaryEnv();
    if (!values) {
      return Response.json(
        {
          code: "CLOUDINARY_ENV_MISSING",
          error: `Missing Cloudinary configuration: ${missing.join(", ")}`,
          missing,
          hint: "Set these variables in .env.local and restart the Next.js dev server.",
        },
        { status: 500 }
      );
    }
    configureCloudinary(values);

    const contentType = request.headers.get("content-type") ?? "";
    let imageBuffer: Buffer | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof Blob)) {
        return Response.json(
          { error: "Missing image file in form data. Expected field name 'file'." },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        return Response.json({ error: "Received empty image payload." }, { status: 400 });
      }
      imageBuffer = Buffer.from(arrayBuffer);
    }

    if (!imageBuffer) {
      const arrayBuffer = await request.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        imageBuffer = Buffer.from(arrayBuffer);
      }
    }

    if (!imageBuffer) {
      return Response.json(
        {
          error: "Missing image payload in request body.",
          hint: "Send multipart/form-data with a 'file' field or raw image bytes.",
          receivedContentType: contentType || "none",
        },
        { status: 400 }
      );
    }

    const upload = await uploadFaceBufferToCloudinary(imageBuffer, uid);

    return Response.json({
      key: upload.publicId,
      secureUrl: upload.secureUrl,
      // Keep old response key for backward compatibility with existing UI.
      presignedUrl: upload.secureUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
