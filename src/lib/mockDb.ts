import { WorkerProfile } from "@/types";

export interface MockUser {
  uid: string;
  phone: string;
  displayName: string;
  role: "worker" | "admin";
}

export const DEMO_OTP = "123456";

// ── Local mock user database ──────────────────────────────────────────────────
// Any phone number works for login. Role is chosen on the login screen.
// OTP: fixed demo OTP (123456).

export const MOCK_USERS: Record<"worker" | "admin", MockUser> = {
  worker: {
    uid: "worker-demo-001",
    phone: "+919876543210",
    displayName: "Arjun K.",
    role: "worker",
  },
  admin: {
    uid: "admin-demo-001",
    phone: "+910000000000",
    displayName: "Admin User",
    role: "admin",
  },
};

export const MOCK_PROFILES: Record<"worker" | "admin", WorkerProfile> = {
  worker: {
    id: "worker-demo-001",
    uid: "worker-demo-001",
    phone: "+919876543210",
    name: "Arjun K.",
    city: "Bengaluru",
    platform: "Zepto",
    zone: "Koramangala",
    workingHours: "morning",
    weeklyEarningRange: "₹6,000–₹8,000",
    upiId: "arjun@upi",
    role: "worker",
    isOnboarded: true,
    trustScore: 0.91,
    activePlan: "core",
    claimsCount: 3,
    joinedDate: "2026-01-15T00:00:00.000Z",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-20T12:00:00.000Z",
  },
  admin: {
    id: "admin-demo-001",
    uid: "admin-demo-001",
    phone: "+910000000000",
    name: "Admin User",
    city: "Bengaluru",
    platform: "Internal",
    zone: "All",
    workingHours: "full_day",
    weeklyEarningRange: "N/A",
    upiId: "",
    role: "admin",
    isOnboarded: true,
    trustScore: 1.0,
    activePlan: null,
    claimsCount: 0,
    joinedDate: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};
