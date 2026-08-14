"use client";

// ============================================================================
// « Ma responsabilité › Gestion » — édition de l'entité dont le compte a la charge
//
// Aiguillage pur. Toute écriture passe par une route cantonnée côté API
// (@RequireScope) : cet écran ne protège rien, il évite simplement de proposer
// l'impossible.
// ============================================================================

import { useResponsibility } from "@/lib/responsibility";
import { NoResponsibility } from "@/components/responsibility/Shared";
import { HospitalManagement } from "@/components/responsibility/HospitalViews";
import { UnitManagement } from "@/components/responsibility/UnitViews";
import { ShelterManagement } from "@/components/responsibility/ShelterViews";
import { MorgueManagement } from "@/components/responsibility/MorgueViews";
import { EquipmentPark } from "@/components/responsibility/EquipmentViews";

export default function GestionPage() {
  const { kind, entityId } = useResponsibility();

  if (!kind) return <NoResponsibility />;
  if (!entityId) return <NoResponsibility unassigned />;

  switch (kind) {
    case "hospital": return <HospitalManagement hid={entityId} />;
    case "unit": return <UnitManagement uid={entityId} />;
    case "shelter": return <ShelterManagement sid={entityId} />;
    case "morgue": return <MorgueManagement mid={entityId} />;
    case "equipment": return <EquipmentPark unitId={entityId} />;
  }
}
