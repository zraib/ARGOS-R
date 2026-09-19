"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { svgToLL } from "@/lib/helpers";
import { HOSPITAL_KINDS, kindDef } from "@/lib/hospitals";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import { WardsEditor, autosumServices, type WardsEditorValue } from "@/components/health/WardsEditor";
import { ARGOS_WARD_REFERENCE } from "@/lib/types";
import { UNIT_CORPS, type HospitalKind, type UnitCorps, type UnitReadiness } from "@/lib/types";
import { corpsLabel } from "@/lib/corps";
import { SHELTER_ORGANS, type ShelterBuilding, type ShelterKind, type ShelterOrgan } from "@/lib/data/modules";
import { locationProvince } from "@/components/org/LocationCascade";
import { LocationPicker, useLocationPicker } from "@/components/org/LocationPicker";

// ============================================================================
// ARGOS — modales de création d'entités organisationnelles (unité, hôpital, abri)
// Création via l'API (RBAC org:*:manage appliqué serveur, mutation auditée),
// puis rechargement du domaine. La position se choisit comme à la déclaration
// d'un incident (`LocationPicker`) : la cascade du référentiel, puis un point
// posé sur la carte, qui prime.
// ============================================================================

const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
const inputCls = "input-champ text-sm";

/**
 * Callback commun aux trois modales : l'identifiant de l'entité créée.
 * Le formulaire de compte s'en sert pour affecter aussitôt l'entité qu'il
 * vient de faire créer — sans deviner « la dernière de la liste ».
 */
type Created = (id: string) => void;

/**
 * Modale « Ajouter une unité » (Super Admin / Admin).
 *
 * Plus de champ « commandant » : le commandant est le compte responsable
 * d'unité AFFECTÉ à l'unité, pas un texte saisi ici. Un texte libre et un
 * compte affecté auraient fini par se contredire.
 */
