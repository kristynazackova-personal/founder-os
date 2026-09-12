"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "@/app/actions/auth";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? loginAction : signupAction, undefined);
  return (
    <form action={action} className="card mx-auto w-full max-w-md p-8">
      <h1 className="text-xl font-bold">{mode === "login" ? "Log in" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{mode === "login" ? "Back to your diagnosis." : "Free until you get paid. No card needed."}</p>
      <input type="hidden" name="next" value={next} />
      {mode === "signup" ? (
        <div className="mt-5">
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" className="input" placeholder="Your name" autoComplete="name" />
        </div>
      ) : null}
      <div className="mt-4">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required className="input" placeholder="you@example.com" autoComplete="email" />
      </div>
      <div className="mt-4">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" required minLength={8} className="input" placeholder="At least 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </div>
      {state?.error ? <p className="mt-4 text-sm text-red-700">{state.error}</p> : null}
      <button type="submit" className="btn btn-primary mt-6 w-full" disabled={pending}>
        {pending ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
      </button>
      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have one?{" "}
            <Link className="underline" href={`/login?next=${encodeURIComponent(next)}`}>
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
