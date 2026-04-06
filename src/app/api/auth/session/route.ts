import { cookies } from "next/headers";
import { createSessionCookie } from "@/lib/session";

function sanitizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getFirebaseErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";

  const byCode = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (byCode) return byCode;

  const info = "errorInfo" in error ? (error as { errorInfo?: unknown }).errorInfo : undefined;
  if (info && typeof info === "object" && "code" in info) {
    return String((info as { code?: unknown }).code ?? "");
  }

  return "";
}

function isAdminConfigError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error).toLowerCase();
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();

  return (
    code.includes("invalid-credential") ||
    code.includes("app/invalid-credential") ||
    message.includes("private key") ||
    message.includes("service account") ||
    message.includes("credential")
  );
}

type DecodedTokenPayload = {
  aud?: string;
  iss?: string;
  sub?: string;
};

function decodeTokenPayload(token: string): DecodedTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64Url = parts[1]!;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as DecodedTokenPayload;
  } catch {
    return null;
  }
}

/**
 * POST /api/auth/session
 *
 * Accepts a Firebase ID token from the client, creates a server-side
 * session cookie, and sets it as an httpOnly cookie on the response.
 */
export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };

    if (!idToken) {
      return Response.json(
        { error: "Missing idToken in request body" },
        { status: 400 }
      );
    }

    const adminProjectId = sanitizeEnvValue(process.env.FIREBASE_ADMIN_PROJECT_ID);
    const decoded = decodeTokenPayload(idToken);

    if (decoded?.aud && adminProjectId && decoded.aud !== adminProjectId) {
      return Response.json(
        {
          code: "PROJECT_MISMATCH",
          error:
            "Firebase project mismatch between client ID token and Admin SDK credentials.",
          tokenProjectId: decoded.aud,
          adminProjectId,
          hint:
            "Ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID and FIREBASE_ADMIN_PROJECT_ID point to the same Firebase project in this deployment.",
        },
        { status: 401 }
      );
    }

    // Create a Firebase session cookie (7-day expiry)
    const sessionCookie = await createSessionCookie(idToken);

    // Set the cookie via Next.js cookies() API
    const cookieStore = await cookies();
    cookieStore.set("session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
      path: "/",
    });

    return Response.json({ status: "success" }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    const firebaseCode = getFirebaseErrorCode(error);

    console.error("Failed to create session:", {
      message: detail,
      firebaseCode: firebaseCode || undefined,
    });

    if (isAdminConfigError(error)) {
      return Response.json(
        {
          code: "ADMIN_SDK_CONFIG_ERROR",
          error: "Server auth configuration error",
          hint:
            "Check FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in deployment environment variables. In Vercel, either paste the full multiline PEM (BEGIN/END lines included) or a single-line value with literal \\n escapes.",
          detail: process.env.NODE_ENV === "development" ? detail : undefined,
        },
        { status: 500 }
      );
    }

    return Response.json(
      {
        code: "INVALID_ID_TOKEN",
        error: "Unauthorized – invalid ID token",
        hint:
          "Verify Firebase Admin credentials and project IDs in deployment environment variables.",
        detail: process.env.NODE_ENV === "development" ? detail : undefined,
      },
      { status: 401 }
    );
  }
}
