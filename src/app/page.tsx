import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest">Tee Time</p>
      <h1 className="text-4xl font-bold">Your household, signed in.</h1>
      <p>A private starting point for your home app. Sign in with your household account to continue.</p>
      <nav className="flex gap-6">
        <Link className="underline underline-offset-4" href="/login">Sign in</Link>
        <Link className="underline underline-offset-4" href="/dashboard">Dashboard</Link>
      </nav>
    </main>
  );
}
