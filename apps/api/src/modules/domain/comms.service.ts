import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

// ============================================================================
// ARGOS — centre de communication (Phase 2, in-memory)
// Canaux, messages et présence. En production : EMQX/MQTT + WebSocket temps réel
// (MASTER_PLAN §5). Ici, REST simple : lecture groupée + envoi de message.
// ============================================================================

export interface CommMessage {
  id: number;
  who: string;
  initials: string;
  av: string;
  time: string;
  txt: string;
  mine?: boolean;
}
interface Channel {
  id: string;
  name: string;
  kind: "text" | "voice";
  topic?: string;
  /**
   * Membres autorisés (matricules).
   *
   * ABSENT = canal OUVERT — c'est le cas des canaux thématiques historiques
   * (état-major, logistique…), qui ne changent donc pas de comportement.
   * DÉFINI = canal restreint : seuls les membres le voient et y écrivent.
   *
   * Les canaux d'incident naissent restreints et se peuplent au fil des
   * engagements (lot G1).
   */
  members?: string[];
  /** Incident porteur, pour les canaux créés à la déclaration. */
  incidentId?: string;
  /** Canal archivé avec son incident — conservé, masqué de la liste active. */
  archived?: boolean;
}
interface CommCategory {
  id: string;
  name: string;
  chans: Channel[];
}
interface Member {
  n: string;
  g: string;
  av: string;
  initials: string;
}

@Injectable()
export class CommsService {
  private readonly categories: CommCategory[] = [
    { id: "g1", name: "OPÉRATIONS", chans: [
      { id: "c1", name: "état-major", kind: "text", topic: "Coordination générale — Op. SALAMA" },
      { id: "c2", name: "op-salama", kind: "text", topic: "Secours séisme Al Haouz" },
      { id: "c3", name: "logistique", kind: "text", topic: "Convois & approvisionnement" },
    ] },
    { id: "g2", name: "RENSEIGNEMENT", chans: [
      { id: "c4", name: "meteo-alertes", kind: "text", topic: "Bulletins & vigilance" },
      { id: "c5", name: "situation-terrain", kind: "text", topic: "Remontées zone sinistrée" },
    ] },
    { id: "g3", name: "SALLES VOCALES", chans: [
      { id: "v1", name: "PC Opérations", kind: "voice" },
      { id: "v2", name: "Coordination EVASAN", kind: "voice" },
    ] },
  ];

  private readonly messages: Record<string, CommMessage[]> = {
    c1: [
      { id: 1, who: "Gén. R. Alaoui", initials: "RA", av: "bg-rdia-600 text-white", time: "06:50", txt: "Point de situation à 07h00. Toutes les cellules en ligne." },
      { id: 2, who: "Col. M. El Fassi", initials: "MF", av: "bg-blue-500 text-white", time: "06:58", txt: "7e RA prêt. 120 personnels en attente d'héliportage à Agadir." },
      { id: 3, who: "Lt-Col. A. Tazi", initials: "AT", av: "bg-purple-500 text-white", time: "07:04", txt: "Génie : axe RP2010 dégagé à 60 %. Estimation réouverture 14h00." },
    ],
    c2: [
      { id: 1, who: "Cdt. H. Berrada", initials: "HB", av: "bg-green-500 text-white", time: "07:10", txt: "Réplique M4.2 ressentie à Amizmiz. Pas de dégâts supplémentaires signalés." },
      { id: 2, who: "Col. M. El Fassi", initials: "MF", av: "bg-blue-500 text-white", time: "07:12", txt: "Bien reçu. Maintien du dispositif." },
    ],
    c3: [{ id: 1, who: "Lt-Col. S. Amrani", initials: "SA", av: "bg-or-500 text-rdia-600", time: "06:40", txt: "Convoi LOG-1 parti de Rabat, 40 t de fret. ETA Marrakech 11h30." }],
    c4: [{ id: 1, who: "Cellule Météo", initials: "CM", av: "bg-blue-500 text-white", time: "06:30", txt: "Vigilance orange pluies fortes sur le Haut Atlas à partir de 18h00." }],
    c5: [{ id: 1, who: "Sgt. N. Chraibi", initials: "NC", av: "bg-gray-500 text-white", time: "07:15", txt: "Village Tizi N'Test : 12 habitations effondrées, besoin équipe cynophile." }],
  };

