"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { regionsOf } from "@/lib/geo";
import {
  ROLE_ICONS,
  assignableRoles,
  canAssignMultipleRoles,
  isCivil,
  isSuperAdmin,
  mandatoryScopeKeysOf,
  RESPONSIBILITY_OF_ROLE,
  requiredAssignments,
  type Assignments,
  type ResponsibilityKind,
  type Role,
  type ScopedAssignments,
  profileOfRoles,
  type ProfileId,
} from "@/lib/roles";
import { GRADES } from "@/lib/data/grades";
import { AddHospitalModal, AddShelterModal, AddUnitModal } from "@/components/org/AddEntityModals";
import { AddMorgueModal } from "@/components/morgue/AddMorgueModal";
import { ApiUser } from "@/app/utilisateurs/_parts/shared";
import { SWITCHABLE_KEYS, moduleLabel, type ModuleKey } from "@/lib/nav";

// ===========================================================================
// Formulaire création / édition d'un compte (via l'API)
//
// Trois règles que l'écran REFLÈTE et que l'API APPLIQUE :
//  - le wali et le commandant de place d'armes portent une région ;
//  - une autorité civile n'a pas de grade militaire ;
//  - un responsable est affecté à SON entité — et s'il faut la créer d'abord,
//    la modale de création s'ouvre d'ici, sans quitter le formulaire.
// ===========================================================================

/** Message d'une réponse d'erreur de l'API (chaîne, ou liste de class-validator). */
function apiMessage(err: unknown, fallback: string): string {
  const m = (err as { message?: string | string[] } | undefined)?.message;
  if (Array.isArray(m)) return m.join(" ");
  return typeof m === "string" && m.trim() ? m : fallback;
}

/** Natures d'entité qu'on sait créer depuis le formulaire. */
const CREATABLE: readonly ResponsibilityKind[] = ["hospital", "unit", "shelter", "morgue"];

/**
 * Affectations telles que le CONTRAT les attend : la région y est l'union des
 * douze noms officiels, pas une chaîne libre. La liste proposée à l'écran vient
 * du même référentiel ; le passage par ce type dit que c'est l'API qui tranche.
 */
type AssignmentsBody = NonNullable<Parameters<typeof api.createUser>[0]["assignments"]>;

