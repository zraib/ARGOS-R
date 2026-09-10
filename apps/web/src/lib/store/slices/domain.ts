// ============================================================================
// lib/store/slices/domain.ts — état serveur du domaine (incidents, unités, hôpitaux, fil, catalogue) et ses actions
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type {
  Channel,
  City,
  CommCategory,
  CommMessage,
  DashStats,
  DeployableAccount,
  DirectoryEntry,
  FeedItem,
  FieldHospital,
  Hospital,
  Incident,
  IncidentPost,
  IncidentTypeDef,
  Mission,
  Notice,
  PostKind,
  Province,
  Responsible,
  SubIncidentCatalog,
  Unit,
  VehRoute,
} from "@/lib/types";
import { hospKind } from "@/lib/hospitals";
import { FEED_POOL } from "@/lib/data/seed";
import { api } from "@/lib/api";
import type { QueueItem, TransportMovement } from "@/lib/data/dispatch";
import { EMPTY_CATALOG, type Catalog, Shelter } from "@/lib/data/modules";
import {
  CommMembers,
  EMPTY_MEMBERS,
  Engagement,
  } from "@/lib/store/shared";

export interface DomainSlice {
  // --- domaine (état serveur, chargé depuis l'API) ---
  incidents: Incident[];
  units: Unit[];
  hospitals: Hospital[];
  fieldHosps: FieldHospital[];
  feed: FeedItem[];
  /** catalogue des modules opérationnels (inventaire, triage, ORSEC, …) depuis l'API */
  catalog: Catalog;
  /** true une fois le domaine chargé depuis l'API (au moins une fois) */
  domainLoaded: boolean;
  /** Catalogue paramétrable des types d'incident (API /incident-types) */
  incidentTypes: IncidentTypeDef[];
  subCatalog: SubIncidentCatalog;
  /** Statistiques de commandement (API /dashboard/stats) */
  dashStats: DashStats | null;
  tick: number;
  /**
   * Demandes de moyens OUVERTES, toutes entités confondues — la file
   * montante du répartiteur (lot P2-a). Distinctes de l'inbox : une demande
   * concerne la conduite dans son ensemble, pas une personne nommée.
   */
  resourceRequests: Mission[];
  // --- communications (depuis l'API) ---
  comCats: CommCategory[];
  comMsgs: Record<string, CommMessage[]>;
  comMembers: CommMembers;
  comSel: string;
  /** Qui tient quoi (titulaires d'entités, postes déployés) — chargé avec le domaine. */
  responsables: Responsible[];
  loadResponsables: () => Promise<void>;
  // --- postes d'opération sur la carte (lot #12) ---
  /** Postes des opérations visibles par le compte — l'API a déjà filtré. */
  posts: IncidentPost[];
  /** Abris connus — pour poser un poste d'abri et nommer le poste sur la carte. */
  shelters: Shelter[];
  /** Comptes déployables (PC, cellules) et l'opération qu'ils servent — la boîte à outils du mode édition. */
  deployable: DeployableAccount[];
  loadDeployable: () => Promise<void>;
  loadPosts: () => Promise<void>;
  createPost: (incidentId: string, body: { kind: PostKind; ll: [number, number]; label?: string; entityId?: string; matricule?: string }) => Promise<void>;
  movePost: (id: string, ll: [number, number]) => Promise<void>;
  deletePost: (id: string) => Promise<void>;
  comCollapsed: Record<string, boolean>;
  // --- données de référence (depuis l'API) ---
  provinces: Province[];
  cities: City[];
  vehRoutes: VehRoute[];
  movements: TransportMovement[];
  queue: QueueItem[];
  /** Charge les entités de domaine depuis l'API (incidents, unités, hôpitaux, fil). */
  /**
   * `ai: false` quand la cause du rechargement ne change pas les entrées des
   * modèles (canal renommé, message reçu) : sinon chaque événement du flux
   * temps réel relançait deux appels au modèle, qui faisaient la queue devant
   * la question de l'opérateur — mesuré : +5 s pour le second appel simultané.
   */
  loadDomain: (opts?: { ai?: boolean }) => Promise<void>;
  addIncident: (inc: Incident) => void;
  deployFieldHospital: (h: Hospital) => void;
  /** Mise à jour locale optimiste d'un hôpital (services, capacités…) */
  patchHospital: (id: string, patch: Partial<Hospital>) => void;
  selectChannel: (id: string) => void;
  sendMessage: (txt: string) => void;
  addCategory: (name: string) => void;
  addChannel: (catId: string, name: string, matricules?: string[]) => void;
  /** Relit canaux et messages depuis l'API — l'état des canaux est serveur. */
  refreshComms: () => Promise<void>;
  /** Annuaire des comptes joignables, chargé à la demande (écran de communication). */
  comDirectory: DirectoryEntry[];
  loadCommsDirectory: () => Promise<void>;
  /** Convoque des comptes dans un canal existant. Rend `true` si l'API a accepté. */
  addChannelMembers: (channelId: string, matricules: string[]) => Promise<boolean>;
  /** Retire un participant d'un canal. Rend `true` si l'API a accepté. */
  removeChannelMember: (channelId: string, matricule: string) => Promise<boolean>;
  toggleCategory: (id: string) => void;
  engageUnit: (unitId: string, incidentId: string, reason: string, via: "manual" | "reco", score?: number) => void;
  relieveUnit: (unitId: string) => void;
  resolveQueueItem: (id: string) => void;
  simTick: () => void;
}

