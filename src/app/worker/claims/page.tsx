"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CloudRain, 
  Thermometer, 
  Wind, 
  MapPin, 
  Wifi, 
  IndianRupee, 
  FileText, 
  Plus,
  AlertCircle,
  Send
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp 
} from "firebase/firestore";
import toast from "react-hot-toast";

// Types
interface Claim {
  id: string;
  workerId: string;
  workerName: string;
  triggerType: string;
  triggerSeverity: string;
  status: string;
  zone: string;
  city: string;
  description: string;
  confidenceScore?: number;
  payoutAmount?: number;
  holdReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt?: Timestamp;
  paidAt?: Timestamp;
}

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

// Status configuration with colors
const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  pending_fraud_check: { 
    label: "Verifying", 
    color: "#f59e0b", 
    bgColor: "rgba(245, 158, 11, 0.1)" 
  },
  under_review: { 
    label: "Under Review", 
    color: "#3b82f6", 
    bgColor: "rgba(59, 130, 246, 0.1)" 
  },
  held: { 
    label: "Additional Check Needed", 
    color: "#f97316", 
    bgColor: "rgba(249, 115, 22, 0.1)" 
  },
  auto_approved: { 
    label: "Approved", 
    color: "#10b981", 
    bgColor: "rgba(16, 185, 129, 0.1)" 
  },
  approved: { 
    label: "Approved", 
    color: "#10b981", 
    bgColor: "rgba(16, 185, 129, 0.1)" 
  },
  payout_initiated: { 
    label: "Payment Sent", 
    color: "#10b981", 
    bgColor: "rgba(16, 185, 129, 0.1)" 
  },
  paid: { 
    label: "Paid", 
    color: "#10b981", 
    bgColor: "rgba(16, 185, 129, 0.1)" 
  },
  denied: { 
    label: "Not Eligible", 
    color: "#ef4444", 
    bgColor: "rgba(239, 68, 68, 0.1)" 
  },
  under_appeal: { 
    label: "Appeal Submitted", 
    color: "#8b5cf6", 
    bgColor: "rgba(139, 92, 246, 0.1)" 
  },
};

export default function ClaimsPage() {
  const { user, userProfile } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [initiatingClaim, setInitiatingClaim] = useState(false);
  const [appealingClaim, setAppealingClaim] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");

  // Real-time Firestore listener
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const claimsRef = collection(db, "claims");
    const q = query(
      claimsRef,
      where("workerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const claimsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Claim[];
        
        setClaims(claimsData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching claims:", error);
        toast.error("Failed to load claims");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // Calculate total received
  const totalReceived = claims
    .filter((c) => c.status === "paid" && c.payoutAmount)
    .reduce((sum, c) => sum + (c.payoutAmount || 0), 0);

  // Manual claim initiation
  const handleInitiateClaim = async () => {
    if (!user?.uid) {
      toast.error("Please log in to initiate a claim");
      return;
    }

    setInitiatingClaim(true);

    try {
      const response = await fetch("/api/claims/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workerId: user.uid,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === "RATE_LIMIT_EXCEEDED") {
          toast.error("You've reached the limit of 3 manual claims per 24 hours");
        } else {
          toast.error(data.message || "Failed to initiate claim");
        }
        return;
      }

      toast.success("Claim initiated successfully!");
    } catch (error) {
      console.error("Error initiating claim:", error);
      toast.error("Failed to initiate claim");
    } finally {
      setInitiatingClaim(false);
    }
  };

  // Submit appeal
  const handleSubmitAppeal = async (claimId: string) => {
    if (!appealReason.trim()) {
      toast.error("Please provide a reason for your appeal");
      return;
    }

    try {
      const response = await fetch(`/api/claims/${claimId}/appeal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appealReason: appealReason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || "Failed to submit appeal");
        return;
      }

      toast.success("Appeal submitted successfully!");
      setAppealingClaim(null);
      setAppealReason("");
    } catch (error) {
      console.error("Error submitting appeal:", error);
      toast.error("Failed to submit appeal");
    }
  };

  if (loading) {
    return (
      <div className="px-4 pt-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Loading claims...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-20">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-outfit)" }}>
          Claims History
        </h1>
        {userProfile && (
          <button
            onClick={handleInitiateClaim}
            disabled={initiatingClaim}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {initiatingClaim ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Initiating...</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>New Claim</span>
              </>
            )}
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6">Your parametric claim records</p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Claims</p>
          <p className="text-2xl font-bold">{claims.length}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Received</p>
          <div className="flex items-center gap-1">
            <IndianRupee className="w-4 h-4 text-green-500" />
            <p className="text-2xl font-bold text-green-500">
              {totalReceived.toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      </div>

      {/* Claims List */}
      {claims.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">No claims yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Claims will appear here when trigger events occur
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {claims.map((claim, i) => {
              const Icon = iconMap[claim.triggerType] || FileText;
              const color = colorMap[claim.triggerType] || "#888";
              const st = statusConfig[claim.status] || statusConfig.under_review;
              const isHeld = claim.status === "held";
              const showAppealForm = isHeld && appealingClaim === claim.id;

              return (
                <motion.div
                  key={claim.id}
                  className="glass rounded-2xl p-4"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ delay: i * 0.05 }}
                >
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
                            {typeLabel[claim.triggerType] || claim.triggerType}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {claim.createdAt?.toDate?.()
                              ? new Date(claim.createdAt.toDate()).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "N/A"}
                          </p>
                        </div>
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{
                            color: st.color,
                            backgroundColor: st.bgColor,
                          }}
                        >
                          {st.label}
                        </span>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        {claim.description}
                      </p>

                      {/* Hold Reason */}
                      {isHeld && claim.holdReason && (
                        <div className="mt-3 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-orange-200">{claim.holdReason}</p>
                          </div>
                        </div>
                      )}

                      {/* Appeal Form */}
                      {showAppealForm && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 space-y-2"
                        >
                          <textarea
                            value={appealReason}
                            onChange={(e) => setAppealReason(e.target.value)}
                            placeholder="Explain why you believe this claim should be approved..."
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSubmitAppeal(claim.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                            >
                              <Send className="w-3 h-3" />
                              Submit Appeal
                            </button>
                            <button
                              onClick={() => {
                                setAppealingClaim(null);
                                setAppealReason("");
                              }}
                              className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                            >
                              Cancel
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* Bottom Info */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-3">
                          {claim.confidenceScore !== undefined && (
                            <div className="text-xs text-muted-foreground">
                              Confidence:{" "}
                              <strong className="text-foreground">
                                {(claim.confidenceScore * 100).toFixed(0)}%
                              </strong>
                            </div>
                          )}
                          {isHeld && !showAppealForm && claim.status !== "under_appeal" && (
                            <button
                              onClick={() => setAppealingClaim(claim.id)}
                              className="text-xs text-primary hover:underline font-medium"
                            >
                              Appeal
                            </button>
                          )}
                        </div>
                        
                        {claim.payoutAmount && claim.payoutAmount > 0 && (
                          <div className="flex items-center gap-1 text-sm font-semibold text-green-500">
                            <IndianRupee className="w-3.5 h-3.5" />
                            {claim.payoutAmount.toLocaleString("en-IN")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
