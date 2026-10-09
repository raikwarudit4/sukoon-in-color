"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

export function AuthForm({ mode }: AuthFormProps) {
  const isSignUp = mode === "sign-up";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    setIsSubmitting(true);

    const supabase = createClient();

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      setIsSubmitting(false);

      if (error) {
        setErrorMessage(error.message);
      } else if (data.session) {
        router.push("/");
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
      }

      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const requestedPath = new URLSearchParams(window.location.search).get("next");
    const nextPath =
      requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/";
    router.push(nextPath);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 py-12 text-[#27221f]">
      <section className="w-full max-w-md rounded-3xl border border-[#eee5de] bg-white p-7 shadow-[0_12px_40px_rgba(72,47,37,0.06)] sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-[0.12em] text-[#a15e61]">
          SUKOON IN COLOR
        </Link>
        <h1 className="mt-6 text-3xl font-medium">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#716763]">
          {isSignUp
            ? "Create an account to save your cart and continue shopping."
            : "Sign in to continue to your account and cart."}
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 outline-none transition focus:border-[#a15e61] focus:ring-2 focus:ring-[#a15e61]/15"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 outline-none transition focus:border-[#a15e61] focus:ring-2 focus:ring-[#a15e61]/15"
            />
            {isSignUp && (
              <span className="mt-1 block text-xs font-normal text-[#716763]">
                Use at least 8 characters.
              </span>
            )}
          </label>

          {errorMessage && (
            <p role="alert" className="rounded-xl bg-[#f9eeec] px-4 py-3 text-sm text-[#7c4548]">
              {errorMessage}
            </p>
          )}
          {message && (
            <p role="status" className="rounded-xl bg-[#edf4ec] px-4 py-3 text-sm text-[#456247]">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-[#a15e61] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#884d50] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Please wait…"
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#716763]">
          {isSignUp ? "Already have an account?" : "New to Sukoon in Color?"}{" "}
          <Link
            href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"}
            className="font-semibold text-[#a15e61] hover:underline"
          >
            {isSignUp ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
