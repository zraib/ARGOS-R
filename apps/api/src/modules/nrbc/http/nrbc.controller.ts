import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { NrbcService, PLUME_MAX_HOUR } from "@/modules/nrbc/nrbc.service";
import { PLUME_MODELS, type PlumeModelId } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — adaptateur HTTP de la capacité NRBC
//
// Traduit HTTP ↔ cas d'usage, et le panache en FeatureCollection GeoJSON —
// le format que la source MapLibre du frontend consomme telle quelle. Le RBAC
// est appliqué ici, côté serveur (default-deny).
// ============================================================================

@ApiTags("nrbc")
@ApiBearerAuth()
@Controller("nrbc")
export class NrbcController {
  constructor(private readonly nrbc: NrbcService) {}

  @Get("substances")
  @RequirePermission("nrbc:view")
  @ApiOperation({
    summary: "Catalogue des substances chimiques (table 1 de l'ERG 2024).",
    description:
      "Distances d'isolement initial et d'action de protection par substance. `ergVerified` distingue " +
      "les valeurs relevées sur l'ERG 2024 de celles restant à confirmer — l'interface l'affiche.",
  })
  async substances() {
    return { substances: await this.nrbc.substances() };
  }

  @Get("plume/:incidentId")
  @RequirePermission("nrbc:view")
  @ApiOperation({
    summary: "Panache chimique estimé d'un incident NRBC (GeoJSON).",
    description:
      "Gabarits ATP-45 et/ou ERG 2024 orientés par la PRÉVISION de vent au point du rejet, à l'échéance " +
      "H+0 … H+6. C'est une estimation de planification, pas une mesure : la réponse transporte l'heure " +
      "du pas de vent utilisé, et les zones directionnelles sont omises quand la prévision est indisponible.",
  })
  @ApiQuery({ name: "models", required: false, description: "Référentiels, séparés par des virgules (atp45,erg). Défaut : les deux." })
  @ApiQuery({ name: "hour", required: false, description: `Échéance 0–${PLUME_MAX_HOUR} (H+n). Défaut : 0.` })
  async plume(
    @Param("incidentId") incidentId: string,
    @Query("models") modelsCsv?: string,
    @Query("hour") hourRaw?: string,
  ) {
    const models = (modelsCsv ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter((m): m is PlumeModelId => (PLUME_MODELS as readonly string[]).includes(m));
    const hour = hourRaw === undefined ? 0 : Number(hourRaw);
    if (!Number.isInteger(hour) || hour < 0 || hour > PLUME_MAX_HOUR) {
      throw new BadRequestException(`L'échéance doit être un entier entre 0 et ${PLUME_MAX_HOUR}.`);
    }
    const result = await this.nrbc.plume(incidentId, models, hour);
    return {
      incidentId: result.incidentId,
      substance: result.substance,
      spill: result.spill,
      hour: result.hour,
      wind: result.wind,
      models: result.models,
      generatedAt: result.generatedAt,
      // La FeatureCollection est le contrat de la source MapLibre `nrbc-plume`.
      fc: {
        type: "FeatureCollection" as const,
        features: result.zones.map((z) => ({
          type: "Feature" as const,
          properties: {
            model: z.model,
            level: z.level,
            kind: z.kind,
            radiusKm: z.radiusKm ?? null,
            reachKm: z.reachKm ?? null,
          },
          geometry: { type: "Polygon" as const, coordinates: [z.ring] },
        })),
      },
    };
  }
}
