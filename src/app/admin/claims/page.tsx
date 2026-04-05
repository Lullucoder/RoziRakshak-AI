"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, CheckCircle, Clock, XCircle, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getAllClaims } from "@/lib/firestore";
import type { Claim } from "@/types/claim";

const statusConfig: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  auto_approved: { label: "Auto Approved", class: "status-approved", icon: CheckCircle },
  approved: { label: "Approved", class: "status-approved", icon: CheckCircle },
  paid: { label: "Paid", class: "status-approved", icon: CheckCircle },
  payout_initiated: { label: "Payout Initiated", class: "status-reviewing", icon: Clock },
  pending_fraud_check: { label: "Fraud Check", class: "status-reviewing", icon: Clock },
  under_review: { label: "Under Review", class: "status-reviewing", icon: Clock },
  under_appeal: { label: "Under Appeal", class: "status-reviewing", icon: Clock },
  held: { label: "Held", class: "status-held", icon: XCircle },
  denied: { label: "Denied", class: "status-denied", icon: XCircle },
  rejected: { label: "Rejected", class: "status-denied", icon: XCircle },
  error: { label: "Error", class: "status-denied", icon: XCircle },
};

const triggerTypeLabel: Record<string, string> = {
  heavy_rain: "Heavy Rain",
  extreme_heat: "Extreme Heat",
  hazardous_aqi: "Hazardous AQI",
  zone_closure: "Zone Closure",
  platform_outage: "Platform Outage",
};

function toDate(input: unknown): Date | null {
  if (!input) return null;
  if (typeof input === "string") return new Date(input);
  if (typeof input === "object" && input !== null && "seconds" in input) {
    return new Date((input as { seconds: number }).seconds * 1000);
  }
  return null;
}

function formatClaimDate(input: unknown): string {
  const date = toDate(input);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AdminClaimsPage() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);

  const loadClaims = async () => {
    try {
      setLoading(true);
      const allClaims = await getAllClaims();
      const sortedClaims = [...allClaims].sort((a, b) => {
        const aTime = toDate(a.createdAt)?.getTime() ?? 0;
        const bTime = toDate(b.createdAt)?.getTime() ?? 0;
        return bTime - aTime;
      });
      setClaims(sortedClaims);
    } catch (error) {
      console.error("Failed to load claims:", error);
      toast.error("Failed to load claims");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClaims();
  }, []);

  const filtered = useMemo(
    () =>
      claims.filter((claim) => {
        if (filterStatus !== "all" && claim.status !== filterStatus) return false;
        if (!searchQuery) return true;

        const haystack = [
          claim.workerName || "",
          claim.workerId || "",
          claim.zone || "",
          claim.city || "",
          claim.id || "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchQuery.toLowerCase());
      }),
    [claims, filterStatus, searchQuery]
  );

  const handleAction = async (id: string, decision: "approve" | "reject") => {
    if (!user) {
      toast.error("Please log in as admin to review claims.");
      return;
    }

    setActioningId(id);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/claims/${id}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          decision,
          admin_note:
            decision === "approve"
              ? "Approved from admin claims console"
              : "Rejected from admin claims console",
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || `Review API failed with ${response.status}`);
      }

      toast.success(`Claim ${id} ${decision === "approve" ? "approved" : "rejected"}`);
      await loadClaims();
    } catch (error: any) {
      console.error("Review action failed:", error);
      toast.error(error?.message || "Failed to process review action");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "var(--font-outfit)" }}>
        Claims <span className="gradient-text">Review</span>
      </h1>
      <p className="text-sm text-muted-foreground mb-6">Review and manage parametric claims</p>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted border border-border flex-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by worker name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent outline-none text-sm text-foreground placeholder-muted-foreground flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {["all", "pending_fraud_check", "under_review", "held", "auto_approved"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === s
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all"
                ? "All"
                : s === "pending_fraud_check"
                ? "Fraud Check"
                : s === "under_review"
                ? "Review"
                : s === "held"
                ? "Held"
                : "Approved"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Claim</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Worker</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Trigger</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Zone</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Confidence</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Payout</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-muted-foreground">
                    Loading claims...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-muted-foreground">
                    No claims match the selected filters.
                  </td>
                </tr>
              )}
              {filtered.map((claim, i) => {
                const st = statusConfig[claim.status] || statusConfig.under_review;
                const confidence = claim.confidenceScore || 0;
                const payout = claim.payoutAmount || 0;
                return (
                  <motion.tr
                    key={claim.id}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{claim.id}</td>
                    <td className="px-5 py-4 font-medium">{claim.workerName || claim.workerId}</td>
                    <td className="px-5 py-4">{triggerTypeLabel[claim.triggerType] || claim.triggerType}</td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{claim.zone || "—"}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${confidence * 100}%`,
                              background:
                                confidence >= 0.75
                                  ? "#10b981"
                                  : confidence >= 0.4
                                  ? "#f59e0b"
                                  : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-xs">{(confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold">
                      {payout > 0 ? `₹${payout}` : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${st.class}`}>
                        <st.icon className="w-3 h-3" />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        {(claim.status === "under_review" || claim.status === "held" || claim.status === "under_appeal") && (
                          <>
                            <button
                              onClick={() => handleAction(claim.id, "approve")}
                              disabled={actioningId === claim.id}
                              className="p-1.5 rounded-lg bg-[rgba(16,185,129,0.1)] text-accent hover:bg-[rgba(16,185,129,0.2)] transition-colors"
                              title="Approve"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleAction(claim.id, "reject")}
                              disabled={actioningId === claim.id}
                              className="p-1.5 rounded-lg bg-[rgba(239,68,68,0.1)] text-destructive hover:bg-[rgba(239,68,68,0.2)] transition-colors"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                          title="View Details"
                          onClick={() =>
                            toast(
                              `${claim.id} · ${triggerTypeLabel[claim.triggerType] || claim.triggerType} · ${formatClaimDate(claim.createdAt)}`
                            )
                          }
                        >
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
