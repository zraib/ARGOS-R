import { API_BASE, getStoredToken } from "@/lib/api";

// ============================================================================
// ARGOS — lecture du flux temps réel (lot COMMS)
//
// POURQUOI PAS `EventSource`. L'API native du navigateur ne sait pas porter
// d'en-tête : il faudrait passer le jeton porteur en paramètre d'URL. Une URL
// se retrouve dans les journaux du serveur, dans l'historique, dans l'en-tête
// `Referer` — un jeton d'accès à un poste de commandement n'a rien à y faire.
// On lit donc le flux par `fetch`, qui accepte les en-têtes, et on découpe le
// protocole SSE à la main : une trentaine de lignes contre une fuite de jeton.
//
// LA RECONNEXION EST OBLIGATOIRE, PAS OPTIONNELLE. Une liaison de campagne
// tombe ; un écran de commandement qui cesse silencieusement de recevoir est
// pire qu'un écran vide, parce qu'il continue d'AVOIR L'AIR à jour. Le délai
// croît puis se stabilise, et l'état de la connexion est remonté à l'appelant
// pour être DIT à l'écran.
// ============================================================================

export type StreamStatus = "connecting" | "open" | "closed";

export interface StreamEvent {
  kind: string;
  data: unknown;
}

/** Délais de reprise, en millisecondes. Le dernier se répète indéfiniment. */
const RECULS = [1_000, 2_000, 5_000, 10_000, 30_000];

export interface StreamHandle {
  close: () => void;
}

/**
 * Ouvre le flux et rappelle à chaque événement.
 *
 * `onStatus` est appelé à chaque changement d'état : c'est ce qui permet à
 * l'écran de dire « reconnexion… » au lieu de laisser croire au temps réel.
 */
export function openRealtimeStream(
  onEvent: (e: StreamEvent) => void,
  onStatus: (s: StreamStatus) => void,
): StreamHandle {
  let vivant = true;
  let essai = 0;
  let controller: AbortController | null = null;
  let minuteur: ReturnType<typeof setTimeout> | null = null;

  const boucle = async (): Promise<void> => {
    if (!vivant) return;
    const token = getStoredToken();
    if (!token) {
      // Sans jeton, inutile de marteler le serveur : on retentera au prochain
      // recul, le temps qu'une session s'ouvre.
      planifier();
      return;
    }

    onStatus("connecting");
    controller = new AbortController();
    try {
      const res = await fetch(`${API_BASE}/api/comms/stream`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`flux refusé : ${res.status}`);

      onStatus("open");
      essai = 0;

      const reader = res.body.getReader();
      const decodeur = new TextDecoder();
      let tampon = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        tampon += decodeur.decode(value, { stream: true });

        // Le protocole SSE sépare les événements par une LIGNE VIDE. Découper
        // sur autre chose couperait un message au milieu de son JSON.
        let coupe: number;
        while ((coupe = tampon.indexOf("\n\n")) !== -1) {
          const brut = tampon.slice(0, coupe);
          tampon = tampon.slice(coupe + 2);
          const e = parser(brut);
          if (e) onEvent(e);
        }
      }
      throw new Error("flux clos par le serveur");
    } catch (err) {
      // Une interruption VOULUE (fermeture de l'écran) n'est pas une panne :
      // la signaler ferait clignoter « reconnexion » à chaque navigation.
      if (!vivant || (err as Error)?.name === "AbortError") return;
      onStatus("closed");
      planifier();
    }
  };

  const planifier = () => {
    if (!vivant) return;
    const delai = RECULS[Math.min(essai++, RECULS.length - 1)];
    minuteur = setTimeout(() => void boucle(), delai);
  };

  void boucle();

  return {
    close: () => {
      vivant = false;
      if (minuteur) clearTimeout(minuteur);
      controller?.abort();
      onStatus("closed");
    },
  };
}

/** Découpe un bloc SSE (`event:` + `data:`) en événement exploitable. */
function parser(bloc: string): StreamEvent | null {
  let kind = "message";
  const lignes: string[] = [];
  for (const ligne of bloc.split("\n")) {
    if (ligne.startsWith(":")) continue; // commentaire de maintien en vie
    if (ligne.startsWith("event:")) kind = ligne.slice(6).trim();
    else if (ligne.startsWith("data:")) lignes.push(ligne.slice(5).trim());
  }
  if (lignes.length === 0) return null;
  try {
    return { kind, data: JSON.parse(lignes.join("\n")) };
  } catch {
    // Un bloc illisible est ignoré, pas propagé : mieux vaut manquer un
    // événement que remonter une donnée qu'on n'a pas su lire.
    return null;
  }
}
