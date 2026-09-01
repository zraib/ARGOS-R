import { interval, map, merge, of, type Observable } from "rxjs";
import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  Sse,
  UploadedFile,
  UseInterceptors,
  type MessageEvent,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { HEARTBEAT_MS, RealtimeService } from "@/modules/realtime/realtime.service";
import { AttachmentsService, MAX_BYTES, type UploadedFileLike } from "@/modules/realtime/attachments.service";

// ============================================================================
// ARGOS — flux temps réel et pièces jointes (lot COMMS)
//
// Le flux est GARDÉ comme le reste : `comms:view`. Un canal poussé en temps
// réel doit être soumis aux mêmes droits qu'un canal lu par requête, sinon le
// temps réel devient la porte dérobée du RBAC.
// ============================================================================

@ApiTags("comms")
@ApiBearerAuth()
@Controller("comms")
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly attachments: AttachmentsService,
  ) {}

  @Sse("stream")
  @RequirePermission("comms:view")
  @ApiOperation({
    summary: "Flux temps réel des communications (Server-Sent Events).",
    description:
      "Pousse les messages, les changements de canaux et la liste des présents. LA PRÉSENCE EST LA " +
      "CONNEXION : un compte est en ligne tant que son flux est ouvert — fermer l'onglet suffit à le " +
      "retirer, sans qu'aucun état déclaratif ne puisse mentir. Un battement toutes les 25 s garde la " +
      "connexion ouverte à travers les intermédiaires et sert de preuve de vie.",
  })
  stream(@CurrentUser() user: AuthUser, @Req() req: Request): Observable<MessageEvent> {
    const { events, close } = this.realtime.open(user.username, user.role);
    // La fermeture est déclenchée par la REQUÊTE, seule à savoir que le client
    // est parti. Sans cela un flux mort resterait « en ligne » indéfiniment.
    req.on("close", close);

    // `data` doit être une chaîne ou un objet : un nombre nu ne passe pas le
    // contrat SSE de Nest.
    const battements = interval(HEARTBEAT_MS).pipe(map(() => ({ type: "ping", data: { at: Date.now() } }) as MessageEvent));
    const flux = events.pipe(map((e) => ({ type: e.kind, data: e }) as MessageEvent));

    // LA PRÉSENCE INITIALE EST PLACÉE EN TÊTE, explicitement. `open()` la
    // diffuse aussi, mais à ce moment Nest ne s'est pas encore abonné au flux :
    // un `Subject` ne rejoue rien, et le nouvel arrivant ne recevait donc jamais
    // sa PROPRE liste — il voyait le poste vide jusqu'à ce que quelqu'un d'autre
    // se connecte ou parte. Différer d'un tour de boucle « marcherait » aussi,
    // mais reposerait sur un ordre d'exécution que rien ne garantit.
    const initiale = of({
      type: "presence",
      data: { kind: "presence", online: this.realtime.online() },
    } as MessageEvent);

    return merge(initiale, flux, battements);
  }

  @Get("presence")
  @RequirePermission("comms:view")
  @ApiOperation({
    summary: "Comptes actuellement connectés.",
    description:
      "Doublon volontaire du flux : un écran qui vient d'ouvrir doit connaître l'état sans attendre " +
      "le prochain changement. Deux onglets d'un même officier font UN présent, pas deux.",
  })
  presence() {
    return { online: this.realtime.online() };
  }

  @Post("attachments")
  @RequirePermission("comms:create")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_BYTES } }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Verser une pièce jointe (image, vidéo, document).",
    description:
      "Liste BLANCHE de types, jamais une liste noire. Le type déclaré est confronté aux premiers " +
      "octets du fichier — seule chose que l'expéditeur ne choisit pas librement. Le fichier est écrit " +
      "sous un identifiant tiré au sort : le nom d'origine ne sert qu'à l'affichage, jamais de chemin.",
  })
  @ApiResponse({ status: 400, description: "Type refusé, contenu non conforme au type, ou fichier trop volumineux." })
  upload(@UploadedFile() file: UploadedFileLike, @CurrentUser() user: AuthUser) {
    return this.attachments.store(file, user.username);
  }

  @Get("attachments/:id")
  @RequirePermission("comms:view")
  @ApiOperation({ summary: "Télécharger une pièce jointe." })
  @ApiResponse({ status: 404, description: "Pièce jointe inconnue." })
  // `nosniff` : le navigateur ne doit JAMAIS re-deviner le type. Sans cet
  // en-tête, un fichier accepté comme texte pourrait être interprété autrement.
  @Header("X-Content-Type-Options", "nosniff")
  download(@Param("id") id: string, @Res() res: Response): void {
    const { att, buf } = this.attachments.read(id);
    res.setHeader("Content-Type", att.mime);
    res.setHeader("Content-Length", String(att.bytes));
    // `inline` pour ce qui s'affiche, `attachment` pour le reste : un PDF ou un
    // texte rendu dans la page est une surface d'attaque inutile.
    const inline = att.mime.startsWith("image/") || att.mime.startsWith("video/");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${att.name}"`);
    res.send(buf);
  }
}
