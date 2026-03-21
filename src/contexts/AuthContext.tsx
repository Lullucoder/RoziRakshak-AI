"use client";

import React, { createContext, useContext, useState } from "react";
import { WorkerProfile } from "@/types";
import { DEMO_OTP, MOCK_USERS, MOCK_PROFILES, MockUser } from "@/lib/mockDb";

interface AuthContextType {
  user: MockUser | null;
  userProfile: WorkerProfile | null;
  loading: boolean;
  login: (role: "worker" | "admin", phone?: string) => void;
  sendOtp: (phone: string, role: "worker" | "admin") => Promise<void>;
  verifyOtp: (otp: string) => Promise<MockUser>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: false,
  login: () => {},
  sendOtp: async () => {},
  verifyOtp: async () => {
    throw new Error("Not implemented");
  },
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [userProfile, setUserProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{
    phone: string;
    role: "worker" | "admin";
  } | null>(null);

  const login = (role: "worker" | "admin", phone?: string) => {
    const baseUser = MOCK_USERS[role];
    const baseProfile = MOCK_PROFILES[role];
    const resolvedPhone = phone?.trim() || baseUser.phone;

    setUser({
      ...baseUser,
      phone: resolvedPhone,
    });
    setUserProfile({
      ...baseProfile,
      phone: resolvedPhone,
    });
  };

  const sendOtp = async (phone: string, role: "worker" | "admin") => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setPendingLogin({ phone: phone.trim(), role });
    setLoading(false);
  };

  const verifyOtp = async (otp: string) => {
    if (!pendingLogin) {
      throw new Error("No OTP request found. Please request OTP again.");
    }

    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (otp.trim() !== DEMO_OTP) {
      setLoading(false);
      throw new Error("Invalid OTP. Use the demo OTP shown on the screen.");
    }

    login(pendingLogin.role, pendingLogin.phone);
    setPendingLogin(null);
    setLoading(false);
    return {
      ...MOCK_USERS[pendingLogin.role],
      phone: pendingLogin.phone,
    };
  };

  const signOut = () => {
    setUser(null);
    setUserProfile(null);
    setPendingLogin(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, userProfile, loading, login, sendOtp, verifyOtp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
