"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  Zap,
  CloudRain,
  Thermometer,
  Wind,
  MapPin,
  Wifi,
  ArrowRight,
  CheckCircle,
  Clock,
  IndianRupee,
} from "lucide-react";
import { LoginModal } from "@/components/LoginModal";

const triggerTypes = [
  { icon: CloudRain, label: "Heavy Rain", color: "#3b82f6", desc: "Flooding & waterlogging" },
  { icon: Thermometer, label: "Extreme Heat", color: "#f97316", desc: "Unsafe outdoor temperatures" },
  { icon: Wind, label: "Hazardous AQI", color: "#8b5cf6", desc: "Severe air pollution" },
  { icon: MapPin, label: "Zone Closure", color: "#ef4444", desc: "Access restrictions" },
  { icon: Wifi, label: "Platform Outage", color: "#06b6d4", desc: "Order system disruptions" },
];

const plans = [
  {
    name: "Lite",
    price: "₹19–₹29",
    protection: "₹800",
    ideal: "Part-time riders",
    popular: false,
  },
  {
    name: "Core",
    price: "₹29–₹49",
    protection: "₹1,500",
    ideal: "Regular riders",
    popular: true,
  },
  {
    name: "Peak",
    price: "₹49–₹79",
    protection: "₹2,500",
    ideal: "Full-time riders",
    popular: false,
  },
];

const steps = [
  { icon: Shield, title: "Buy Weekly Cover", desc: "Choose a plan in under 2 minutes. Affordable, weekly protection." },
  { icon: Zap, title: "Auto-Detect Triggers", desc: "AI monitors rain, heat, AQI, zone closures, and platform outages." },
  { icon: IndianRupee, title: "Instant Payout", desc: "Verified claims trigger simulated UPI payouts within minutes." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function LandingPage() {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <LoginModal isOpen={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#ec4899] flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold font-[var(--font-outfit)]" style={{ fontFamily: "var(--font-outfit)" }}>
              RoziRakshak <span className="text-primary-light">AI</span>
            </span>
          </div>
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="animated-gradient min-h-screen flex items-center justify-center relative overflow-hidden pt-20">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#6c5ce7] rounded-full opacity-10 blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#ec4899] rounded-full opacity-10 blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[rgba(108,92,231,0.3)] bg-[rgba(108,92,231,0.1)] text-sm text-primary-light mb-6">
              <Zap className="w-4 h-4" />
              <span>AI-Powered Parametric Insurance</span>
            </div>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight mb-6"
            style={{ fontFamily: "var(--font-outfit)" }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            Protect Your{" "}
            <span className="gradient-text">Weekly Income</span>
            <br />
            When the City Shuts You Down
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            If a rider cannot work because the city shuts them down, their income
            should not vanish too. Weekly pricing, zero-touch claims, instant payouts.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <button
              onClick={() => setIsLoginModalOpen(true)}
              id="hero-cta"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white font-semibold text-lg hover:opacity-90 transition-all pulse-glow"
            >
              Start Protection
              <ArrowRight className="w-5 h-5" />
            </button>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-border text-foreground font-semibold text-lg hover:bg-secondary transition-colors"
            >
              How It Works
            </a>
          </motion.div>

          <motion.div
            className="mt-12 flex flex-wrap gap-6 justify-center text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              Income loss only
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              Weekly pricing from ₹19
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              Zero paperwork claims
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              Payout in minutes
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-4 bg-background">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              How It <span className="gradient-text">Works</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Three simple steps from vulnerability to protection
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                className="glass rounded-2xl p-8 text-center group hover:border-[rgba(108,92,231,0.4)] transition-all duration-300"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i + 1}
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <step.icon className="w-8 h-8 text-white" />
                </div>
                <h3
                  className="text-xl font-bold mb-3"
                  style={{ fontFamily: "var(--font-outfit)" }}
                >
                  {step.title}
                </h3>
                <p className="text-muted-foreground">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Coverage */}
      <section className="py-24 px-4 bg-secondary">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              What We <span className="gradient-text">Cover</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Five parametric triggers, each objectively measurable and automatically detected
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {triggerTypes.map((trigger, i) => (
              <motion.div
                key={trigger.label}
                className="glass rounded-2xl p-6 text-center group hover:border-[rgba(108,92,231,0.4)] transition-all duration-300 cursor-default"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i + 1}
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: `${trigger.color}20` }}
                >
                  <trigger.icon className="w-7 h-7" style={{ color: trigger.color }} />
                </div>
                <h3 className="font-semibold mb-1">{trigger.label}</h3>
                <p className="text-xs text-muted-foreground">{trigger.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-4 bg-background">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Weekly <span className="gradient-text">Plans</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Affordable protection aligned to your earning cycle
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                className={`rounded-2xl p-8 relative ${
                  plan.popular
                    ? "gradient-border glass bg-[rgba(108,92,231,0.05)]"
                    : "glass"
                }`}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i + 1}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <h3
                  className="text-2xl font-bold mb-2"
                  style={{ fontFamily: "var(--font-outfit)" }}
                >
                  {plan.name}
                </h3>
                <div className="text-3xl font-bold gradient-text mb-1">
                  {plan.price}
                </div>
                <p className="text-sm text-muted-foreground mb-6">/week</p>
                <div className="space-y-3 mb-8">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent" />
                    <span>Max protection: {plan.protection}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent" />
                    <span>All 5 triggers covered</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent" />
                    <span>Instant payout</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent" />
                    <span>Ideal for: {plan.ideal}</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className={`w-full text-center py-3 rounded-xl font-semibold transition-all ${
                    plan.popular
                      ? "bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white hover:opacity-90"
                      : "border border-border text-foreground hover:bg-secondary"
                  }`}
                >
                  Get {plan.name}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 animated-gradient relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/3 w-80 h-80 bg-[#6c5ce7] rounded-full opacity-15 blur-[100px]" />
          <div className="absolute bottom-0 right-1/3 w-80 h-80 bg-[#ec4899] rounded-full opacity-15 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2
            className="text-3xl sm:text-4xl font-bold mb-6"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            Ready to Protect Your <span className="gradient-text">Livelihood</span>?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-lg mx-auto">
            Join thousands of riders who never have to worry about losing income
            to external disruptions again.
          </p>
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="inline-flex items-center gap-2 px-10 py-4 rounded-full bg-white text-[#0a0a12] font-bold text-lg hover:bg-gray-100 transition-colors"
          >
            Start in 2 Minutes
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6c5ce7] to-[#ec4899] flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold">RoziRakshak AI</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 RoziRakshak AI. Built for DEVTrails 2026. Prototype — not a regulated financial product.
          </p>
        </div>
      </footer>
    </div>
  );
}
