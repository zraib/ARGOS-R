"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { UI_ICONS } from "@/lib/icons";
import { isSuperAdmin } from "@/lib/roles";
import type { Tracker, TrackerSource, TrackerTargetKind } from "@/lib/tracking/tracker";
import { TRACKER_TARGET_KINDS, contactAge, isStale } from "@/lib/tracking/tracker";
import { startSharing, stopSharing, useShare } from "@/lib/tracking/share";

// ============================================================================
// Traceurs GPS FMC920 (lot N-2)
//
// CE QUE CET ÉCRAN EST. Le registre des boîtiers — et le registre n'est pas un
// inventaire : c'est la LISTE BLANCHE de l'écouteur TCP. Le protocole Teltonika
// ne porte ni secret ni certificat ; l'IMEI est la seule identité présentée, et
// un IMEI absent d'ici est refusé à la poignée de main (ADR 0008). Déclarer un
// traceur, c'est autoriser un boîtier à écrire dans la carte de l'état-major.
// L'écran le dit, parce qu'un opérateur qui croit ranger un inventaire ne
// mesure pas ce qu'il accorde.
//
// DEUX DATES, JAMAIS FONDUES. `last` est la dernière position EXPLOITABLE ;
// `lastSeenAt` le dernier contact, fix ou non. Un boîtier peut émettre
// fidèlement depuis un sous-sol sans jamais se localiser : le confondre avec un
// boîtier muet enverrait chercher une panne qui n'existe pas.
//
// DEUX SOURCES (ADR 0008, révision) : le boîtier FMC920 (IMEI, entrée TCP) et
// le PARTAGE PAR L'APPLICATION — le téléphone d'un compte, qui ne peut verser
// que sa propre position sur son partage déclaré. La carte « Ma position »
// pilote ce partage pour le compte connecté.
// ============================================================================

/** Rafraîchissement de la liste. Le FMC920 émet typiquement toutes les 30 s. */
const REFRESH_MS = 20_000;

