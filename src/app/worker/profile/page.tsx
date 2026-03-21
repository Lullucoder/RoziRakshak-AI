"use client";

import React from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import {
  UserCircle,
  Phone,
  MapPin,
  Briefcase,
  Clock,
  Wallet,
  Shield,
  LogOut,
  ChevronRight,
  Star,
} from "lucide-react";
import toast from "react-hot-toast";

export default function ProfilePage() {
  const { userProfile, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    signOut();
    toast.success("Signed out successfully");
    router.push("/");
  };

  const profileData = userProfile || {
    name: "Arjun K.",
    phone: "+919876543210",
    city: "Bengaluru",
    platform: "Zepto",
    zone: "Koramangala",
    workingHours: "Morning",
    upiId: "arjun@upi",
    trustScore: 0.91,
  };

  const items = [
    { icon: Phone, label: "Phone", value: profileData.phone },
    { icon: MapPin, label: "City & Zone", value: `${profileData.city}, ${profileData.zone}` },
    { icon: Briefcase, label: "Platform", value: profileData.platform },
    { icon: Clock, label: "Working Hours", value: profileData.workingHours },
    { icon: Wallet, label: "UPI ID", value: profileData.upiId },
  ];

  const trustScore = typeof profileData.trustScore === "number" ? profileData.trustScore : 0.91;

  return (
    <div className="px-4 pt-6">
      {/* Header */}
      <motion.div
        className="flex flex-col items-center mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#ec4899] flex items-center justify-center mb-3">
          <UserCircle className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-outfit)" }}>
          {profileData.name}
        </h1>
        <p className="text-sm text-muted-foreground">Quick Commerce Delivery Partner</p>
      </motion.div>

      {/* Trust Score */}
      <motion.div
        className="glass rounded-2xl p-4 mb-6"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-warning" />
            <span className="text-sm font-semibold">Trust Score</span>
          </div>
          <span className="text-lg font-bold text-accent">{(trustScore * 100).toFixed(0)}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#10b981] to-[#059669]"
            initial={{ width: 0 }}
            animate={{ width: `${trustScore * 100}%` }}
            transition={{ duration: 1, delay: 0.3 }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          High trust = lower premiums. Maintain consistent activity for better rates.
        </p>
      </motion.div>

      {/* Profile Details */}
      <div className="space-y-2 mb-6">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            className="glass rounded-xl p-4 flex items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * (i + 2) }}
          >
            <item.icon className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
              <p className="text-sm font-medium">{item.value}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-muted transition-colors">
          <Shield className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium flex-1 text-left">Payout History</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          onClick={handleSignOut}
          className="w-full rounded-xl p-4 flex items-center gap-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.15)] transition-colors"
        >
          <LogOut className="w-5 h-5 text-destructive" />
          <span className="text-sm font-medium text-destructive">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
