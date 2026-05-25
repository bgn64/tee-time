import React from "react";
import { Stack } from "expo-router";

import { SignInGate } from "@/components/widgets/SignInGate";

export default function TodosLayout() {
  return (
    <SignInGate>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#25292e" },
          headerTintColor: "#fff",
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="index" options={{ title: "Lists" }} />
        <Stack.Screen name="[id]" options={{ title: "List" }} />
      </Stack>
    </SignInGate>
  );
}
