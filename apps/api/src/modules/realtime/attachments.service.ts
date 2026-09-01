import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";

// ============================================================================
// ARGOS — pièces jointes des communications (lot COMMS)
//
// CE QUI EST ACCEPTÉ, ET RIEN D'AUTRE. Une liste blanche de types, jamais une
// liste noire : on ne devine pas ce qui est dangereux, on nomme ce qui est
// permis. Le type déclaré par le navigateur n'est pas cru sur parole — il est
// confronté aux PREMIERS OCTETS du fichier, seule chose que l'expéditeur ne
// choisit pas librement.
//
// LE NOM D'ORIGINE N'EST JAMAIS UN NOM DE FICHIER. Le fichier est écrit sous un
// identifiant tiré au sort ; le nom saisi par l'expéditeur ne sert qu'à
// l'affichage. C'est ce qui ferme la traversée de répertoire (« ../../etc/… »)
// et l'écriture d'un exécutable sous un nom trompeur.
//
// STOCKAGE SUR DISQUE, pas en mémoire : une vidéo de 40 Mo par message ferait
// enfler le processus jusqu'à le tuer. MinIO prendra la suite (MASTER_PLAN
// §4.2) ; le port est déjà ce service, et son remplacement ne touchera rien
// d'autre.
// ============================================================================

/** Taille maximale d'une pièce jointe. Au-delà, le poste de commandement passe par un autre canal. */
export const MAX_BYTES = 40 * 1024 * 1024;

/**
 * Types acceptés, avec leur signature d'octets de tête.
 *
 * `null` = pas de signature fiable (le PDF en a une, le texte brut non). Un
 * type sans signature n'est accepté que s'il est INOFFENSIF à servir : du texte
 * rendu en pièce jointe, jamais interprété.
 */
const ACCEPTES: Record<string, { ext: string; magic: number[][] | null }> = {
  "image/jpeg": { ext: "jpg", magic: [[0xff, 0xd8, 0xff]] },
  "image/png": { ext: "png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/gif": { ext: "gif", magic: [[0x47, 0x49, 0x46, 0x38]] },
  "image/webp": { ext: "webp", magic: [[0x52, 0x49, 0x46, 0x46]] },
  "video/mp4": { ext: "mp4", magic: null },
  "video/webm": { ext: "webm", magic: [[0x1a, 0x45, 0xdf, 0xa3]] },
  "video/quicktime": { ext: "mov", magic: null },
  "application/pdf": { ext: "pdf", magic: [[0x25, 0x50, 0x44, 0x46]] },
  "text/plain": { ext: "txt", magic: null },
  "text/csv": { ext: "csv", magic: null },
};

/** Ce qu'une pièce jointe est, une fois versée. */
export interface Attachment {
  id: string;
  /** Nom SAISI par l'expéditeur — affiché, jamais utilisé comme chemin. */
  name: string;
  mime: string;
  bytes: number;
  /** Empreinte du contenu : permet de reconnaître un doublon sans le relire. */
  sha256: string;
  by: string;
  at: string;
}

/** Le fichier tel que l'intercepteur d'Express le remet. */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService {
  private readonly log = new Logger("Attachments");
  private readonly meta = new Map<string, Attachment>();

  /** Racine de stockage. Hors du dépôt, jamais commitée. */
  private dir(): string {
    const d = process.env.ARGOS_ATTACHMENTS_DIR ?? resolve(process.cwd(), "data", "attachments");
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
    return d;
  }

  /**
   * Nettoie un nom pour l'AFFICHAGE seulement.
   *
   * Le nom ne devient jamais un chemin ; ce nettoyage évite qu'il ne casse un
   * en-tête HTTP ou ne s'affiche comme du balisage.
   */
  private nomSur(brut: string): string {
    return (
      brut
        .replace(/[\r\n"\\]/g, "")
        .replace(/[/\\]/g, "-")
        .trim()
        .slice(0, 120) || "fichier"
    );
  }

  /** Le contenu correspond-il au type déclaré ? */
  private signatureOk(mime: string, buf: Buffer): boolean {
    const spec = ACCEPTES[mime];
    if (!spec) return false;
    if (spec.magic === null) return true;
    return spec.magic.some((sig) => sig.every((octet, i) => buf[i] === octet));
  }

  store(file: UploadedFileLike, by: string): Attachment {
    if (!file?.buffer?.length) throw new BadRequestException("Fichier vide.");
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`Fichier trop volumineux : ${Math.round(file.size / 1048576)} Mo, maximum 40 Mo.`);
    }
    const spec = ACCEPTES[file.mimetype];
    if (!spec) {
      // Le refus NOMME le type reçu : « type non autorisé » sans dire lequel
      // laisse l'expéditeur réessayer à l'aveugle.
      throw new BadRequestException(`Type de fichier non autorisé : ${file.mimetype}`);
    }
    if (!this.signatureOk(file.mimetype, file.buffer)) {
      // Le type déclaré ne correspond pas au contenu : c'est soit une erreur de
      // navigateur, soit un fichier maquillé. Dans les deux cas on refuse.
      throw new BadRequestException("Le contenu du fichier ne correspond pas au type déclaré.");
    }

    const id = randomUUID();
    // Le fichier est écrit sous l'IDENTIFIANT, jamais sous le nom reçu.
    writeFileSync(resolve(this.dir(), `${id}.${spec.ext}`), file.buffer);
    const att: Attachment = {
      id,
      name: this.nomSur(file.originalname),
      mime: file.mimetype,
      bytes: file.size,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
      by,
      at: new Date().toISOString(),
    };
    this.meta.set(id, att);
    this.log.log(`${by} a versé ${att.name} (${Math.round(att.bytes / 1024)} Ko)`);
    return att;
  }

  find(id: string): Attachment | null {
    return this.meta.get(id) ?? null;
  }

  /** Lit le contenu. `id` est confronté au registre : aucun chemin n'est construit depuis l'entrée. */
  read(id: string): { att: Attachment; buf: Buffer } {
    const att = this.meta.get(id);
    if (!att) throw new NotFoundException(`Pièce jointe inconnue : ${id}`);
    const chemin = resolve(this.dir(), `${id}.${ACCEPTES[att.mime].ext}`);
    if (!existsSync(chemin) || !statSync(chemin).isFile()) {
      throw new NotFoundException("Le fichier n'est plus disponible sur ce poste.");
    }
    return { att, buf: readFileSync(chemin) };
  }
}
