"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { X } from "lucide-react";

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useSandboxStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none font-mono">
      {toasts.map((toast) => {
        let borderClass = "border-[#27272a] bg-[#111218] text-[#f4f4f5]";

        if (toast.type === "success") {
          borderClass = "border-[#064e3b] bg-[#051c14] text-[#10b981]";
        } else if (toast.type === "warning") {
          borderClass = "border-[#78350f] bg-[#1f1300] text-[#f59e0b]";
        } else if (toast.type === "error") {
          borderClass = "border-[#7f1d1d] bg-[#1a060a] text-[#ef4444]";
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto border p-3 flex items-start justify-between gap-3 text-xs animate-in slide-in-from-left duration-150 ${borderClass}`}
          >
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center justify-between font-bold uppercase tracking-wider">
                <span>{toast.title}</span>
                <span className="text-[10px] opacity-60 font-normal">{toast.timestamp}</span>
              </div>
              <p className="text-[11px] leading-tight text-[#d4d4d8] font-normal">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
