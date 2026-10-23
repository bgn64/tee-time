"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (result.error) {
        setError(result.error.status === 401
          ? "Email or password is incorrect."
          : result.error.status === 429
            ? "Too many attempts. Please wait before trying again."
            : "Unable to sign in. Please try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={signIn} className="flex flex-col gap-5" aria-busy={pending}>
      <div className="flex flex-col gap-2">
        <label htmlFor="email">Email</label>
        <input className="rounded border px-3 py-2" id="email" name="email" type="email" autoComplete="username" required disabled={pending} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password">Password</label>
        <input className="rounded border px-3 py-2" id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={pending} />
      </div>
      {error && <p role="alert" className="text-red-700 dark:text-red-400">{error}</p>}
      <button className="rounded bg-foreground px-4 py-3 text-background disabled:opacity-50" disabled={pending} type="submit">
        {pending ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-sm">Accounts are created locally by the household administrator. Public signup and email recovery are not available.</p>
      <Link className="underline underline-offset-4" href="/">Back home</Link>
    </form>
  );
}
