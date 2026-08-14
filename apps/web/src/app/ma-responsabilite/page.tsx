"use client";

// ============================================================================
// « Ma responsabilité » — tableau de bord de l'entité dont le compte a la charge
//
// Aiguillage pur : l'entité est résolue depuis la portée ABAC servie par l'API
// à la connexion, puis la vue de la nature correspondante est rendue.
// Route jumelle : /ma-responsabilite/gestion (édition).
// Vue de supervision (superadmin) : /responsabilites.
// ============================================================================

import { useResponsibility } from "@/lib/responsibility";
import { NoResponsibility } from "@/components/responsibility/Shared";
import { HospitalDashboard } from "@/components/responsibility/HospitalViews";
import { UnitDashboard } from "@/components/responsibility/UnitViews";
import { ShelterDashboard } from "@/components/responsibility/ShelterViews";
import { MorgueDashboard } from "@/components/responsibility/MorgueViews";
import { EquipmentPark } from "@/components/responsibility/EquipmentViews";

export default function MaResponsabilitePage() {
  const { kind, entityId } = useResponsibility();

  if (!kind) return <NoResponsibility />;
  if (!entityId) return <NoResponsibility unassigned />;

  switch (kind) {
    case "hospital": return <HospitalDashboard hid={entityId} />;
    case "unit": return <UnitDashboard uid={entityId} />;
    case "shelter": return <ShelterDashboard sid={entityId} />;
    case "morgue": return <MorgueDashboard mid={entityId} />;
    // Le parc n'a pas de tableau de bord distinct (non demandé) : la gestion
    // fait office de vue d'ensemble.
    case "equipment": return <EquipmentPark unitId={entityId} />;
  }
}
