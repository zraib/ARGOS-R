import { Injectable } from "@nestjs/common";
import { RealtimeService, type Notice } from "@/modules/realtime/realtime.service";

// ============================================================================
// ARGOS — alertes adressées (lot #10)
//
// Une alerte n'est pas un message de canal : elle s'adresse à des comptes
// nommés — le wali et le commandant de place d'armes de la région où un
// incident vient d'être déclaré — et à eux seuls. Elle est POUSSÉE à ceux qui
// sont là (flux temps réel) et GARDÉE pour ceux qui ne le sont pas : un wali
// qui ouvre son poste une heure plus tard la trouve dans sa cloche.
//
// En mémoire, comme le reste du domaine en Phase 1 ; cinquante par compte au
// plus, les plus récentes d'abord.
// ============================================================================

const KEEP = 50;

@Injectable()
export class NoticesService {
  private readonly parCompte = new Map<string, Notice[]>();
  private compteur = 0;

  constructor(private readonly realtime: RealtimeService) {}

  /** Adresse une alerte à ces comptes : gardée pour chacun, poussée à ceux qui sont connectés. */
  push(matricules: readonly string[], notice: Omit<Notice, "id" | "at">): Notice {
    const n: Notice = { ...notice, id: `n${++this.compteur}-${Date.now()}`, at: new Date().toISOString() };
    for (const m of new Set(matricules.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
      const list = this.parCompte.get(m) ?? [];
      list.unshift(n);
      if (list.length > KEEP) list.length = KEEP;
      this.parCompte.set(m, list);
    }
    this.realtime.emitTo(matricules, { kind: "notice", notice: n });
    return n;
  }

  /** Les alertes d'un compte, la plus récente d'abord. */
  listFor(matricule: string): Notice[] {
    return this.parCompte.get(matricule.trim().toLowerCase()) ?? [];
  }
}
