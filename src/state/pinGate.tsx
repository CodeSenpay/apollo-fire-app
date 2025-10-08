import { getCurrentUser, getUserData, User } from '@/src/services/apiConfig';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

// Define the new, combined shape of the context data
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  unlocked: boolean;
  setUnlocked: (unlocked: boolean) => void;
  setUser: (user: User | null) => void;
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

  // Check for existing user session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First check local storage
        const storedUser = await getUserData();
        console.log(`Stored User: ${storedUser?.id}`);
        if (storedUser) {
          setUser(storedUser);
          // Only verify with API if user has an email (not a guest)
          // Guest users have email "guest@gmail.com" and no auth token
          if (storedUser.email !== "guest@gmail.com") {
            const currentUser = await getCurrentUser();
            if (currentUser) {
              setUser(currentUser);
            } else {
              setUser(null);
            }
          }
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleSetUser = (newUser: User | null) => {
    setUser(newUser);
    // If the user logs out, we must also re-lock the app
    if (!newUser) {
      setUnlocked(false);
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    unlocked,
    setUnlocked,
    setUser: handleSetUser,
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

