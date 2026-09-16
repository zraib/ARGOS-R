import { Injectable } from "@nestjs/common";
import { RealtimeService, type Notice, type NoticeInput } from "@/modules/realtime/realtime.service";
import { loadDevState, saveDevState } from "@/common/dev-store";

// ============================================================================
// ARGOS — alertes adressées (lot #10)
//
// Une alerte n'est pas un message de canal : elle s'adresse à des comptes
// nommés — le wali et le commandant de place d'armes de la région où un
// incident vient d'être déclaré, les administrateurs qu'un compte appelle à
// l'aide pour son mot de passe — et à eux seuls. Elle est POUSSÉE à ceux qui
// sont là (flux temps réel) et GARDÉE pour ceux qui ne le sont pas : un wali
// qui ouvre son poste une heure plus tard la trouve dans sa cloche.
//
// Vit dans le module temps réel, GLOBAL, et non dans le domaine : l'IAM aussi
// adresse des alertes, et le domaine dépend déjà de l'IAM — l'inverse aurait
// fait un cycle. Une alerte est un événement poussé, elle a sa place ici.
//
// En mémoire, comme le reste du domaine en Phase 1 ; cinquante par compte au
// plus, les plus récentes d'abord. Depuis l'ADR 0016 les alertes et leurs
// ACQUITTEMENTS survivent au redémarrage (instantané `notices`) : une alerte
// non acquittée reste visible et sonore jusqu'à ce qu'on l'acquitte, et
// l'acquittement ne se perd pas au rechargement de la page.
// ============================================================================

const KEEP = 50;

type Snapshot = { compteur?: number; parCompte?: Record<string, Notice[]>; acked?: Record<string, string[]> };

@Injectable()
export class NoticesService {
  private readonly parCompte = new Map<string, Notice[]>();
  /** Identifiants acquittés, par compte. */
  private readonly acked = new Map<string, Set<string>>();
  private compteur = 0;

  constructor(private readonly realtime: RealtimeService) {
    const snap = loadDevState<Snapshot>("notices", {});
    this.compteur = snap.compteur ?? 0;
    for (const [m, list] of Object.entries(snap.parCompte ?? {})) this.parCompte.set(m, list);
    for (const [m, ids] of Object.entries(snap.acked ?? {})) this.acked.set(m, new Set(ids));
  }

  private persist(): void {
    saveDevState("notices", {
      compteur: this.compteur,
      parCompte: Object.fromEntries(this.parCompte),
      acked: Object.fromEntries([...this.acked].map(([m, s]) => [m, [...s]])),
    });
  }

  /** Adresse une alerte à ces comptes : gardée pour chacun, poussée à ceux qui sont connectés. */
  push(matricules: readonly string[], notice: NoticeInput): Notice {
    const n: Notice = { ...notice, id: `n${++this.compteur}-${Date.now()}`, at: new Date().toISOString() };
    for (const m of new Set(matricules.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
      const list = this.parCompte.get(m) ?? [];
      list.unshift(n);
      if (list.length > KEEP) list.length = KEEP;
      this.parCompte.set(m, list);
    }
    this.realtime.emitTo(matricules, { kind: "notice", notice: n });
    this.persist();
    return n;
  }

  /** Les alertes d'un compte, la plus récente d'abord, chacune avec son acquittement. */
  listFor(matricule: string): (Notice & { acked: boolean })[] {
    const key = matricule.trim().toLowerCase();
    const done = this.acked.get(key);
    return (this.parCompte.get(key) ?? []).map((n) => ({ ...n, acked: done?.has(n.id) ?? false }));
  }

  /** Acquitte une alerte pour ce compte ; `all` : toutes. Rend le nombre acquitté. */
  ack(matricule: string, id: string | "all"): number {
    const key = matricule.trim().toLowerCase();
    const list = this.parCompte.get(key) ?? [];
    const done = this.acked.get(key) ?? new Set<string>();
    let n = 0;
    for (const notice of list) {
      if ((id === "all" || notice.id === id) && !done.has(notice.id)) {
        done.add(notice.id);
        n++;
      }
    }
    // Les acquittements d'alertes sorties de la fenêtre ne servent plus.
    for (const k of done) if (!list.some((x) => x.id === k)) done.delete(k);
    this.acked.set(key, done);
    if (n > 0) this.persist();
    return n;
  }
}
