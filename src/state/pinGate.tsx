// src/state/pinGate.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";

type Ctx = { unlocked: boolean; setUnlocked: (v: boolean) => void };
const PinGateCtx = createContext<Ctx | undefined>(undefined);

export function PinGateProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);

  // Re-lock when the app goes to background (optional; tweak as you like)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") setUnlocked(false);
    });
    return () => sub.remove();
  }, []);

  return (
    <PinGateCtx.Provider value={{ unlocked, setUnlocked }}>
      {children}
    </PinGateCtx.Provider>
  );
}

export function usePinGate() {
  const ctx = useContext(PinGateCtx);
  if (!ctx) throw new Error("usePinGate must be used inside PinGateProvider");
  return ctx;
}
