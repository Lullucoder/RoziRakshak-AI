"use client";

import React, { useEffect, useRef, createContext, useContext, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FileText, History, UserCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─ Theme context — consumed by profile page to render toggle ─────────────────
type WorkerTheme = "light" | "dark";

interface WorkerThemeCtx {
  theme: WorkerTheme;
  setTheme: (t: WorkerTheme) => void;
}

export const WorkerThemeContext = createContext<WorkerThemeCtx>({
  theme: "light",
  setTheme: () => {},
});

export function useWorkerTheme() {
  return useContext(WorkerThemeContext);
}
// ─────────────────────────────────────────────────────────────────────────────

const navItems = [
  { href: "/worker/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/worker/policy",    icon: FileText,         label: "Policy" },
  { href: "/worker/claims",    icon: History,          label: "Claims" },
  { href: "/worker/profile",   icon: UserCircle,       label: "Profile" },
];

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Read worker theme preference from localStorage (default: "light")
  // Worker portals should be readable in outdoor sunlight — default to light
  const [theme, setThemeState] = useState<WorkerTheme>("light");

  useEffect(() => {
    const stored = (localStorage.getItem("worker-theme") ?? "light") as WorkerTheme;
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const applyTheme = (t: WorkerTheme) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (t === "dark") {
      wrapper.classList.add("dark");
      wrapper.classList.remove("light");
    } else {
      wrapper.classList.remove("dark");
      wrapper.classList.add("light");
    }
  };

  const setTheme = useCallback((t: WorkerTheme) => {
    setThemeState(t);
    localStorage.setItem("worker-theme", t);
    applyTheme(t);
  }, []);

  return (
    <WorkerThemeContext.Provider value={{ theme, setTheme }}>
      <div
        ref={wrapperRef}
        suppressHydrationWarning
        className="worker-portal min-h-screen bg-background flex flex-col"
      >
        <main className="flex-1 pb-24 max-w-lg mx-auto w-full">{children}</main>

        {/* Bottom Navigation — 56px tap targets for gloves/wet hands */}
        <nav className="fixed bottom-0 left-0 right-0 glass border-t border-border z-50">
          <div className="max-w-lg mx-auto flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ minHeight: "56px" }}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 px-2 py-1 rounded-xl transition-all ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                  {isActive && (
                    <div className="w-1 h-1 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </WorkerThemeContext.Provider>
  );
}
