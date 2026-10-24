import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";
import "./login.css";

async function Login() {
  if (await getSession()) redirect("/dashboard");
  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <main className="tt-auth">
      <section className="tt-auth-card">
      <p className="tt-auth-logo">tee time<span>.</span></p>
      <h1>Sign in</h1>
      <Suspense fallback={<p role="status">Loading sign in...</p>}>
        <Login />
      </Suspense>
      </section>
    </main>
  );
}
