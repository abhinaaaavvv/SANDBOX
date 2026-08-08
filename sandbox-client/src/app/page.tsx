"use client";

import React from "react";
import { SandboxProvider, useSandboxStore } from "@/context/SandboxContext";
import { Header } from "@/components/Header";
import { ParticipantDashboard } from "@/components/ParticipantDashboard";
import { AdminPanel } from "@/components/AdminPanel";
import { ToastContainer } from "@/components/ToastContainer";
import { VideoOverlay } from "@/components/VideoOverlay";

function MainContent() {
  const { activeTab } = useSandboxStore();

  return (
    <main className="min-h-screen pb-16 bg-[#090a0f] dark:bg-[#090a0f] light:bg-[#fafafa] text-[#d4d4d8] dark:text-[#d4d4d8] light:text-[#18181b] selection:bg-[#27272a] selection:text-[#f4f4f5] transition-colors">
      <Header />

      {activeTab === "participant" && <ParticipantDashboard />}
      {activeTab === "admin" && <AdminPanel />}

      {/* Global Interactive Overlays */}
      <VideoOverlay />
      <ToastContainer />
    </main>
  );
}

export default function Home() {
  return (
    <SandboxProvider>
      <MainContent />
    </SandboxProvider>
  );
}
