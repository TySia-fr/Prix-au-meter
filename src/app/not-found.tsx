import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <Link href="/" className="mt-4 inline-block text-accent hover:underline">Retour à la carte</Link>
    </div>
  );
}
