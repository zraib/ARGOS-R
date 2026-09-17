"use client";

// Racine de l'application : oriente vers l'écran d'accueil du rôle ACTIF.
// Un responsable arrive directement sur SA responsabilité ; tous les autres sur
// le tableau de bord national. Si cet écran lui est coupé (matrice rôle →
// modules, ADR 0017), le premier écran ouvert du menu prend le relais. La barre
// latérale reste libre — c'est un point d'entrée, pas un enfermement.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useArgos } from "@/lib/store";
import { isResponsibleRole } from "@/lib/responsibility";
import { HREF, firstOpenHref, moduleOpen } from "@/lib/nav";

export default function Home() {
  const router = useRouter();
  const authed = useArgos((s) => s.authed);
  const role = useArgos((s) => s.role);
  const flags = useArgos((s) => s.flags);
  const roleFeatures = useArgos((s) => s.roleFeatures);
  const myModules = useArgos((s) => s.myModules);

  useEffect(() => {
    // Tant que la session n'est pas ouverte, AppFrame affiche l'écran de
    // connexion : rediriger maintenant enverrait vers la mauvaise page.
    if (!authed) return;
    const home = isResponsibleRole(role) ? "myresp" : "dashboard";
    const open = moduleOpen(home, flags, roleFeatures[role], myModules);
    router.replace(open ? HREF[home] : (firstOpenHref(role, flags, roleFeatures[role], myModules) ?? HREF[home]));
  }, [authed, role, flags, roleFeatures, myModules, router]);

  return null;
}
