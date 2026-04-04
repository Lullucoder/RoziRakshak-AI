"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  MapPin,
  Smartphone,
  Zap,
  Users,
  Shield,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ScanFace,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaceReverification {
  face_reverified?: boolean;
  face_mismatch?: boolean;
  face_similarity_score?: number;
  /** Presigned URL to the stored onboarding face (for admin view). */
  stored_face_url?: string;
  /** Presigned URL to the liveness capture used during re-verification. */
  new_face_url?: string;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const fraudAlerts = [
  {
    id: "fs_001",
    worker: "Suresh P.",
    workerId: "worker-002",
    type: "GPS-WiFi Mismatch",
    severity: "high",
    icon: MapPin,
    details:
      "GPS reports Koramangala zone but device connected to home WiFi (Jayanagar). Cell tower registration inconsistent.",
    date: "18 Mar, 20:32",
    status: "investigating",
    face: {
      face_reverified: true,
      face_similarity_score: 0.87,
      // In a real app these would be freshly-generated presigned R2 URLs:
      stored_face_url: undefined,
      new_face_url: undefined,
    } as FaceReverification,
  },
  {
    id: "fs_002",
    worker: "Vikram T.",
    workerId: "worker-003",
    type: "Impossible Speed",
    severity: "critical",
    icon: Zap,
    details:
      "GPS showed transit from HSR Layout to Whitefield (28km) in 4 minutes. Speed: 420 km/h. GPS teleportation detected.",
    date: "19 Mar, 14:20",
    status: "open",
    face: {
      face_mismatch: true,
      face_similarity_score: 0.41,
      stored_face_url: undefined,
      new_face_url: undefined,
    } as FaceReverification,
  },
  {
    id: "fs_003",
    worker: "Amit G.",
    workerId: "worker-004",
    type: "Device Fingerprint Collision",
    severity: "medium",
    icon: Users,
    details:
      "Same device fingerprint found across 3 worker accounts (w_007, w_012, w_018). Possible syndicate activity.",
    date: "17 Mar, 09:15",
    status: "investigating",
    face: {} as FaceReverification, // no face check yet
  },
  {
    id: "fs_004",
    worker: "Ravi K.",
    workerId: "worker-005",
    type: "Emulator Detected",
    severity: "critical",
    icon: Smartphone,
    details:
      "Claim submitted from Android emulator. Device model: 'sdk_gphone64_x86_64'. No physical device.",
    date: "19 Mar, 22:00",
    status: "open",
    face: {} as FaceReverification,
  },
];

// ─── Style maps ───────────────────────────────────────────────────────────────

const severityConfig: Record<string, { class: string; bg: string }> = {
  low: { class: "severity-low", bg: "rgba(16,185,129,0.1)" },
  medium: { class: "severity-medium", bg: "rgba(245,158,11,0.1)" },
  high: { class: "severity-high", bg: "rgba(249,115,22,0.1)" },
  critical: { class: "severity-critical", bg: "rgba(239,68,68,0.1)" },
};

const statusBg: Record<string, string> = {
  open: "status-held",
  investigating: "status-reviewing",
  resolved: "status-approved",
  dismissed: "text-muted-foreground bg-muted",
};

// ─── Sub-component: Face verification panel ───────────────────────────────────

function FaceVerificationPanel({
  workerId,
  face,
}: {
  workerId: string;
  face: FaceReverification;
}) {
  const [expanded, setExpanded] = useState(false);

  // Determine badge to show
  const hasVerification =
    face.face_reverified === true || face.face_mismatch === true;
  if (!hasVerification) return null;

  const isMatch = face.face_reverified === true;
  const score = face.face_similarity_score;

  return (
    <div
      className="mt-3 rounded-xl overflow-hidden"
      style={{
        background: isMatch
          ? "rgba(34,197,94,0.06)"
          : "rgba(239,68,68,0.06)",
        border: `1px solid ${isMatch ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
      }}
    >
      {/* Summary row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
      >
        <div className="flex items-center gap-2">
          <ScanFace
            className="w-4 h-4 flex-shrink-0"
            style={{ color: isMatch ? "#22c55e" : "#ef4444" }}
          />
          {isMatch ? (
            <div className="flex items-center gap-1.5">
              <span
                className="text-xs font-bold flex items-center gap-1"
                style={{ color: "#22c55e" }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Face Verified
              </span>
              {score !== undefined && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(34,197,94,0.15)",
                    color: "#22c55e",
                  }}
                >
                  Match: {(score * 100).toFixed(0)}%
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                className="text-xs font-bold flex items-center gap-1"
                style={{ color: "#ef4444" }}
              >
                <XCircle className="w-3.5 h-3.5" />
                Face Mismatch
              </span>
              {score !== undefined && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(239,68,68,0.15)",
                    color: "#ef4444",
                  }}
                >
                  Match: {(score * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ color: "#8b8d9b" }}>
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expanded — side-by-side photos */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="px-3 pb-3"
          >
            <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">
              Identity Photo Comparison
            </p>
            <div className="grid grid-cols-2 gap-2">
              {/* Stored (onboarding) face */}
              <FacePhotoSlot
                label="Onboarding Photo"
                url={face.stored_face_url}
                fallbackAlt="Stored onboarding face"
                onLoad={() => {
                  // In production, call GET /api/upload/face?uid={workerId}
                  // here to load the admin presigned URL
                }}
                workerId={workerId}
                kind="stored"
              />
              {/* New (reverification) face */}
              <FacePhotoSlot
                label="Re-verification Capture"
                url={face.new_face_url}
                fallbackAlt="New liveness capture"
                onLoad={() => {}}
                workerId={workerId}
                kind="new"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              {isMatch
                ? `Vision API detected a ${(score! * 100).toFixed(1)}% face landmark match — above the 75% threshold. Identity confirmed.`
                : `Vision API detected only a ${(score! * 100).toFixed(1)}% match — below the 75% threshold. Manual review advised.`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-component: Individual face photo slot ────────────────────────────────

function FacePhotoSlot({
  label,
  url,
  fallbackAlt,
  workerId,
  kind,
}: {
  label: string;
  url?: string;
  fallbackAlt: string;
  onLoad: () => void;
  workerId: string;
  kind: "stored" | "new";
}) {
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>(url);
  const [loading, setLoading] = useState(false);

  const fetchStoredFace = async () => {
    if (kind !== "stored" || loadedUrl) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/upload/face?uid=${workerId}`);
      if (res.ok) {
        const data = await res.json();
        setLoadedUrl(data.presignedUrl);
      }
    } catch {
      // fail silently — placeholder stays
    } finally {
      setLoading(false);
    }
  };

  // Attempt to load the stored face when this slot mounts (stored kind only)
  React.useEffect(() => {
    if (kind === "stored" && !loadedUrl) {
      fetchStoredFace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <p
        className="text-[10px] font-semibold text-muted-foreground mb-1"
        style={{ textAlign: "center" }}
      >
        {label}
      </p>
      <div
        className="rounded-lg overflow-hidden flex items-center justify-center"
        style={{
          aspectRatio: "1",
          background: "#14141e",
          border: "1px solid #2d2e3f",
        }}
      >
        {loading ? (
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              border: "2px solid #8b5cf6",
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
            }}
          />
        ) : loadedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={loadedUrl}
            alt={fallbackAlt}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              color: "#8b8d9b",
            }}
          >
            <ImageIcon className="w-6 h-6" />
            <span style={{ fontSize: "10px" }}>
              {kind === "stored" ? "Not available" : "Not captured"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FraudPage() {
  return (
    <div className="p-6 lg:p-8">
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div className="flex items-center gap-3 mb-1">
        <AlertTriangle className="w-6 h-6 text-warning" />
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "var(--font-outfit)" }}
        >
          Fraud <span className="gradient-text">Alerts</span>
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        AI-detected anomalies across the anti-spoofing defense layers
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Open", count: 2, color: "#f97316" },
          { label: "Investigating", count: 2, color: "#6c5ce7" },
          { label: "Resolved", count: 0, color: "#10b981" },
          { label: "Dismissed", count: 0, color: "#888899" },
        ].map((item) => (
          <div key={item.label} className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            <p className="text-2xl font-bold" style={{ color: item.color }}>
              {item.count}
            </p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div className="space-y-4">
        {fraudAlerts.map((alert, i) => {
          const sev = severityConfig[alert.severity];
          return (
            <motion.div
              key={alert.id}
              className="glass rounded-2xl p-5 hover:border-[rgba(108,92,231,0.3)] border border-transparent transition-all cursor-pointer"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: sev.bg }}
                >
                  <alert.icon className={`w-5 h-5 ${sev.class}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <h3 className="font-semibold text-sm">{alert.type}</h3>
                      <p className="text-xs text-muted-foreground">
                        Worker:{" "}
                        <strong className="text-foreground">
                          {alert.worker}
                        </strong>{" "}
                        · {alert.date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${sev.class}`}
                        style={{ backgroundColor: sev.bg }}
                      >
                        {alert.severity}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBg[alert.status]}`}
                      >
                        {alert.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {alert.details}
                  </p>

                  {/* Face verification panel */}
                  <FaceVerificationPanel
                    workerId={alert.workerId}
                    face={alert.face}
                  />

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() =>
                        toast.success(
                          `Investigation started for ${alert.worker}`
                        )
                      }
                      className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Investigate
                    </button>
                    <button
                      onClick={() =>
                        toast(`Viewing claim details for ${alert.worker}`, {
                          icon: "📋",
                        })
                      }
                      className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
                    >
                      View Claim
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