export function UserForm({
  creatorRole,
  profile: tabProfile,
  user,
  onClose,
  onDone,
  onCreated,
}: {
  creatorRole: Role;
  /** Profil de l'onglet d'où l'on crée (ADR 0022) ; un compte édité garde celui de ses rôles. */
  profile?: ProfileId;
  user?: ApiUser;
  onClose: () => void;
  onDone: () => void;
  onCreated: (user: ApiUser, code: string) => void;
}) {
  const m = useModules();
  const t = useDict();
  const showToast = useArgos((s) => s.showToast);

  const editing = !!user;
  // Bascules de modules PROPRES au compte (ADR 0016) : en édition seulement,
  // écrites une par une (effet immédiat côté serveur, pas au « Enregistrer »).
  const [userModules, setUserModules] = useState<Partial<Record<ModuleKey, boolean>>>((user as { modules?: Partial<Record<ModuleKey, boolean>> } | undefined)?.modules ?? {});
  const lockedModules = !!user && user.roles.some((r) => r === "superadmin" || r === "admin");
  const setModule = async (module: ModuleKey, enabled: boolean | null) => {
    if (!user) return;
    const res = await api.setUserModule(user.id, module, enabled);
    if (res.error) { showToast(m.resp.err_denied); return; }
    setUserModules((s) => { const next = { ...s }; if (enabled === null) delete next[module]; else next[module] = enabled; return next; });
  };
  const superAdmin = isSuperAdmin(creatorRole);
  // Les rôles proposés sont ceux du profil de l'onglet — celui des rôles du
  // compte édité, sinon celui de l'onglet, sinon le mode en service (ADR 0022).
  const sessionProfile = useArgos((s) => s.profile);
  const profile: ProfileId = (user ? profileOfRoles(user.roles as Role[]) : null) ?? tabProfile ?? sessionProfile;
  const options = assignableRoles(creatorRole, profile);
  const multiple = canAssignMultipleRoles(creatorRole);

  const [matricule, setMatricule] = useState(user?.matricule ?? "");
  const [nom, setNom] = useState(user?.nom ?? "");
  const [prenom, setPrenom] = useState(user?.prenom ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [grade, setGrade] = useState(user?.grade ?? "");
  const [roles, setRoles] = useState<Role[]>(() => {
    if (!user) return [];
    const kept = user.roles.filter((r) => options.includes(r));
    return multiple ? kept : kept.slice(0, 1);
  });
  const [assignments, setAssignments] = useState<Assignments>(() => user?.assignments ?? {});
  const [region, setRegion] = useState<string>(() => (user?.assignments as ScopedAssignments | undefined)?.region ?? "");
  /** Nature d'entité dont la modale de création est ouverte. */
  const [creating, setCreating] = useState<ResponsibilityKind | null>(null);

  // Référentiels servant de choix d'affectation. Le parc d'équipement est
  // celui d'une unité — on choisit l'unité. Les sites mortuaires viennent du
  // service morgue (mobiles repliées exclues).
  const hospitals = useArgos((s) => s.hospitals);
  const units = useArgos((s) => s.units);
  const shelters = useArgos((s) => s.catalog.shelters);
  const morgues = useArgos((s) => s.morgues);
  const provinces = useArgos((s) => s.provinces);
  const regions = useMemo(() => regionsOf(provinces), [provinces]);
  const milHospitals = hospitals.filter((h) => (h.kind ?? "mil") === "mil");
  const neededKinds = requiredAssignments(roles);
  const regionNeeded = mandatoryScopeKeysOf(roles).includes("region");
  const civil = isCivil(roles);
  const entityOptions = (kind: ResponsibilityKind): { id: string; label: string }[] => {
    if (kind === "hospital") return milHospitals.map((h) => ({ id: h.id, label: `${h.nom} — ${h.ville}` }));
    if (kind === "unit" || kind === "equipment") return units.map((u) => ({ id: u.id, label: `${u.nom} — ${u.ville}` }));
    if (kind === "shelter") return shelters.map((s) => ({ id: s.id, label: `${s.nom} — ${s.ville}` }));
    if (kind === "morgue") return morgues.filter((x) => !(x.kind === "mobile" && !x.deployment)).map((x) => ({ id: x.id, label: `${x.nom} — ${x.ville}` }));
    return [];
  };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Le nom d'utilisateur (identifiant de connexion) n'est modifiable que par le
  // Super Administrateur ; l'API applique la même règle (frontière de sécurité).
  const usernameLocked = editing && !superAdmin;

  const toggleRole = (r: Role) => {
    setError(null);
    if (multiple) setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
    else setRoles([r]);
  };
  const setAssignment = (kind: ResponsibilityKind, v: string) => {
    setAssignments((a) => ({ ...a, [kind]: v }));
    setError(null);
  };

  const submit = async () => {
    if (!matricule.trim() || !nom.trim()) { setError(m.users.need_fields); return; }
    if (roles.length === 0) { setError(m.users.need_role); return; }
    // Un rôle « responsable » sans entité, un wali sans région : refusés par
    // l'API ; on le signale ici pour éviter un aller-retour, sans que ce soit
    // le contrôle.
    const missing = neededKinds.filter((k) => !assignments[k]?.trim());
    if (missing.length > 0) { setError(m.users.need_assignment); return; }
    if (regionNeeded && !region) { setError(m.users.region_hint); return; }
    // N'envoyer que ce que les rôles retenus exigent : une clé de trop est
    // refusée comme portée orpheline.
    const payload: AssignmentsBody = {};
    for (const k of neededKinds) payload[k] = assignments[k]!.trim();
    if (regionNeeded) payload.region = region as AssignmentsBody["region"];
    // Une autorité civile n'a pas de grade : on n'en envoie pas, et on efface
    // celui qu'un compte aurait pu porter avant de devenir civil.
    const gradeOut = civil ? "" : grade.trim();
    setBusy(true);
    try {
      if (editing && user) {
        const res = await api.updateUser(user.id, {
          ...(superAdmin && matricule.trim() !== user.matricule ? { matricule: matricule.trim() } : {}),
          nom: nom.trim(),
          prenom: prenom.trim(),
          phone: phone.trim(),
          grade: gradeOut,
          roles,
          assignments: payload,
        });
        const status = res.response?.status;
        if (res.error || (status !== undefined && status >= 400)) {
          setError(apiMessage(res.error, status === 409 ? m.users.dup_matricule : m.users.need_role));
          return;
        }
        showToast(m.users.saved_toast);
        onDone();
        return;
      }
      const res = await api.createUser({
        matricule: matricule.trim(),
        nom: nom.trim(),
        prenom: prenom.trim() || undefined,
        phone: phone.trim() || undefined,
        grade: gradeOut || undefined,
        roles,
        assignments: payload,
      });
      if (res.error || !res.data) {
        const status = (res.response as Response | undefined)?.status;
        setError(apiMessage(res.error, status === 409 ? m.users.dup_matricule : m.users.need_role));
        return;
      }
      const data = res.data as unknown as { user: ApiUser; tempPassword: string };
      showToast(m.users.created_toast + data.tempPassword);
      onCreated(data.user, data.tempPassword);
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  // 16 px sous `md` : en deçà, iOS zoome à la prise de focus et décale la modale.
  const fieldCls = "input-champ text-base md:text-sm";

  return (
    <div className="flex flex-col gap-4">
      {/* Identité : nom d'utilisateur, nom, prénom, téléphone, grade */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.users.identity}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{m.users.matricule}</label>
            <input
              className={`${fieldCls} font-mono disabled:opacity-60`}
              placeholder={m.users.matricule_ph}
              value={matricule}
              disabled={usernameLocked}
              onChange={(e) => { setMatricule(e.target.value); setError(null); }}
              spellCheck={false}
            />
            {usernameLocked && <p className="mt-1 text-[10px] text-gray-400 dark:text-rdia-400">{m.users.matricule_locked}</p>}
          </div>
          <div>
            <label className={labelCls}>{m.users.grade}</label>
            {civil ? (
              // Le champ ne disparaît pas sans un mot : l'administrateur doit
              // savoir POURQUOI il n'a pas de grade à saisir.
              <p className="input-champ flex min-h-[44px] items-center text-sm text-gray-400 dark:text-rdia-400 md:min-h-0">{m.users.civil_no_grade}</p>
            ) : (
              <select className={fieldCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">{m.users.grade_none}</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className={labelCls}>{m.users.name}</label>
            <input className={fieldCls} placeholder={m.users.name_ph} value={nom} onChange={(e) => { setNom(e.target.value); setError(null); }} />
          </div>
          <div>
            <label className={labelCls}>{m.users.firstname}</label>
            <input className={fieldCls} placeholder={m.users.firstname_ph} value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.users.phone}</label>
            <input className={`${fieldCls} font-mono`} placeholder={m.users.phone_ph} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" />
          </div>
        </div>
      </div>

      <div>
        <label className={labelCls}>{multiple ? m.users.roles_multi : m.users.roles_single}</label>
        <div className="flex flex-wrap gap-2">
          {options.map((r) => {
            const on = roles.includes(r);
            return (
              <button key={r} type="button" onClick={() => toggleRole(r)} className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors lg:min-h-0 lg:text-xs ${on ? "border-or-500 bg-or-500/10 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-500 hover:border-or-500/50 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-300"}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${multiple ? "rounded-sm" : "rounded-full"} border ${on ? "border-or-500 bg-or-500 text-white" : "border-gray-300 dark:border-rdia-500"}`}>
                  {on && <Icon path={UI_ICONS.check} size={10} strokeWidth={3} />}
                </span>
                <Icon path={ROLE_ICONS[r]} size={13} />
                {m.roles[r]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400 dark:text-rdia-400">{multiple ? m.users.multi_hint : m.users.single_hint}</p>
      </div>

      {/* Territoire : le wali et le commandant de place d'armes répondent d'une
          région. L'API refuse le compte sans, et refuse un second titulaire. */}
      {regionNeeded && (
        <div className="rounded-lg border border-or-500/30 bg-or-500/5 p-3 sm:p-4">
          <div className="mb-1 flex items-center gap-2">
            <Icon path={UI_ICONS.shield} size={14} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-or-600 dark:text-or-400">{m.users.region}</span>
          </div>
          <p className="mb-3 text-[11px] text-gray-500 dark:text-rdia-300">{m.users.region_hint}</p>
          <select className={fieldCls} value={region} onChange={(e) => { setRegion(e.target.value); setError(null); }}>
            <option value="">{m.users.region_none}</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}

      {/* Rattachement : chaque rôle « responsable » exige l'entité dont il répond.
          L'API refuse la création sans, et cantonne ensuite toutes ses actions. */}
      {neededKinds.length > 0 && (
        <div className="rounded-lg border border-or-500/30 bg-or-500/5 p-3 sm:p-4">
          <div className="mb-1 flex items-center gap-2">
            <Icon path={UI_ICONS.shield} size={14} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-or-600 dark:text-or-400">
              {m.users.assignment}
            </span>
          </div>
          <p className="mb-3 text-[11px] text-gray-500 dark:text-rdia-300">{m.users.assignment_hint}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {neededKinds.map((kind) => {
              const opts = entityOptions(kind);
              const value = assignments[kind] ?? "";
              const creatable = CREATABLE.includes(kind);
              return (
                <div key={kind}>
                  <label className={labelCls}>{m.users.responsibility[kind]}</label>
                  <div className="flex gap-2">
                    {opts.length > 0 ? (
                      <select className={`${fieldCls} min-w-0 flex-1`} value={value} onChange={(e) => setAssignment(kind, e.target.value)}>
                        <option value="">{m.users.assignment_none}</option>
                        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    ) : (
                      // Aucune entité de cette nature connue : l'identifiant se saisit,
                      // ou l'entité se crée à côté.
                      <input
                        className={`${fieldCls} min-w-0 flex-1 font-mono`}
                        placeholder={m.users.assignment_id_ph}
                        value={value}
                        onChange={(e) => setAssignment(kind, e.target.value)}
                        spellCheck={false}
                      />
                    )}
                    {creatable && (
                      // L'entité n'existe pas encore : sa modale s'ouvre ICI, et
                      // l'identifiant créé est affecté au retour.
                      <button
                        type="button"
                        className="btn-secondaire cible-tactile shrink-0 gap-1 px-2.5 text-xs"
                        title={m.users.entity_missing}
                        onClick={() => setCreating(kind)}
                      >
                        <Icon path={UI_ICONS.plus} size={13} />
                        {m.users.create_entity}
                      </button>
                    )}
                  </div>
                  {creatable && <p className="mt-1 text-[10px] text-gray-400 dark:text-rdia-400">{m.users.entity_missing}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && !lockedModules && (
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-gray-600 dark:text-rdia-200">{t.um_title}</label>
          <p className="mb-2 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">{t.um_hint}</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {SWITCHABLE_KEYS.map((k) => {
              const v = userModules[k];
              const state: "inherit" | "on" | "off" = v === undefined ? "inherit" : v ? "on" : "off";
              const cls = (s: typeof state) => `cible-tactile rounded-md px-2 py-0.5 text-[10.5px] font-semibold transition-colors lg:min-h-0 ${state === s ? (s === "off" ? "bg-danger-500 text-white" : s === "on" ? "bg-or-500 text-rdia-600" : "bg-gray-300 text-gray-800 dark:bg-rdia-500 dark:text-rdia-50") : "text-gray-400 hover:text-gray-700 dark:text-rdia-400 dark:hover:text-rdia-100"}`;
              return (
                <div key={k} className="flex min-h-[40px] items-center justify-between gap-2 border-b border-gray-100 py-1 text-sm dark:border-rdia-700/50">
                  <span className={`min-w-0 truncate ${state === "off" ? "text-gray-400 line-through dark:text-rdia-400" : "text-gray-700 dark:text-rdia-100"}`}>{moduleLabel(k, t, roles.find((r) => RESPONSIBILITY_OF_ROLE[r]))}</span>
                  <span className="flex shrink-0 gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-rdia-700/60">
                    <button type="button" className={cls("inherit")} onClick={() => void setModule(k, null)}>{t.um_inherit}</button>
                    <button type="button" className={cls("on")} onClick={() => void setModule(k, true)}>{t.um_on}</button>
                    <button type="button" className={cls("off")} onClick={() => void setModule(k, false)}>{t.um_off}</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}

      {/* Empilés sous `sm` : deux boutons côte à côte y tiennent mal. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-secondaire text-sm" onClick={onClose}>{m.users.cancel}</button>
        <button className="btn-primaire text-sm" onClick={() => void submit()} disabled={busy}>{busy ? "…" : editing ? m.users.save : m.users.create}</button>
      </div>

      {/* Création d'entité depuis l'affectation : la même modale qu'ailleurs,
          l'identifiant revient dans le champ. */}
      <AddUnitModal open={creating === "unit"} onClose={() => setCreating(null)} onCreated={(id) => setAssignment("unit", id)} />
      <AddHospitalModal open={creating === "hospital"} onClose={() => setCreating(null)} onCreated={(id) => setAssignment("hospital", id)} />
      <AddShelterModal open={creating === "shelter"} onClose={() => setCreating(null)} onCreated={(id) => setAssignment("shelter", id)} />
      {creating === "morgue" && <AddMorgueModal onClose={() => setCreating(null)} onDone={() => setCreating(null)} onCreated={(id) => setAssignment("morgue", id)} />}
    </div>
  );
}
