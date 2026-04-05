"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Shield, Zap, ArrowRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createPolicy, getActivePolicyByWorker } from "@/lib/firestore";
import type { PremiumQuote } from "@/lib/premiumEngine";

const plans = [
  {
    id: "lite",
    name: "Lite",
    defaultPrice: 29,
    defaultProtection: 800,
    ideal: "Part-time riders",
    features: ["All 5 triggers", "Up to ₹800/week", "Standard payout speed", "Basic trust rewards"],
  },
  {
    id: "core",
    name: "Core",
    defaultPrice: 49,
    defaultProtection: 1500,
    ideal: "Regular riders",
    popular: true,
    features: ["All 5 triggers", "Up to ₹1,500/week", "Instant payout", "Trust discount eligible", "Priority support"],
  },
  {
    id: "peak",
    name: "Peak",
    defaultPrice: 79,
    defaultProtection: 2500,
    ideal: "Full-time riders",
    features: ["All 5 triggers", "Up to ₹2,500/week", "Instant payout", "Maximum trust rewards", "Priority support", "Multi-zone cover"],
  },
];

const FALLBACK_PLAN_VALUES: Record<string, { premiumInr: number; maxWeeklyProtectionInr: number }> = {
  lite: { premiumInr: 29, maxWeeklyProtectionInr: 800 },
  core: { premiumInr: 49, maxWeeklyProtectionInr: 1500 },
  peak: { premiumInr: 79, maxWeeklyProtectionInr: 2500 },
};

function formatDate(input: unknown): string {
  if (!input) return "—";
  if (typeof input === "string") {
    return new Date(input).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  if (typeof input === "object" && input !== null && "seconds" in input) {
    return new Date((input as { seconds: number }).seconds * 1000).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return "—";
}

export default function PolicyPage() {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [activePlanExpiry, setActivePlanExpiry] = useState<string>("—");
  const [quote, setQuote] = useState<PremiumQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [buying, setBuying] = useState(false);
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);

  useEffect(() => {
    const loadPolicyAndQuote = async () => {
      if (!user) {
        setLoadingQuote(false);
        return;
      }

      try {
        const existingPolicy = await getActivePolicyByWorker(user.uid);
        if (existingPolicy) {
          setActivePlan(existingPolicy.plan);
          setActivePlanExpiry(formatDate(existingPolicy.weekEnd));
        } else {
          setActivePlan(null);
          setActivePlanExpiry("—");
        }
      } catch (error) {
        console.error("Failed to load active policy:", error);
      }

      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/claims/premium-quote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Premium quote API returned ${response.status}`);
        }

        const data = (await response.json()) as PremiumQuote;
        setQuote(data);
      } catch (error) {
        console.error("Failed to fetch premium quote:", error);
        toast.error("Using default pricing while quote service is unavailable.");
      } finally {
        setLoadingQuote(false);
      }
    };

    void loadPolicyAndQuote();
  }, [user]);

  const planValues = useMemo(() => {
    if (!quote) {
      return FALLBACK_PLAN_VALUES;
    }

    return {
      lite: {
        premiumInr: quote.plans.lite.weekly_premium,
        maxWeeklyProtectionInr: quote.plans.lite.max_weekly_protection,
      },
      core: {
        premiumInr: quote.plans.standard.weekly_premium,
        maxWeeklyProtectionInr: quote.plans.standard.max_weekly_protection,
      },
      peak: {
        premiumInr: quote.plans.premium.weekly_premium,
        maxWeeklyProtectionInr: quote.plans.premium.max_weekly_protection,
      },
    };
  }, [quote]);

  const handleBuy = async (planId: string) => {
    // a. Guard checks
    if (!user || !userProfile) {
      toast.error("Please log in first");
      return;
    }
    if (!userProfile.upiId) {
      toast.error("Please complete your profile with a UPI ID first");
      return;
    }

    // b. Set loading state
    setBuying(true);
    setBuyingPlanId(planId);

    try {
      // c. Check for existing active policy
      const existingPolicy = await getActivePolicyByWorker(user.uid);
      if (existingPolicy) {
        toast.error("You already have an active policy this week");
        setBuying(false);
        setBuyingPlanId(null);
        return;
      }

      // d. Compute coverage dates (week start = now, week end = +7 days)
      const weekStartDate = new Date();
      const weekEndDate = new Date();
      weekEndDate.setDate(weekEndDate.getDate() + 7);

      // e. Map plan id to PlanTier (lowercase) and look up values
      const planName = planId.toLowerCase() as "lite" | "core" | "peak";
      const selectedPlanValues = planValues[planName];

      // f. Create the policy document in Firestore (field names match the Policy type)
      await createPolicy({
        workerId:      user.uid,
        plan:          planName,
        premium:       selectedPlanValues.premiumInr,
        maxProtection: selectedPlanValues.maxWeeklyProtectionInr,
        weekStart:     weekStartDate.toISOString(),
        weekEnd:       weekEndDate.toISOString(),
        status:        "active",
        triggers:      ["heavy_rain", "extreme_heat", "hazardous_aqi", "zone_closure", "platform_outage"],
      });

      // g. Success
      toast.success("Policy activated! You are protected this week.");
      router.push("/worker/dashboard");
    } catch (error) {
      // h. Error
      toast.error("Failed to activate policy. Please try again.");
      console.error(error);
    } finally {
      // i. Reset loading
      setBuying(false);
      setBuyingPlanId(null);
    }
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="text-xl font-bold mb-1" style={{ fontFamily: "var(--font-outfit)" }}>
        Weekly Plans
      </h1>
      <p className="text-sm text-muted-foreground mb-6">Choose your income protection level</p>

      {/* Current Plan */}
      <div className="glass rounded-2xl p-4 mb-6 flex items-center gap-3 border border-[rgba(108,92,231,0.3)]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold">
            Current:{" "}
            <span className="gradient-text">
              {activePlan ? `${activePlan.charAt(0).toUpperCase()}${activePlan.slice(1)} Plan` : "No active plan"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {activePlan ? `Active until ${activePlanExpiry}` : "Buy a weekly plan to activate protection"}
          </p>
          {quote && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Pricing source: {quote.model_used === "ml_model" ? "AI quote" : "Fallback quote"}
            </p>
          )}
        </div>
      </div>

      {/* Plans */}
      <div className="space-y-4">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.id}
            className={`glass rounded-2xl p-5 relative ${
              plan.popular ? "gradient-border" : ""
            } ${activePlan === plan.id ? "ring-1 ring-primary" : ""}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            {plan.popular && (
              <div className="absolute -top-2.5 right-4 px-3 py-0.5 rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-[10px] font-bold text-white">
                POPULAR
              </div>
            )}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-outfit)" }}>
                  {plan.name}
                </h3>
                <p className="text-xs text-muted-foreground">{plan.ideal}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold gradient-text">₹{planValues[plan.id].premiumInr}</p>
                <p className="text-[10px] text-muted-foreground">/week</p>
                <p className="text-[10px] text-muted-foreground">
                  Cover ₹{planValues[plan.id].maxWeeklyProtectionInr}
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {plan.features.map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-secondary-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleBuy(plan.id)}
              disabled={buying || loadingQuote}
              className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                activePlan === plan.id
                  ? "bg-muted border border-border text-muted-foreground cursor-default"
                  : "bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white hover:opacity-90"
              }`}
            >
              {loadingQuote ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading quote...
                </>
              ) : buying && buyingPlanId === plan.id ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Activating...
                </>
              ) : activePlan === plan.id ? (
                "Current Plan"
              ) : (
                <>
                  Get {plan.name}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
