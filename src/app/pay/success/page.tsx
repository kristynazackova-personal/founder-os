import Link from "next/link";

export default async function SuccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="card p-8 text-center">
        <div className="text-4xl">✓</div>
        <h1 className="mt-2 text-2xl font-bold">Thank you</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Your payment went through. A receipt is on its way to your email.</p>
        <Link href="/" className="mt-6 inline-block text-xs text-[var(--muted)] underline">
          Powered by Founder OS
        </Link>
      </div>
    </main>
  );
}
