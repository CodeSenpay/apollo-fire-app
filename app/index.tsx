import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import Loading from "../src/components/loading";
export default function Index() {
    const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Simulate auth check
    setTimeout(() => {
      setIsLoggedIn(false); // change to true if user is logged in
      setLoading(false);
    }, 5000);
  }, []);

if (loading) return <Loading/>; // Or loading screen
  return isLoggedIn ? <Redirect href="/dashboard" /> : <Redirect href="/login" />;
}
