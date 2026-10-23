"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Could not sign out. Please try again.");
        return;
      }
      // A full navigation discards prefetched authenticated React content.
      window.location.replace("/login");
    } catch {
      setError("Could not reach the server. Please try signing out again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className="rounded bg-foreground px-4 py-3 text-background disabled:opacity-50" type="button" onClick={signOut} disabled={pending}>
        {pending ? "Signing out..." : "Sign out"}
      </button>
      {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
