"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Shield, Zap, ArrowRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createPolicy, getActivePolicyByWorker } from "@/lib/firestore";
import { serverTimestamp } from "firebase/firestore";

const plans = [
  {
    id: "lite",
    name: "Lite",
    priceRange: "₹19–₹29",
    price: 24,
    protection: 800,
    ideal: "Part-time riders",
    features: ["All 5 triggers", "Up to ₹800/week", "Standard payout speed", "Basic trust rewards"],
  },
  {
    id: "core",
    name: "Core",
    priceRange: "₹29–₹49",
    price: 39,
    protection: 1500,
    ideal: "Regular riders",
    popular: true,
    features: ["All 5 triggers", "Up to ₹1,500/week", "Instant payout", "Trust discount eligible", "Priority support"],
  },
  {
    id: "peak",
    name: "Peak",
    priceRange: "₹49–₹79",
    price: 64,
    protection: 2500,
    ideal: "Full-time riders",
    features: ["All 5 triggers", "Up to ₹2,500/week", "Instant payout", "Maximum trust rewards", "Priority support", "Multi-zone cover"],
  },
];

const PLAN_VALUES: Record<string, { premiumInr: number; maxWeeklyProtectionInr: number }> = {
  lite: { premiumInr: 29, maxWeeklyProtectionInr: 800 },
  core: { premiumInr: 49, maxWeeklyProtectionInr: 1500 },
  peak: { premiumInr: 79, maxWeeklyProtectionInr: 2500 },
};

export default function PolicyPage() {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const [activePlan] = useState("core");
  const [buying, setBuying] = useState(false);
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);

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
      const planValues = PLAN_VALUES[planName];

      // f. Create the policy document in Firestore (field names match the Policy type)
      await createPolicy({
        workerId:      user.uid,
        plan:          planName,
        premium:       planValues.premiumInr,
        maxProtection: planValues.maxWeeklyProtectionInr,
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
            Current: <span className="gradient-text">Core Plan</span>
          </p>
          <p className="text-xs text-muted-foreground">Active until 23 Mar 2026</p>
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
                <p className="text-xl font-bold gradient-text">{plan.priceRange}</p>
                <p className="text-[10px] text-muted-foreground">/week</p>
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
              disabled={buying}
              className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                activePlan === plan.id
                  ? "bg-muted border border-border text-muted-foreground cursor-default"
                  : "bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white hover:opacity-90"
              }`}
            >
              {buying && buyingPlanId === plan.id ? (
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