/**
 * Marque les messages de l'utilisateur courant.
 *
 * `mine` ne peut pas venir du serveur : le même message part vers tous les
 * postes. Il se décide ici, sur le MATRICULE de l'auteur — le nom affiché ne
 * suffit pas. Les messages du jeu d'amorçage et ceux de la plateforme n'ont
 * pas d'auteur : ils ne sont à personne, ce qui est exact.
 */
function marquerMiens(
  messages: Record<string, CommMessage[]>,
  matricule: string | undefined,
): Record<string, CommMessage[]> {
  const sortie: Record<string, CommMessage[]> = {};
  for (const [canal, liste] of Object.entries(messages)) {
    sortie[canal] = liste.map((m) => ({ ...m, mine: !!matricule && !!m.author && m.author === matricule }));
  }
  return sortie;
}

export const createDomainSlice: StateCreator<ArgosState, [], [], DomainSlice> = (set, get) => ({
  incidents: [],
  units: [],
  hospitals: [],
  fieldHosps: [],
  feed: [],
  catalog: EMPTY_CATALOG,
  domainLoaded: false,
  incidentTypes: [],
  subCatalog: { types: [], byParent: {} },
  dashStats: null,
  tick: 0,
  resourceRequests: [],
  comCats: [],
  comMsgs: {},
  comMembers: EMPTY_MEMBERS,
  comSel: "c1",
  responsables: [],
  posts: [],
  shelters: [],
  deployable: [],
  comCollapsed: {},
  provinces: [],
  cities: [],
  vehRoutes: [],
  movements: [],
  queue: [],
  // Charge le domaine depuis l'API. Chaque entité dégrade proprement si le rôle
  // n'a pas la permission de lecture (tableau vide plutôt qu'erreur bloquante).
  loadDomain: async (opts) => {
    const results = await Promise.allSettled([
      api.getIncidents(),
      api.getUnits(),
      api.getHospitals(),
      api.getFieldHospitals(),
      api.getFeed(),
      api.getDispatchQueue(),
      api.getDispatchMovements(),
      api.getCatalog(),
      api.getComms(),
      api.getReference(),
      api.getIncidentTypes(),
      api.getDashboardStats(),
      api.getSubIncidentTypes(),
      api.getResponsables(),
      api.getNotices(),
      api.getPosts(),
      api.getShelters(),
    ]);
    const data = <T,>(i: number): T | undefined =>
      results[i].status === "fulfilled"
        ? ((results[i] as PromiseFulfilledResult<{ data?: unknown }>).value.data as T | undefined)
        : undefined;
    const comms = data<{ categories: CommCategory[]; messages: Record<string, CommMessage[]>; members: CommMembers }>(8);
    const reference = data<{ provinces: Province[]; cities: City[]; vehRoutes: VehRoute[] }>(9);
    set((s) => ({
      incidents: data<Incident[]>(0) ?? s.incidents,
      units: data<Unit[]>(1) ?? s.units,
      hospitals: data<Hospital[]>(2) ?? s.hospitals,
      fieldHosps: data<FieldHospital[]>(3) ?? s.fieldHosps,
      feed: data<FeedItem[]>(4) ?? s.feed,
      queue: data<QueueItem[]>(5) ?? s.queue,
      movements: data<TransportMovement[]>(6) ?? s.movements,
      catalog: data<Catalog>(7) ?? s.catalog,
      incidentTypes: data<IncidentTypeDef[]>(10) ?? s.incidentTypes,
      dashStats: data<DashStats>(11) ?? s.dashStats,
      subCatalog: data<SubIncidentCatalog>(12) ?? s.subCatalog,
      responsables: data<Responsible[]>(13) ?? s.responsables,
      rtNotices: data<Notice[]>(14) ?? s.rtNotices,
      posts: data<IncidentPost[]>(15) ?? s.posts,
      shelters: data<Shelter[]>(16) ?? s.shelters,
      comCats: comms?.categories ?? s.comCats,
      comMsgs: comms?.messages ? marquerMiens(comms.messages, s.sessionUser?.matricule) : s.comMsgs,
      comMembers: comms?.members ?? s.comMembers,
      provinces: reference?.provinces ?? s.provinces,
      cities: reference?.cities ?? s.cities,
      vehRoutes: reference?.vehRoutes ?? s.vehRoutes,
      domainLoaded: true,
    }));
    // Re-calcul IA prédictions risques (100% données ARGOS réel chargées · IA Ollama
    // en local si dispo, sinon repli AUTOMATIQUE sur le moteur déterministe).
    if (opts?.ai !== false) {
      // En SÉRIE et non de front : deux appels simultanés se mettent en file sur
      // le runtime, et le second retarde d'autant une question de l'opérateur.
      // Le léger délai laisse passer le préchauffage et une première question.
      setTimeout(() => {
        void (async () => {
          await get().recomputeRiskPredictionsAI();
          await get().recomputeSituationalAwarenessAI();
        })();
      }, 1_500);
    }
  },
  addIncident: (inc) => {
    set((s) => {
      const d = new Date();
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return {
        incidents: [inc, ...s.incidents],
        feed: [{ time, c: "bg-danger-500", txt: `${inc.id} — ${inc.titre}` }, ...s.feed].slice(0, 8),
      };
    });
    // Recalcul IA prédictions
    get().recomputeRiskPredictions();
  },
  deployFieldHospital: (h) => {
    set((s) => {
      const n = s.fieldHosps.filter((f) => f.hid === h.id).length + 1;
      // Le détachement hérite du réseau de son hôpital de rattachement :
      // HMC = hôpital militaire de campagne, HCC = hôpital civil de campagne.
      const mil = hospKind(h) === "mil";
      const entry: FieldHospital = {
        hid: h.id,
        kind: mil ? "mil_field" : "civ_field",
        nom: `${mil ? "HMC" : "HCC"} ${h.ville} — Détachement ${n}`,
        cap: 40,
        occ: 0,
        statut: "partial",
        depuis: "J+0",
        x: h.x + 8 + n * 4,
        y: h.y + 10 + n * 3,
        ll: [h.ll[0] + 0.05 * n, h.ll[1] - 0.04 * n],
      };
      return { fieldHosps: [...s.fieldHosps, entry] };
    });
    get().recomputeRiskPredictions();
  },
  patchHospital: (id, patch) => {
    set((s) => ({
      hospitals: s.hospitals.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
    get().recomputeRiskPredictions();
  },
  selectChannel: (id) => set({ comSel: id }),
  loadPosts: async () => {
    const res = await api.getPosts();
    if (res.data) set({ posts: res.data as unknown as IncidentPost[] });
  },
  loadDeployable: async () => {
    const res = await api.getDeployablePosts();
    if (res.data) set({ deployable: res.data as unknown as DeployableAccount[] });
  },
  createPost: async (incidentId, body) => {
    const res = await api.createPost(incidentId, body);
    if (res.error || !res.data) throw new Error(apiErrorMessage(res.error));
    // Poser un PC déploie son compte : les titulaires et les disponibilités
    // ont changé en même temps que les postes.
    await Promise.all([get().loadPosts(), get().loadResponsables(), get().loadDeployable()]);
  },
  // Optimiste : le marqueur reste où l'opérateur l'a lâché ; le signal temps
  // réel qui suit l'écriture relit la liste et confirme.
  movePost: async (id, ll) => {
    const post = get().posts.find((p) => p.id === id);
    if (!post) return;
    set({ posts: get().posts.map((p) => (p.id === id ? { ...p, ll } : p)) });
    const res = await api.updatePost(post.incidentId, id, { ll });
    if (res.error) await get().loadPosts();
  },
  deletePost: async (id) => {
    const post = get().posts.find((p) => p.id === id);
    if (!post) return;
    const res = await api.deletePost(post.incidentId, id);
    if (res.error) throw new Error(apiErrorMessage(res.error));
    await get().loadPosts();
  },
  loadResponsables: async () => {
    const res = await api.getResponsables();
    if (res.data) set({ responsables: res.data as unknown as Responsible[] });
  },
  sendMessage: (txt) => {
    const t = txt.trim();
    if (!t) return;
    const { comSel, comCats, sessionUser } = get();
    let chan: Channel | undefined;
    comCats.forEach((c) => c.chans.forEach((ch) => { if (ch.id === comSel) chan = ch; }));
    if (!chan || chan.kind === "voice") return;
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const nom = sessionUser?.nom ?? "Moi";
    const initials = nom.replace(/^[A-Za-zÀ-ÿ]+\.?\s*/, "").split(/\s+/).map((p) => p[0]?.toUpperCase() ?? "").join("").slice(0, 2) || nom.slice(0, 2).toUpperCase();

    // BROUILLON LOCAL, identifiant NÉGATIF. Le message s'affiche tout de suite
    // — un poste de commandement ne doit pas attendre le réseau pour voir sa
    // propre phrase — mais son identifiant ne peut pas être deviné : le
    // serveur donnera le sien. Un identifiant négatif ne peut entrer en
    // collision avec aucun identifiant serveur, et la réconciliation ci-dessous
    // le remplace par le message réel. Sans cela, l'auteur voyait son message
    // DEUX FOIS : une fois en brouillon, une fois revenu par le flux temps
    // réel, sous son matricule et du côté des autres.
    const brouillon = -Date.now();
    set((s) => ({
      comMsgs: {
        ...s.comMsgs,
        [comSel]: [
          ...(s.comMsgs[comSel] || []),
          { id: brouillon, who: nom, author: sessionUser?.matricule, initials, av: "bg-or-500 text-rdia-600", time, txt: t, mine: true },
        ],
      },
    }));

    void (async () => {
      const res = await api.sendMessage(comSel, t);
      const envoye = res.error ? undefined : (res.data as CommMessage | undefined);
      set((s) => {
        const sansBrouillon = (s.comMsgs[comSel] ?? []).filter((m) => m.id !== brouillon);
        // Échec : le brouillon disparaît et on le DIT. Laisser à l'écran une
        // phrase que personne n'a reçue est le pire des deux.
        if (!envoye?.id) return { comMsgs: { ...s.comMsgs, [comSel]: sansBrouillon } };
        // Le flux temps réel a pu arriver avant la réponse : on ne le double pas.
        const dejaLa = sansBrouillon.some((m) => m.id === envoye.id);
        return {
          comMsgs: {
            ...s.comMsgs,
            [comSel]: dejaLa ? sansBrouillon : [...sansBrouillon, { ...envoye, mine: true }],
          },
        };
      });
      if (!envoye?.id) get().showToast(get().dict.cm_send_failed);
    })();
  },
  // Création persistée côté API, puis resynchronisation des canaux/messages.
  addCategory: (name) => {
    const clean = name.trim();
    if (!clean) return;
    void (async () => {
      const res = await api.createCommCategory(clean);
      if (res.error) return;
      const comms = await api.getComms();
      const d = comms.data as { categories?: CommCategory[] } | undefined;
      if (d?.categories) set({ comCats: d.categories });
    })();
  },
  refreshComms: async () => {
    const comms = await api.getComms();
    const d = comms.data as { categories?: CommCategory[]; messages?: Record<string, CommMessage[]> } | undefined;
    if (!d?.categories) return;
    set((s) => ({
      comCats: d.categories ?? s.comCats,
      comMsgs: d.messages ? marquerMiens(d.messages, s.sessionUser?.matricule) : s.comMsgs,
    }));
  },
  comDirectory: [],
  loadCommsDirectory: async () => {
    const res = await api.getCommsDirectory();
    if (res.error || !Array.isArray(res.data)) return;
    set({ comDirectory: res.data as DirectoryEntry[] });
  },
  // Après une écriture, on RELIT les canaux depuis l'API plutôt que de recopier
  // la réponse : la liste des participants est de l'état serveur, et deux
  // opérateurs peuvent la modifier en même temps.
  addChannelMembers: async (channelId, matricules) => {
    const propres = matricules.map((m) => m.trim()).filter(Boolean);
    if (!propres.length) return false;
    const res = await api.addChannelMembers(channelId, propres);
    if (res.error) return false;
    await get().refreshComms();
    return true;
  },
  removeChannelMember: async (channelId, matricule) => {
    const res = await api.removeChannelMember(channelId, matricule);
    if (res.error) return false;
    await get().refreshComms();
    return true;
  },
  addChannel: (catId, name, matricules) => {
    // Le nom part TEL QUEL : l'API le normalise (une seule orthographe, quel
    // que soit le chemin — création ici, renommage ailleurs).
    if (!name.trim()) return;
    void (async () => {
      const res = await api.createCommChannel(catId, name.trim(), matricules);
      const created = res.data as { id?: string } | undefined;
      if (res.error || !created?.id) return;
      await get().refreshComms();
      set({ comSel: created.id as string });
    })();
  },
  toggleCategory: (id) => set((s) => ({ comCollapsed: { ...s.comCollapsed, [id]: !s.comCollapsed[id] } })),
  engageUnit: (unitId, incidentId, reason, via, score) => {
    const s = get();
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const others = s.engagements.filter((e) => e.unitId !== unitId);
    const eng: Engagement = { id: `ENG-${Date.now()}`, unitId, incidentId, reason, via, score, time };
    // Affichage immédiat : le répartiteur ne doit pas attendre le réseau pour
    // voir son geste pris en compte.
    set({ engagements: [eng, ...others] });

    // ...et l'engagement OUVRE UNE BOUCLE côté serveur (ADR 0007, P1-b).
    // Avant, il ne vivait que dans ce store : l'unité n'était jamais prévenue,
    // et rien n'en restait au rechargement. La mission est désormais la trace
    // qui fait foi ; le fil et le canal de l'incident sont alimentés par
    // l'API, d'où l'absence de ligne de fil locale ici.
    const unit = s.units.find((u) => u.id === unitId);
    void api
      .issueMission({
        incidentId,
        label: `${unit?.nom ?? unitId} — ${reason}`,
        to: { role: "resp_unit", entity: unitId },
        payload: { kind: "order", unitId, ...(score !== undefined ? { etaMin: Math.round(score) } : {}) },
      })
      .then((res) => {
        if (res.error) {
          // Émission refusée (droits, incident inconnu) : on le dit plutôt que
          // de laisser croire qu'un ordre est parti.
          get().showToast(`Ordre non émis pour ${unitId}`);
          return;
        }
        void get().loadMissions();
        void get().loadDomain();
      });
  },
  relieveUnit: (unitId) => set((s) => ({ engagements: s.engagements.filter((e) => e.unitId !== unitId) })),
  resolveQueueItem: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
  simTick: () =>
    set((s) => {
      let feed = s.feed;
      if (s.tick > 0 && s.tick % 6 === 0) {
        const item = FEED_POOL[Math.floor(s.tick / 6) % FEED_POOL.length];
        const d = new Date();
        const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        feed = [{ time, c: item.c, txt: item.txt }, ...s.feed].slice(0, 8);
      }
      // Fait progresser les mouvements de transport vers leur destination.
      const movements = s.movements.map((mv) =>
        mv.progress >= 100 ? mv : { ...mv, progress: Math.min(100, mv.progress + 1), etaMin: Math.max(0, mv.etaMin - 1) },
      );
      return { tick: s.tick + 1, feed, movements };
    }),
});

/** Le message d'un refus de l'API, tel que l'opérateur doit le lire ; sinon une phrase neutre. */
function apiErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    return Array.isArray(m) ? m.join(" · ") : String(m);
  }
  return "Refus de l'API";
}
