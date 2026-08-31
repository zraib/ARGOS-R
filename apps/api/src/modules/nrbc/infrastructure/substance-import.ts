import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Substance } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — CHARGEMENT D'UN JEU DE SUBSTANCES SOUS LICENCE (lot N-3b)
//
// POURQUOI CE FICHIER EXISTE. La bibliothèque livrée avec le code compte
// trente et une substances. Les référentiels complets — ERG 2024 (~3 500
// numéros ONU), fiches CAMEO Chemicals, référentiel national — ne peuvent pas
// être recopiés dans le dépôt :
//
//   • CAMEO Chemicals : « Data from the above organizations shall not be
//     duplicated by the recipient, without written permission from those
//     organizations. » Numéros CAS (Chemical Abstracts Service), informations
//     de protection DuPont, cotations NFPA, seuils AEGL et ERPG appartiennent
//     chacun à un tiers.
//   • ERG 2024 : diffusé gratuitement aux services de secours ; le PHMSA fournit
//     les fichiers de production sur demande.
//
// LA DONNÉE SOUS LICENCE N'ENTRE PAS DANS GIT. Elle est déposée en JSON dans
// `apps/api/data/` (ignoré par git) et chargée au démarrage. Ce n'est pas une
// commodité : c'est ce qui évite qu'un jeu de données concédé à l'état-major
// marocain ne se retrouve dans un dépôt cloné ailleurs. Un dépôt public ne doit
// pas devenir le vecteur d'une redistribution non autorisée.
//
// LA PROVENANCE VOYAGE AVEC LA DONNÉE. Le fichier déclare sa source, sa date de
// relevé et le titre sous lequel il est détenu — et l'interface les affiche.
// Une bibliothèque enrichie dont on ignore d'où vient l'enrichissement serait
// pire que celle d'origine : elle aurait l'air complète.
// ============================================================================

/** Version du format. Un fichier d'une autre version est REFUSÉ, pas deviné. */
export const IMPORT_FORMAT = "argos.substances.v1";

export interface SubstanceImportFile {
  format: string;
  /** D'où vient ce jeu — cité tel quel dans l'interface. */
  source: string;
  /** Date de relevé (AAAA-MM-JJ) : une distance ERG a une édition. */
  retrievedAt: string;
  /**
   * À quel titre ce jeu est détenu. Champ OBLIGATOIRE, et volontairement libre :
   * il force celui qui verse la donnée à écrire sous quel droit il le fait.
   * « diffusion libre aux services de secours (PHMSA) » ou « autorisation
   * écrite de la NOAA du 12/09/2026, réf. … ». Un champ vide est un refus.
   */
  authorization: string;
  substances: Substance[];
}

export interface ImportedLibrary {
  substances: Substance[];
  source: string;
  retrievedAt: string;
  authorization: string;
}

/**
 * Racine du paquet `apps/api`, trouvée en remontant depuis CE module.
 *
 * Surtout PAS `process.cwd()` : la commande d'import se lance depuis
 * `apps/api`, le serveur de développement depuis la racine du dépôt. Ancré sur
 * le répertoire courant, un jeu « installé » restait invisible au serveur — sans
 * le moindre message. Un référentiel de sécurité qu'on croit chargé et qui ne
 * l'est pas est exactement le défaut à ne pas laisser passer.
 *
 * La remontée s'arrête au premier `package.json`, ce qui vaut aussi bien sous
 * ts-node (`src/…`) qu'après compilation (`dist/…`).
 */
function packageRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return from;
}

/** Répertoire des jeux sous licence — hors du suivi de version. */
export const IMPORT_DIR = process.env.NRBC_DATA_DIR ?? resolve(packageRoot(__dirname), "data");
export const IMPORT_FILE = "substances.json";

export class SubstanceImportError extends Error {}

/**
 * Valide un fichier d'import. Lève à la PREMIÈRE anomalie, avec le rang de
 * l'enregistrement fautif.
 *
 * La validation est stricte parce que le fichier arrive d'un tableur converti à
 * la main : une colonne décalée, et l'isolement du chlore devient celui de
 * l'ammoniac. Mieux vaut refuser le fichier entier que charger la moitié.
 */
