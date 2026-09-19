"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Pill, type Tone } from "@/components/ui/Pill";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatTile } from "@/components/ui/StatTile";
import { KPI_ICONS, NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { loadBarClass } from "@/lib/responsibility";
import { freePlaces, lastCustody, levelOf, presentBodies, sortRegistry, sortSites, type SiteLevel } from "@/lib/morgue";
import { STATUS_TONES } from "@/components/responsibility/MorgueViews";
import { AddMorgueModal } from "@/components/morgue/AddMorgueModal";
import { MORGUE_STATUS_TONE, MorgueDetailModal } from "@/components/morgue/MorgueDetailModal";
import { DeployMobileModal } from "@/components/morgue/DeployMobileModal";
import { RecordDetailModal, quand } from "@/components/morgue/RecordDetailModal";
import { TransferModal } from "@/components/morgue/TransferModal";
import { IdentifyModal } from "@/components/morgue/IdentifyModal";
import { SearchBox, type Suggestion } from "@/components/ui/SearchBox";
import { personName } from "@/lib/victims";
import { DVI_STATUSES, type DviStatus, type MorgueSite, type MortuaryRecord } from "@/lib/types";
import { DeleteEntityButton } from "@/components/org/DeleteEntityModal";
import { EditMorgueModal } from "@/components/org/EditEntityModals";

// ============================================================================
// Service morgue — la vue d'ensemble de l'état-major sur la gestion des corps
//
// La morgue suit la logique des hôpitaux : un service par région (la morgue
// régionale, institut médico-légal, grande et équipée) et par ville (la
// chambre mortuaire d'un établissement), chaque site rattaché à l'hôpital
// qui l'abrite ; des morgues mobiles en renfort sur le terrain. Deux vues,
// séparées parce qu'on ne les lit pas pour la même chose : les SITES (par
// région, filtrés par échelon, créés comme un hôpital) et les DÉCÉDÉS (le
// registre de tous les sites : recherche avec auto-complétion, filtres,
// chaîne de garde, réceptions à confirmer, transferts, identification signée).
// Doctrine INTERPOL DVI / OMS-OPS-CICR ; l'API reste l'autorité, l'écran ne
// propose que ce qu'elle accepte.
// ============================================================================

const TH = "px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const LEVEL_TONE: Record<SiteLevel, Tone> = { regional: "gold", city: "gray", mobile: "amber" };

export function MorgueService() {
  const m = useModules();
  const router = useRouter();
  const role = useArgos((s) => s.role);
  // La permission servie par l'API (ADR 0022) vaut pour les deux profils de rôles.
  const can = useArgos((s) => s.can);
  const morgues = useArgos((s) => s.morgues);
  const hospitals = useArgos((s) => s.hospitals);
  const incidents = useArgos((s) => s.incidents);
  const reloadMorgues = useArgos((s) => s.reloadMorgues);
  const setMapCenter = useArgos((s) => s.setMapCenter);
  const showToast = useArgos((s) => s.showToast);
  const [records, setRecords] = useState<MortuaryRecord[]>([]);
  const [tab, setTab] = useState<"sites" | "bodies">("sites");
  const [statusFilter, setStatusFilter] = useState<DviStatus | "">("");
  const [identifying, setIdentifying] = useState<MortuaryRecord | null>(null);
  const [regionFilter, setRegionFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<SiteLevel | "">("");
  const [siteFilter, setSiteFilter] = useState("");
  const [incidentFilter, setIncidentFilter] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [siteQuery, setSiteQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [deploying, setDeploying] = useState(false);
  // Modifier un site (désignation, implantation, capacité) : à qui l'API l'accorde ; le directeur sur le sien.
  const [editingSite, setEditingSite] = useState<MorgueSite | null>(null);
  const sessionUser = useArgos((s) => s.sessionUser);
  const canEditSite = (id: string) => role === "superadmin" || (can("morgue:update") && (role !== "resp_morgue" || sessionUser?.assignments?.morgue === id));
  const [detail, setDetail] = useState<MortuaryRecord | null>(null);
  const [transferring, setTransferring] = useState<MortuaryRecord | null>(null);
  // La fiche d'un site : ouverte par un clic sur sa carte, ou par `?site=` (depuis la carte de la situation).
  const params = useSearchParams();
  const [openSite, setOpenSite] = useState<string | null>(params.get("site"));
  const siteOuvert = openSite ? morgues.find((s) => s.id === openSite) ?? null : null;

  // Qui agit : le service (admin) et les responsables de site ; les autres lisent.
  const canWrite = can("morgue:update") || role === "superadmin";
  // Créer un site : la permission servie (`morgue:create` — administration, LOG / OPS des PC et Anim en direx).
  const canCreate = role === "superadmin" || can("morgue:create");

  const load = useCallback(async () => {
    const res = await api.getMortuaryRegistry();
    setRecords(((res.data ?? []) as unknown as MortuaryRecord[]) ?? []);
  }, []);
  useEffect(() => {
    void load();
    void reloadMorgues();
  }, [load, reloadMorgues]);
  const refresh = () => {
    void load();
    void reloadMorgues();
  };

  const levelLabel: Record<SiteLevel, string> = { regional: m.morgue.level_regional, city: m.morgue.level_city, mobile: m.morgue.level_mobile };
  const actifs = morgues.filter((s) => !(s.kind === "mobile" && !s.deployment));
  const parEchelon = (l: SiteLevel) => actifs.filter((s) => levelOf(s) === l).length;
  const ouverts = actifs.filter((s) => s.statut !== "closed");
  const totalPlaces = ouverts.reduce((n, s) => n + s.capacity, 0);
  const libres = ouverts.reduce((n, s) => n + Math.max(0, freePlaces(s, records)), 0);
  const nonIdentifies = records.filter((r) => r.status === "unidentified").length;
  const enAttente = records.filter((r) => r.pendingReceipt).length;
  const regions = useMemo(() => [...new Set(actifs.map((s) => s.region).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, "fr")), [actifs]);
  const hospitalOf = (s: MorgueSite) => (s.hospitalId ? hospitals.find((h) => h.id === s.hospitalId) : undefined);

  // Les sites, par région (les régionales en tête de chaque groupe), filtrés.
  const groupes = useMemo(() => {
    const q = siteQuery.trim().toLowerCase();
    const sites = sortSites(actifs).filter((s) => {
      if (regionFilter && s.region !== regionFilter) return false;
      if (levelFilter && levelOf(s) !== levelFilter) return false;
      if (!q) return true;
      return [s.nom, s.ville, s.region, s.province, hospitalOf(s)?.nom].some((v) => v?.toLowerCase().includes(q));
    });
    const map = new Map<string, MorgueSite[]>();
    for (const s of sites) {
      const k = s.region ?? m.morgue.region_none;
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actifs, regionFilter, levelFilter, siteQuery, hospitals]);

  // Un dossier « répond » à la recherche si l'un de ses repères contient chaque mot tapé.
  const matches = useCallback((r: MortuaryRecord, q: string) => {
    const mots = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (mots.length === 0) return true;
    const site = morgues.find((s) => s.id === r.mid);
    const champs = [r.reference, r.identifiedAs, personName(r), r.cni, r.incidentId, r.foundAt, r.origin?.label, site?.nom, site?.ville].map((v) => (v ?? "").toLowerCase());
    return mots.every((mot) => champs.some((c) => c.includes(mot)));
  }, [morgues]);

  const visibles = useMemo(() => {
    return sortRegistry(
      records.filter((r) => {
        if (siteFilter && r.mid !== siteFilter) return false;
        if (incidentFilter && r.incidentId !== incidentFilter) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        if (pendingOnly && !r.pendingReceipt) return false;
        return matches(r, query);
      }),
    );
  }, [records, siteFilter, incidentFilter, statusFilter, pendingOnly, query, matches]);

  // Les suggestions de la recherche : huit dossiers au plus, référence et identité en tête, le site en sous-titre.
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!query.trim()) return [];
    return records
      .filter((r) => matches(r, query))
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        label: `${r.reference} — ${r.identifiedAs ?? personName(r) ?? m.morgue.unknown}`,
        sub: `${morgues.find((s) => s.id === r.mid)?.nom ?? r.mid} · ${m.resp.dvi_status[r.status]}${r.incidentId ? ` · ${r.incidentId}` : ""}`,
      }));
  }, [records, query, matches, morgues, m]);
  const parStatut = (st: DviStatus) => records.filter((r) => r.status === st).length;

  const siteOf = (mid: string) => morgues.find((s) => s.id === mid);
  const sur = (site: MorgueSite) => {
    if (!site.ll) return;
    setMapCenter(site.ll, 12, site.nom);
    router.push("/map");
  };
  const refuse = (res: { error?: unknown; response?: Response }) => {
    const code = res.response?.status;
    if (res.error || (code !== undefined && code >= 400)) {
      showToast(code === 409 ? `${m.morgue.err_conflict} ${(res.error as { message?: string } | undefined)?.message ?? ""}` : m.morgue.err_denied);
      return true;
    }
    return false;
  };
  const receptionner = async (r: MortuaryRecord) => {
    if (refuse(await api.receiveBody(r.mid, r.id))) return;
    showToast(m.morgue.received);
    refresh();
  };
  const replier = async (site: MorgueSite) => {
    if (!window.confirm(m.morgue.recall_confirm)) return;
    if (refuse(await api.recallMorgue(site.id))) return;
    showToast(m.morgue.recalled);
    refresh();
  };
  const origine = (r: MortuaryRecord) =>
    r.origin ? (r.origin.kind === "hospital" ? `${m.morgue.origin_hospital} · ${r.origin.label}` : `${m.morgue.origin_field}${r.origin.label ? ` · ${r.origin.label}` : ""}`) : (r.foundAt ?? "—");
  const derniere = (r: MortuaryRecord) => {
    const c = lastCustody(r);
    return c ? `${m.morgue.custody[c.step]} · ${quand(c.at)}` : `${m.resp.g_admit} · ${quand(r.admittedAt)}`;
  };

  const chip = (on: boolean) =>
    `cible-tactile shrink-0 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${
      on ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
    }`;

  const actions = (r: MortuaryRecord) => (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" title={m.morgue.detail} aria-label={`${m.morgue.detail} — ${r.reference}`} onClick={() => setDetail(r)} className="cible-tactile flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600">
        <Icon path={UI_ICONS.info} size={15} />
      </button>
      {canWrite && r.pendingReceipt && (
        <button type="button" onClick={() => void receptionner(r)} className="cible-tactile rounded-lg bg-or-500 px-2 py-1 text-[11px] font-bold text-rdia-900 hover:bg-or-400">
          {m.morgue.receive}
        </button>
      )}
      {canWrite && !r.pendingReceipt && r.status !== "released" && (
        <button type="button" onClick={() => setIdentifying(r)} className="cible-tactile rounded-lg border border-or-500/60 px-2 py-1 text-[11px] font-semibold text-or-600 hover:bg-or-500/10 dark:text-or-400">
          {r.status === "identified" ? m.morgue.edit : m.morgue.identify}
        </button>
      )}
      {canWrite && !r.pendingReceipt && r.status !== "released" && (
        <button type="button" onClick={() => setTransferring(r)} className="cible-tactile rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-or-500 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-200">
          {m.morgue.transfer}
        </button>
      )}
    </div>
  );
  const ongletCls = (on: boolean) =>
    `cible-tactile flex items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${
      on ? "bg-rdia-600 text-white dark:bg-or-500 dark:text-rdia-900" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* --- bandeau ------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={m.morgue.sites} value={`${parEchelon("regional")} + ${parEchelon("city")} + ${parEchelon("mobile")}`} sub={m.morgue.sites_sub} icon={NAV_ICONS.morgue} tint="or" />
        <StatTile label={m.morgue.places_free} value={libres} sub={`/ ${totalPlaces}`} icon={KPI_ICONS.beds} tint={totalPlaces > 0 && libres / totalPlaces < 0.15 ? "danger" : "green"} />
        <StatTile label={m.morgue.unidentified} value={nonIdentifies} icon={UI_ICONS.shield} tint={nonIdentifies > 0 ? "danger" : "gray"} />
        <StatTile label={m.morgue.pending} value={enAttente} icon={UI_ICONS.activity} tint={enAttente > 0 ? "amber" : "gray"} />
      </div>

      {/* --- titre, onglets, actions ------------------------------------------ */}
      <div className="carte flex flex-wrap items-center gap-2 p-2.5">
        <h1 className="flex items-center gap-2 pe-2 text-sm font-bold text-rdia-600 dark:text-rdia-50">
          <Icon path={NAV_ICONS.morgue} size={17} className="text-or-500" />
          {m.morgue.title}
        </h1>
        <div role="tablist" aria-label={m.morgue.title} className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-rdia-700/60">
          <button type="button" role="tab" aria-selected={tab === "sites"} className={ongletCls(tab === "sites")} onClick={() => setTab("sites")}>
            {m.morgue.tab_sites} <span className="font-mono text-[11px] opacity-70">{actifs.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "bodies"} className={ongletCls(tab === "bodies")} onClick={() => setTab("bodies")}>
            {m.morgue.tab_bodies} <span className="font-mono text-[11px] opacity-70">{records.length}</span>
          </button>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={refresh} title={m.morgue.refresh} aria-label={m.morgue.refresh} className="cible-tactile flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600">
            <Icon path={UI_ICONS.refresh} size={15} />
          </button>
          {canCreate && (
            <button type="button" className="cible-tactile btn-secondaire flex items-center gap-1.5 text-sm" onClick={() => setAdding(true)}>
              <Icon path={UI_ICONS.plus} size={14} />
              {m.morgue.add}
            </button>
          )}
          {canWrite && (
            <button type="button" className="cible-tactile btn-primaire flex items-center gap-1.5 text-sm" onClick={() => setDeploying(true)}>
              <Icon path={UI_ICONS.plus} size={14} />
              {m.morgue.deploy}
            </button>
          )}
        </div>
      </div>
      <p className="-mt-2 text-xs text-gray-500 dark:text-rdia-300">{m.morgue.subtitle}</p>

      {tab === "sites" && (
        <>
          {/* --- filtres des sites ------------------------------------------- */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              <button type="button" className={chip(levelFilter === "")} onClick={() => setLevelFilter("")} aria-pressed={levelFilter === ""}>{m.morgue.filter_level_all}</button>
              {(["regional", "city", "mobile"] as SiteLevel[]).map((l) => (
                <button key={l} type="button" className={chip(levelFilter === l)} onClick={() => setLevelFilter(levelFilter === l ? "" : l)} aria-pressed={levelFilter === l}>
                  {levelLabel[l]} ({parEchelon(l)})
                </button>
              ))}
            </div>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <select className="input-champ cible-tactile w-auto text-sm" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} aria-label={m.morgue.filter_region_all}>
                <option value="">{m.morgue.filter_region_all}</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input className="input-champ cible-tactile w-[220px] text-sm" type="search" placeholder={m.morgue.search_ph} aria-label={m.morgue.search_ph} value={siteQuery} onChange={(e) => setSiteQuery(e.target.value)} />
            </div>
          </div>

          {/* --- sites, par région -------------------------------------------- */}
          {groupes.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-[11px] text-gray-400 dark:border-rdia-700 dark:text-rdia-400">{m.morgue.no_site}</div>
          )}
          {groupes.map(([region, sites]) => (
            <div key={region} className="flex flex-col gap-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                {region} <span className="font-mono">· {sites.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sites.map((site) => {
                  const presents = presentBodies(site, records);
                  const pct = site.capacity > 0 ? Math.round((presents / site.capacity) * 100) : 0;
                  const attente = records.filter((r) => r.mid === site.id && r.pendingReceipt).length;
                  const echelon = levelOf(site);
                  const hosp = hospitalOf(site);
                  return (
                    <div key={site.id} className="carte flex flex-col gap-3 p-4">
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => setOpenSite(site.id)} className="min-w-0 flex-1 text-start" title={m.morgue.open_detail}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-sm font-bold text-rdia-600 hover:text-or-500 dark:text-rdia-50">{site.nom}</h3>
                            <Pill tone={LEVEL_TONE[echelon]} label={levelLabel[echelon]} size="sm" />
                            <Pill tone={MORGUE_STATUS_TONE[site.statut]} label={m.resp.morgue_statut[site.statut]} size="sm" />
                            {site.type && <span className="text-[10.5px] text-gray-400 dark:text-rdia-400">{m.morgue.types[site.type]}</span>}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-rdia-300">
                            {site.ville}
                            {site.province && site.province !== site.ville ? ` · ${site.province}` : ""}
                            {site.deployment?.incidentId ? ` · ${site.deployment.incidentId}` : ""}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500 dark:text-rdia-300">
                            <Icon path={NAV_ICONS.hospitals} size={12} className="shrink-0 text-or-500" />
                            <span className="truncate">{hosp ? `${m.morgue.attached} ${hosp.nom}` : m.morgue.not_attached}</span>
                          </div>
                        </button>
                        {site.ll && (
                          <button type="button" onClick={() => sur(site)} title={m.morgue.map} aria-label={`${m.morgue.map} — ${site.nom}`} className="cible-tactile flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600">
                            <Icon path={NAV_ICONS.map} size={15} />
                          </button>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700 dark:text-rdia-100">{m.morgue.present}</span>
                          <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{presents} / {site.capacity} · {pct} %</span>
                        </div>
                        <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-rdia-300">
                        <span>{m.resp.g_staff} : {site.staff}</span>
                        {attente > 0 && <Pill tone="amber" label={`${attente} ${m.morgue.pending_short}`} size="sm" />}
                        <span className="ms-auto flex gap-2">
                          {presents > 0 && (
                            <button type="button" onClick={() => { setSiteFilter(site.id); setTab("bodies"); }} className="cible-tactile text-[11px] font-semibold text-or-500 hover:underline">
                              {m.morgue.bodies} · {presents}
                            </button>
                          )}
                          {canWrite && echelon === "mobile" && (
                            <button type="button" onClick={() => void replier(site)} className="cible-tactile text-[11px] font-semibold text-gray-500 hover:text-danger-500 dark:text-rdia-300">
                              {m.morgue.recall}
                            </button>
                          )}
                          {role === "resp_morgue" && (
                            <Link href="/ma-responsabilite/gestion" className="text-[11px] font-semibold text-or-500 hover:underline">
                              {m.morgue.open_site}
                            </Link>
                          )}
                          {canEditSite(site.id) && (
                            <button type="button" onClick={() => setEditingSite(site)} title={m.morgue.edit_site} aria-label={`${m.morgue.edit_site} — ${site.nom}`} className="cible-tactile text-[11px] font-semibold text-gray-500 hover:text-or-500 dark:text-rdia-300">
                              {m.morgue.edit_site}
                            </button>
                          )}
                          <DeleteEntityButton kind="morgue" id={site.id} name={site.nom} compact className="!py-0.5" onDeleted={refresh} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "bodies" && (
        <div className="carte flex flex-col gap-3 p-4">
          {/* --- recherche avec auto-complétion, puis les filtres ------------------ */}
          <div className="flex flex-col gap-2">
            <SearchBox
              value={query}
              onChange={setQuery}
              suggestions={suggestions}
              placeholder={m.morgue.search_bodies_ph}
              hint={m.morgue.sugg_hint}
              emptyLabel={m.morgue.sugg_none}
              onPick={(sug) => {
                const r = records.find((x) => x.id === sug.id);
                if (!r) return;
                setQuery(r.reference);
                setDetail(r);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1">
                <button type="button" className={chip(statusFilter === "")} onClick={() => setStatusFilter("")} aria-pressed={statusFilter === ""}>{m.morgue.status_all}</button>
                {DVI_STATUSES.map((st) => (
                  <button key={st} type="button" className={chip(statusFilter === st)} onClick={() => setStatusFilter(statusFilter === st ? "" : st)} aria-pressed={statusFilter === st}>
                    {m.resp.dvi_status[st]} ({parStatut(st)})
                  </button>
                ))}
              </div>
              <div className="ms-auto flex flex-wrap items-center gap-2">
                <select className="input-champ cible-tactile w-auto text-sm" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} aria-label={m.morgue.filter_site}>
                  <option value="">{m.morgue.filter_site}</option>
                  {morgues.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
                <select className="input-champ cible-tactile w-auto text-sm" value={incidentFilter} onChange={(e) => setIncidentFilter(e.target.value)} aria-label={m.morgue.filter_incident}>
                  <option value="">{m.morgue.filter_incident}</option>
                  {incidents.map((i) => <option key={i.id} value={i.id}>{i.id} — {i.titre}</option>)}
                </select>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-rdia-200">
                  <input type="checkbox" className="size-4 accent-or-500" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
                  {m.morgue.filter_pending}
                </label>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.morgue.registry}</h2>
            <span className="font-mono text-[11px] text-gray-400 dark:text-rdia-400">{visibles.length} / {records.length}</span>
          </div>

          {visibles.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-[11px] text-gray-400 dark:border-rdia-700 dark:text-rdia-400">{m.morgue.no_record}</div>
          )}

          {/* Tableau à partir de md ; une carte par dossier en dessous. */}
          {visibles.length > 0 && (
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-rdia-600">
                    <th className={TH}>{m.morgue.col_ref}</th><th className={TH}>{m.morgue.col_site}</th><th className={TH}>{m.morgue.col_status}</th>
                    <th className={TH}>{m.morgue.col_identity}</th><th className={TH}>{m.morgue.col_origin}</th><th className={TH}>{m.morgue.col_last}</th><th className={TH}>{m.morgue.col_actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 dark:border-rdia-700/50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-rdia-100">{r.reference}</td>
                      <td className="px-3 py-2 text-xs text-gray-700 dark:text-rdia-100">{siteOf(r.mid)?.nom ?? r.mid}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          <Pill tone={STATUS_TONES[r.status]} label={m.resp.dvi_status[r.status]} size="sm" />
                          {r.pendingReceipt && <Pill tone="amber" label={m.morgue.pending_badge} size="sm" />}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700 dark:text-rdia-100">{r.identifiedAs ?? personName(r) ?? "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-500 dark:text-rdia-300">{origine(r)}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-500 dark:text-rdia-300">{derniere(r)}</td>
                      <td className="px-3 py-2">{actions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-col gap-2 md:hidden">
            {visibles.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-100 p-3 dark:border-rdia-700/60">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-xs font-semibold text-gray-800 dark:text-rdia-50">{r.reference}</span>
                  <span className="flex shrink-0 gap-1">
                    <Pill tone={STATUS_TONES[r.status]} label={m.resp.dvi_status[r.status]} size="sm" />
                    {r.pendingReceipt && <Pill tone="amber" label={m.morgue.pending_badge} size="sm" />}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-600 dark:text-rdia-200">{siteOf(r.mid)?.nom ?? r.mid} · {r.identifiedAs ?? personName(r) ?? m.morgue.unknown}</div>
                <div className="text-[11px] text-gray-500 dark:text-rdia-300">{origine(r)} · {derniere(r)}</div>
                <div className="mt-2">{actions(r)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {siteOuvert && <MorgueDetailModal site={siteOuvert} records={records} onClose={() => setOpenSite(null)} onChanged={refresh} />}
      {adding && <AddMorgueModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
      {editingSite && <EditMorgueModal site={editingSite} onClose={() => setEditingSite(null)} onSaved={refresh} />}
      {deploying && <DeployMobileModal onClose={() => setDeploying(false)} onDone={() => { setDeploying(false); refresh(); }} />}
      {detail && <RecordDetailModal record={detail} sites={morgues} onClose={() => setDetail(null)} />}
      {identifying && <IdentifyModal record={identifying} onClose={() => setIdentifying(null)} onDone={() => { setIdentifying(null); refresh(); }} />}
      {transferring && <TransferModal record={transferring} sites={morgues} records={records} onClose={() => setTransferring(null)} onDone={() => { setTransferring(null); refresh(); }} />}
    </section>
  );
}
