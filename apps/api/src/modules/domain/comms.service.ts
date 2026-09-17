import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DEMO_DATA } from "@/common/data-profile";

// ============================================================================
// ARGOS — centre de communication (Phase 2, in-memory)
// Canaux, messages et présence. En production : EMQX/MQTT + WebSocket temps réel
// (MASTER_PLAN §5). Ici, REST simple : lecture groupée + envoi de message.
// ============================================================================

/** Pièce jointe d'un message — le contenu vit sur disque, ceci en est la fiche. */
export interface CommAttachment {
  id: string;
  name: string;
  mime: string;
  bytes: number;
}

export interface CommMessage {
  id: number;
  who: string;
  initials: string;
  av: string;
  time: string;
  txt: string;
  /**
   * MATRICULE de l'auteur — l'identité, par opposition à `who` qui en est
   * l'affichage. C'est le seul champ sur lequel un client peut décider si un
   * message est le sien : le nom affiché ne suffit pas (deux homonymes, un
   * grade qui change), et `mine` ne peut pas être décidé côté serveur puisque
   * le même message part vers tous les postes.
   */
  author?: string;
  /**
   * NE VIENT PLUS DU SERVEUR pour les messages d'opérateur : chaque poste le
   * calcule depuis `author`. Reste posé à `false` pour les messages système.
   */
  mine?: boolean;
  /** Absente pour un message de texte seul — la majorité. */
  attachment?: CommAttachment;
  /**
   * Accusés d'une conversation DIRECTE : qui a reçu, qui a lu — des matricules,
   * jamais celui de l'auteur. Les deux coches de l'écran en découlent.
   */
  deliveredBy?: string[];
  readBy?: string[];
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
  /**
   * Conversation directe entre deux comptes : ne sort du serveur que pour
   * ses deux membres, et sa composition ne se modifie pas.
   */
  direct?: boolean;
  /** Les deux correspondants d'une conversation directe — pour la nommer du nom de l'AUTRE, chez chacun. */
  correspondents?: Correspondent[];
}

/** Groupe qui accueille les conversations directes, créé au premier besoin. */
const DIRECT_CATEGORY_ID = "g-direct";