  private readonly voice = [
    { n: "Gén. R. Alaoui", initials: "RA", av: "bg-rdia-600 text-white", speaking: true },
    { n: "Col. M. El Fassi", initials: "MF", av: "bg-blue-500 text-white", speaking: false },
    { n: "Cdt. H. Berrada", initials: "HB", av: "bg-green-500 text-white", speaking: true },
    { n: "Lt-Col. S. Amrani", initials: "SA", av: "bg-or-500 text-rdia-600", speaking: false },
  ];

  private readonly online: Member[] = [
    { n: "Gén. R. Alaoui", g: "EMG", av: "bg-rdia-600 text-white", initials: "RA" },
    { n: "Col. K. Benjelloun", g: "RDIA", av: "bg-or-500 text-rdia-600", initials: "KB" },
    { n: "Col. M. El Fassi", g: "7e RA", av: "bg-blue-500 text-white", initials: "MF" },
    { n: "Lt-Col. A. Tazi", g: "3e BG", av: "bg-purple-500 text-white", initials: "AT" },
    { n: "Cdt. H. Berrada", g: "5e BS", av: "bg-green-500 text-white", initials: "HB" },
  ];

  private readonly offline: Member[] = [
    { n: "Lt-Col. S. Amrani", g: "2e GL", av: "bg-gray-400 text-white", initials: "SA" },
    { n: "Cdt. N. Chraibi", g: "4e NRBC", av: "bg-gray-400 text-white", initials: "NC" },
  ];

  all() {
    return {
      categories: this.categories,
      messages: this.messages,
      members: { online: this.online, offline: this.offline, voice: this.voice },
    };
  }

  addMessage(channelId: string, msg: { who: string; initials: string; av: string; txt: string }): CommMessage {
    const exists = this.categories.some((c) => c.chans.some((ch) => ch.id === channelId && ch.kind === "text"));
    if (!exists) throw new NotFoundException(`Canal texte inconnu : ${channelId}`);
    const list = this.messages[channelId] ?? (this.messages[channelId] = []);
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const entry: CommMessage = { id: Date.now(), ...msg, time, mine: true };
    list.push(entry);
    return entry;
  }

  /** Crée un groupe de canaux (nom affiché en capitales, comme le design). */
  addCategory(name: string): CommCategory {
    const cat: CommCategory = { id: `g${Date.now()}`, name: name.trim().toUpperCase(), chans: [] };
    this.categories.push(cat);
    return cat;
  }

  /**
   * Canal d'un incident, créé À LA DÉCLARATION (ADR 0007, lot P1-a).
   *
   * Avant, le seul canal d'opération (`op-salama`) avait été créé à la main :
   * rien dans la plateforme ne donnait un lieu de conversation aux
   * intervenants d'un incident. Désormais chaque incident naît avec le sien,
   * dans le groupe OPÉRATIONS, nommé par sa référence.
   *
   * Idempotent : rappeler la méthode pour un incident déjà pourvu rend le
   * canal existant plutôt que d'en empiler un second.
   */
  channelForIncident(incidentId: string): Channel {
    // L'identifiant porte déjà son préfixe (« INC-2614 ») : le re-préfixer
    // donnerait « inc-inc-2614 ». Le slug est l'identifiant, en minuscules.
    const slug = incidentId.toLowerCase();
    const existing = this.categories.flatMap((c) => c.chans).find((ch) => ch.name === slug);
    if (existing) return existing;
    const ops = this.categories.find((c) => c.id === "g1") ?? this.categories[0];
    const chan: Channel = {
      id: `c-${slug}`,
      name: slug,
      kind: "text",
      topic: `Coordination — ${incidentId}`,
      incidentId,
      // Naît restreint : la convocation des intervenants le peuplera.
      members: [],
    };
    ops.chans.push(chan);
    this.messages[chan.id] = [];
    return chan;
  }

