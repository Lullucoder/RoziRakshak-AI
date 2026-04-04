"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, type User, type ConfirmationResult } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { getWorkerByUid } from "@/lib/firestore";
import { verifyOTP, firebaseSignOut } from "@/lib/auth";
import { WorkerProfile, UserRole } from "@/types";
import {
  isMockAuthEnabled,
  mockVerifyOTP,
  mockGetUserProfile,
  mockCreateUserProfile,
  mockSignOut,
} from "@/lib/mockAuth";

// ─── Context Type ─────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  userProfile: WorkerProfile | null;
  role: UserRole | null;
  isOnboarded: boolean;
  loading: boolean;
  verifyOtp: (
    confirmationResultOrPhone: ConfirmationResult | string,
    otp: string,
    selectedRole: "worker" | "admin"
  ) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  role: null,
  isOnboarded: false,
  loading: true,
  verifyOtp: async () => {
    throw new Error("Not implemented");
  },
  signOut: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<WorkerProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);

  const useMockAuth = isMockAuthEnabled();

  // Re-hydrate session on auth state change (page reload / token refresh)
  useEffect(() => {
    if (useMockAuth) {
      // Mock auth doesn't persist sessions across reloads
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const profile = await getWorkerByUid(firebaseUser.uid);
          if (profile) {
            setUserProfile(profile);
            setRole(profile.role);
            setIsOnboarded(profile.isOnboarded ?? false);
          }
        } catch (err) {
          console.error("Failed to fetch worker profile on auth change:", err);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setRole(null);
        setIsOnboarded(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [useMockAuth]);

  // ─── Verify OTP & provision user ───────────────────────────────────────────

  const verifyOtp = async (
    confirmationResultOrPhone: ConfirmationResult | string,
    otp: string,
    selectedRole: "worker" | "admin"
  ) => {
    setLoading(true);

    try {
      let firebaseUser: User;
      let existingProfile: WorkerProfile | null;

      if (useMockAuth) {
        // ── Mock Auth Flow ──────────────────────────────────────────────
        const phone = typeof confirmationResultOrPhone === "string" 
          ? confirmationResultOrPhone 
          : "";
        
        firebaseUser = await mockVerifyOTP("", otp, phone);
        existingProfile = await mockGetUserProfile(firebaseUser.uid);

        if (!existingProfile) {
          existingProfile = await mockCreateUserProfile(
            firebaseUser.uid,
            phone,
            selectedRole
          );
        }
      } else {
        // ── Firebase Auth Flow ──────────────────────────────────────────
        if (typeof confirmationResultOrPhone === "string") {
          throw new Error("Invalid confirmation result");
        }

        const credential = await verifyOTP(confirmationResultOrPhone, otp);
        firebaseUser = credential.user;
        existingProfile = await getWorkerByUid(firebaseUser.uid);

        if (!existingProfile) {
          // Create new workers document
          const isAdmin = selectedRole === "admin";

          const newProfileData = {
            uid: firebaseUser.uid,
            phone: firebaseUser.phoneNumber ?? "",
            name: "",
            city: "",
            platform: "",
            zone: "",
            workingHours: "",
            weeklyEarningRange: "",
            upiId: "",
            role: selectedRole as UserRole,
            isOnboarded: isAdmin,
            trustScore: 0.8,
            activePlan: null,
            claimsCount: 0,
            joinedDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          const workerDocRef = doc(db, "workers", firebaseUser.uid);
          await setDoc(workerDocRef, newProfileData);

          existingProfile = {
            ...newProfileData,
            id: firebaseUser.uid,
            joinedDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      }

      setUser(firebaseUser);
      setUserProfile(existingProfile);
      setRole(existingProfile.role);
      setIsOnboarded(existingProfile.isOnboarded ?? false);
    } finally {
      setLoading(false);
    }
  };

  // ─── Sign Out ──────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    try {
      if (useMockAuth) {
        await mockSignOut();
      } else {
        await firebaseSignOut();
      }
    } catch (err) {
      console.error("Sign-out error:", err);
    }
    setUser(null);
    setUserProfile(null);
    setRole(null);
    setIsOnboarded(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, userProfile, role, isOnboarded, loading, verifyOtp, signOut: handleSignOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
