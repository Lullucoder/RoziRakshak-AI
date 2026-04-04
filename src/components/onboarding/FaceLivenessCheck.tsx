"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaceLivenessCheckProps {
  onSuccess: (capturedImageBlob: Blob) => void;
  onFailure: (reason: string) => void;
  onRetry: () => void;
}

type Step = 1 | 2 | 3;
type StepStatus = "waiting" | "detecting" | "passed";
type BorderState = "gray" | "blue" | "green";

interface StepState {
  status: StepStatus;
  label: string;
  subLabel?: string;
}

// ─── Landmark helpers ─────────────────────────────────────────────────────────

type Point = { x: number; y: number; z?: number };

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function ear(p1: Point, p2: Point, p3: Point, p4: Point, p5: Point, p6: Point): number {
  // EAR = (dist(p2,p6) + dist(p3,p5)) / (2 * dist(p1,p4))
  return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_TIMEOUT_MS = 15_000;
const COUNTDOWN_START_MS = 8_000;
const STRAIGHT_HOLD_MS = 1_500;
const TURN_HOLD_MS = 1_000;
const EAR_THRESHOLD = 0.2;
const TURN_ANGLE_DEG = 15;
const FRAME_SIZE = 320;

// ─── Component ────────────────────────────────────────────────────────────────

export default function FaceLivenessCheck({
  onSuccess,
  onFailure,
  onRetry,
}: FaceLivenessCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // overlay (hidden, kept for future use)
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const stepStartRef = useRef<number>(Date.now());
  const straightHoldStartRef = useRef<number | null>(null);
  const turnHoldStartRef = useRef<number | null>(null);
  const blinkCountRef = useRef<number>(0);
  const eyeClosedRef = useRef<boolean>(false);
  const doneRef = useRef<boolean>(false);

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [stepStatuses, setStepStatuses] = useState<[StepStatus, StepStatus, StepStatus]>([
    "detecting",
    "waiting",
    "waiting",
  ]);
  const [borderState, setBorderState] = useState<BorderState>("blue");
  const [blinkCount, setBlinkCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [livenessDone, setLivenessDone] = useState(false);

  const stepLabels: Record<Step, string> = {
    1: "Look straight at the camera",
    2: "Blink twice slowly",
    3: "Turn your head slightly to the left",
  };

  // ─── Camera setup ──────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const captureAndFinish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    const video = videoRef.current;
    if (!video) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = FRAME_SIZE;
    offscreen.height = FRAME_SIZE;
    const ctx = offscreen.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, FRAME_SIZE, FRAME_SIZE);
    }

    stopCamera();

    offscreen.toBlob(
      (blob) => {
        if (blob) onSuccess(blob);
        else onFailure("Failed to capture image from video.");
      },
      "image/jpeg",
      0.85
    );
  }, [onSuccess, onFailure, stopCamera]);

  // ─── Step transition ───────────────────────────────────────────────────────

  const advanceStep = useCallback(
    (fromStep: Step) => {
      const nextStep = (fromStep + 1) as Step;

      setStepStatuses((prev) => {
        const updated = [...prev] as [StepStatus, StepStatus, StepStatus];
        updated[fromStep - 1] = "passed";
        if (nextStep <= 3) updated[nextStep - 1] = "detecting";
        return updated;
      });
      setBorderState("green");

      if (nextStep > 3) {
        // All done
        setLivenessDone(true);
        setTimeout(() => {
          captureAndFinish();
        }, 1000);
        return;
      }

      setTimeout(() => {
        setCurrentStep(nextStep);
        setBorderState("blue");
        stepStartRef.current = Date.now();
        setCountdown(null);
        setTimedOut(false);
        // Reset step-local refs
        straightHoldStartRef.current = null;
        turnHoldStartRef.current = null;
        blinkCountRef.current = 0;
        eyeClosedRef.current = false;
        setBlinkCount(0);
      }, 600);
    },
    [captureAndFinish]
  );

  // ─── Liveness detection loop ───────────────────────────────────────────────

  const processResults = useCallback(
    (results: any, step: Step) => {
      if (doneRef.current) return;
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

      const lm = results.multiFaceLandmarks[0]; // array of {x,y,z}

      const now = Date.now();
      const elapsed = now - stepStartRef.current;

      // ── Countdown ──
      if (elapsed >= COUNTDOWN_START_MS) {
        const remaining = Math.ceil((STEP_TIMEOUT_MS - elapsed) / 1000);
        setCountdown(remaining > 0 ? remaining : 0);
      }

      // ── Timeout ──
      if (elapsed >= STEP_TIMEOUT_MS) {
        setTimedOut(true);
        setBorderState("gray");
        stopCamera();
        return;
      }

      if (step === 1) {
        // Landmark 1 = nose tip (normalised 0–1)
        const nose = lm[1];
        const inCenterX = nose.x >= 0.3 && nose.x <= 0.7;
        const inCenterY = nose.y >= 0.3 && nose.y <= 0.7;

        if (inCenterX && inCenterY) {
          if (!straightHoldStartRef.current) straightHoldStartRef.current = now;
          if (now - straightHoldStartRef.current >= STRAIGHT_HOLD_MS) {
            advanceStep(1);
          }
        } else {
          straightHoldStartRef.current = null;
        }
      } else if (step === 2) {
        // Left eye: 159, 145, 133, 160, 144, 153
        const le = [lm[159], lm[145], lm[133], lm[160], lm[144], lm[153]];
        // Right eye: 386, 374, 362, 387, 373, 380
        const re = [lm[386], lm[374], lm[362], lm[387], lm[373], lm[380]];

        const leftEAR = ear(le[2], le[0], le[1], le[5], le[4], le[3]);
        const rightEAR = ear(re[2], re[0], re[1], re[5], re[4], re[3]);
        const avgEAR = (leftEAR + rightEAR) / 2;

        if (avgEAR < EAR_THRESHOLD) {
          if (!eyeClosedRef.current) {
            eyeClosedRef.current = true;
          }
        } else {
          if (eyeClosedRef.current) {
            // Eyes opened back — count as one blink
            eyeClosedRef.current = false;
            blinkCountRef.current += 1;
            setBlinkCount(blinkCountRef.current);
            if (blinkCountRef.current >= 2) {
              advanceStep(2);
            }
          }
        }
      } else if (step === 3) {
        // Nose tip: 1, Left cheek: 234, Right cheek: 454
        const nose = lm[1];
        const leftCheek = lm[234];
        const rightCheek = lm[454];

        // Mid-point of cheeks
        const midX = (leftCheek.x + rightCheek.x) / 2;
        // If nose is to the LEFT of mid (lower x in normalised space = more left-turned)
        const faceWidth = dist(leftCheek, rightCheek);
        const offset = (midX - nose.x) / (faceWidth || 1); // positive = nose left of centre
        // Approx angle: offset * 90 gives degrees (rough)
        const angleDeg = offset * 90;

        if (angleDeg >= TURN_ANGLE_DEG) {
          if (!turnHoldStartRef.current) turnHoldStartRef.current = now;
          if (now - turnHoldStartRef.current >= TURN_HOLD_MS) {
            advanceStep(3);
          }
        } else {
          turnHoldStartRef.current = null;
        }
      }
    },
    [advanceStep, stopCamera]
  );

  // ─── Init MediaPipe + camera ───────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: FRAME_SIZE, height: FRAME_SIZE, facingMode: "user" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (!cancelled) setCameraError(true);
        return;
      }

      // Dynamically import MediaPipe so it only runs client-side
      const { FaceMesh } = await import("@mediapipe/face_mesh");

      const faceMesh = new FaceMesh({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMeshRef.current = faceMesh;

      // We drive inference manually via rAF
      const video = videoRef.current!;

      async function loop() {
        if (cancelled || doneRef.current) return;
        if (video.readyState >= 2) {
          // Read currentStep from a ref to avoid stale closure
          await faceMeshRef.current?.send({ image: video });
        }
        rafRef.current = requestAnimationFrame(loop);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    init();

    return () => {
      cancelled = true;
      stopCamera();
      faceMeshRef.current?.close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire onResults every time currentStep changes so the closure has fresh step
  useEffect(() => {
    if (!faceMeshRef.current) return;
    faceMeshRef.current.onResults((results: any) => {
      processResults(results, currentStep);
    });
  }, [currentStep, processResults]);

  // ─── Restart ───────────────────────────────────────────────────────────────

  const handleRetry = () => {
    stopCamera();
    doneRef.current = false;
    blinkCountRef.current = 0;
    eyeClosedRef.current = false;
    straightHoldStartRef.current = null;
    turnHoldStartRef.current = null;
    setCurrentStep(1);
    setStepStatuses(["detecting", "waiting", "waiting"]);
    setBorderState("blue");
    setBlinkCount(0);
    setCountdown(null);
    setTimedOut(false);
    setCameraError(false);
    setLivenessDone(false);
    stepStartRef.current = Date.now();
    onRetry();
  };

  // ─── Derived UI state ──────────────────────────────────────────────────────

  const borderColor =
    borderState === "green"
      ? "#22c55e"
      : borderState === "blue"
      ? "#3b82f6"
      : "#6b7280";

  const borderAnimation =
    borderState === "blue" ? "liveness-pulse 1.6s ease-in-out infinite" : "none";

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes liveness-pulse {
          0%, 100% { box-shadow: 0 0 0 0px ${borderColor}66, 0 0 0 4px ${borderColor}33; }
          50% { box-shadow: 0 0 0 8px ${borderColor}44, 0 0 0 16px ${borderColor}18; }
        }
        @keyframes liveness-fadein {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes liveness-confirmed {
          0%   { opacity: 0; transform: translateY(8px); }
          20%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .liveness-check-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #22c55e;
          color: #fff;
          font-size: 12px;
          margin-left: 8px;
          animation: liveness-fadein 0.35s ease forwards;
          flex-shrink: 0;
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px",
          padding: "8px 0",
          fontFamily: "'Inter', system-ui, sans-serif",
          userSelect: "none",
        }}
      >
        {/* ── Small tag ── */}
        <p
          style={{
            fontSize: "12px",
            color: "var(--muted-foreground)",
            letterSpacing: "0.04em",
            margin: 0,
          }}
        >
          🔒 Checking for real human presence
        </p>

        {/* ── Current instruction ── */}
        {!cameraError && !livenessDone && (
          <p
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--foreground)",
              margin: 0,
              textAlign: "center",
              minHeight: "28px",
            }}
          >
            {timedOut ? "Having trouble? Make sure your face is well lit" : stepLabels[currentStep]}
          </p>
        )}

        {livenessDone && (
          <p
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#22c55e",
              margin: 0,
              textAlign: "center",
              animation: "liveness-confirmed 1s ease forwards",
            }}
          >
            ✅ Liveness Confirmed
          </p>
        )}

        {cameraError && (
          <p
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#dc2626",
              margin: 0,
              textAlign: "center",
            }}
          >
            Camera access is required for identity verification
          </p>
        )}

        {/* ── Video frame ── */}
        <div
          style={{
            position: "relative",
            width: `${FRAME_SIZE}px`,
            height: `${FRAME_SIZE}px`,
            borderRadius: "20px",
            overflow: "hidden",
            border: `3px solid ${borderColor}`,
            transition: "border-color 0.4s ease",
            animation: borderAnimation,
            background: "#0f172a",
            flexShrink: 0,
          }}
        >
          <video
            ref={videoRef}
            width={FRAME_SIZE}
            height={FRAME_SIZE}
            muted
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)", // mirror
              display: cameraError ? "none" : "block",
            }}
          />

          {/* Hidden overlay canvas (kept for extensibility) */}
          <canvas
            ref={canvasRef}
            width={FRAME_SIZE}
            height={FRAME_SIZE}
            style={{ display: "none" }}
          />

          {/* Countdown overlay */}
          {countdown !== null && !timedOut && (
            <div
              style={{
                position: "absolute",
                bottom: "12px",
                right: "12px",
                background: "rgba(0,0,0,0.55)",
                color: countdown <= 3 ? "#f87171" : "#fbbf24",
                borderRadius: "8px",
                padding: "4px 10px",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              {countdown}s
            </div>
          )}

          {/* Camera error placeholder */}
          {cameraError && (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                fontSize: "14px",
                textAlign: "center",
                padding: "24px",
              }}
            >
              📷
            </div>
          )}
        </div>

        {/* ── Blink counter (step 2 only) ── */}
        {currentStep === 2 && !timedOut && !livenessDone && (
          <p
            style={{
              fontSize: "14px",
              color: "var(--muted-foreground)",
              margin: 0,
              fontWeight: 600,
            }}
          >
            Blinks detected:{" "}
            <span style={{ color: "#3b82f6" }}>
              {blinkCount}/2
            </span>
          </p>
        )}

        {/* ── Progress dots ── */}
        {!cameraError && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {([1, 2, 3] as Step[]).map((s) => {
              const status = stepStatuses[s - 1];
              return (
                <div
                  key={s}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                    color: status === "passed" ? "#22c55e" : status === "detecting" ? "#3b82f6" : "#cbd5e1",
                    fontWeight: status !== "waiting" ? 600 : 400,
                    transition: "color 0.3s ease",
                  }}
                >
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      background:
                        status === "passed"
                          ? "#22c55e"
                          : status === "detecting"
                          ? "#3b82f6"
                          : "#e2e8f0",
                      transition: "background 0.3s ease",
                      flexShrink: 0,
                    }}
                  />
                  <span>{stepLabels[s]}</span>
                  {status === "passed" && (
                    <span className="liveness-check-mark">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Camera error message ── */}
        {cameraError && (
          <p
            style={{
              fontSize: "14px",
              color: "var(--muted-foreground)",
              textAlign: "center",
              maxWidth: "300px",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Camera access is required for identity verification.
            <br />
            Please allow camera access in your browser settings and try again.
          </p>
        )}

        {/* ── Retry / Try Again button ── */}
        {(timedOut || cameraError) && (
          <button
            onClick={handleRetry}
            style={{
              marginTop: "4px",
              padding: "10px 28px",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "15px",
              cursor: "pointer",
              letterSpacing: "0.02em",
              boxShadow: "0 4px 14px #3b82f640",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.opacity = "0.85")}
            onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.opacity = "1")}
          >
            Try Again
          </button>
        )}
      </div>
    </>
  );
}
