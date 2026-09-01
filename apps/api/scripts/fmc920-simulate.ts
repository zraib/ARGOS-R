/* eslint-disable no-console */
import { connect } from "node:net";
import { crc16 } from "@/modules/tracking/codec8";

// ============================================================================
// ARGOS — simuler un boîtier FMC920 (lot N-2)
//
//   npm run fmc920:simulate -- <imei> [hôte] [port]
//
// À QUOI CELA SERT. À vérifier la chaîne AVANT de déployer un parc : le port
// est-il joignable, l'IMEI est-il déclaré, la position remonte-t-elle jusqu'à
// l'écran. Un boîtier réel qui ne remonte pas laisse le doute entre la carte
// SIM, l'APN, le pare-feu et le registre ; ce script écarte le serveur de la
// liste des suspects en trente secondes.
//
// Il parle le VRAI protocole — poignée de main IMEI, Codec 8, CRC-16, accusé —
// et non une route de complaisance : ce qui est éprouvé ici est bien ce qu'un
// FMC920 rencontrera.
//
// Le trajet simulé est une boucle autour de Casablanca. Rien n'est écrit dans
// le dépôt : le boîtier simulé n'existe que le temps de la session.
// ============================================================================

/** Un pas toutes les 30 s, comme un FMC920 en mouvement. */
const PERIODE_MS = 30_000;

/** Boucle autour de Casablanca — [lng, lat]. */
const TRAJET: [number, number][] = [
  [-7.6114, 33.5731],
  [-7.6028, 33.5804],
  [-7.5902, 33.5867],
  [-7.5771, 33.5892],
  [-7.5688, 33.5810],
  [-7.5749, 33.5712],
  [-7.5901, 33.5665],
  [-7.6042, 33.5681],
];

function imeiFrame(imei: string): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(imei.length, 0);
  return Buffer.concat([b, Buffer.from(imei, "ascii")]);
}

/** Un enregistrement Codec 8 : horodatage, priorité, position, aucun élément d'E/S. */
function record(at: number, lng: number, lat: number, cap: number, vitesse: number): Buffer {
  const b = Buffer.alloc(24);
  b.writeBigUInt64BE(BigInt(at), 0);
  b.writeUInt8(0, 8); // priorité basse — envoi périodique
  b.writeInt32BE(Math.round(lng * 1e7), 9);
  b.writeInt32BE(Math.round(lat * 1e7), 13);
  b.writeInt16BE(65, 17); // altitude, m
  b.writeUInt16BE(cap, 19);
  b.writeUInt8(11, 21); // satellites
  b.writeUInt16BE(vitesse, 22);
  return Buffer.concat([b, Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00])]);
}

function paquet(records: Buffer[]): Buffer {
  const corps = Buffer.concat([Buffer.from([0x08, records.length]), ...records, Buffer.from([records.length])]);
  const t = Buffer.alloc(8 + corps.length + 4);
  t.writeUInt32BE(0, 0);
  t.writeUInt32BE(corps.length, 4);
  corps.copy(t, 8);
  t.writeUInt32BE(crc16(corps), 8 + corps.length);
  return t;
}

/** Cap en degrés entre deux points — pour que la flèche pointe où l'on va. */
function cap(a: [number, number], b: [number, number]): number {
  const d = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  return Math.round((d + 360) % 360);
}

function main(): void {
  const imei = process.argv[2];
  const host = process.argv[3] ?? "127.0.0.1";
  const port = Number(process.argv[4] ?? 5027);

  if (!imei || !/^\d{15}$/.test(imei)) {
    console.error("Usage : npm run fmc920:simulate -- <imei-15-chiffres> [hôte] [port]");
    console.error("\nL'IMEI doit être DÉCLARÉ dans ARGOS, sinon le serveur refusera la session.");
    process.exit(2);
  }

  console.log(`\n  Boîtier simulé ${imei} → ${host}:${port}\n`);
  const s = connect({ host, port });
  let i = 0;
  let minuteur: NodeJS.Timeout | null = null;

  s.on("connect", () => {
    console.log("  connecté — envoi de l'IMEI…");
    s.write(imeiFrame(imei));
  });

  let accepte = false;
  s.on("data", (d) => {
    if (!accepte) {
      // Premier octet : 0x01 accepté, 0x00 refusé.
      if (d[0] !== 0x01) {
        console.error("\n  ✗ IMEI REFUSÉ par le serveur.");
        console.error("    L'IMEI doit être déclaré dans ARGOS (écran « Traceurs GPS »),");
        console.error("    et le traceur ne doit pas être archivé.\n");
        s.destroy();
        process.exit(1);
      }
      accepte = true;
      console.log("  ✓ IMEI accepté — envoi des positions (Ctrl+C pour arrêter)\n");
      envoyer();
      minuteur = setInterval(envoyer, 2000);
      return;
    }
    // Accusé : le nombre d'enregistrements acceptés, sur quatre octets.
    console.log(`    ← accusé : ${d.readUInt32BE(0)} enregistrement(s)`);
  });

  function envoyer(): void {
    const a = TRAJET[i % TRAJET.length];
    const b = TRAJET[(i + 1) % TRAJET.length];
    // Horodatage RÉEL : la position doit apparaître comme fraîche à l'écran.
    const at = Date.now();
    const r = record(at, a[0], a[1], cap(a, b), 30 + (i % 5) * 6);
    s.write(paquet([r]));
    console.log(`  → ${new Date(at).toISOString().slice(11, 19)}  ${a[1].toFixed(5)}, ${a[0].toFixed(5)}`);
    i++;
  }

  s.on("error", (e) => {
    console.error(`\n  ✗ ${e.message}`);
    console.error("    Le serveur écoute-t-il ? L'écouteur est ÉTEINT par défaut :");
    console.error("    démarrer l'API avec FMC920_PORT=5027 (voir ADR 0008).\n");
    process.exit(1);
  });

  s.on("close", () => {
    if (minuteur) clearInterval(minuteur);
    console.log("\n  session close\n");
  });
}

main();
