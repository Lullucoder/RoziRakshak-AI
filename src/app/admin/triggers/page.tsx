"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudRain,
  Thermometer,
  Wind,
  MapPin,
  Wifi,
  Activity,
  Zap,
  CheckCircle,
  Clock,
  Flame,
  Filter,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
  where,
  getDocs,
  type Timestamp,
} from "firebase/firestore";
import toast from "react-hot-toast";

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

type TriggerTypeKey = "heavy_rain" | "extreme_heat" | "hazardous_aqi" | "zone_closure" | "platform_outage";
type SeverityKey = "moderate" | "high" | "severe";

const TRIGGER_TYPES: { key: TriggerTypeKey; label: string; icon: React.ElementType; color: string }[] = [
  { key: "heavy_rain", label: "Rain", icon: CloudRain, color: "#3b82f6" },
  { key: "extreme_heat", label: "Heat", icon: Thermometer, color: "#f97316" },
  { key: "hazardous_aqi", label: "AQI", icon: Wind, color: "#8b5cf6" },
  { key: "zone_closure", label: "Zone", icon: MapPin, color: "#ef4444" },
  { key: "platform_outage", label: "Platform", icon: Wifi, color: "#06b6d4" },
];

const SEVERITY_OPTIONS: { key: SeverityKey; label: string; color: string }[] = [
  { key: "moderate", label: "Moderate", color: "#f59e0b" },
  { key: "high", label: "High", color: "#f97316" },
  { key: "severe", label: "Severe", color: "#ef4444" },
];

const triggerMeta: Record<string, { icon: React.ElementType; color: string; label: string }> = {};
for (const t of TRIGGER_TYPES) {
  triggerMeta[t.key] = { icon: t.icon, color: t.color, label: t.label };
}

const severityColors: Record<string, string> = {
  moderate: "#f59e0b",
  high: "#f97316",
  severe: "#ef4444",
};

