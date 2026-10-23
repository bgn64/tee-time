import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { LogoutButton } from "./logout-button";

async function Dashboard() {
  const user = await requireUser();
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Welcome, {user.name}</h1>
      <p>Signed in as <strong>{user.email}</strong>.</p>
      <p>This is your private dashboard. Your session was verified on the server before these details were returned.</p>
      <LogoutButton />
    </section>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Suspense fallback={<p role="status">Checking your session...</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