export function AddUnitModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: Created }) {
  const t = useDict();
  const provinces = useArgos((s) => s.provinces);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);

  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [eff, setEff] = useState(200);
  const [corps, setCorps] = useState<UnitCorps>("far");
  const [dispo, setDispo] = useState<UnitReadiness>("ready");
  const [readiness, setReadiness] = useState(85);
  // La commune déduite (point posé ou cascade) remplit le champ ; il reste
  // modifiable pour une localité absente du référentiel.
  const picker = useLocationPicker({}, setVille);
  const [busy, setBusy] = useState(false);
  const canSubmit = !!(nom.trim() && ville.trim() && picker.ready && eff > 0);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const p = locationProvince(picker.loc, provinces);
      const ll = picker.ll ?? (p ? svgToLL(p.x, p.y) : undefined);
      if (!ll) return;
      const res = await api.createUnit({
        nom: nom.trim(),
        ville: ville.trim(),
        corps,
        eff,
        dispo,
        readiness,
        x: p?.x ?? 0,
        y: p?.y ?? 0,
        ll,
      });
      if (res.error) return;
      const created = res.data as { id?: string } | undefined;
      await loadDomain();
      showToast(t.toast_unit);
      setNom(""); setVille(""); picker.reset();
      if (created?.id) onCreated?.(created.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const dispoOptions: [UnitReadiness, string][] = [["ready", t.u_ready], ["deployed", t.u_deployed], ["standby", t.u_standby]];

  return (
    <Modal open={open} title={t.add_unit} onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{t.h_name}</label>
          <input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="6e Bataillon Médical" />
        </div>
        {/* Le corps décide qui affecte l'unité et vers quel PC elle va (ADR 0016). */}
        <div>
          <label className={labelCls}>{t.f_corps}</label>
          <select className={inputCls} value={corps} onChange={(e) => setCorps(e.target.value as UnitCorps)}>
            {UNIT_CORPS.map((c) => (
              <option key={c} value={c}>{corpsLabel(c, t)}</option>
            ))}
          </select>
        </div>
        {/* La localisation, comme à la déclaration d'un incident : la cascade, puis un point sur la carte. */}
        <LocationPicker picker={picker} />
        <div>
          <label className={labelCls}>{t.lbl_city}</label>
          <input className={inputCls} value={ville} onChange={(e) => setVille(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>{t.effectif}</label>
            <input type="number" min={1} className={inputCls} value={eff} onChange={(e) => setEff(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div>
            <label className={labelCls}>{t.h_status}</label>
            <select className={inputCls} value={dispo} onChange={(e) => setDispo(e.target.value as UnitReadiness)}>
              {dispoOptions.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.readiness} (%)</label>
            <input type="number" min={0} max={100} className={inputCls} value={readiness} onChange={(e) => setReadiness(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondaire text-sm" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primaire text-sm" onClick={() => void submit()} disabled={!canSubmit || busy}>
            {busy ? "…" : t.lbl_create}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Modale « Ajouter un hôpital » (Super Admin / Admin). */
export function AddHospitalModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: Created }) {
  const t = useDict();
  const provinces = useArgos((s) => s.provinces);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);

  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [kind, setKind] = useState<HospitalKind>("mil");
  const [staff, setStaff] = useState(250);
  const [amb, setAmb] = useState(10);
  const [heli, setHeli] = useState(1);
  // La position de l'établissement : la cascade, puis un point sur la carte.
  const picker = useLocationPicker({}, setVille);
  const [busy, setBusy] = useState(false);

  // Valeurs par défaut = les 5 services flagués `default` du référentiel ARGOS (~50% part marché hospitalier).
  const defaultSvcs = (): WardsEditorValue[] =>
    ARGOS_WARD_REFERENCE.filter((r) => r.default)
      .map((r): WardsEditorValue => {
        // Presets réalistes pour un hôpital 200 lits :
        const presets: Record<string, [number, number]> = {
          rea:       [16, 11],
          chirurgie: [56, 46],
          medecine:  [64, 50],
          urgences:  [36, 28],
          pediatrie: [28, 20],
        };
        const [total, occ] = presets[r.key] ?? [10, 4];
        return { key: r.key, name: r.label, total, occ };
      });

  const [svcs, setSvcs] = useState<WardsEditorValue[]>(defaultSvcs());

  const { lits, rea } = useMemo(() => autosumServices(svcs), [svcs]);
  const canSubmit = !!(nom.trim() && ville.trim() && picker.loc.province && lits > 0 && svcs.every((s) => s.occ <= s.total));

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const p = locationProvince(picker.loc, provinces);
      if (!p) return;
      const res = await api.createHospital({
        nom: nom.trim(),
        ville: ville.trim(),
        kind,
        type: kindDef(kind).long,
        region: p.region,
        province: p.v,
        lits,
        rea,
        staff,
        amb,
        heli,
        x: p.x,
        y: p.y,
        ll: picker.ll ?? svgToLL(p.x, p.y),
      });
      if (res.error) return;
      // Services de soins et taux d'occupation ne font PAS partie du contrat de
      // CRÉATION d'un établissement : l'API valide en `forbidNonWhitelisted`, les
      // envoyer ici faisait échouer la requête en 400. Les services ont leur
      // propre sous-ressource — on crée l'établissement, puis ses services.
      const created = res.data as { id?: string } | undefined;
      if (created?.id) {
        for (const svc of svcs) {
          await api.createWard(created.id, { nom: svc.name, lits: svc.total, occ: svc.occ, statut: "open" });
        }
      }
      await loadDomain();
      showToast(t.toast_hosp);
      setNom(""); setVille(""); setSvcs(defaultSvcs()); picker.reset();
      if (created?.id) onCreated?.(created.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

  return (
    <Modal open={open} title={t.add_hosp} onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{t.h_name}</label>
          <input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Hôpital Militaire de Tanger" />
        </div>
        <div>
          <label className={labelCls}>{t.hn_filter_kind}</label>
          <div className="flex flex-wrap gap-2">
            {HOSPITAL_KINDS.filter((k) => !k.campagne).map((k) => (
              <button
                key={k.kind}
                onClick={() => setKind(k.kind)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  kind === k.kind
                    ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400"
                    : "border-gray-200 text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:text-rdia-200"
                }`}
              >
                <HealthGlyph kind={k.kind} size={16} />
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t.lbl_city}</label>
            <input className={inputCls} value={ville} onChange={(e) => setVille(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-3"><LocationPicker picker={picker} /></div>
        </div>

        <WardsEditor value={svcs} onChange={setSvcs} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>{t.staff}</label>
            <input type="number" min={0} className={inputCls} value={staff} onChange={(e) => setStaff(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.lbl_amb}</label>
            <input type="number" min={0} className={inputCls} value={amb} onChange={(e) => setAmb(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.lbl_heli}</label>
            <input type="number" min={0} className={inputCls} value={heli} onChange={(e) => setHeli(num(e.target.value))} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondaire text-sm" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primaire text-sm" onClick={() => void submit()} disabled={!canSubmit || busy}>
            {busy ? "…" : t.lbl_create}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Modale « Ouvrir un abri » (OPSnet).
 *
 * La COMMUNE, et non une province, parce que c'est elle qui donne sa position à
 * l'abri : l'affecteur résout le chef-lieu dans le référentiel souverain plutôt
 * que d'inventer des coordonnées. Une commune absente du référentiel n'empêche
 * pas d'ouvrir l'abri — elle le prive seulement du classement par trajet, ce
 * que l'écran dit.
 *
 * Les répartitions par âge ne sont pas demandées : un abri qu'on ouvre n'a pas
 * encore de recensement, et un champ pré-rempli se lirait comme un dénombrement.
 */
export function AddShelterModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: Created }) {
  const t = useDict();
  const m = useModules();
  const cities = useArgos((s) => s.cities);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);

  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  // Un point posé sur la carte prime sur la cascade : un abri doit apparaître
  // LÀ où il est ouvert (ADR 0015), pas au chef-lieu de sa province.
  const picker = useLocationPicker({}, setVille);
  // Typologie : un camp de tentes DÉDUIT sa capacité (tentes × personnes par
  // tente) ; un bâtiment en dur la saisit et dit sa nature. Deux chiffres pour
  // la même chose se contrediraient au premier ravitaillement.
  const [kind, setKind] = useState<ShelterKind>("dur");
  const [building, setBuilding] = useState<ShelterBuilding>("dedie");
  // L'organe d'origine (ADR 0019) : qui ouvre et tient l'abri — lu sur sa tuile.
  const [organ, setOrgan] = useState<ShelterOrgan>("dgpc");
  const [tents, setTents] = useState(20);
  const [perTent, setPerTent] = useState(6);
  const [capacity, setCapacity] = useState(300);
  const derived = tents * perTent;
  const [staff, setStaff] = useState(0);
  const [supplies, setSupplies] = useState<"ok" | "low" | "critical">("ok");
  const [needs, setNeeds] = useState("");
  const [busy, setBusy] = useState(false);

  const connue = useMemo(
    () => cities.some((c) => c.v.trim().toLocaleLowerCase("fr") === ville.trim().toLocaleLowerCase("fr")),
    [cities, ville],
  );
  const canSubmit = !!(nom.trim() && ville.trim() && (kind === "tentes" ? tents > 0 && perTent > 0 : capacity > 0));
  // La position : le point posé, sinon la commune de la cascade, sinon celle de
  // la saisie libre si le référentiel la connaît (dans la province choisie d'abord).
  const villeConnue = useMemo(() => {
    const k = ville.trim().toLocaleLowerCase("fr");
    const hits = cities.filter((c) => c.v.trim().toLocaleLowerCase("fr") === k);
    return hits.find((c) => c.province === picker.loc.province) ?? hits[0];
  }, [cities, ville, picker.loc.province]);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const ll = picker.ll ?? villeConnue?.ll;
      const loc = picker.loc;
      const res = await api.createShelter({
        nom: nom.trim(),
        ville: ville.trim(),
        kind,
        organ,
        ...(kind === "tentes" ? { tents, perTent } : { building, capacity }),
        ...(loc.region ? { region: loc.region as never } : {}),
        ...(loc.province ? { province: loc.province } : {}),
        ...(ll ? { ll } : {}),
        staff,
        supplies,
        ...(needs.trim() ? { needs: needs.trim() } : {}),
      });
      if (res.error) return;
      const created = res.data as { id?: string } | undefined;
      await loadDomain();
      showToast(t.ops_shelter_created);
      picker.reset();
      if (created?.id) onCreated?.(created.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={t.ops_add_shelter} onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className={labelCls}>{t.ops_shelter_name}</label>
          <input className={inputCls + " w-full"} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} />
        </div>
        <LocationPicker picker={picker} height="h-48" />
        <div>
          <label className={labelCls}>{t.ops_shelter_city}</label>
          {/* Saisie libre AVEC liste de suggestions : le référentiel aide sans
              interdire — une commune absente doit rester ouvrable. */}
          <input
            className={inputCls + " w-full"}
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            list="ops-villes"
            maxLength={60}
          />
          <datalist id="ops-villes">
            {/* Homonymes d'une province à l'autre : la clé porte la province. */}
            {cities.map((c) => (
              <option key={`${c.province}/${c.v}`} value={c.v} />
            ))}
          </datalist>
          <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">
            {ville.trim() === "" ? t.ops_city_help : connue ? t.ops_city_known : t.ops_city_unknown}
          </p>
        </div>
        <div>
          <label className={labelCls}>{m.shelters.kind}</label>
          <div className="flex gap-2">
            {(["dur", "tentes"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`cible-tactile flex-1 rounded-lg border px-3 text-xs font-semibold transition-colors lg:min-h-0 lg:py-2 ${
                  kind === k ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:text-rdia-200"
                }`}
              >
                {k === "dur" ? m.shelters.kind_hard : m.shelters.kind_tent}
              </button>
            ))}
          </div>
        </div>
        {kind === "dur" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{m.shelters.building}</label>
              <select className={inputCls + " w-full"} value={building} onChange={(e) => setBuilding(e.target.value as ShelterBuilding)}>
                <option value="dedie">{m.shelters.b_dedie}</option>
                <option value="ecole">{m.shelters.b_ecole}</option>
                <option value="college">{m.shelters.b_college}</option>
                <option value="lycee">{m.shelters.b_lycee}</option>
                <option value="autre">{m.shelters.b_autre}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.ops_capacity}</label>
              <input
                type="number"
                min={1}
                className={inputCls + " w-full"}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{m.shelters.tents}</label>
                <input type="number" min={1} className={inputCls + " w-full"} value={tents} onChange={(e) => setTents(Math.max(1, Number(e.target.value) || 0))} />
              </div>
              <div>
                <label className={labelCls}>{m.shelters.per_tent}</label>
                <input type="number" min={1} className={inputCls + " w-full"} value={perTent} onChange={(e) => setPerTent(Math.max(1, Number(e.target.value) || 0))} />
              </div>
            </div>
            <p className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px] text-gray-500 dark:text-rdia-300">
              <span>{m.shelters.tent_hint}</span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{m.shelters.derived} : {derived.toLocaleString("fr-FR")}</span>
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{m.shelters.organ}</label>
            <select className={inputCls + " w-full"} value={organ} onChange={(e) => setOrgan(e.target.value as ShelterOrgan)}>
              {SHELTER_ORGANS.map((o) => <option key={o} value={o}>{m.shelters[`o_${o}` as const]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.ops_staff}</label>
            <input
              type="number"
              min={0}
              className={inputCls + " w-full"}
              value={staff}
              onChange={(e) => setStaff(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t.ops_supplies}</label>
          <select
            className={inputCls + " w-full"}
            value={supplies}
            onChange={(e) => setSupplies(e.target.value as "ok" | "low" | "critical")}
          >
            <option value="ok">{m.shelters.sup_ok}</option>
            <option value="low">{m.shelters.sup_low}</option>
            <option value="critical">{m.shelters.sup_critical}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{t.ops_needs}</label>
          <input
            className={inputCls + " w-full"}
            value={needs}
            onChange={(e) => setNeeds(e.target.value)}
            maxLength={200}
            placeholder={t.ops_needs_ph}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondaire cible-tactile text-sm" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn-primaire cible-tactile text-sm" onClick={() => void submit()} disabled={!canSubmit || busy}>
            {busy ? t.trk_saving : t.ops_open_shelter}
          </button>
        </div>
      </div>
    </Modal>
  );
}
