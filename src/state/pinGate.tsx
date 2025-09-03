import { auth } from '@/src/services/firebaseConfig';
import { onAuthStateChanged, User } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

// Define the new, combined shape of the context data
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  unlocked: boolean;
  setUnlocked: (unlocked: boolean) => void;
}

// Create the context
const PinGateCtx = createContext<AuthContextType | undefined>(undefined);

// Rename the provider for clarity
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);

  // Re-lock the app when it goes to the background
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState.match(/inactive|background/)) {
        setUnlocked(false);
        console.log("App has gone to the background, re-locking PIN gate.");
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Listen for Firebase authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // If the user logs out, we must also re-lock the app
      if (!currentUser) {
        setUnlocked(false);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    unlocked,
    setUnlocked,
  };

  return (
    <PinGateCtx.Provider value={value}>
      {!loading && children}
    </PinGateCtx.Provider>
  );
}

// Rename the hook for clarity
export function useAuth() {
  const ctx = useContext(PinGateCtx);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}