/** Un correspondant d'une conversation directe : son matricule, son nom affiché. */
export interface Correspondent {
  matricule: string;
  nom: string;
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

/**
 * Nom de canal lisible : minuscules, tout ce qui n'est ni lettre ni chiffre
 * devient un tiret, 48 caractères au plus. « Crues de l'oued Ourika » →
 * « crues-de-l-oued-ourika ».
 *
 * Les LETTRES ACCENTUÉES SONT CONSERVÉES, et les alphabets non latins avec
 * elles : l'interface est en français, en arabe et en anglais, et un canal
 * nommé « séisme-al-haouz » se lit mieux que « seisme-al-haouz ». C'est aussi
 * la règle qui valait déjà pour un renommage manuel — la création s'y aligne
 * plutôt que d'imposer deux orthographes selon le chemin emprunté.
 */
function slugify(source: string): string {
  return source
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

@Injectable()
export class CommsService {
  // Le profil « empty » (ADR 0015) ne connaît ni salons ni messages fictifs :
  // un seul canal d'accueil, que les opérations réelles viendront rejoindre.
  private readonly categories: CommCategory[] = DEMO_DATA ? [
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
  ] : [{ id: "g1", name: "OPÉRATIONS", chans: [{ id: "c1", name: "général", kind: "text", topic: "Coordination générale" }] }];

  private readonly messages: Record<string, CommMessage[]> = DEMO_DATA ? {
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
  } : { c1: [] };

  private readonly voice = DEMO_DATA ? [
    { n: "Gén. R. Alaoui", initials: "RA", av: "bg-rdia-600 text-white", speaking: true },
    { n: "Col. M. El Fassi", initials: "MF", av: "bg-blue-500 text-white", speaking: false },
    { n: "Cdt. H. Berrada", initials: "HB", av: "bg-green-500 text-white", speaking: true },
    { n: "Lt-Col. S. Amrani", initials: "SA", av: "bg-or-500 text-rdia-600", speaking: false },
  ] : [];

  private readonly online: Member[] = DEMO_DATA ? [
    { n: "Gén. R. Alaoui", g: "EMG", av: "bg-rdia-600 text-white", initials: "RA" },
    { n: "Col. K. Benjelloun", g: "RDIA", av: "bg-or-500 text-rdia-600", initials: "KB" },
    { n: "Col. M. El Fassi", g: "7e RA", av: "bg-blue-500 text-white", initials: "MF" },
    { n: "Lt-Col. A. Tazi", g: "3e BG", av: "bg-purple-500 text-white", initials: "AT" },
    { n: "Cdt. H. Berrada", g: "5e BS", av: "bg-green-500 text-white", initials: "HB" },
  ] : [];

  private readonly offline: Member[] = DEMO_DATA ? [
    { n: "Lt-Col. S. Amrani", g: "2e GL", av: "bg-gray-400 text-white", initials: "SA" },
    { n: "Cdt. N. Chraibi", g: "4e NRBC", av: "bg-gray-400 text-white", initials: "NC" },
  ] : [];

  /**
   * Le centre tel que `viewer` (un matricule) a le droit de le voir.
   *
   * Une conversation directe n'existe que pour ses deux membres : elle ne
   * sort pas du serveur pour les autres, quel que soit leur rôle — c'est le
   * serveur qui la retient, pas l'écran qui la cache. Les autres canaux
   * restreints restent servis comme avant : leur liste de membres gouverne
   * la participation, pas la lecture.
   */
  all(viewer?: string) {
    const visible = (ch: Channel) => !ch.direct || (!!viewer && this.isMember(ch, viewer));
    // Une conversation directe porte, chez chacun, le nom de l'AUTRE : on ne
    // lit pas « alami-bennani » dans sa propre liste, on lit « Cdt. S. Bennani ».
    const named = (ch: Channel): Channel => {
      if (!ch.direct || !viewer || !ch.correspondents) return ch;
      const autre = ch.correspondents.find((c) => c.matricule.toLowerCase() !== viewer.toLowerCase());
      return autre ? { ...ch, name: autre.nom } : ch;
    };
    const categories = this.categories
      .map((c) => ({ ...c, chans: c.chans.filter(visible).map(named) }))
      .filter((c) => c.id !== DIRECT_CATEGORY_ID || c.chans.length > 0);
    const messages = Object.fromEntries(
      Object.entries(this.messages).filter(([id]) => {
        const ch = this.findChannel(id);
        return !ch || visible(ch);
      }),
    );
    return {
      categories,
      messages,
      members: { online: this.online, offline: this.offline, voice: this.voice },
    };
  }

  private isMember(chan: Channel, matricule: string): boolean {
    const m = matricule.toLowerCase();
    return (chan.members ?? []).some((x) => x.toLowerCase() === m);
  }

  /**
   * Le canal où `matricule` peut prendre la parole : un canal texte, et — s'il
   * est direct — dont il est membre. Le serveur le vérifie sur le matricule,
   * pour le message comme pour le signal de frappe et l'accusé.
   */
  private speakable(channelId: string, matricule: string): Channel {
    const chan = this.findChannel(channelId);
    if (!chan || chan.kind !== "text") throw new NotFoundException(`Canal texte inconnu : ${channelId}`);
    if (chan.direct && !this.isMember(chan, matricule)) throw new ForbiddenException("Cette conversation directe ne vous concerne pas.");
    return chan;
  }

  /**
   * À qui un message de ce canal est poussé (ADR 0019) : les membres d'un canal
   * restreint ou direct, et eux seuls ; `null` pour un canal ouvert (sans
   * liste de membres), qui se diffuse à tous. Avant, chaque message — une
   * conversation directe comprise — traversait le fil de tout le monde, et la
   * cloche de chacun comptait des messages qui ne le concernaient pas.
   */
  audienceOf(channelId: string): readonly string[] | null {
    const chan = this.findChannel(channelId);
    if (!chan || !chan.members || chan.members.length === 0) return null;
    return chan.members;
  }

  /** Les autres membres d'un canal restreint — à qui un accusé ou un signal de frappe s'adresse. */
  private otherMembers(chan: Channel, matricule: string): string[] {
    const m = matricule.toLowerCase();
    return (chan.members ?? []).filter((x) => x.toLowerCase() !== m);
  }

  /**
   * Accusé de réception (« remis ») ou de lecture (« lu ») — conversation
   * DIRECTE seulement : dans un canal de conduite, « lu par tous » n'aurait
   * pas de sens net. Marque tous les messages de l'AUTRE jusqu'à `upToId` ;
   * lire implique avoir reçu. Rend qui prévenir et si quelque chose a changé
   * (un accusé répété ne fait pas sonner deux fois) ; `null` hors direct.
   */
  markReceipt(
    channelId: string,
    matricule: string,
    state: "delivered" | "read",
    upToId: number,
  ): { notify: string[]; changed: boolean } | null {
    const chan = this.speakable(channelId, matricule);
    if (!chan.direct) return null;
    const me = matricule.toLowerCase();
    const sans = (liste: string[] | undefined) => !liste?.some((x) => x.toLowerCase() === me);
    let changed = false;
    for (const msg of this.messages[channelId] ?? []) {
      if (msg.id > upToId || !msg.author || msg.author.toLowerCase() === me) continue;
      if (sans(msg.deliveredBy)) {
        msg.deliveredBy = [...(msg.deliveredBy ?? []), matricule];
        changed = true;
      }
      if (state === "read" && sans(msg.readBy)) {
        msg.readBy = [...(msg.readBy ?? []), matricule];
        changed = true;
      }
    }
    return { notify: this.otherMembers(chan, matricule), changed };
  }

  /** Signal de frappe : les correspondants à prévenir — `null` hors conversation directe. */
  typingTargets(channelId: string, matricule: string): string[] | null {
    const chan = this.speakable(channelId, matricule);
    return chan.direct ? this.otherMembers(chan, matricule) : null;
  }

  addMessage(
    channelId: string,
    msg: { who: string; author: string; initials: string; av: string; txt: string; attachment?: CommAttachment },
  ): CommMessage {
    this.speakable(channelId, msg.author);
    const list = this.messages[channelId] ?? (this.messages[channelId] = []);
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    // Ni `mine` ni identifiant deviné : l'identifiant est celui du serveur (le
    // seul qui fasse foi pour dédoublonner), et l'appartenance se décide sur
    // chaque poste. `mine: true` stocké ici faisait apparaître TOUS les
    // messages comme les siens à quiconque rechargeait le centre.
    const entry: CommMessage = { id: this.nextMessageId(), ...msg, time };
    list.push(entry);
    return entry;
  }

  /**
   * Identifiant de message : strictement croissant, jamais réutilisé.
   * `Date.now()` seul rendait deux fois la même valeur pour deux messages
   * envoyés dans la même milliseconde.
   */
  private dernierId = 0;
  private nextMessageId(): number {
    this.dernierId = Math.max(Date.now(), this.dernierId + 1);
    return this.dernierId;
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
  channelForIncident(incidentId: string, titre?: string): Channel {
    // Rattachement par INCIDENT, pas par nom : le canal se nomme d'après le
    // titre de l'incident, et un titre peut changer ou se répéter. L'identifiant
    // technique, lui, reste dérivé de l'identifiant d'incident — la suppression
    // en cascade et le message système le retrouvent par là.
    const existing = this.categories.flatMap((c) => c.chans).find((ch) => ch.incidentId === incidentId);
    if (existing) return existing;
    const ops = this.categories.find((c) => c.id === "g1") ?? this.categories[0];
    const chan: Channel = {
      id: `c-${incidentId.toLowerCase()}`,
      // Le NOM est celui de l'opération, pas sa référence : « crues-de-l-oued-
      // ourika » se reconnaît dans une liste, « inc-2623 » demande d'aller
      // chercher à quoi il correspond. La référence reste dans le sujet.
      name: this.uniqueChannelName(titre?.trim() ? titre : incidentId, incidentId),
      kind: "text",
      topic: titre?.trim() ? `Coordination — ${incidentId} · ${titre.trim()}` : `Coordination — ${incidentId}`,
      incidentId,
      // Naît restreint : la convocation des intervenants le peuplera.
      members: [],
    };
    ops.chans.push(chan);
    this.messages[chan.id] = [];
    return chan;
  }

  /**
   * Conversation directe entre deux comptes, ouverte au premier contact.
   *
   * Idempotente : l'identifiant est dérivé des deux matricules, dans l'ordre
   * alphabétique, et rappeler la méthode rend la conversation existante. Elle
   * naît restreinte à ses deux membres, dans un groupe dédié créé au premier
   * besoin — après les groupes d'opération, pas au milieu.
   */
  channelForDirect(a: Correspondent, b: Correspondent): { channel: Channel; created: boolean } {
    const paire = [a, b].map((c) => c.matricule.trim()).filter(Boolean);
    if (paire.length !== 2 || paire[0].toLowerCase() === paire[1].toLowerCase()) {
      throw new BadRequestException("Une conversation directe se tient à deux.");
    }
    const id = `dm-${[...paire].map((m) => m.toLowerCase()).sort().join("_")}`;
    const existing = this.findChannel(id);
    if (existing) return { channel: existing, created: false };
    let cat = this.categories.find((c) => c.id === DIRECT_CATEGORY_ID);
    if (!cat) {
      cat = { id: DIRECT_CATEGORY_ID, name: "CONVERSATIONS DIRECTES", chans: [] };
      this.categories.push(cat);
    }
    const channel: Channel = {
      id,
      // Le nom SERVI est celui de l'autre correspondant (voir `all`) ; celui-ci
      // n'est qu'un repli technique, jamais affiché à un membre.
      name: slugify(`${a.nom} ${b.nom}`) || id,
      kind: "text",
      topic: "Conversation directe",
      members: paire,
      direct: true,
      correspondents: [
        { matricule: paire[0], nom: a.nom },
        { matricule: paire[1], nom: b.nom },
      ],
    };
    cat.chans.push(channel);
    this.messages[id] = [];
    return { channel, created: true };
  }

  /**
   * Nom de canal à partir d'un texte libre : minuscules, sans accents, un tiret
   * par séparateur, 48 caractères au plus. Deux incidents peuvent porter le
   * même titre ; le second reçoit alors le numéro de sa référence en suffixe,
   * pour que la liste reste lisible sans deviner lequel est lequel.
   */
  private uniqueChannelName(source: string, incidentId: string): string {
    const base = slugify(source) || incidentId.toLowerCase();
    const pris = new Set(this.categories.flatMap((c) => c.chans).map((ch) => ch.name));
    if (!pris.has(base)) return base;
    const suffixe = incidentId.replace(/^INC-/i, "").toLowerCase();
    const avecSuffixe = `${base}-${suffixe}`;
    if (!pris.has(avecSuffixe)) return avecSuffixe;
    let n = 2;
    while (pris.has(`${avecSuffixe}-${n}`)) n += 1;
    return `${avecSuffixe}-${n}`;
  }

  /** Retrouve un canal par identifiant, ou `undefined`. */
  findChannel(channelId: string): Channel | undefined {
    return this.categories.flatMap((c) => c.chans).find((ch) => ch.id === channelId);
  }

  /** Renomme un canal / change son sujet. */
  updateChannel(channelId: string, patch: { name?: string; topic?: string }): Channel {
    const chan = this.requireChannel(channelId);
    if (patch.name !== undefined) {
      const slug = slugify(patch.name);
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
    this.assertComposable(chan);
    const set = new Set([...(chan.members ?? []), ...matricules.map((m) => m.trim()).filter(Boolean)]);
    chan.members = [...set];
    return chan;
  }

  /** Retire un membre. Le canal reste restreint, même vidé de ses membres. */
  removeMember(channelId: string, matricule: string): Channel {
    const chan = this.requireChannel(channelId);
    this.assertComposable(chan);
    if (!chan.members) throw new BadRequestException("Ce canal est ouvert : il n'a pas de liste de membres.");
    chan.members = chan.members.filter((m) => m !== matricule);
    return chan;
  }

  /** Une conversation directe se tient à deux : on n'y convoque ni n'en retire personne. */
  private assertComposable(chan: Channel): void {
    if (chan.direct) throw new BadRequestException("Une conversation directe se tient à deux : sa composition ne se modifie pas.");
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
      id: this.nextMessageId(),
      who: "IRIS",
      initials: "AR",
      av: "bg-rdia-500",
      txt,
      time,
      // La plateforme rend compte : ce n'est le message de personne.
      mine: false,
    });
  }

  /**
   * Crée un canal texte dans un groupe existant (nom à la Discord).
   *
   * `matricules` fournis → le canal naît RESTREINT à ces comptes, et le geste
   * de création est aussi celui de la convocation : ouvrir un canal puis penser
   * à y ajouter les intéressés en deux temps, c'est laisser une conversation
   * sans destinataires. Liste absente ou vide → canal ouvert à tous, comme les
   * canaux thématiques historiques.
   */
  addChannel(categoryId: string, name: string, matricules?: string[]): Channel {
    const cat = this.categories.find((c) => c.id === categoryId);
    if (!cat) throw new NotFoundException(`Groupe inconnu : ${categoryId}`);
    const slug = slugify(name);
    if (!slug) throw new BadRequestException("Le nom du canal ne peut pas être vide.");
    const membres = [...new Set((matricules ?? []).map((m) => m.trim()).filter(Boolean))];
    const chan: Channel = { id: `c${Date.now()}`, name: slug, kind: "text", topic: "" };
    if (membres.length) chan.members = membres;
    cat.chans.push(chan);
    this.messages[chan.id] = [];
    return chan;
  }
}