  /** Retrouve un canal par identifiant, ou `undefined`. */
  findChannel(channelId: string): Channel | undefined {
    return this.categories.flatMap((c) => c.chans).find((ch) => ch.id === channelId);
  }

  /** Renomme un canal / change son sujet. */
  updateChannel(channelId: string, patch: { name?: string; topic?: string }): Channel {
    const chan = this.requireChannel(channelId);
    if (patch.name !== undefined) {
      const slug = patch.name.trim().toLowerCase().replace(/\s+/g, "-");
      if (!slug) throw new BadRequestException("Le nom du canal ne peut pas être vide.");
      chan.name = slug;
    }
    if (patch.topic !== undefined) chan.topic = patch.topic.trim();
    return chan;
  }

  /**
   * Ajoute des membres. Un canal jusque-là OUVERT devient restreint dès qu'on
   * lui donne un premier membre — c'est le geste qui le referme, et il doit
   * être explicite.
   */
  addMembers(channelId: string, matricules: string[]): Channel {
    const chan = this.requireChannel(channelId);
    const set = new Set([...(chan.members ?? []), ...matricules.map((m) => m.trim()).filter(Boolean)]);
    chan.members = [...set];
    return chan;
  }

  /** Retire un membre. Le canal reste restreint, même vidé de ses membres. */
  removeMember(channelId: string, matricule: string): Channel {
    const chan = this.requireChannel(channelId);
    if (!chan.members) throw new BadRequestException("Ce canal est ouvert : il n'a pas de liste de membres.");
    chan.members = chan.members.filter((m) => m !== matricule);
    return chan;
  }

  /** Archive le canal d'un incident (appelé avec l'archivage de l'incident). */
  archiveChannelForIncident(incidentId: string, archived = true): void {
    const chan = this.categories.flatMap((c) => c.chans).find((ch) => ch.incidentId === incidentId);
    if (chan) chan.archived = archived;
  }

  /**
   * Suppression DÉFINITIVE d'un canal — réservée au superadmin par le RBAC
   * (`comms:delete`, que la matrice n'accorde à personne).
   *
   * Garde-fou métier : on refuse de supprimer le canal d'un incident encore
   * actif. Effacer la conversation d'une opération en cours détruirait la
   * trace au moment où elle sert le plus ; il faut archiver l'incident d'abord.
   */
  deleteChannel(channelId: string, isIncidentActive: (incidentId: string) => boolean): void {
    const chan = this.requireChannel(channelId);
    if (chan.incidentId && isIncidentActive(chan.incidentId)) {
      throw new BadRequestException(
        `Le canal appartient à l'incident actif ${chan.incidentId} : archivez l'incident avant de supprimer son canal.`,
      );
    }
    for (const cat of this.categories) cat.chans = cat.chans.filter((c) => c.id !== channelId);
    delete this.messages[channelId];
  }

  private requireChannel(channelId: string): Channel {
    const chan = this.findChannel(channelId);
    if (!chan) throw new NotFoundException(`Canal inconnu : ${channelId}`);
    return chan;
  }

  /**
   * Message SYSTÈME dans le canal d'un incident : les jalons de boucle s'y
   * inscrivent tout seuls. `mine: false` — ce n'est pas l'opérateur qui parle,
   * c'est la plateforme qui rend compte.
   */
  postSystem(incidentId: string, txt: string): void {
    const chan = this.channelForIncident(incidentId);
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    (this.messages[chan.id] ??= []).push({
      id: Date.now(),
      who: "ARGOS",
      initials: "AR",
      av: "bg-rdia-500",
      txt,
      time,
      mine: false,
    });
  }

  /** Crée un canal texte dans un groupe existant (slug à la Discord). */
  addChannel(categoryId: string, name: string): Channel {
    const cat = this.categories.find((c) => c.id === categoryId);
    if (!cat) throw new NotFoundException(`Groupe inconnu : ${categoryId}`);
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
    const chan: Channel = { id: `c${Date.now()}`, name: slug, kind: "text", topic: "" };
    cat.chans.push(chan);
    this.messages[chan.id] = [];
    return chan;
  }
}
