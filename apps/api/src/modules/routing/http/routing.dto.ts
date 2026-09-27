import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional } from "class-validator";
import { ROUTE_WARNINGS, TRAVEL_MODES, type RouteWarning, type TravelMode } from "@/modules/routing/routing.types";

// ============================================================================
// ARGOS — contrat HTTP du routage sûr (ADR 0039)
// ============================================================================

const LNGLAT = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } as const;
const PATH = { type: "array", items: LNGLAT } as const;

export class PlanRouteDto {
  @ApiProperty({
    ...PATH,
    minItems: 1,
    maxItems: 10,
    description:
      "Étapes [longitude, latitude] dans l'ordre : départ, étapes, arrivée. Un seul point = sortir au plus vite de la zone NRBC où il se trouve.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  points!: [number, number][];

  @ApiPropertyOptional({ enum: TRAVEL_MODES, default: "auto", description: "En véhicule (`auto`) ou à pied (`pedestrian`)." })
  @IsOptional()
  @IsIn(TRAVEL_MODES as unknown as string[])
  mode?: TravelMode;

  @ApiPropertyOptional({ default: true, description: "Contourner les obstacles posés sur la carte." })
  @IsOptional()
  @IsBoolean()
  avoidObstacles?: boolean;

  @ApiPropertyOptional({ default: true, description: "Contourner les zones des panaches NRBC en cours (danger et protection)." })
  @IsOptional()
  @IsBoolean()
  avoidNrbc?: boolean;

  @ApiPropertyOptional({ default: false, description: "Contourner aussi les zones de vigilance NRBC." })
  @IsOptional()
  @IsBoolean()
  nrbcVigilance?: boolean;
}

export class RouteLegDto {
  @ApiProperty({ enum: ["exit", "route"], description: "`exit` : sortie d'une zone NRBC (la traverse) ; `route` : trajet qui contourne." })
  kind!: "exit" | "route";
  @ApiProperty(PATH)
  coords!: [number, number][];
  @ApiProperty() km!: number;
  @ApiProperty() min!: number;
}

export class RouteReferenceDto {
  @ApiProperty(PATH)
  coords!: [number, number][];
  @ApiProperty() km!: number;
  @ApiProperty() min!: number;
}

export class RouteExitDto {
  @ApiProperty({ ...LNGLAT, description: "Point de sortie atteint, hors zone." })
  point!: [number, number];
  @ApiProperty({ description: "Kilomètres parcourus dans la zone avant d'en sortir." })
  insideKm!: number;
  @ApiProperty({ description: "Minutes passées dans la zone avant d'en sortir." })
  insideMin!: number;
  @ApiProperty({ type: [String] })
  incidentIds!: string[];
}

export class RouteApproachDto {
  @ApiProperty({ description: "Index de l'étape remplacée dans la demande." })
  index!: number;
  @ApiProperty({ ...LNGLAT, description: "L'étape demandée, dans une zone." })
  from!: [number, number];
  @ApiProperty({ ...LNGLAT, description: "Le point d'approche sûr retenu à sa place." })
  point!: [number, number];
  @ApiProperty({ type: [String] })
  incidentIds!: string[];
}

export class RouteAvoidedDto {
  @ApiProperty({ description: "Obstacles contournés (points et surfaces)." })
  obstacles!: number;
  @ApiProperty({ description: "Zones NRBC de l'heure en cours prises en compte." })
  zones!: number;
  @ApiProperty({ type: [String] })
  incidentIds!: string[];
  @ApiProperty({ type: [Number], description: "Échéances du panache évitées (H+n)." })
  hours!: number[];
}

export class RoutePlanDto {
  @ApiProperty({ description: "Moteur utilisé (`valhalla`), ou `direct` quand il est injoignable." })
  engine!: string;
  @ApiProperty({ description: "Par le réseau routier (sinon : à vol d'oiseau)." })
  road!: boolean;
  @ApiProperty({ description: "Faux : le tracé traverse un obstacle ou une zone — aucun itinéraire ne contourne tout." })
  safe!: boolean;
  @ApiProperty({ enum: TRAVEL_MODES })
  mode!: TravelMode;
  @ApiProperty({ type: [RouteLegDto] })
  legs!: RouteLegDto[];
  @ApiProperty() km!: number;
  @ApiProperty({ nullable: true, type: Number, description: "Minutes ; null à vol d'oiseau." })
  min!: number | null;
  @ApiProperty({ nullable: true, type: RouteReferenceDto, description: "Le plus court sans rien contourner, quand il diffère." })
  reference!: RouteReferenceDto | null;
  @ApiProperty({ nullable: true, type: RouteExitDto })
  exit!: RouteExitDto | null;
  @ApiProperty({ type: [RouteApproachDto] })
  approaches!: RouteApproachDto[];
  @ApiProperty({ type: RouteAvoidedDto })
  avoided!: RouteAvoidedDto;
  @ApiProperty({ enum: ROUTE_WARNINGS, isArray: true })
  warnings!: RouteWarning[];
}
