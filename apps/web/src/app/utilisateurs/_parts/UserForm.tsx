"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import {
  ROLE_ICONS,
  assignableRoles,
  canAssignMultipleRoles,
  isSuperAdmin,
  requiredAssignments,
  type Assignments,
  type ResponsibilityKind,
  type Role,
} from "@/lib/roles";
import { GRADES } from "@/lib/data/grades";
import {
  ApiUser,
  } from "@/app/utilisateurs/_parts/shared";


// ===========================================================================
// Formulaire création / édition (via l'API)
// ===========================================================================
export 
function UserForm({
  creatorRole,
  user,
  onClose,
  onDone,
  onCreated,
}: {
  creatorRole: Role;
  user?: ApiUser;
  onClose: () => void;
  onDone: () => void;
  onCreated: (user: ApiUser, code: string) => void;
}) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);

  const editing = !!user;
  const superAdmin = isSuperAdmin(creatorRole);
  const options = assignableRoles(creatorRole);
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

  // Référentiels servant de choix d'affectation. Le parc d'équipement et la
  // morgue n'ont pas encore de référentiel dédié : saisie libre en attendant.
  const hospitals = useArgos((s) => s.hospitals);
  const units = useArgos((s) => s.units);
  const milHospitals = hospitals.filter((h) => (h.kind ?? "mil") === "mil");
  const neededKinds = requiredAssignments(roles);
  const entityOptions = (kind: ResponsibilityKind): { id: string; label: string }[] => {
    if (kind === "hospital") return milHospitals.map((h) => ({ id: h.id, label: `${h.nom} — ${h.ville}` }));
    if (kind === "unit") return units.map((u) => ({ id: u.id, label: `${u.nom} — ${u.ville}` }));
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

  const submit = async () => {
    if (!matricule.trim() || !nom.trim()) { setError(m.users.need_fields); return; }
    if (roles.length === 0) { setError(m.users.need_role); return; }
    // Un rôle « responsable » sans entité affectée est refusé par l'API ; on le
    // signale ici pour éviter un aller-retour, sans que ce soit le contrôle.
    const missing = neededKinds.filter((k) => !assignments[k]?.trim());
    if (missing.length > 0) { setError(m.users.need_assignment); return; }
    // N'envoyer que les affectations réellement exigées par les rôles retenus.
    const payload: Assignments = {};
    for (const k of neededKinds) payload[k] = assignments[k]!.trim();
    setBusy(true);
    try {
      if (editing && user) {
        const res = await api.updateUser(user.id, {
          ...(superAdmin && matricule.trim() !== user.matricule ? { matricule: matricule.trim() } : {}),
          nom: nom.trim(),
          prenom: prenom.trim(),
          phone: phone.trim(),
          grade: grade.trim(),
          roles,
          assignments: payload,
        });
        const status = res.response?.status;
        if (res.error || (status !== undefined && status >= 400)) {
          setError(status === 409 ? m.users.dup_matricule : m.users.need_role);
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
        grade: grade.trim() || undefined,
        roles,
        assignments: payload,
      });
      if (res.error || !res.data) {
        const status = (res.response as Response | undefined)?.status;
        setError(status === 409 ? m.users.dup_matricule : m.users.need_role);
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
            <select className={fieldCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">{m.users.grade_none}</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
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
              const set = (v: string) => { setAssignments((a) => ({ ...a, [kind]: v })); setError(null); };
              return (
                <div key={kind}>
                  <label className={labelCls}>{m.users.responsibility[kind]}</label>
                  {opts.length > 0 ? (
                    <select className={fieldCls} value={value} onChange={(e) => set(e.target.value)}>
                      <option value="">{m.users.assignment_none}</option>
                      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  ) : (
                    // Morgue et parc d'équipement : référentiel pas encore livré,
                    // saisie libre de l'identifiant en attendant.
                    <input
                      className={`${fieldCls} font-mono`}
                      placeholder={m.users.assignment_id_ph}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      spellCheck={false}
                    />
                  )}
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
    </div>
  );
}
