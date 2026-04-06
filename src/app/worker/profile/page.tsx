"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  ShieldCheck,
  BadgeCheck,
  ScanFace,
  Sun,
  Moon,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useWorkerTheme } from "../layout";

const DL_GREEN = "#217346";

export default function ProfilePage() {
  const { userProfile, user, signOut } = useAuth();
  const { theme, setTheme } = useWorkerTheme();
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
    // Demo KYC data so badge is visible in prototype
    aadhaar_verified: true,
    aadhaar_masked: "XXXX-XXXX-3421",
    aadhaar_verified_at: new Date("2026-04-04T16:00:00.000Z").toISOString(),
  };

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    name: profileData.name ?? "",
    city: profileData.city ?? "",
    zone: profileData.zone ?? "",
    platform: profileData.platform ?? "",
    workingHours: profileData.workingHours ?? "",
    upiId: profileData.upiId ?? "",
  });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "workers", user.uid), {
        name: editData.name,
        city: editData.city,
        zone: editData.zone,
        platform: editData.platform,
        workingHours: editData.workingHours,
        upiId: editData.upiId,
        updatedAt: serverTimestamp(),
      });
      toast.success("Profile updated successfully!");
      setEditing(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData({
      name: profileData.name ?? "",
      city: profileData.city ?? "",
      zone: profileData.zone ?? "",
      platform: profileData.platform ?? "",
      workingHours: profileData.workingHours ?? "",
      upiId: profileData.upiId ?? "",
    });
    setEditing(false);
  };

  const trustScore = typeof userProfile?.trustScore === "number" ? userProfile.trustScore : 0;

  const aadhaarVerified   = (profileData as { aadhaar_verified?: boolean }).aadhaar_verified ?? false;
  const aadhaarMasked     = (profileData as { aadhaar_masked?: string }).aadhaar_masked;
  const aadhaarVerifiedAt = (profileData as { aadhaar_verified_at?: string }).aadhaar_verified_at;

  const faceVerified   = (profileData as { face_verified?: boolean }).face_verified ?? false;
  const faceVerifiedAt = (profileData as { face_verified_at?: string }).face_verified_at;

  const verifiedDateStr = aadhaarVerifiedAt
    ? new Date(aadhaarVerifiedAt).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

  const faceVerifiedDateStr = faceVerifiedAt
    ? new Date(faceVerifiedAt).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

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

        {/* Name + KYC badge inline */}
        <div className="flex items-center gap-2 mb-1">
          {editing ? (
            <input
              value={editData.name}
              onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
              className="text-xl font-bold bg-transparent border-b-2 border-primary outline-none text-center"
              style={{ fontFamily: "var(--font-outfit)", minHeight: "48px" }}
              placeholder="Your name"
            />
          ) : (
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-outfit)" }}>
              {profileData.name}
            </h1>
          )}
          {aadhaarVerified && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 }}
              title="KYC Verified via DigiLocker"
            >
              <BadgeCheck className="w-5 h-5" style={{ color: DL_GREEN }} />
            </motion.div>
          )}
          {faceVerified && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.4 }}
              title="Face Liveness Verified"
            >
              <ScanFace className="w-5 h-5" style={{ color: DL_GREEN }} />
            </motion.div>
          )}
        </div>

        <p className="text-sm text-muted-foreground">Quick Commerce Delivery Partner</p>

        {/* KYC Verified badge pill */}
        {aadhaarVerified && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="mt-2 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: "rgba(33,115,70,0.10)",
              border: "1px solid rgba(33,115,70,0.3)",
              color: DL_GREEN,
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            KYC Verified
          </motion.div>
        )}
        {/* Face Verified badge pill */}
        {faceVerified && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="mt-1.5 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: "rgba(33,115,70,0.10)",
              border: "1px solid rgba(33,115,70,0.3)",
              color: DL_GREEN,
            }}
          >
            <ScanFace className="w-3.5 h-3.5" />
            Face Verified
          </motion.div>
        )}

        <div className="flex gap-2 mt-3">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #6c5ce7, #a855f7)", minHeight: "44px" }}
            >
              <Pencil className="w-4 h-4" />
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #10b981, #059669)", minHeight: "44px" }}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-border text-muted-foreground disabled:opacity-50"
                style={{ minHeight: "44px" }}
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* KYC Details Card (only if verified) */}
      {aadhaarVerified && (
        <motion.div
          className="rounded-2xl p-4 mb-5"
          style={{
            background: "rgba(33,115,70,0.06)",
            border: "1px solid rgba(33,115,70,0.25)",
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4" style={{ color: DL_GREEN }} />
            <span className="text-sm font-semibold" style={{ color: DL_GREEN }}>
              Identity Verified
            </span>
          </div>
          <div className="space-y-2">
            {aadhaarMasked && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Aadhaar</span>
                <span className="text-xs font-bold font-mono" style={{ color: DL_GREEN }}>
                  {aadhaarMasked}
                </span>
              </div>
            )}
            {verifiedDateStr && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Verified on</span>
                <span className="text-xs font-medium text-foreground">{verifiedDateStr}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Method</span>
              <span className="text-xs font-semibold" style={{ color: DL_GREEN }}>DigiLocker</span>
            </div>
            {faceVerified && (
              <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "rgba(33,115,70,0.2)" }}>
                <span className="text-xs text-muted-foreground">Liveness check</span>
                <span className="text-xs font-semibold" style={{ color: DL_GREEN }}>
                  ✓ Passed{faceVerifiedDateStr ? ` on ${faceVerifiedDateStr}` : ""}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

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
          {aadhaarVerified && (
            <span style={{ color: DL_GREEN }}> KYC boost applied.</span>
          )}
        </p>
      </motion.div>

      {/* Profile Details */}
      <div className="space-y-2 mb-6">
        {[
          { 
            icon: Phone, 
            label: "Phone", 
            field: null,
            value: profileData.phone || 
                   (user as { phoneNumber?: string | null } | null)?.phoneNumber || 
                   "Not available"
          },
          { icon: MapPin,    label: "City",          field: "city",         value: editData.city },
          { icon: MapPin,    label: "Zone",          field: "zone",         value: editData.zone },
          { icon: Briefcase, label: "Platform",      field: "platform",     value: editData.platform },
          { icon: Clock,     label: "Working Hours", field: "workingHours", value: editData.workingHours },
          { icon: Wallet,    label: "UPI ID",        field: "upiId",        value: editData.upiId },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            className="glass rounded-xl p-4 flex items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * (i + 2) }}
          >
            <item.icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
              {editing && item.field ? (
                item.field === "workingHours" ? (
                  <select
                    value={editData[item.field as keyof typeof editData]}
                    onChange={(e) => setEditData(prev => ({ 
                      ...prev, 
                      [item.field as string]: e.target.value 
                    }))}
                    className="text-sm font-medium bg-transparent border-b border-primary outline-none w-full"
                    style={{ minHeight: "32px" }}
                  >
                    {["6 AM","7 AM","8 AM","9 AM","10 AM","11 AM",
                      "12 PM","1 PM","2 PM","3 PM","4 PM","5 PM",
                      "6 PM","7 PM","8 PM","9 PM","10 PM"].map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                ) : item.field === "platform" ? (
                  <select
                    value={editData[item.field as keyof typeof editData]}
                    onChange={(e) => setEditData(prev => ({ 
                      ...prev, 
                      [item.field as string]: e.target.value 
                    }))}
                    className="text-sm font-medium bg-transparent border-b border-primary outline-none w-full"
                    style={{ minHeight: "32px" }}
                  >
                    {["Zepto","Blinkit","Instamart",
                      "BigBasket Now","Swiggy Instamart","Other"].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={editData[item.field as keyof typeof editData]}
                    onChange={(e) => setEditData(prev => ({ 
                      ...prev, 
                      [item.field as string]: e.target.value 
                    }))}
                    className="text-sm font-medium bg-transparent border-b border-primary outline-none w-full"
                    style={{ minHeight: "32px" }}
                    placeholder={item.label}
                  />
                )
              ) : (
                <p className="text-sm font-medium">{item.value || "—"}</p>
              )}
            </div>
            {!editing && (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </motion.div>
        ))}
      </div>

      {/* ── Display Mode ─────────────────────────────────────────────── */}
      <motion.div
        className="glass rounded-2xl p-4 mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Display Mode
        </p>
        <div className="flex items-center gap-2">
          {/* Light button */}
          <button
            id="worker-theme-light-btn"
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
            style={{ minHeight: "48px" }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
              theme === "light"
                ? "bg-amber-50 border-2 border-amber-400 text-amber-700"
                : "glass border border-border text-muted-foreground hover:border-amber-300"
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>Light</span>
            <span className="text-[10px] opacity-70 hidden sm:inline">(outdoor)</span>
          </button>

          {/* Dark button */}
          <button
            id="worker-theme-dark-btn"
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
            style={{ minHeight: "48px" }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
              theme === "dark"
                ? "bg-slate-800 border-2 border-slate-500 text-slate-100"
                : "glass border border-border text-muted-foreground hover:border-slate-400"
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>Dark</span>
            <span className="text-[10px] opacity-70 hidden sm:inline">(indoor)</span>
          </button>
        </div>
      </motion.div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={() => toast.success("₹1,250 received this week — 2 auto-approved claims")}
          style={{ minHeight: "48px" }}
          className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-muted transition-colors"
        >
          <Shield className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium flex-1 text-left">Payout History</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          onClick={handleSignOut}
          style={{ minHeight: "48px" }}
          className="w-full rounded-xl p-4 flex items-center gap-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.15)] transition-colors"
        >
          <LogOut className="w-5 h-5 text-destructive" />
          <span className="text-sm font-medium text-destructive">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
