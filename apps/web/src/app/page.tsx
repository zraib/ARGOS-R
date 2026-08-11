"use client";

// Racine de l'application : oriente vers l'écran d'accueil du rôle ACTIF.
// Un responsable arrive directement sur SA responsabilité ; tous les autres sur
// le tableau de bord national. La barre latérale reste libre — c'est un point
// d'entrée, pas un enfermement.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useArgos } from "@/lib/store";
import { isResponsibleRole } from "@/lib/responsibility";

export default function Home() {
  const router = useRouter();
  const authed = useArgos((s) => s.authed);
  const role = useArgos((s) => s.role);

  useEffect(() => {
    // Tant que la session n'est pas ouverte, AppFrame affiche l'écran de
    // connexion : rediriger maintenant enverrait vers la mauvaise page.
    if (!authed) return;
    router.replace(isResponsibleRole(role) ? "/ma-responsabilite" : "/dashboard");
  }, [authed, role, router]);

  return null;
}
