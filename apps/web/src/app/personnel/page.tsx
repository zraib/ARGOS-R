"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/responsibility/Shared";

/**
 * L'ancien écran « Personnel » — un roster fictif — est absorbé par les
 * Ressources (ADR 0016) : l'adresse reste, elle renvoie vers l'onglet Personnel.
 */
export default function PersonnelPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ressources?tab=persons");
  }, [router]);
  return <Loading />;
}
