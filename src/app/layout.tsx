import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Geist } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RoziRakshak AI — Income Protection for Gig Workers",
  description:
    "AI-powered parametric income protection for India's gig workforce. Weekly pricing, zero-touch claims, instant payouts.",
  keywords: [
    "gig economy",
    "income protection",
    "parametric insurance",
    "delivery partner",
    "India",
  ],
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#6c5ce7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", inter.variable, outfit.variable, "font-sans", geist.variable)}
    >
      <body className="min-h-full flex flex-col antialiased">
        <AuthProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                background: "var(--card)",
                color: "var(--card-foreground)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
