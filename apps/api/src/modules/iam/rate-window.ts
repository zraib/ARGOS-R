// ============================================================================
// ARGOS — borne de débit à fenêtre glissante, en mémoire
//
// Assez pour une route publique d'un poste de commandement : `limit` passages
// par clé (un compte, une adresse) dans les `windowMs` dernières millisecondes.
// Sans dépendance, sans horloge partagée entre instances — une seconde API en
// production imposerait un compteur commun, ce que le registre R-x note.
// ============================================================================

export class RateWindow {
  private readonly passages = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Enregistre un passage pour `key` et dit s'il reste dans la borne. */
  allow(key: string, now = Date.now()): boolean {
    const recents = (this.passages.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recents.length >= this.limit) {
      this.passages.set(key, recents);
      return false;
    }
    recents.push(now);
    this.passages.set(key, recents);
    // Les clés inactives ne s'accumulent pas : une adresse vue une fois il y a
    // une heure n'a pas à occuper la mémoire du serveur pour toujours.
    if (this.passages.size > 10_000) {
      for (const [k, v] of this.passages) if (v.every((t) => now - t >= this.windowMs)) this.passages.delete(k);
    }
    return true;
  }
}