export default function TraceursPage() {
  const t = useDict();
  const role = useArgos((s) => s.role);

  const [list, setList] = useState<Tracker[]>([]);
  const [archives, setArchives] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [declarer, setDeclarer] = useState<false | "device" | "app">(false);
  const [edite, setEdite] = useState<Tracker | null>(null);
  const [mien, setMien] = useState<Tracker | null | undefined>(undefined);

  const canDelete = isSuperAdmin(role);

  // Mon partage : lu à part, parce qu'un compte de terrain n'a pas forcément le droit de voir le registre.
  const chargerMien = useCallback(async () => {
    const { data } = await api.getMyTracker();
    setMien(((data as { tracker?: Tracker | null } | undefined)?.tracker ?? null) as Tracker | null);
  }, []);
  useEffect(() => { void chargerMien(); }, [chargerMien]);

  const charger = useCallback(async () => {
    const { data, error } = await api.getTrackers(archives);
    if (error) {
      setErreur(t.trk_load_failed);
    } else {
      setErreur(null);
      setList((data ?? []) as unknown as Tracker[]);
    }
    setChargement(false);
  }, [archives, t]);

  useEffect(() => {
    void charger();
    // Relance périodique : sans elle l'écran fige la situation au chargement,
    // ce qui est exactement le contraire de ce qu'on attend d'un suivi.
    const timer = setInterval(() => void charger(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [charger]);

  const compte = useMemo(
    () => ({
      total: list.length,
      localises: list.filter((x) => x.last).length,
      muets: list.filter((x) => isStale(x)).length,
    }),
    [list],
  );

  // Le report sur la carte viendra avec la couche de traceurs — un bouton qui
  // n'irait nulle part serait pire que son absence.

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <header className="carte flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-bold text-rdia-600 dark:text-rdia-50">
            <Icon path={UI_ICONS.tracker} size={18} className="text-or-500" />
            {t.trk_title}
          </h1>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500 dark:text-rdia-300">
              <input
                type="checkbox"
                checked={archives}
                onChange={(e) => setArchives(e.target.checked)}
                className="h-4 w-4 accent-or-500"
              />
              {t.trk_show_archived}
            </label>
            <button className="btn-primaire cible-tactile text-sm" onClick={() => setDeclarer("device")}>
              {t.trk_declare}
            </button>
          </div>
        </div>

        {/* Ce que la déclaration ENGAGE, dit à l'endroit où on la fait. Reléguer
            cet avertissement dans une note laisserait croire à un rangement. */}
        <p className="flex items-start gap-2 rounded-lg border border-or-500/30 bg-or-500/5 px-3 py-2 text-[11.5px] leading-snug text-gray-600 dark:text-rdia-200">
          <Icon path={UI_ICONS.shield} size={13} className="mt-0.5 shrink-0 text-or-500" />
          {t.trk_whitelist_note}
        </p>

        {list.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] tabular-nums text-gray-500 dark:text-rdia-300">
            <span>
              <span className="font-bold text-gray-800 dark:text-rdia-50">{compte.total}</span> {t.trk_count}
            </span>
            <span>
              <span className="font-bold text-green-600">{compte.localises}</span> {t.trk_located}
            </span>
            {compte.muets > 0 && (
              <span>
                <span className="font-bold text-danger-500">{compte.muets}</span> {t.trk_silent}
              </span>
            )}
          </div>
        )}
      </header>

      {/* --- ma position : le partage du compte connecté ------------------------ */}
      <MaPosition mien={mien} onDeclare={() => setDeclarer("app")} />

      {erreur && (
        <p role="alert" className="carte px-4 py-3 text-sm font-semibold text-danger-400">
          {erreur}
        </p>
      )}

      {chargement && list.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="carte h-[120px] animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="carte flex flex-col items-center gap-3 p-8 text-center">
          <Icon path={UI_ICONS.tracker} size={28} className="text-gray-300 dark:text-rdia-600" />
          <p className="text-sm font-semibold text-gray-700 dark:text-rdia-100">{t.trk_none}</p>
          <p className="max-w-md text-[12.5px] leading-relaxed text-gray-500 dark:text-rdia-300">{t.trk_none_hint}</p>
          <button className="btn-primaire cible-tactile text-sm" onClick={() => setDeclarer("device")}>
            {t.trk_declare}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((x) => (
            <CarteTraceur
              key={x.id}
              tracker={x}
              onEdit={() => setEdite(x)}
              canDelete={canDelete}
              onDeleted={charger}
            />
          ))}
        </div>
      )}

      {declarer && (
        <FormulaireTraceur
          sourceInitiale={declarer}
          onClose={() => setDeclarer(false)}
          onDone={async () => {
            setDeclarer(false);
            await Promise.all([charger(), chargerMien()]);
          }}
        />
      )}
      {edite && (
        <FormulaireTraceur
          tracker={edite}
          onClose={() => setEdite(null)}
          onDone={async () => {
            setEdite(null);
            await Promise.all([charger(), chargerMien()]);
          }}
        />
      )}
    </section>
  );
}

// --- ma position : le partage du compte connecté ------------------------------

/**
 * Le compte connecté pilote ici SON partage : démarrer, arrêter, voir la
 * dernière position envoyée. Sans partage déclaré, un seul geste : le déclarer
 * (le formulaire s'ouvre prérempli). Un partage archivé se lit, ne se relance
 * pas d'ici — c'est au registre de le réactiver.
 */
