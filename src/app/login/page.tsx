"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_OTP } from "@/lib/mockDb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, sendOtp, verifyOtp } = useAuth();
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"worker" | "admin">("worker");
  const [otp, setOtp] = useState("");
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

    router.replace(user.role === "admin" ? "/admin/dashboard" : "/worker/dashboard");
  }, [router, user]);

  const handleSendOtp = async (event: FormEvent) => {
    event.preventDefault();

    if (!phone.trim()) {
      toast.error("Enter phone number first");
      return;
    }

    try {
      await sendOtp(phone, role);
      setOtp("");
      setOtpRequestedFor(phone);
      toast.success("Demo OTP sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send OTP");
    }
  };

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault();

    if (!otp.trim()) {
      toast.error("Enter OTP");
      return;
    }

    try {
      await verifyOtp(otp);
      toast.success("Login successful");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to verify OTP");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(108,92,231,0.25),_transparent_45%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.18),_transparent_45%),#14141e] px-4">
      <Card className="w-full max-w-md border-border/70 bg-card/90 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Demo OTP Login</CardTitle>
          <CardDescription>
            Hackathon demo mode. Enter any phone number and use OTP <span className="font-semibold text-foreground">{DEMO_OTP}</span>.
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
                  variant={role === "worker" ? "default" : "outline"}
                  onClick={() => setRole("worker")}
                  disabled={loading}
                >
                  Worker
                </Button>
                <Button
                  type="button"
                  variant={role === "admin" ? "default" : "outline"}
                  onClick={() => setRole("admin")}
                  disabled={loading}
                >
                  Admin
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending OTP..." : "Send OTP"}
            </Button>
          </form>

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
                disabled={loading || !otpRequestedFor}
              />
            </div>

            {otpRequestedFor ? (
              <p className="text-xs text-muted-foreground">OTP requested for {phoneDisplay}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Request OTP first</p>
            )}

            <Button type="submit" className="w-full" disabled={loading || !otpRequestedFor}>
              {loading ? "Verifying..." : "Verify OTP & Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
