"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import FaceLivenessCheck from "@/components/onboarding/FaceLivenessCheck";
import {
  doc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaceReverificationModalProps {
  open: boolean;
  onClose: () => void;
  /** The claim document ID to update. */
  claimId: string;
  /** Worker's UID (used to fetch their stored face from R2). */
  uid: string;
  /** Existing confidence score on the claim (0–1). */
  currentConfidenceScore: number;
  /** Worker display name (for fraud signal denormalisation). */
  workerName: string;
}

type ModalPhase =
  | "liveness"      // showing the FaceLivenessCheck component
  | "processing"    // fetching stored face + calling Vision API
  | "success"       // similarity >= 0.75, identity confirmed
  | "mismatch"      // similarity < 0.75, face mismatch recorded
  | "error";        // network / api error

// ─── Vision API helpers ───────────────────────────────────────────────────────

interface VisionVertex { x?: number; y?: number }
interface VisionBoundingPoly { vertices?: VisionVertex[] }
interface VisionLandmark { type?: string; position?: { x: number; y: number; z: number } }
interface VisionFaceAnnotation {
  fdBoundingPoly?: VisionBoundingPoly;
  landmarks?: VisionLandmark[];
}
interface VisionResponse {
  faceAnnotations?: VisionFaceAnnotation[];
}

const LANDMARK_TYPES = [
  "LEFT_EYE",
  "RIGHT_EYE",
  "NOSE_TIP",
  "MOUTH_LEFT",
  "MOUTH_RIGHT",
] as const;

/**
 * Normalise a landmark's (x, y) position relative to its face bounding box.
 * Returns null if the bounding box is degenerate (zero area).
 */
function normalizeLandmark(
  lm: VisionLandmark,
  bbox: VisionBoundingPoly
): { x: number; y: number } | null {
  const verts = bbox.vertices ?? [];
  if (verts.length < 4) return null;

  const xs = verts.map((v) => v.x ?? 0);
  const ys = verts.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const w = maxX - minX;
  const h = maxY - minY;
  if (w === 0 || h === 0) return null;

  const pos = lm.position;
  if (!pos) return null;

  return {
    x: (pos.x - minX) / w,
    y: (pos.y - minY) / h,
  };
}

/**
 * Compute face similarity score (0–1) from two Vision API face annotations.
 *
 * Strategy:
 *  1. Extract the 5 key landmarks (eyes, nose, mouth corners).
 *  2. Normalise each to [0,1]² relative to its bounding box.
 *  3. Compute Euclidean distance between matching normalised landmarks.
 *  4. Average distances → similarity = 1 − (avgDist / MAX_POSSIBLE)
 *
 * MAX_POSSIBLE = sqrt(2) because normalised coords are in [0,1]²
 * so max Euclidean distance between two points is sqrt(2).
 */
function computeSimilarity(
  faceA: VisionFaceAnnotation,
  faceB: VisionFaceAnnotation
): number {
  const bboxA = faceA.fdBoundingPoly;
  const bboxB = faceB.fdBoundingPoly;
  if (!bboxA || !bboxB) return 0;

  const landmarksA = faceA.landmarks ?? [];
  const landmarksB = faceB.landmarks ?? [];

  const distances: number[] = [];

  for (const type of LANDMARK_TYPES) {
    const lmA = landmarksA.find((l) => l.type === type);
    const lmB = landmarksB.find((l) => l.type === type);
    if (!lmA || !lmB) continue;

    const nA = normalizeLandmark(lmA, bboxA);
    const nB = normalizeLandmark(lmB, bboxB);
    if (!nA || !nB) continue;

    const dx = nA.x - nB.x;
    const dy = nA.y - nB.y;
    distances.push(Math.sqrt(dx * dx + dy * dy));
  }

  if (distances.length === 0) return 0;

  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const MAX_POSSIBLE = Math.SQRT2; // max Euclidean in [0,1]²
  return Math.max(0, 1 - avgDist / MAX_POSSIBLE);
}

// ─── Blob → base64 ────────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URI prefix (e.g. "data:image/jpeg;base64,")
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function updateClaimDoc(
  claimId: string,
  fields: Record<string, unknown>
) {
  const ref = doc(db, "claims", claimId);
  await updateDoc(ref, { ...fields, updatedAt: serverTimestamp() });
}

async function createFraudSignalDoc(fields: Record<string, unknown>) {
  const ref = collection(db, "fraudSignals");
  await addDoc(ref, {
    ...fields,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FaceReverificationModal({
  open,
  onClose,
  claimId,
  uid,
  currentConfidenceScore,
  workerName,
}: FaceReverificationModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("liveness");
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // ── Liveness success → compare faces ─────────────────────────────────────

  const handleLivenessSuccess = useCallback(
    async (newFaceBlob: Blob) => {
      setPhase("processing");

      try {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
        if (!apiKey) {
          throw new Error(
            "NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY is not configured."
          );
        }

        // ── a. Fetch stored onboarding face from R2 via our API ────────────
        const faceUrlRes = await fetch("/api/upload/face", {
          method: "GET",
          headers: { "x-worker-uid": uid },
        });
        if (!faceUrlRes.ok) {
          throw new Error("Could not retrieve stored face photo.");
        }
        const { presignedUrl } = await faceUrlRes.json();

        const storedFaceRes = await fetch(presignedUrl);
        if (!storedFaceRes.ok) {
          throw new Error("Could not download stored face photo from storage.");
        }
        const storedFaceBlob = await storedFaceRes.blob();

        // ── b. Convert both images to base64 ──────────────────────────────
        const [storedBase64, newBase64] = await Promise.all([
          blobToBase64(storedFaceBlob),
          blobToBase64(newFaceBlob),
        ]);

        // ── c. Call Google Cloud Vision API ───────────────────────────────
        const visionRes = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requests: [
                {
                  image: { content: storedBase64 },
                  features: [{ type: "FACE_DETECTION" }],
                },
                {
                  image: { content: newBase64 },
                  features: [{ type: "FACE_DETECTION" }],
                },
              ],
            }),
          }
        );

        if (!visionRes.ok) {
          const errBody = await visionRes.text();
          throw new Error(`Vision API error: ${errBody}`);
        }

        const visionData = await visionRes.json();
        const responses: VisionResponse[] = visionData.responses ?? [];

        const faceA = responses[0]?.faceAnnotations?.[0];
        const faceB = responses[1]?.faceAnnotations?.[0];

        if (!faceA || !faceB) {
          throw new Error(
            "Face not detected in one or both images. Please ensure good lighting and try again."
          );
        }

        // ── d. Compare face landmark positions ────────────────────────────
        const score = computeSimilarity(faceA, faceB);
        setSimilarityScore(score);

        const SIMILARITY_THRESHOLD = 0.75;

        // ── e. Update Firestore based on similarity ────────────────────────
        if (score >= SIMILARITY_THRESHOLD) {
          const newConfidence = Math.min(currentConfidenceScore + 0.15, 1.0);
          const updates: Record<string, unknown> = {
            face_reverified: true,
            face_similarity_score: score,
            confidence_score: newConfidence,
          };

          if (newConfidence >= 0.75) {
            updates.status = "auto_approved";
          }

          await updateClaimDoc(claimId, updates);
          setPhase("success");
        } else {
          await updateClaimDoc(claimId, {
            face_mismatch: true,
            face_similarity_score: score,
          });

          await createFraudSignalDoc({
            type: "face_mismatch",
            signalType: "Face Mismatch",
            claim_id: claimId,
            claimId,
            worker_id: uid,
            workerId: uid,
            workerName,
            similarity_score: score,
            severity: "high",
            status: "open",
            details: `Face re-verification failed. Similarity score: ${(
              score * 100
            ).toFixed(1)}%. The identity check could not confirm a match between the stored onboarding photo and the new liveness capture.`,
          });

          setPhase("mismatch");
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setErrorMsg(msg);
        setPhase("error");
      }
    },
    [claimId, uid, currentConfidenceScore, workerName]
  );

  const handleClose = () => {
    setPhase("liveness");
    setSimilarityScore(null);
    setErrorMsg("");
    onClose();
  };

  const handleRetry = () => {
    setPhase("liveness");
    setSimilarityScore(null);
    setErrorMsg("");
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              background: "rgba(0,0,0,0.72)",
              backdropFilter: "blur(6px)",
            }}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 51,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              padding: "16px",
            }}
          >
            <div
              style={{
                pointerEvents: "auto",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "20px",
                width: "100%",
                maxWidth: "420px",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "24px",
                position: "relative",
                boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              }}
            >
              {/* Close */}
              <button
                onClick={handleClose}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "6px",
                  cursor: "pointer",
                  color: "var(--muted-foreground)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>

              {/* Title */}
              <h2
                style={{
                  margin: "0 0 4px",
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "var(--foreground)",
                  fontFamily: "var(--font-outfit, 'Inter', sans-serif)",
                }}
              >
                Quick Identity Check
              </h2>
              <p
                style={{
                  margin: "0 0 20px",
                  fontSize: "13px",
                  color: "var(--muted-foreground)",
                }}
              >
                Complete the liveness steps to boost your claim confidence.
              </p>

              {/* ── Phase: liveness ── */}
              {phase === "liveness" && (
                <FaceLivenessCheck
                  onSuccess={handleLivenessSuccess}
                  onFailure={(reason) => {
                    setErrorMsg(reason);
                    setPhase("error");
                  }}
                  onRetry={handleRetry}
                />
              )}

              {/* ── Phase: processing ── */}
              {phase === "processing" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "16px",
                    padding: "32px 0",
                  }}
                >
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "50%",
                      background: "rgba(139,92,246,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Loader2
                      size={32}
                      style={{
                        color: "#8b5cf6",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                  </div>
                  <p
                    style={{
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "15px",
                      margin: 0,
                    }}
                  >
                    Comparing your face…
                  </p>
                  <p
                    style={{ color: "var(--muted-foreground)", fontSize: "13px", margin: 0, textAlign: "center" }}
                  >
                    Analysing identity landmarks against your onboarding photo.
                  </p>
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {/* ── Phase: success ── */}
              {phase === "success" && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "16px",
                    padding: "32px 0",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      background: "rgba(34,197,94,0.12)",
                      border: "2px solid rgba(34,197,94,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ShieldCheck size={36} style={{ color: "#22c55e" }} />
                  </div>
                  <p
                    style={{
                      color: "#22c55e",
                      fontWeight: 700,
                      fontSize: "17px",
                      margin: 0,
                    }}
                  >
                    Identity confirmed!
                  </p>
                  <p style={{ color: "var(--foreground)", fontSize: "14px", margin: 0 }}>
                    Your claim has been approved. Payout will be initiated
                    shortly.
                  </p>
                  {similarityScore !== null && (
                    <div
                      style={{
                        background: "rgba(34,197,94,0.08)",
                        border: "1px solid rgba(34,197,94,0.2)",
                        borderRadius: "12px",
                        padding: "10px 20px",
                        fontSize: "13px",
                        color: "#22c55e",
                      }}
                    >
                      Face match:{" "}
                      <strong>{(similarityScore * 100).toFixed(1)}%</strong>
                    </div>
                  )}
                  <button
                    onClick={handleClose}
                    style={{
                      marginTop: "8px",
                      padding: "12px 32px",
                      background:
                        "linear-gradient(135deg, #22c55e, #16a34a)",
                      border: "none",
                      borderRadius: "12px",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "15px",
                      cursor: "pointer",
                    }}
                  >
                    Done
                  </button>
                </motion.div>
              )}

              {/* ── Phase: mismatch ── */}
              {phase === "mismatch" && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "16px",
                    padding: "32px 0",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      background: "rgba(249,115,22,0.12)",
                      border: "2px solid rgba(249,115,22,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AlertTriangle size={36} style={{ color: "#f97316" }} />
                  </div>
                  <p
                    style={{
                      color: "#f97316",
                      fontWeight: 700,
                      fontSize: "17px",
                      margin: 0,
                    }}
                  >
                    Face match failed
                  </p>
                  <p
                    style={{
                      color: "var(--muted-foreground)",
                      fontSize: "14px",
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    We couldn&apos;t match your face. An admin will review your
                    claim within 24 hours.
                  </p>
                  {similarityScore !== null && (
                    <div
                      style={{
                        background: "rgba(249,115,22,0.08)",
                        border: "1px solid rgba(249,115,22,0.2)",
                        borderRadius: "12px",
                        padding: "10px 20px",
                        fontSize: "13px",
                        color: "#f97316",
                      }}
                    >
                      Similarity:{" "}
                      <strong>{(similarityScore * 100).toFixed(1)}%</strong>{" "}
                      (below 75% threshold)
                    </div>
                  )}
                  <button
                    onClick={handleClose}
                    style={{
                      marginTop: "8px",
                      padding: "12px 32px",
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "15px",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </motion.div>
              )}

              {/* ── Phase: error ── */}
              {phase === "error" && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "16px",
                    padding: "32px 0",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      background: "rgba(239,68,68,0.12)",
                      border: "2px solid rgba(239,68,68,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AlertTriangle size={36} style={{ color: "#ef4444" }} />
                  </div>
                  <p
                    style={{
                      color: "#ef4444",
                      fontWeight: 700,
                      fontSize: "17px",
                      margin: 0,
                    }}
                  >
                    Something went wrong
                  </p>
                  {errorMsg && (
                    <p
                      style={{
                        color: "var(--muted-foreground)",
                        fontSize: "13px",
                        margin: 0,
                        maxWidth: "320px",
                        lineHeight: 1.5,
                      }}
                    >
                      {errorMsg}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={handleRetry}
                      style={{
                        padding: "12px 24px",
                        background:
                          "linear-gradient(135deg, #6c5ce7, #8b5cf6)",
                        border: "none",
                        borderRadius: "12px",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "14px",
                        cursor: "pointer",
                      }}
                    >
                      Try Again
                    </button>
                    <button
                      onClick={handleClose}
                      style={{
                        padding: "12px 24px",
                        background: "var(--muted)",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        color: "var(--foreground)",
                        fontWeight: 600,
                        fontSize: "14px",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
