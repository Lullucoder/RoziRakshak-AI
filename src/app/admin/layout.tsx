"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Shield,
  Activity,
  Sliders,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import toast from "react-hot-toast";

// Adjusted Nav Items to match the vibe while keeping functionality
const navItems = [
  { href: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/users", icon: Users, label: "Worker Management" },
  { href: "/admin/claims", icon: MessageSquare, label: "Claim Sessions" },
  { href: "/admin/fraud", icon: Shield, label: "Fraud Monitoring" },
  { href: "#", icon: Activity, label: "Trigger Analytics" },
  { href: "#", icon: Sliders, label: "Settings & Limits" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleSignOut = () => {
    toast.success("Signed out successfully");
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Sidebar - Matching reference UI exactly */}
      <aside 
        className={`fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border z-50 flex flex-col py-6 ${isCollapsed ? 'w-20 px-2' : 'w-64 px-4'} transition-all duration-300`}
      >
        
        {/* Logo Area */}
        <div className={`flex flex-col items-center mb-8 pb-6 border-b border-sidebar-border/50`}>
          <div className={`rounded-3xl bg-primary/20 flex items-center justify-center mb-3 neon-glow border border-primary/30 transition-all ${isCollapsed ? 'w-10 h-10 rounded-2xl' : 'w-16 h-16'}`}>
            <Shield className={`text-primary drop-shadow-[0_0_8px_rgba(139,92,246,0.8)] ${isCollapsed ? 'w-5 h-5' : 'w-8 h-8'}`} />
          </div>
          {!isCollapsed && (
            <span className="text-sm font-bold tracking-wider whitespace-nowrap" style={{ fontFamily: "var(--font-outfit)" }}>
              RoziRakshak <span className="text-primary">AI</span>
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "#" && pathname.startsWith(item.href) && item.href !== "/admin/dashboard");
            const isDisabled = item.href === "#";

            if (isDisabled) {
              return (
                <button
                  key={item.label}
                  onClick={() => toast("Coming soon! 🚧", { icon: "⏳" })}
                  className={`flex items-center gap-4 rounded-2xl text-[13px] font-medium transition-all group w-full ${
                    isCollapsed ? 'justify-center p-3' : 'px-4 py-3'
                  } text-muted-foreground hover:text-foreground hover:bg-card`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-4 rounded-2xl text-[13px] font-medium transition-all group ${
                  isCollapsed ? 'justify-center p-3' : 'px-4 py-3'
                } ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-card"
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-primary-foreground" : ""}`} />
                {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out Button */}
        <div className="mt-4 pt-4 border-t border-sidebar-border/50 space-y-2">
          <button
            onClick={handleSignOut}
            className={`flex items-center gap-4 rounded-2xl text-[13px] font-medium transition-all w-full ${
              isCollapsed ? 'justify-center p-3' : 'px-4 py-3'
            } text-destructive hover:bg-[rgba(239,68,68,0.1)]`}
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="whitespace-nowrap">Sign Out</span>}
          </button>

          {/* Collapse Toggle Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`flex items-center justify-center p-2 rounded-xl text-muted-foreground hover:bg-card hover:text-foreground transition-all ${!isCollapsed && 'w-full gap-2'}`}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Collapse Menu</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 w-full bg-background relative overflow-hidden transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
        {/* Decorative background glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className={`absolute bottom-0 w-[500px] h-[500px] bg-[#f72585]/5 rounded-full blur-[120px] pointer-events-none transition-all duration-300 ${isCollapsed ? 'left-20' : 'left-64'}`} />
        
        <div className="relative z-10 w-full h-full pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
