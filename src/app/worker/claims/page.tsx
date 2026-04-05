"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CloudRain,
  Thermometer,
  Wind,
  MapPin,
  Wifi,
  IndianRupee,
  FileText,
  ScanFace,
  ChevronRight,
} from "lucide-react";
import FaceReverificationModal from "@/components/FaceReverificationModal";
import { useAuth } from "@/contexts/AuthContext";
import { getClaimsByWorker } from "@/lib/firestore";
import type { Claim } from "@/types/claim";
import toast from "react-hot-toast";

// ─── Static data ──────────────────────────────────────────────────────────────

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
  heavy_rain: CloudRain,
  extreme_heat: Thermometer,
  hazardous_aqi: Wind,
  zone_closure: MapPin,
  platform_outage: Wifi,
};

const colorMap: Record<string, string> = {
  heavy_rain: "#3b82f6",
  extreme_heat: "#f97316",
  hazardous_aqi: "#8b5cf6",
  zone_closure: "#ef4444",
  platform_outage: "#06b6d4",
};

const typeLabel: Record<string, string> = {
  heavy_rain: "Heavy Rain",
  extreme_heat: "Extreme Heat",
  hazardous_aqi: "Hazardous AQI",
  zone_closure: "Zone Closure",
  platform_outage: "Platform Outage",
};

// Demo claims — Track A is auto_approved, B/C use soft_review / held
const claims = [
  {
    id: "cl_001",
    triggerType: "heavy_rain",
    status: "auto_approved",
    confidenceScore: 0.92,
    payoutAmount: 750,
    createdAt: "2026-03-18T20:15:00",
    description: "Severe rainfall in Koramangala zone. 6-hour work window lost.",
  },
  {
    id: "cl_004",
    triggerType: "platform_outage",
    /** Track B — soft review */
    status: "soft_review",
    confidenceScore: 0.58,
    payoutAmount: 500,
    createdAt: "2026-03-19T21:45:00",
    description:
      "Platform outage during peak evening hours. 3.5 hours lost. Under soft review.",
  },
  {
    id: "cl_003",
    triggerType: "hazardous_aqi",
    /** Track C — held */
    status: "held",
    confidenceScore: 0.35,
    payoutAmount: 900,
    createdAt: "2026-03-15T23:30:00",
    description:
      "Hazardous AQI in your zone. Full-day income disruption. Held for investigation.",
  },
];

const statusConfig: Record<string, { label: string; class: string }> = {
  auto_approved: { label: "Auto Approved", class: "status-approved" },
  approved: { label: "Approved", class: "status-approved" },
  paid: { label: "Paid", class: "status-approved" },
  under_review: { label: "Under Review", class: "status-reviewing" },
  soft_review: { label: "Soft Review", class: "status-reviewing" },
  pending_fraud_check: { label: "Fraud Check", class: "status-reviewing" },
  payout_initiated: { label: "Payout Initiated", class: "status-reviewing" },
  held: { label: "Held", class: "status-held" },
  denied: { label: "Denied", class: "status-denied" },
};

/** Claims that offer the face re-verification boost */
const BOOSTABLE_STATUSES = new Set(["soft_review", "held", "under_review", "pending_fraud_check"]);

