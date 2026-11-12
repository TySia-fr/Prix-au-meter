"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      onClick={async () => {
        await authClient.signOut();
        router.refresh();
      }}
    >
      Déconnexion
    </button>
  );
}
