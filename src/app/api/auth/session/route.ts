import { cookies } from "next/headers";
import { createSessionCookie } from "@/lib/session";

// ── Debug helpers (remove after fixing deployment) ─────────────────────────────
function diagAdminEnv() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  const keyPresent = !!rawKey && rawKey.length > 0;
  const keyLen = rawKey?.length ?? 0;

  // Check if the key starts & ends with the expected PEM markers
  const trimmed = rawKey?.trim() ?? "";
  const startsOk = trimmed.startsWith("-----BEGIN PRIVATE KEY-----");
  // After .replace(/\\n/g, "\n") the key should end with the marker
  const normalised = trimmed.replace(/\\n/g, "\n");
  const endsOk = normalised.trimEnd().endsWith("-----END PRIVATE KEY-----");

  // Check for double-escaping: literal \\n (four chars) still present after one replace pass?
  const hasDoubleEscape = normalised.includes("\\n");

  return {
    projectId: projectId ?? "(not set)",
    clientEmail: clientEmail ? `${clientEmail.slice(0, 12)}...` : "(not set)",
    keyPresent,
    keyLen,
    startsOk,
    endsOk,
    hasDoubleEscape,
  };
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

    const adminProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const decoded = decodeTokenPayload(idToken);

    // ── Debug: log diagnostics on every request (remove after fix) ──
    const diag = diagAdminEnv();
    console.log("[session] Admin env diagnostics:", JSON.stringify(diag));
    console.log("[session] Token aud:", decoded?.aud, "| Admin project:", adminProjectId);

    if (decoded?.aud && adminProjectId && decoded.aud !== adminProjectId) {
      console.error("[session] PROJECT MISMATCH:", { tokenAud: decoded.aud, adminProjectId });
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
    // ── Enhanced debug logging (remove after fixing deployment) ──────
    const detail = error instanceof Error ? error.message : "Unknown error";
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: string }).code
        : undefined;
    const errorInfo =
      error && typeof error === "object" && "errorInfo" in error
        ? (error as { errorInfo?: unknown }).errorInfo
        : undefined;

    console.error("[session] ❌ createSessionCookie FAILED");
    console.error("[session]   message:", detail);
    console.error("[session]   code:", errorCode ?? "(none)");
    console.error("[session]   errorInfo:", JSON.stringify(errorInfo ?? null));
    console.error("[session]   env diag:", JSON.stringify(diagAdminEnv()));
    console.error("[session]   full error:", error);

    return Response.json(
      {
        code: "INVALID_ID_TOKEN",
        error: "Unauthorized – invalid ID token",
        hint:
          "Verify Firebase Admin credentials and project IDs in deployment environment variables.",
        // Show detail in ALL environments temporarily for debugging
        detail,
        debugDiag: diagAdminEnv(),
      },
      { status: 401 }
    );
  }
}
