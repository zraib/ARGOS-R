// ============================================================================
// ARGOS — isolation des tests vis-à-vis des données locales sous licence
//
// Depuis le lot N-3d, l'application charge au démarrage les jeux de substances
// déposés dans `apps/api/data/` — jusqu'à 25 Mo de fiches. Chaque fichier de
// test instancie sa propre application : la suite entière relisait et analysait
// ces mégaoctets une fois par fichier, ce qui l'a fait passer de quelques
// secondes à plus d'une minute par suite, et a rendu la gate instable.
//
// Plus grave que la lenteur : le VERDICT des tests dépendait alors de ce qu'un
// opérateur avait versé sur sa machine. Un test qui change de résultat selon le
// poste ne prouve plus rien.
//
// Les tests pointent donc un répertoire vide : ils s'exécutent contre la
// bibliothèque LIVRÉE AVEC LE CODE, la seule que le dépôt garantisse.
// ============================================================================
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

process.env.NRBC_DATA_DIR = mkdtempSync(join(tmpdir(), "argos-nrbc-tests-"));
