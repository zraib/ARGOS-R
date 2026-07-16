import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class ToggleFlagDto {
  @ApiProperty({ description: "Nouvel état du flag" })
  @IsBoolean()
  enabled!: boolean;
}
