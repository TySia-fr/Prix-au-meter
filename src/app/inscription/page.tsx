import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Créer un compte" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-sm p-4 md:pt-16">
      <h1 className="text-2xl font-semibold tracking-tight">Créer un compte</h1>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
