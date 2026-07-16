import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppFrame } from "@/components/shell/AppFrame";

export const metadata: Metadata = {
  title: "ARGOS — Poste de commandement",
  description:
    "ARGOS — Plateforme militaire de gestion des catastrophes (vue nationale). État-Major Général · Forces Armées Royales.",
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
      <body className="font-sans">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