function MaPosition({ mien, onDeclare }: { mien: Tracker | null | undefined; onDeclare: () => void }) {
  const t = useDict();
  const share = useShare();
  if (mien === undefined) return null;
  const actif = share.active && share.trackerId === mien?.id;
  const erreurs: Record<NonNullable<typeof share.error>, string> = {
    unsupported: t.trk_share_unsupported, geo: t.trk_share_err_geo, send: t.trk_share_err_send, archived: t.trk_share_archived,
  };
  return (
    <section className="carte flex flex-col gap-2 p-4" aria-label={t.trk_share_title}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${actif ? "bg-green-500/15 text-green-600" : "bg-gray-400/15 text-gray-400"}`} aria-hidden="true">
          <Icon path={UI_ICONS.tracker} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-rdia-50">{t.trk_share_title}</h2>
          <p className="text-[11.5px] leading-snug text-gray-500 dark:text-rdia-300">
            {mien ? (mien.archived ? t.trk_share_archived : t.trk_share_hint) : t.trk_share_none}
          </p>
        </div>
        {mien ? (
          !mien.archived && (
            <button
              className={`cible-tactile text-sm ${actif ? "btn-secondaire" : "btn-primaire"}`}
              onClick={() => (actif ? stopSharing() : startSharing(mien.id))}
              aria-pressed={actif}
            >
              {actif ? t.trk_share_stop : t.trk_share_start}
            </button>
          )
        ) : (
          <button className="btn-primaire cible-tactile text-sm" onClick={onDeclare}>{t.trk_share_declare}</button>
        )}
      </div>
      {mien && !mien.archived && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-2 text-[11px] tabular-nums dark:border-rdia-700/50">
          <span className={actif ? "font-semibold text-green-600" : "text-gray-400 dark:text-rdia-400"}>{actif ? t.trk_share_on : t.trk_share_off}</span>
          <span className="text-gray-500 dark:text-rdia-300">
            {t.trk_share_last} : {share.lastAt ? new Date(share.lastAt).toLocaleTimeString() : "—"}
            {share.sent > 0 ? ` (${share.sent})` : ""}
          </span>
          <span className="font-mono text-gray-400 dark:text-rdia-400">{mien.label} · {mien.target ? `${t[`trk_kind_${mien.target.kind}` as const]} ${mien.target.id}` : ""}{mien.incidentId ? ` · ${mien.incidentId}` : ""}</span>
          {share.error && <span role="alert" className="font-semibold text-danger-500">{erreurs[share.error]}</span>}
        </div>
      )}
    </section>
  );
}

// --- une carte de traceur ----------------------------------------------------

function CarteTraceur({
  tracker,
  onEdit,
  canDelete,
  onDeleted,
}: {
  tracker: Tracker;
  onEdit: () => void;
  canDelete: boolean;
  onDeleted: () => Promise<void>;
}) {
  const t = useDict();
  const [busy, setBusy] = useState(false);
  const muet = isStale(tracker);
  const age = contactAge(tracker);

  const supprimer = async () => {
    setBusy(true);
    await api.deleteTracker(tracker.id);
    await onDeleted();
  };

  return (
    <article className={`carte flex flex-col gap-2 p-3 ${tracker.archived ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2.5">
        {/* La flèche porte le CAP relevé : sans elle, deux moyens au même point
            se lisent identiques alors qu'ils vont en sens opposés. */}
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            tracker.last ? "bg-or-500/15 text-or-500" : "bg-gray-400/15 text-gray-400"
          }`}
          aria-hidden="true"
        >
          {tracker.last ? (
            <svg width={18} height={18} viewBox="0 0 24 24" style={{ transform: `rotate(${tracker.last.headingDeg}deg)` }}>
              <path d="M12 3l7 17-7-4-7 4z" fill="currentColor" />
            </svg>
          ) : (
            <Icon path={UI_ICONS.tracker} size={16} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-gray-800 dark:text-rdia-50">{tracker.label}</h2>
          <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-gray-500 dark:text-rdia-300">
            {tracker.source === "app" ? `${t.trk_app_badge} · ${tracker.account ?? ""}` : tracker.imei}
          </p>
        </div>

        <div className="flex shrink-0 gap-0.5">
          <button
            className="cible-tactile inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
            title={t.act_edit}
            aria-label={`${t.act_edit} — ${tracker.label}`}
            onClick={onEdit}
          >
            <Icon path={UI_ICONS.edit} size={14} />
          </button>
          {canDelete && (
            <button
              className="cible-tactile inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:!text-danger-500 disabled:opacity-30 dark:hover:bg-rdia-600"
              title={t.act_delete}
              aria-label={`${t.act_delete} — ${tracker.label}`}
              disabled={busy}
              onClick={() => void supprimer()}
            >
              <Icon path={UI_ICONS.trash} size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Rattachement et engagement, quand ils sont connus. */}
      <div className="flex flex-wrap gap-1.5">
        {tracker.target && (
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-rdia-200">
            {t[`trk_kind_${tracker.target.kind}` as const]} · {tracker.target.id}
          </span>
        )}
        {tracker.incidentId && (
          <span className="rounded-md bg-or-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-or-600 dark:text-or-400">
            {tracker.incidentId}
          </span>
        )}
        {tracker.archived && (
          <span className="rounded-md bg-gray-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-rdia-300">
            {t.tab_archived}
          </span>
        )}
      </div>

      {/* --- état : les DEUX dates, jamais fondues --------------------------- */}
      <div className="border-t border-gray-100 pt-2 text-[11px] leading-relaxed dark:border-rdia-700/50">
        {tracker.last ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums text-gray-600 dark:text-rdia-200">
            <span className="font-mono">
              {tracker.last.ll[1].toFixed(5)}, {tracker.last.ll[0].toFixed(5)}
            </span>
            <span className="font-semibold">{tracker.last.speedKmh} km/h</span>
            <span className="text-gray-400 dark:text-rdia-400">
              {tracker.last.satellites} {t.trk_sats}
            </span>
          </div>
        ) : (
          // L'absence de fix est DITE. Un blanc se lirait comme une donnée
          // manquante, alors que c'est un fait sur le boîtier.
          <p className="text-gray-500 dark:text-rdia-300">{t.trk_no_fix}</p>
        )}
        <p className={`mt-0.5 ${muet ? "font-semibold text-danger-500" : "text-gray-400 dark:text-rdia-400"}`}>
          {tracker.lastSeenAt ? `${t.trk_last_seen} ${age}` : t.trk_never_seen}
        </p>
      </div>
    </article>
  );
}

// --- déclaration / modification ---------------------------------------------

function FormulaireTraceur({
  tracker,
  sourceInitiale = "device",
  onClose,
  onDone,
}: {
  tracker?: Tracker;
  sourceInitiale?: TrackerSource;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useDict();
  const sessionUser = useArgos((s) => s.sessionUser);
  const incidents = useArgos((s) => s.incidents);
  const modif = !!tracker;
  const [source, setSource] = useState<TrackerSource>(tracker?.source ?? sourceInitiale);
  const [imei, setImei] = useState(tracker?.source === "app" ? "" : tracker?.imei ?? "");
  const [account, setAccount] = useState(tracker?.account ?? sessionUser?.matricule ?? "");
  const [label, setLabel] = useState(tracker?.label ?? "");
  const [kind, setKind] = useState<TrackerTargetKind | "">(tracker?.target?.kind ?? "");
  const [targetId, setTargetId] = useState(tracker?.target?.id ?? "");
  const [incidentId, setIncidentId] = useState(tracker?.incidentId ?? "");
  const [archived, setArchived] = useState(tracker?.archived ?? false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const imeiOk = /^\d{15}$/.test(imei);
  // Partage par l'application : sans compte saisi, le serveur prend celui qui déclare.
  const identiteOk = source === "app" ? true : imeiOk;
  const valide = identiteOk && label.trim().length > 0 && (kind === "" || targetId.trim().length > 0);
  // Les incidents à proposer : les actifs, plus celui déjà rattaché (même archivé), pour ne pas le perdre.
  const choixIncidents = incidents.filter((i) => !i.archived || i.id === incidentId);

  const enregistrer = async () => {
    if (!valide || busy) return;
    setBusy(true);
    setErreur(null);
    const target = kind === "" ? undefined : { kind, id: targetId.trim() };
    const res = modif
      ? await api.updateTracker(tracker.id, {
          label: label.trim(),
          ...(target ? { target } : {}),
          ...(incidentId.trim() ? { incidentId: incidentId.trim() } : {}),
          archived,
        })
      : await api.declareTracker({
          source,
          ...(source === "app" ? (account.trim() ? { account: account.trim() } : {}) : { imei }),
          label: label.trim(),
          ...(target ? { target } : {}),
          ...(incidentId.trim() ? { incidentId: incidentId.trim() } : {}),
        });
    if (res.error) {
      // 400 = IMEI mal formé ou déjà déclaré, ou compte partageant déjà ; les deux se corrigent au clavier.
      setErreur(res.response.status === 400 ? (source === "app" ? t.trk_account_taken : t.trk_imei_taken) : t.trk_save_failed);
      setBusy(false);
      return;
    }
    await onDone();
  };

  return (
    <Modal open title={modif ? t.trk_edit_title : t.trk_declare_title} onClose={busy ? () => {} : onClose} size="md">
      <div className="space-y-3.5">
        {/* La source se choisit à la déclaration ; elle ne se change pas ensuite (c'est l'identité du traceur). */}
        {!modif && (
          <fieldset>
            <legend className="mb-1 text-[12px] font-semibold text-gray-700 dark:text-white/80">{t.trk_source}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["device", "app"] as TrackerSource[]).map((k) => (
                <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors ${source === k ? "border-or-500 bg-or-500/10" : "border-gray-200 hover:border-or-400 dark:border-rdia-600"}`}>
                  <input type="radio" name="trk-source" className="mt-0.5 accent-or-500" checked={source === k} onChange={() => { setSource(k); setErreur(null); }} disabled={busy} />
                  <span className="text-[12px] leading-snug text-gray-700 dark:text-rdia-100">
                    <span className="font-semibold">{k === "device" ? t.trk_source_device : t.trk_source_app}</span>
                    <br />
                    <span className="text-gray-500 dark:text-rdia-300">{k === "device" ? t.trk_source_device_help : t.trk_source_app_help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {source === "app" ? (
          <div>
            <label htmlFor="trk-account" className="mb-1 block text-[12px] font-semibold text-gray-700 dark:text-white/80">
              {t.trk_account}
            </label>
            <input
              id="trk-account"
              value={account}
              placeholder={sessionUser?.matricule ?? ""}
              onChange={(e) => setAccount(e.target.value.trim().toLowerCase())}
              disabled={modif || busy}
              autoComplete="off"
              className="input-champ cible-tactile w-full font-mono"
            />
            <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">{t.trk_account_help}</p>
          </div>
        ) : (
        <div>
          <label htmlFor="trk-imei" className="mb-1 block text-[12px] font-semibold text-gray-700 dark:text-white/80">
            {t.trk_imei}
          </label>
          <input
            id="trk-imei"
            value={imei}
            onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
            // L'IMEI ne se modifie pas : il EST l'identité présentée par le
            // boîtier. Le changer reviendrait à créer un autre traceur — et à
            // laisser l'ancien admis sans que personne l'ait voulu.
            disabled={modif || busy}
            inputMode="numeric"
            autoComplete="off"
            placeholder="356307042441013"
            aria-describedby="trk-imei-aide"
            className={`input-champ cible-tactile w-full font-mono tracking-wider ${
              imei && !imeiOk ? "border-danger-500/70" : ""
            }`}
          />
          <p id="trk-imei-aide" className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">
            {modif ? t.trk_imei_locked : t.trk_imei_help}
          </p>
        </div>
        )}

        <div>
          <label htmlFor="trk-label" className="mb-1 block text-[12px] font-semibold text-gray-700 dark:text-white/80">
            {t.trk_label}
          </label>
          <input
            id="trk-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            maxLength={60}
            placeholder={t.trk_label_ph}
            className="input-champ cible-tactile w-full"
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-[12px] font-semibold text-gray-700 dark:text-white/80">{t.trk_target}</legend>
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as TrackerTargetKind | "")}
              disabled={busy}
              aria-label={t.trk_target_kind}
              className="input-champ cible-tactile w-[46%]"
            >
              <option value="">{t.trk_target_none}</option>
              {TRACKER_TARGET_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t[`trk_kind_${k}` as const]}
                </option>
              ))}
            </select>
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              disabled={busy || kind === ""}
              placeholder={t.trk_target_id}
              aria-label={t.trk_target_id}
              className="input-champ cible-tactile min-w-0 flex-1 font-mono"
            />
          </div>
        </fieldset>

        <div>
          <label htmlFor="trk-inc" className="mb-1 block text-[12px] font-semibold text-gray-700 dark:text-white/80">
            {t.trk_incident}
          </label>
          {/* L'incident se choisit par son nom : le moyen est déployé SUR une opération, pas sur un identifiant. */}
          <select
            id="trk-inc"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value)}
            disabled={busy}
            className="input-champ cible-tactile w-full"
          >
            <option value="">{t.trk_incident_none}</option>
            {choixIncidents.map((i) => (
              <option key={i.id} value={i.id}>
                {i.titre} — {i.id}
              </option>
            ))}
          </select>
        </div>

        {modif && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 accent-or-500"
            />
            <span className="text-[12px] leading-snug text-gray-700 dark:text-rdia-100">
              <span className="font-semibold">{t.trk_archive}</span>
              <br />
              <span className="text-gray-500 dark:text-rdia-300">{t.trk_archive_help}</span>
            </span>
          </label>
        )}

        {erreur && (
          <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-[12px] font-semibold text-danger-400">
            {erreur}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondaire cible-tactile text-sm" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn-primaire cible-tactile text-sm" onClick={() => void enregistrer()} disabled={!valide || busy}>
            {busy ? t.trk_saving : modif ? t.save : t.trk_declare}
          </button>
        </div>
      </div>
    </Modal>
  );
}
