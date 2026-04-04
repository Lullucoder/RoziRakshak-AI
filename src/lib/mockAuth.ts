/**
 * Mock Authentication System
 * 
 * Bypasses Firebase Auth and reCAPTCHA for development/testing.
 * Enable by setting NEXT_PUBLIC_USE_MOCK_AUTH=true in .env
 * 
 * Test credentials:
 * - Any 10-digit phone number
 * - OTP: 123456
 */

import type { User } from "firebase/auth";
import type { WorkerProfile, UserRole } from "@/types";

// Mock user storage (in-memory for demo)
const mockUsers = new Map<string, WorkerProfile>();

// Mock Firebase User object
function createMockUser(phone: string): User {
  const uid = `mock_${phone}`;
  return {
    uid,
    phoneNumber: `+91${phone}`,
    displayName: null,
    email: null,
    photoURL: null,
    providerId: "phone",
    emailVerified: false,
    isAnonymous: false,
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString(),
    },
    providerData: [],
    refreshToken: "",
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => "mock_token",
    getIdTokenResult: async () => ({
      token: "mock_token",
      expirationTime: "",
      authTime: "",
      issuedAtTime: "",
      signInProvider: "phone",
      signInSecondFactor: null,
      claims: {},
    }),
    reload: async () => {},
    toJSON: () => ({}),
  } as User;
}

// Mock OTP verification
export async function mockSendOTP(phone: string): Promise<string> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  console.log(`[Mock Auth] OTP sent to +91${phone}: 123456`);
  return `mock_confirmation_${phone}`;
}

export async function mockVerifyOTP(
  confirmationId: string,
  otp: string,
  phone: string
): Promise<User> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (otp !== "123456") {
    throw new Error("Invalid OTP. Use 123456 for mock auth.");
  }

  const user = createMockUser(phone);
  console.log(`[Mock Auth] User authenticated:`, user.uid);
  
  return user;
}

// Mock user profile operations
export async function mockGetUserProfile(uid: string): Promise<WorkerProfile | null> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));
  
  return mockUsers.get(uid) || null;
}

export async function mockCreateUserProfile(
  uid: string,
  phone: string,
  role: UserRole
): Promise<WorkerProfile> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  const isAdmin = role === "admin";
  
  const profile: WorkerProfile = {
    id: uid,
    uid,
    phone: `+91${phone}`,
    name: "",
    city: "",
    platform: "",
    zone: "",
    workingHours: "",
    weeklyEarningRange: "",
    upiId: "",
    role,
    isOnboarded: isAdmin, // admins skip onboarding
    trustScore: 0.8,
    activePlan: null,
    claimsCount: 0,
    joinedDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mockUsers.set(uid, profile);
  console.log(`[Mock Auth] Created user profile:`, profile);
  
  return profile;
}

export async function mockUpdateUserProfile(
  uid: string,
  updates: Partial<WorkerProfile>
): Promise<void> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  const existing = mockUsers.get(uid);
  if (!existing) {
    throw new Error("User profile not found");
  }

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  mockUsers.set(uid, updated);
  console.log(`[Mock Auth] Updated user profile:`, updated);
}

// Mock sign out
export async function mockSignOut(): Promise<void> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log(`[Mock Auth] User signed out`);
}

// Check if mock auth is enabled
export function isMockAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";
}
