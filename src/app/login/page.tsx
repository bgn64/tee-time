import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

async function Login() {
  if (await getSession()) redirect("/dashboard");
  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-bold">Sign in to Tee Time</h1>
      <Suspense fallback={<p role="status">Loading sign in...</p>}>
        <Login />
      </Suspense>
    </main>
  );
}
