import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack } from "expo-router";
import { PowerSyncContext } from "@powersync/react";

import { SystemContext, system } from "@/library/powersync/system";

export default function RootLayout() {
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    system
      .init()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: "red", textAlign: "center" }}>Failed to initialise PowerSync:</Text>
        <Text style={{ color: "#333", marginTop: 8, textAlign: "center" }}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SystemContext.Provider value={system}>
      <PowerSyncContext.Provider value={system.powersync}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </PowerSyncContext.Provider>
    </SystemContext.Provider>
  );
}
