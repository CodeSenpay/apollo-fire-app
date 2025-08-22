import { Redirect } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

SplashScreen.preventAutoHideAsync();

export default function Index() {
  useEffect(() => {
    const prepare = async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await SplashScreen.hideAsync();
    };

    prepare();
  }, []);

  return <Redirect href="/dashboard" />;
}
