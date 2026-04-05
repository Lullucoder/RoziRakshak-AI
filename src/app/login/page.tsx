"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type ConfirmationResult } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { sendOTP } from "@/lib/auth";
import { useRecaptcha } from "@/lib/hooks/useRecaptcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const { user, role, loading, verifyOtp, signInWithGoogle } = useAuth();
  const { recaptchaRef, verifier, resetVerifier } = useRecaptcha();

  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState<"worker" | "admin">("worker");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [otpRequestedFor, setOtpRequestedFor] = useState<string | null>(null);

  const phoneDisplay = useMemo(() => {
    if (!otpRequestedFor) {
      return "";
    }

    const cleaned = otpRequestedFor.trim();
    if (cleaned.length <= 4) {
      return cleaned;
    }

    return `${"*".repeat(Math.max(0, cleaned.length - 4))}${cleaned.slice(-4)}`;
  }, [otpRequestedFor]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (role === "admin") {
      router.replace("/admin/dashboard");
      return;
    }

    if (role === "worker") {
      router.replace("/worker/dashboard");
      return;
    }

    // Authenticated but role/profile not resolved yet → continue onboarding.
    router.replace("/onboarding");
  }, [router, user, role]);

  const handleSendOtp = async (event: FormEvent) => {
    event.preventDefault();

    if (!phone.trim()) {
      toast.error("Enter phone number first");
      return;
    }

    if (!verifier) {
      toast.error("reCAPTCHA not ready. Please wait a moment.");
      return;
    }

    try {
      const result = await sendOTP(phone, verifier);
      setConfirmationResult(result);
      setOtp("");
      setOtpRequestedFor(phone);
      toast.success("OTP sent!");
    } catch (error) {
      resetVerifier();
      toast.error(error instanceof Error ? error.message : "Failed to send OTP");
    }
  };

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault();

    if (!otp.trim()) {
      toast.error("Enter OTP");
      return;
    }

    if (!confirmationResult) {
      toast.error("Please request an OTP first.");
      return;
    }

    try {
      await verifyOtp(confirmationResult, otp, selectedRole);
      toast.success("Login successful");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to verify OTP");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(108,92,231,0.25),_transparent_45%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.18),_transparent_45%),#14141e] px-4">
      <Card className="w-full max-w-md border-border/70 bg-card/90 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Phone Login</CardTitle>
          <CardDescription>
            Enter your phone number to receive a one-time password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="space-y-4" onSubmit={handleSendOtp}>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                inputMode="numeric"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedRole === "worker" ? "default" : "outline"}
                  onClick={() => setSelectedRole("worker")}
                  disabled={loading}
                >
                  Worker
                </Button>
                <Button
                  type="button"
                  variant={selectedRole === "admin" ? "default" : "outline"}
                  onClick={() => setSelectedRole("admin")}
                  disabled={loading}
                >
                  Admin
                </Button>
              </div>
            </div>

            {/* Invisible reCAPTCHA container */}
            <div ref={recaptchaRef} />

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending OTP..." : "Send OTP"}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Google Sign-In */}
          <Button
            id="google-signin-btn"
            type="button"
            variant="outline"
            className="w-full flex items-center justify-center gap-2.5"
            disabled={loading}
            onClick={async () => {
              try {
                await signInWithGoogle(selectedRole);
                toast.success("Login successful");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Google sign-in failed.");
              }
            }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <form className="space-y-3" onSubmit={handleVerifyOtp}>
            <div className="space-y-2">
              <Label htmlFor="otp">Enter OTP</Label>
              <Input
                id="otp"
                maxLength={6}
                inputMode="numeric"
                placeholder="6-digit OTP"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                disabled={loading || !confirmationResult}
              />
            </div>

            {otpRequestedFor ? (
              <p className="text-xs text-muted-foreground">OTP sent to {phoneDisplay}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Request OTP first</p>
            )}

            <Button type="submit" className="w-full" disabled={loading || !confirmationResult}>
              {loading ? "Verifying..." : "Verify OTP & Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
