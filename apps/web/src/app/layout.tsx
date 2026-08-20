import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppFrame } from "@/components/shell/AppFrame";

export const metadata: Metadata = {
  title: "ARGOS — Poste de commandement",
  description:
    "ARGOS — Alerte, Réponse, Gestion des Opérations et Sinistres. Plateforme de commandement pour la gestion de crise (vue nationale).",
  icons: { icon: "/argos-logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f1f14",
  width: "device-width",
  initialScale: 1,
};

// Applique la classe de thème persistée avant l'hydratation pour éviter un flash.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('kanban_rdia_theme');if((t||'dark')!=='light'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      {/* `suppressHydrationWarning` : des extensions de navigateur (ColorZilla,
          Grammarly, gestionnaires de mots de passe…) injectent leurs attributs
          sur <body> AVANT l'hydratation — React signalait alors un écart
          serveur/client qui n'est pas de notre fait. La suppression ne porte
          que sur les attributs de CET élément, jamais sur ses enfants. */}
      <body className="font-sans" suppressHydrationWarning>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
