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
  signOut: () => Promise<void>;
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
  signOut: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<WorkerProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);

  const useMockAuth = isMockAuthEnabled();

  const createServerSession = async (firebaseUser: User): Promise<void> => {
    const callSessionApi = async (forceRefresh: boolean): Promise<Response> => {
      const idToken = await firebaseUser.getIdToken(forceRefresh);
      return fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ idToken }),
      });
    };

    let res = await callSessionApi(false);
    if (!res.ok && res.status === 401) {
      // Retry once with force-refresh to avoid stale-token failures.
      res = await callSessionApi(true);
    }

    if (!res.ok) {
      const body = await res.json().catch(
        () => ({} as { error?: string; code?: string; hint?: string })
      );
      const code = body.code ? ` (${body.code})` : "";
      const hint = body.hint ? ` ${body.hint}` : "";
      throw new Error(
        `${body.error ?? `Failed to create server session (HTTP ${res.status})`}${code}.${hint}`.trim()
      );
    }
  };

  const clearServerSession = async (): Promise<void> => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  };

  const isPermissionDeniedError = (err: unknown): boolean => {
    if (!err || typeof err !== "object") return false;
    return "code" in err && (err as { code?: string }).code === "permission-denied";
  };

  // Re-hydrate session on auth state change (page reload / token refresh)
  useEffect(() => {
    if (useMockAuth) {
      // Mock auth doesn't persist sessions across reloads
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await createServerSession(firebaseUser);
        } catch (err) {
          console.warn("Failed to refresh server session cookie:", err);

          if (
            err instanceof Error &&
            /(PROJECT_MISMATCH|INVALID_ID_TOKEN|invalid ID token|project mismatch)/i.test(
              err.message
            )
          ) {
            // Clear stale/incompatible client auth state to prevent login/dashboard loops.
            await firebaseSignOut();
            return;
          }
        }

        setUser(firebaseUser);
        setUserProfile(null);
        setRole(null);
        setIsOnboarded(false);
        try {
          const profile = await getWorkerByUid(firebaseUser.uid);
          if (profile) {
            setUserProfile(profile);
            setRole(profile.role);
            setIsOnboarded(profile.isOnboarded ?? false);
          }
        } catch (err) {
          if (isPermissionDeniedError(err)) {
            console.warn("Worker profile read denied by Firestore rules on auth change.", err);
          } else {
            console.error("Failed to fetch worker profile on auth change:", err);
          }
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
        try {
          existingProfile = await getWorkerByUid(firebaseUser.uid);
        } catch (err) {
          if (isPermissionDeniedError(err)) {
            existingProfile = null;
          } else {
            throw err;
          }
        }

        if (!existingProfile) {
          // Create new workers document with minimal data
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
            isOnboarded: isAdmin, // Admins skip onboarding, workers need to complete it
            trustScore: 0.8,
            activePlan: null,
            claimsCount: 0,
            joinedDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          const workerDocRef = doc(db, "workers", firebaseUser.uid);
          try {
            await setDoc(workerDocRef, newProfileData, { merge: true });
          } catch (err) {
            if (isPermissionDeniedError(err)) {
              throw new Error(
                "Firestore permissions blocked profile creation. Deploy updated Firestore rules and try again."
              );
            }
            throw err;
          }

          existingProfile = {
            ...newProfileData,
            id: firebaseUser.uid,
            joinedDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        } else if (existingProfile.role !== selectedRole) {
          // Existing user switching role (e.g. logging in as admin with a worker profile).
          // Update Firestore and local profile to reflect the selected role.
          const workerDocRef = doc(db, "workers", firebaseUser.uid);
          const isNowAdmin = selectedRole === "admin";
          try {
            await setDoc(
              workerDocRef,
              {
                role: selectedRole,
                isOnboarded: isNowAdmin ? true : existingProfile.isOnboarded,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (err) {
            if (!isPermissionDeniedError(err)) throw err;
            console.warn("Could not update role in Firestore (permission denied).");
          }
          existingProfile = {
            ...existingProfile,
            role: selectedRole as UserRole,
            isOnboarded: isNowAdmin ? true : (existingProfile.isOnboarded ?? false),
          };
        }

        // Create server-side session cookie so /worker/* and /admin/* routes
        // protected by proxy can resolve the authenticated user.
        try {
          await createServerSession(firebaseUser);
        } catch (err) {
          // Avoid partial login state where client auth succeeds but server
          // session is missing, which causes redirect loops back to /login.
          await firebaseSignOut();
          throw err;
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
        await clearServerSession();
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
