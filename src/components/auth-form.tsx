"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";

const schema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80).optional(),
  email: z.email("Adresse e-mail invalide"),
  password: z.string().min(10, "10 caractères minimum").max(128),
});

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    // Client-side validation is UX only; the server (Better Auth) validates again.
    const parsed = schema.safeParse(mode === "signin" ? { email: fd.email, password: fd.password } : fd);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setPending(true);
    const { email, password, name } = parsed.data;
    const res = mode === "signin"
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({ email, password, name: name ?? email.split("@")[0]! });
    setPending(false);
    if (res.error) {
      setFormError(mode === "signin" ? "E-mail ou mot de passe incorrect." : res.error.message ?? "Inscription impossible.");
      return;
    }
    router.push((next && next.startsWith("/") && !next.startsWith("//") ? next : "/") as never);
    router.refresh();
  }

  const field = (name: string, label: string, type: string, autoComplete: string) => (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm">{label}</label>
      <input id={name} name={name} type={type} autoComplete={autoComplete} required aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-err` : undefined}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:border-accent focus:outline-none aria-[invalid=true]:border-danger" />
      {errors[name] && <p id={`${name}-err`} className="mt-1 text-xs text-danger">{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4 animate-fade-up">
      {mode === "signup" && field("name", "Nom", "text", "name")}
      {field("email", "E-mail", "email", "email")}
      {field("password", "Mot de passe", "password", mode === "signin" ? "current-password" : "new-password")}
      {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-60">
        {pending ? "Patientez…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
      </button>
      <p className="text-center text-sm text-muted">
        {mode === "signin" ? <>Pas de compte ? <Link href="/inscription" className="text-accent hover:underline">Inscription</Link></> : <>Déjà inscrit ? <Link href="/connexion" className="text-accent hover:underline">Connexion</Link></>}
      </p>
    </form>
  );
}
