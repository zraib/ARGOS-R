import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, Length } from "class-validator";
import { AIRCRAFT_ROLES, type AircraftRole } from "@/modules/aviation/aircraft.types";

// ============================================================================
// ARGOS — DTO du suivi aérien
//
// Les propriétés sont typées nommément (et non `Record<string, unknown>`) pour
// que le client généré depuis l'OpenAPI porte de vrais types côté web.
// ============================================================================

export class AddAircraftDto {
  @ApiProperty({
    description:
      "Identifiant de l'aéronef : immatriculation (CN-TZS), indicatif d'appel (GRM01), " +
      "code transpondeur IFF (7001) ou adresse OACI 24 bits (02a101). La nature est déduite de la forme.",
    example: "CN-TZS",
  })
  @IsString()
  @Length(3, 14)
  code!: string;

  @ApiProperty({ description: "Libellé affiché sur la carte.", example: "Canadair 01" })
  @IsString()
  @Length(1, 60)
  label!: string;

  @ApiProperty({ description: "Rôle opérationnel.", enum: AIRCRAFT_ROLES, example: "waterbomber" })
  @IsIn(AIRCRAFT_ROLES as readonly string[])
  role!: AircraftRole;

  @ApiPropertyOptional({ description: "Incident auquel l'appareil est engagé." })
  @IsOptional()
  @IsString()
  incidentId?: string;

  @ApiPropertyOptional({
    description: "Adresse OACI 24 bits, si connue. Seule clé d'appariement sans ambiguïté.",
    example: "02a101",
  })
  @IsOptional()
  @IsString()
  icao24?: string;
}

export class UpdateAircraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  label?: string;

  @ApiPropertyOptional({ enum: AIRCRAFT_ROLES })
  @IsOptional()
  @IsIn(AIRCRAFT_ROLES as readonly string[])
  role?: AircraftRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incidentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
