"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { updateWorker } from "@/lib/firestore";
import { serverTimestamp } from "firebase/firestore";
import {
  Shield,
  User,
  MapPin,
  Briefcase,
  Clock,
  Wallet,
  Loader2,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, role, isOnboarded, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    city: "",
    platform: "",
    zone: "",
    shiftStartTime: "",
    shiftDuration: "",
    weeklyEarningRange: "",
    upiId: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Guard checks
  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (role === "admin") {
      router.replace("/admin/dashboard");
      return;
    }

    if (isOnboarded) {
      router.replace("/worker/dashboard");
      return;
    }
  }, [user, role, isOnboarded, loading, router]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Full name is required";
    }

    if (!formData.city) {
      newErrors.city = "Please select a city";
    }

    if (!formData.platform) {
      newErrors.platform = "Please select a platform";
    }

    if (!formData.zone.trim()) {
      newErrors.zone = "Working zone is required";
    }

    if (!formData.shiftStartTime) {
      newErrors.shiftStartTime = "Please select shift start time";
    }

    if (!formData.shiftDuration) {
      newErrors.shiftDuration = "Please select shift duration";
    }

    if (!formData.weeklyEarningRange) {
      newErrors.weeklyEarningRange = "Please select income range";
    }

    if (!formData.upiId.trim()) {
      newErrors.upiId = "UPI ID is required";
    } else if (!formData.upiId.includes("@")) {
      newErrors.upiId = "UPI ID must contain @ symbol";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    if (!user) {
      toast.error("User not found");
      return;
    }

    setSubmitting(true);

    try {
      await updateWorker(user.uid, {
        name: formData.name,
        city: formData.city,
        platform: formData.platform,
        zone: formData.zone,
        workingHours: `${formData.shiftStartTime} (${formData.shiftDuration}h)`,
        weeklyEarningRange: formData.weeklyEarningRange,
        upiId: formData.upiId,
        isOnboarded: true,
      });

      toast.success("Welcome to RoziRakshak!");
      router.replace("/worker/dashboard");
    } catch (error) {
      console.error("Onboarding error:", error);
      toast.error("Failed to save profile. Please try again.");
      setSubmitting(false);
    }
  };

  // Show spinner while loading or redirecting
  if (loading || !user || role === "admin" || isOnboarded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Progress Indicator */}
        <div className="text-center mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Step 1 of 1 — Complete Your Profile
          </p>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#ec4899] flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1
            className="text-2xl font-bold mb-2"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            Complete Your Profile
          </h1>
          <p className="text-sm text-muted-foreground">
            Help us personalize your insurance coverage
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="glass rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <User className="w-4 h-4 text-muted-foreground" />
              Full Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                setErrors({ ...errors, name: "" });
              }}
              placeholder="Enter your full name"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          {/* City */}
          <div className="glass rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              City
            </label>
            <select
              value={formData.city}
              onChange={(e) => {
                setFormData({ ...formData, city: e.target.value });
                setErrors({ ...errors, city: "" });
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select city</option>
              <option value="Bengaluru">Bengaluru</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Delhi">Delhi</option>
              <option value="Hyderabad">Hyderabad</option>
              <option value="Chennai">Chennai</option>
              <option value="Pune">Pune</option>
            </select>
            {errors.city && (
              <p className="text-xs text-red-500 mt-1">{errors.city}</p>
            )}
          </div>

          {/* Platform */}
          <div className="glass rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              Platform
            </label>
            <select
              value={formData.platform}
              onChange={(e) => {
                setFormData({ ...formData, platform: e.target.value });
                setErrors({ ...errors, platform: "" });
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select platform</option>
              <option value="Zepto">Zepto</option>
              <option value="Blinkit">Blinkit</option>
              <option value="Instamart">Instamart</option>
              <option value="BigBasket Now">BigBasket Now</option>
              <option value="Swiggy Instamart">Swiggy Instamart</option>
              <option value="Other">Other</option>
            </select>
            {errors.platform && (
              <p className="text-xs text-red-500 mt-1">{errors.platform}</p>
            )}
          </div>

          {/* Working Zone */}
          <div className="glass rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Working Zone
            </label>
            <input
              type="text"
              value={formData.zone}
              onChange={(e) => {
                setFormData({ ...formData, zone: e.target.value });
                setErrors({ ...errors, zone: "" });
              }}
              placeholder="e.g. Koramangala, HSR Layout"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.zone && (
              <p className="text-xs text-red-500 mt-1">{errors.zone}</p>
            )}
          </div>

          {/* Shift Start Time */}
          <div className="glass rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Shift Start Time
            </label>
            <select
              value={formData.shiftStartTime}
              onChange={(e) => {
                setFormData({ ...formData, shiftStartTime: e.target.value });
                setErrors({ ...errors, shiftStartTime: "" });
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select start time</option>
              <option value="6 AM">6 AM</option>
              <option value="7 AM">7 AM</option>
              <option value="8 AM">8 AM</option>
              <option value="9 AM">9 AM</option>
              <option value="10 AM">10 AM</option>
              <option value="11 AM">11 AM</option>
              <option value="12 PM">12 PM</option>
              <option value="1 PM">1 PM</option>
              <option value="2 PM">2 PM</option>
              <option value="3 PM">3 PM</option>
              <option value="4 PM">4 PM</option>
              <option value="5 PM">5 PM</option>
              <option value="6 PM">6 PM</option>
              <option value="7 PM">7 PM</option>
              <option value="8 PM">8 PM</option>
              <option value="9 PM">9 PM</option>
              <option value="10 PM">10 PM</option>
            </select>
            {errors.shiftStartTime && (
              <p className="text-xs text-red-500 mt-1">{errors.shiftStartTime}</p>
            )}
          </div>

          {/* Shift Duration */}
          <div className="glass rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Shift Duration
            </label>
            <select
              value={formData.shiftDuration}
              onChange={(e) => {
                setFormData({ ...formData, shiftDuration: e.target.value });
                setErrors({ ...errors, shiftDuration: "" });
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select duration</option>
              <option value="4 hours">4 hours</option>
              <option value="6 hours">6 hours</option>
              <option value="8 hours">8 hours</option>
              <option value="10 hours">10 hours</option>
              <option value="12 hours">12 hours</option>
            </select>
            {errors.shiftDuration && (
              <p className="text-xs text-red-500 mt-1">{errors.shiftDuration}</p>
            )}
          </div>

          {/* Weekly Income Range */}
          <div className="glass rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              Weekly Income Range
            </label>
            <select
              value={formData.weeklyEarningRange}
              onChange={(e) => {
                setFormData({ ...formData, weeklyEarningRange: e.target.value });
                setErrors({ ...errors, weeklyEarningRange: "" });
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select income range</option>
              <option value="₹3,000 - ₹5,000">₹3,000 - ₹5,000</option>
              <option value="₹5,000 - ₹7,000">₹5,000 - ₹7,000</option>
              <option value="₹7,000 - ₹10,000">₹7,000 - ₹10,000</option>
              <option value="₹10,000+">₹10,000+</option>
            </select>
            {errors.weeklyEarningRange && (
              <p className="text-xs text-red-500 mt-1">{errors.weeklyEarningRange}</p>
            )}
          </div>

          {/* UPI ID */}
          <div className="glass rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              UPI ID
            </label>
            <input
              type="text"
              value={formData.upiId}
              onChange={(e) => {
                setFormData({ ...formData, upiId: e.target.value });
                setErrors({ ...errors, upiId: "" });
              }}
              placeholder="yourname@upi"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.upiId && (
              <p className="text-xs text-red-500 mt-1">{errors.upiId}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Complete Profile
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