function toDate(input: unknown): Date | null {
  if (!input) return null;
  if (typeof input === "string") return new Date(input);
  if (typeof input === "object" && input !== null && "seconds" in input) {
    return new Date((input as { seconds: number }).seconds * 1000);
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClaimsPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? "worker-demo-001";
  const workerName = user?.displayName ?? "Worker";

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeClaim, setActiveClaim] = useState<Claim | null>(null);

  useEffect(() => {
    const loadClaims = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const workerClaims = await getClaimsByWorker(user.uid);
        const sortedClaims = [...workerClaims].sort((a, b) => {
          const aTime = toDate(a.createdAt)?.getTime() ?? 0;
          const bTime = toDate(b.createdAt)?.getTime() ?? 0;
          return bTime - aTime;
        });
        setClaims(sortedClaims);
      } catch (error) {
        console.error("Failed to load claims:", error);
        toast.error("Could not load claim history.");
      } finally {
        setLoading(false);
      }
    };

    void loadClaims();
  }, [user]);

  const totalReceived = claims.reduce((sum, claim) => sum + (claim.payoutAmount || 0), 0);

  const openModal = (claim: Claim) => {
    setActiveClaim(claim);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveClaim(null);
  };

  return (
    <>
      <div className="px-4 pt-6">
        <h1
          className="text-xl font-bold mb-1"
          style={{ fontFamily: "var(--font-outfit)" }}
        >
          Claims History
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your parametric claim records
        </p>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Claims</p>
            <p className="text-2xl font-bold">{claims.length}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Received</p>
            <div className="flex items-center gap-1">
              <IndianRupee className="w-4 h-4 text-accent" />
              <p className="text-2xl font-bold text-accent">{totalReceived}</p>
            </div>
          </div>
        </div>

        {/* Claims List */}
        <div className="space-y-3">
          {loading && (
            <div className="glass rounded-2xl p-4 text-sm text-muted-foreground">
              Loading claims...
            </div>
          )}
          {!loading && claims.length === 0 && (
            <div className="glass rounded-2xl p-4 text-sm text-muted-foreground">
              No claims found for this account yet.
            </div>
          )}
          {claims.map((claim, i) => {
            const Icon = iconMap[claim.triggerType] || FileText;
            const color = colorMap[claim.triggerType] || "#888";
            const st = statusConfig[claim.status] || statusConfig.under_review;
            const isBoostable = BOOSTABLE_STATUSES.has(claim.status);
            const createdAtDate = toDate(claim.createdAt);
            const confidencePct = Math.round((claim.confidenceScore || 0) * 100);

            return (
              <motion.div
                key={claim.id}
                className="glass rounded-2xl p-4"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                {/* Claim header */}
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">
                          {typeLabel[claim.triggerType]}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {createdAtDate
                            ? createdAtDate.toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.class}`}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {claim.description}
                    </p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <div className="text-xs text-muted-foreground">
                        Confidence:{" "}
                        <strong className="text-foreground">
                          {confidencePct}%
                        </strong>
                      </div>
                      {claim.payoutAmount > 0 &&
                        claim.status !== "soft_review" &&
                        claim.status !== "held" &&
                        claim.status !== "under_review" &&
                        claim.status !== "pending_fraud_check" && (
                          <div className="flex items-center gap-1 text-sm font-semibold text-accent">
                            <IndianRupee className="w-3.5 h-3.5" />
                            {claim.payoutAmount}
                          </div>
                        )}
                      {(claim.status === "soft_review" ||
                        claim.status === "held" ||
                        claim.status === "under_review" ||
                        claim.status === "pending_fraud_check") && (
                        <span className="text-xs text-warning font-medium">
                          Pending…
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Boost Card (Track B / Track C only) ── */}
                {isBoostable && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ delay: i * 0.08 + 0.15 }}
                    className="mt-4 rounded-xl overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(108,92,231,0.12), rgba(139,92,246,0.08))",
                      border: "1px solid rgba(139,92,246,0.25)",
                    }}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(139,92,246,0.15)" }}
                        >
                          <ScanFace
                            className="w-5 h-5"
                            style={{ color: "#8b5cf6" }}
                          />
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs font-bold mb-0.5 text-primary"
                          >
                            Speed up your claim verification
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            A quick face check can help us verify your identity
                            and approve your claim faster.
                          </p>
                        </div>
                      </div>

                      {/* Button */}
                      <button
                        id={`verify-face-btn-${claim.id}`}
                        onClick={() => openModal(claim)}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85 active:scale-[0.98]"
                        style={{
                          background:
                            "linear-gradient(135deg, #6c5ce7, #8b5cf6)",
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <ScanFace className="w-4 h-4" />
                        Verify My Face Now
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Face Re-verification Modal */}
      {activeClaim && (
        <FaceReverificationModal
          open={modalOpen}
          onClose={closeModal}
          claimId={activeClaim.id}
          uid={uid}
          currentConfidenceScore={activeClaim.confidenceScore || 0}
          workerName={workerName}
        />
      )}
    </>
  );
}