export function validateImport(raw: unknown): SubstanceImportFile {
  const f = raw as Partial<SubstanceImportFile>;
  if (!f || typeof f !== "object") throw new SubstanceImportError("Fichier illisible : objet JSON attendu.");
  if (f.format !== IMPORT_FORMAT) {
    throw new SubstanceImportError(`Format inconnu : « ${String(f.format)} ». Attendu « ${IMPORT_FORMAT} ».`);
  }
  for (const k of ["source", "retrievedAt", "authorization"] as const) {
    if (typeof f[k] !== "string" || !f[k]!.trim()) {
      throw new SubstanceImportError(
        `Champ « ${k} » manquant. La provenance et le titre de détention sont OBLIGATOIRES : ` +
          "une donnée dont on ignore d'où elle vient ne peut pas servir à poser un périmètre.",
      );
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.retrievedAt!)) {
    throw new SubstanceImportError(`« retrievedAt » doit être une date AAAA-MM-JJ (reçu : ${f.retrievedAt}).`);
  }
  if (!Array.isArray(f.substances) || f.substances.length === 0) {
    throw new SubstanceImportError("Aucune substance dans le fichier.");
  }

  const seenId = new Set<string>();
  const seenUn = new Set<string>();
  f.substances.forEach((s, i) => {
    const at = `substance n°${i + 1}${s?.id ? ` (${s.id})` : ""}`;
    if (!s?.id || !s.un || !s.ergGuide) throw new SubstanceImportError(`${at} : id, un et ergGuide sont requis.`);
    if (!s.labels?.fr) throw new SubstanceImportError(`${at} : un libellé français est requis.`);
    if (s.state !== "gas" && s.state !== "liquid") throw new SubstanceImportError(`${at} : state doit valoir gas ou liquid.`);
    if (seenId.has(s.id)) throw new SubstanceImportError(`${at} : identifiant en double.`);
    if (seenUn.has(s.un)) {
      // Un numéro ONU en double ferait remonter la mauvaise fiche à la recherche
      // par étiquette orange — l'usage le plus probable sur intervention.
      throw new SubstanceImportError(`${at} : numéro ONU ${s.un} en double.`);
    }
    seenId.add(s.id);
    seenUn.add(s.un);

    // Les distances vont par paire : un seul déversement renseigné produirait un
    // gabarit disponible dans un cas et absent dans l'autre, sans explication.
    if (!!s.small !== !!s.large) throw new SubstanceImportError(`${at} : renseigner les DEUX déversements, ou aucun.`);
    for (const [k, d] of [["small", s.small], ["large", s.large]] as const) {
      if (!d) continue;
      if (![d.isolationM, d.protectDayKm, d.protectNightKm].every((n) => typeof n === "number" && n >= 0)) {
        throw new SubstanceImportError(`${at} : distances « ${k} » invalides (nombres positifs attendus).`);
      }
      if (d.isolationM > 20000 || d.protectDayKm > 100 || d.protectNightKm > 100) {
        // Garde-fou d'ordre de grandeur : une colonne mètres/kilomètres inversée
        // dans un tableur passe autrement inaperçue et donne un périmètre absurde.
        throw new SubstanceImportError(`${at} : distances « ${k} » hors de tout ordre de grandeur — colonnes inversées ?`);
      }
    }
    if (s.ergVerified && !s.small) throw new SubstanceImportError(`${at} : ergVerified sans distances renseignées.`);
  });

  return f as SubstanceImportFile;
}

/**
 * Charge le jeu sous licence s'il est présent. Absent, ce n'est PAS une erreur :
 * l'application tourne avec la bibliothèque livrée.
 *
 * Un fichier présent mais invalide, en revanche, fait échouer le démarrage. Un
 * référentiel de sécurité à moitié chargé est un piège : on croit consulter la
 * base complète.
 */
export function loadImportedLibrary(dir = IMPORT_DIR): ImportedLibrary | null {
  const path = resolve(dir, IMPORT_FILE);
  if (!existsSync(path)) return null;
  const file = validateImport(JSON.parse(readFileSync(path, "utf8")));
  return {
    substances: file.substances,
    source: file.source,
    retrievedAt: file.retrievedAt,
    authorization: file.authorization,
  };
}

/**
 * Fusionne le jeu importé sur la bibliothèque livrée.
 *
 * L'IMPORTÉ PRIME, par identifiant : c'est lui qui vient d'une source relevée,
 * là où le jeu livré tient de ce qu'on pouvait honnêtement affirmer. L'ordre
 * inverse rendrait l'import sans effet sur les trente et une substances
 * d'origine — précisément celles qu'on veut voir vérifiées en premier.
 */
export function mergeLibrary(builtin: Substance[], imported: Substance[]): Substance[] {
  const byId = new Map(builtin.map((s) => [s.id, s]));
  for (const s of imported) byId.set(s.id, s);
  return [...byId.values()];
}
