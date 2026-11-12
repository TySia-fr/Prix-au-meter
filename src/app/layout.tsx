import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "Prix au mètre — prix immobiliers par rue", template: "%s · Prix au mètre" },
  description: "Explorez le prix médian au m² des maisons et appartements, rue par rue, à partir des données officielles DVF.",
  // DVF terms of use forbid search-engine indexing of the data.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0b0f", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 rounded-md bg-accent px-3 py-2 text-accent-fg">
          Aller au contenu
        </a>
        <SiteHeader />
        <main id="contenu" className="flex-1 flex flex-col">{children}</main>
        <footer className="border-t border-border px-4 py-3 text-xs text-muted">
          Source : Demandes de valeurs foncières (DGFiP), version géolocalisée Etalab — Licence Ouverte 2.0 ·
          Quartiers : Contours IRIS® (IGN/INSEE) · Fond de carte : OpenFreeMap, © OpenMapTiles, © OpenStreetMap ·
          Médianes affichées uniquement à partir de 10 ventes.
        </footer>
      </body>
    </html>
  );
}
