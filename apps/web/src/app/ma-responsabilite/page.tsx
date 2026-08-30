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
import { OrdersInbox } from "@/components/missions/OrdersInbox";
import { RequestResource } from "@/components/missions/RequestResource";
import { SitrepForm } from "@/components/missions/SitrepForm";
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

  // Les ordres reçus passent AVANT le tableau de bord de l'entité : ce qui
  // attend un geste doit se voir avant ce qui informe (ADR 0007, lot P1-b).
  return (
    <div className="flex flex-col gap-4">
      <OrdersInbox />
      {/* Le sens montant : demander un moyen depuis son entité (lot P2-a). */}
      <RequestResource entityLabel={entityId} />
      {/* Le battement : rendre compte à la cadence du niveau d'alerte (P3-b). */}
      {kind !== "equipment" && <SitrepForm entityKind={kind} entityId={entityId} />}
      <EntityView kind={kind} entityId={entityId} />
    </div>
  );
}

/** Vue de l'entité selon sa nature. */
function EntityView({ kind, entityId }: { kind: string; entityId: string }) {
  switch (kind) {
    case "hospital": return <HospitalDashboard hid={entityId} />;
    case "unit": return <UnitDashboard uid={entityId} />;
    case "shelter": return <ShelterDashboard sid={entityId} />;
    case "morgue": return <MorgueDashboard mid={entityId} />;
    // Le parc n'a pas de tableau de bord distinct (non demandé) : la gestion
    // fait office de vue d'ensemble.
    case "equipment": return <EquipmentPark unitId={entityId} />;
    default: return <NoResponsibility />;
  }
}