const TEST_TRIGGER_DATA: Record<TriggerTypeKey, { zone: string; city: string; rawValue: number; threshold: number; details: string }> = {
  heavy_rain: { zone: "Koramangala", city: "Bengaluru", rawValue: 52.4, threshold: 35, details: "Test: Heavy rainfall 52.4 mm/hr in demo zone" },
  extreme_heat: { zone: "Connaught Place", city: "Delhi", rawValue: 46.2, threshold: 42, details: "Test: Heat index 46.2°C in demo zone" },
  hazardous_aqi: { zone: "Anand Vihar", city: "Delhi", rawValue: 420, threshold: 300, details: "Test: AQI 420 sustained hazardous level" },
  zone_closure: { zone: "Bandra", city: "Mumbai", rawValue: 1, threshold: 1, details: "Test: Zone closure — waterlogging" },
  platform_outage: { zone: "HSR Layout", city: "Bengaluru", rawValue: 8, threshold: 20, details: "Test: Platform order volume dropped to 8%" },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface TriggerDoc {
  id: string;
  type: string;
  severity: string;
  zone: string;
  city: string;
  startTime: string | Timestamp | null;
  details: string;
  rawValue: number | null;
  thresholdApplied: number | null;
  confidenceScore: number | null;
  result: string | null;
  source: string;
  status?: string;
  affectedWorkers: number;
  createdAt: Timestamp | string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Resolve a timestamp from Firestore — handles Timestamp, string, or null. */
function resolveDate(ts: Timestamp | string | null | undefined): Date | null {
  if (!ts) return null;
  if (typeof ts === "string") return new Date(ts);
  if (typeof ts === "object" && "toDate" in ts) return ts.toDate();
  return null;
}

function formatTime(ts: Timestamp | string | null | undefined): string {
  const d = resolveDate(ts);
  if (!d) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(ts: Timestamp | string | null | undefined): string {
  const d = resolveDate(ts);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function isToday(ts: Timestamp | string | null | undefined): boolean {
  const d = resolveDate(ts);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Pick the best timestamp from a trigger doc (createdAt → startTime fallback). */
function getDisplayTimestamp(t: TriggerDoc): Timestamp | string | null {
  return t.createdAt || t.startTime || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TriggerAnalyticsPage() {
  const [triggers, setTriggers] = useState<TriggerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [firingType, setFiringType] = useState<TriggerTypeKey | null>(null);

  // ── Real-time Firestore listener ────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "triggerEvents"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: TriggerDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as TriggerDoc[];
        setTriggers(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // ── Computed stats ──────────────────────────────────────────────────────
  const todayCount = triggers.filter((t) => isToday(getDisplayTimestamp(t))).length;
  const totalCount = triggers.length;

  const typeCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};
  for (const t of triggers) {
    typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
    severityCounts[t.severity] = (severityCounts[t.severity] || 0) + 1;
  }

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = triggers.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterSeverity !== "all" && t.severity !== filterSeverity) return false;
    return true;
  });

  // ── Fire Test Trigger ───────────────────────────────────────────────────
  const fireTestTrigger = useCallback(async (type: TriggerTypeKey) => {
    setFiringType(type);
    try {
      const data = TEST_TRIGGER_DATA[type];
      const severity: SeverityKey = data.rawValue > (data.threshold * 2) ? "severe" : data.rawValue > (data.threshold * 1.3) ? "high" : "moderate";

      // 1. Write triggerEvent
      const triggerRef = await addDoc(collection(db, "triggerEvents"), {
        type,
        severity,
        zone: data.zone,
        city: data.city,
        startTime: new Date().toISOString(),
        endTime: null,
        details: data.details,
        affectedWorkers: 1,
        confidenceScore: 0.85,
        result: null,
        source: "manual_test",
        rawValue: data.rawValue,
        thresholdApplied: data.threshold,
        status: "test",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Create a test claim linked to this trigger
      await addDoc(collection(db, "claims"), {
        workerId: "worker-demo-001",
        workerName: "Arjun K. (Test)",
        policyId: "policy-001",
        triggerEventId: triggerRef.id,
        triggerType: type,
        triggerSeverity: severity,
        status: "pending_fraud_check",
        confidenceScore: 0.85,
        payoutAmount: severity === "severe" ? 750 : severity === "high" ? 400 : 200,
        payoutId: null,
        zone: data.zone,
        description: `Auto-initiated test claim from ${triggerMeta[type].label} trigger in ${data.zone}`,
        resolvedAt: null,
        autoInitiated: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success(
        `${triggerMeta[type].label} trigger fired! Claim created.`,
        { icon: "⚡", duration: 3000 }
      );
    } catch (err) {
      console.error("Fire test trigger error:", err);
      toast.error("Failed to fire trigger. Check console.");
    } finally {
      setFiringType(null);
    }
  }, []);

  // ═════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-6 lg:p-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-outfit)" }}>
            Trigger <span className="gradient-text">Analytics</span>
          </h1>
        </div>
        {/* Live Today Badge */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground">LIVE</span>
          <span className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/30">
            <Zap className="w-3 h-3" />
            {todayCount} today
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Real-time parametric trigger monitoring across all zones
      </p>

      {/* ── Summary Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Triggers", value: totalCount.toString(), trend: `${todayCount} fired today`, icon: Activity, color: "#8b5cf6" },
          { label: "Severe", value: (severityCounts["severe"] || 0).toString(), trend: "Critical events", icon: AlertTriangle, color: "#ef4444" },
          { label: "High", value: (severityCounts["high"] || 0).toString(), trend: "Needs attention", icon: Flame, color: "#f97316" },
          { label: "Moderate", value: (severityCounts["moderate"] || 0).toString(), trend: "Within tolerance", icon: CheckCircle, color: "#f59e0b" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className="bg-card border-none shadow-lg">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight mb-1">{stat.value}</h3>
                  <p className="text-sm font-medium mb-1">{stat.label}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.trend}</p>
                </div>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}15`, border: `1px solid ${stat.color}30` }}
                >
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Fire Test Trigger Buttons ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Card className="bg-card border-none shadow-lg mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Fire Test Trigger
            </CardTitle>
            <CardDescription className="text-xs">
              Manually fire a trigger event with a linked claim — for live demo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {TRIGGER_TYPES.map((tt) => {
                const isLoading = firingType === tt.key;
                return (
                  <Button
                    key={tt.key}
                    variant="outline"
                    size="sm"
                    disabled={firingType !== null}
                    onClick={() => fireTestTrigger(tt.key)}
                    className="gap-1.5 transition-all"
                    style={{
                      borderColor: `${tt.color}40`,
                      color: tt.color,
                    }}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <tt.icon className="w-3.5 h-3.5" />
                    )}
                    {tt.label}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Live Trigger Feed ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <Card className="bg-card border-none shadow-lg">
          <CardHeader className="pb-2 flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold">Live Trigger Feed</CardTitle>
              <CardDescription className="text-xs">
                Real-time Firestore events · Showing {filtered.length} of {totalCount}
              </CardDescription>
            </div>

            {/* ── Filters ──────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />

              {/* Type filter */}
              <select
                id="filter-trigger-type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-primary"
              >
                <option value="all">All Types</option>
                {TRIGGER_TYPES.map((tt) => (
                  <option key={tt.key} value={tt.key}>
                    {tt.label} ({typeCounts[tt.key] || 0})
                  </option>
                ))}
              </select>

              {/* Severity filter */}
              <select
                id="filter-severity"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-primary"
              >
                <option value="all">All Severity</option>
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} ({severityCounts[s.key] || 0})
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Connecting to Firestore…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Activity className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">
                  {totalCount === 0 ? 'No trigger events yet' : 'No events match filters'}
                </p>
                <p className="text-xs mt-1">
                  {totalCount === 0 ? 'Fire a test trigger above to get started' : 'Try adjusting your filters'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Time</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Type</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Zone</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Severity</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Raw Value</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Workers</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {filtered.map((t, i) => {
                        const meta = triggerMeta[t.type] || { icon: Zap, color: "#888", label: t.type };
                        const Icon = meta.icon;
                        const color = meta.color;
                        const sevColor = severityColors[t.severity] || "#888";
                        const isTest = t.status === "test" || t.source === "manual_test";

                        return (
                          <motion.tr
                            key={t.id}
                            layout
                            className="border-b border-border hover:bg-muted/50 transition-colors"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ delay: Math.min(i * 0.03, 0.5) }}
                          >
                            {/* Time */}
                            <td className="px-3 py-3">
                              <div className="text-xs font-mono text-muted-foreground">{formatTime(getDisplayTimestamp(t))}</div>
                              <div className="text-[10px] text-muted-foreground/60">{formatDate(getDisplayTimestamp(t))}</div>
                            </td>

                            {/* Type */}
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-6 h-6 rounded-md flex items-center justify-center"
                                  style={{ backgroundColor: `${color}20` }}
                                >
                                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                                </div>
                                <div>
                                  <span className="text-xs font-medium">{meta.label}</span>
                                  {isTest && (
                                    <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
                                      TEST
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Zone */}
                            <td className="px-3 py-3">
                              <div className="text-xs">{t.zone}</div>
                              <div className="text-[10px] text-muted-foreground">{t.city}</div>
                            </td>

                            {/* Severity */}
                            <td className="px-3 py-3">
                              <span
                                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                                style={{
                                  color: sevColor,
                                  backgroundColor: `${sevColor}15`,
                                }}
                              >
                                {t.severity}
                              </span>
                            </td>

                            {/* Raw Value */}
                            <td className="px-3 py-3">
                              <span className="text-xs font-mono font-medium">
                                {t.rawValue !== null && t.rawValue !== undefined ? t.rawValue : "—"}
                              </span>
                              {t.thresholdApplied !== null && t.thresholdApplied !== undefined && (
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  / {t.thresholdApplied}
                                </span>
                              )}
                            </td>

                            {/* Workers affected */}
                            <td className="px-3 py-3">
                              <span className="text-xs font-medium">{t.affectedWorkers || 0}</span>
                            </td>

                            {/* Source */}
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                t.source === "manual_test"
                                  ? "bg-primary/10 text-primary"
                                  : t.source === "mock_feed" 
                                  ? "bg-[#10b981]/10 text-[#10b981]"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {t.source === "manual_test" ? (
                                  <><Zap className="w-3 h-3" /> Manual</>
                                ) : t.source === "mock_feed" ? (
                                  <><CheckCircle className="w-3 h-3" /> Engine</>
                                ) : (
                                  <><Clock className="w-3 h-3" /> {t.source || "Unknown"}</>
                                )}
                              </span>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Trigger Type Distribution (from live data) ─────────────────── */}
      {totalCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-6"
        >
          <Card className="bg-card border-none shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Trigger Distribution</CardTitle>
              <CardDescription className="text-xs">
                Breakdown by trigger type from live Firestore data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {TRIGGER_TYPES.map((tt) => {
                  const count = typeCounts[tt.key] || 0;
                  const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
                  return (
                    <div
                      key={tt.key}
                      className="rounded-xl p-3 flex flex-col items-center gap-2"
                      style={{ backgroundColor: `${tt.color}08`, border: `1px solid ${tt.color}20` }}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${tt.color}18` }}
                      >
                        <tt.icon className="w-4.5 h-4.5" style={{ color: tt.color }} />
                      </div>
                      <span className="text-lg font-bold" style={{ color: tt.color }}>{count}</span>
                      <span className="text-[10px] text-muted-foreground font-medium">{tt.label} · {pct}%</span>
                      <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: tt.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.8 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
