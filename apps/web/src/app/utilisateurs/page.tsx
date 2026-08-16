"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import type { ModuleFeature } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { UI_ICONS } from "@/lib/icons";
import { navLabel } from "@/lib/nav";
import {
  ROLES,
  ROLE_ICONS,
  assignableRoles,
  canManageUsers,
  canAssignMultipleRoles,
  isSuperAdmin,
  requiredAssignments,
  type Assignments,
  type ResponsibilityKind,
  type Role,
} from "@/lib/roles";
import { MODULE_FEATURES, DEFAULT_ROLE_FEATURES, initials } from "@/lib/data/users";
import { GRADES } from "@/lib/data/grades";

/** Projection publique d'un compte, telle que renvoyée par l'API (/iam/users). */
interface ApiUser {
  id: string;
  /** Identifiant de connexion — libellé d'interface : « nom d'utilisateur ». */
  matricule: string;
  nom: string;
  prenom?: string;
  phone?: string;
  grade?: string;
  roles: Role[];
  /** Entités affectées (portée ABAC) — une par nature de responsabilité. */
  assignments?: Assignments;
  status: "active" | "inactive";
  activatedByAdmin: boolean;
  hasTempCode: boolean;
  online: boolean;
  builtin: boolean;
  createdBy: string;
  createdAt: string;
  lastLogin: string | null;
}

type Tab = "users" | "roles";

/** Nom affiché d'un compte : « Prénom Nom » si le prénom est renseigné. */
const fullName = (u: { nom: string; prenom?: string }) => (u.prenom ? `${u.prenom} ${u.nom}` : u.nom);

export default function UtilisateursPage() {
  const m = useModules();
  const role = useArgos((s) => s.role);
  const sessionUser = useArgos((s) => s.sessionUser);

  const [tab, setTab] = useState<Tab>("users");

  // Accès refusé (défense en profondeur — l'API refuse aussi sans la permission).
  if (!canManageUsers(role)) {
    return (
      <section className="flex min-h-[60dvh] animate-fade-in items-center justify-center">
        <div className="carte flex w-full max-w-[420px] flex-col items-center gap-3 p-6 text-center sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-500/10 text-danger-500">
            <Icon path={UI_ICONS.shield} size={22} />
          </div>
          <h2 className="text-base font-bold text-rdia-600 dark:text-rdia-50">{m.users.title}</h2>
          <p className="text-sm text-gray-500 dark:text-rdia-300">{m.settings.reserved}</p>
        </div>
      </section>
    );
  }

  return (
    // Sous `lg` la page se laisse défiler par <main> : figer sa hauteur
    // enfermerait la liste dans un second ascenseur, illisible au doigt.
    <section className="flex w-full flex-col gap-4 animate-fade-in lg:h-full">
      <div className="carte flex flex-wrap items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
          <Icon path={UI_ICONS.users} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.users.title}</h2>
          <p className="text-xs text-gray-500 dark:text-rdia-300">{m.users.subtitle}</p>
        </div>
        <span className="rounded-md bg-or-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-or-500">
          {m.roles[role]}
        </span>
      </div>

      <div className="flex w-fit max-w-full gap-1 overflow-hidden rounded-lg bg-gray-100 p-1 dark:bg-rdia-800/60">
        <TabButton active={tab === "users"} onClick={() => setTab("users")} label={m.users.tab_users} />
        {isSuperAdmin(role) && (
          <TabButton active={tab === "roles"} onClick={() => setTab("roles")} label={m.users.tab_roles} />
        )}
      </div>

      {tab === "users" ? (
        <UsersTab creatorRole={role} currentMatricule={sessionUser?.matricule ?? null} />
      ) : (
        <RolesTab />
      )}
    </section>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-11 rounded-md px-3 py-2.5 text-xs font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${
        active ? "bg-white text-or-600 shadow-sm dark:bg-rdia-600 dark:text-or-400" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"
      }`}
    >
      {label}
    </button>
  );
}

// ===========================================================================
// Onglet Utilisateurs (données depuis l'API)
// ===========================================================================

function UsersTab({ creatorRole, currentMatricule }: { creatorRole: Role; currentMatricule: string | null }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  // Pop-up récapitulatif du compte qui vient d'être créé (identifiants à remettre).
  const [created, setCreated] = useState<{ user: ApiUser; code: string } | null>(null);
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; user: ApiUser } | null>(null);
  const [confirmDel, setConfirmDel] = useState<ApiUser | null>(null);

  const superAdmin = isSuperAdmin(creatorRole);
  const adminRoles = assignableRoles("admin");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listUsers();
      if (res.data) setUsers(res.data as unknown as ApiUser[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const manageable = (u: ApiUser) =>
    !u.builtin && (superAdmin || u.roles.every((r) => adminRoles.includes(r)));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.matricule.toLowerCase().includes(q) || u.nom.toLowerCase().includes(q));
  }, [users, query]);

  const reveal = async (u: ApiUser) => {
    if (codes[u.id]) {
      setCodes((s) => { const n = { ...s }; delete n[u.id]; return n; });
      return;
    }
    const res = await api.revealUserCode(u.id);
    const code = (res.data as { tempPassword?: string | null } | undefined)?.tempPassword;
    if (code) setCodes((s) => ({ ...s, [u.id]: code }));
  };

  /** Copie un texte dans le presse-papiers (confirmation par toast). */
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(m.users.copied_toast);
    } catch {
      /* presse-papiers indisponible (permissions navigateur) */
    }
  };

  /**
   * Copie le mot de passe provisoire d'un compte SANS l'afficher : s'il n'a pas
   * encore été révélé, il est demandé à l'API à la volée.
   */
  const copyUserCode = async (u: ApiUser) => {
    let code = codes[u.id];
    if (!code) {
      const res = await api.revealUserCode(u.id);
      code = (res.data as { tempPassword?: string | null } | undefined)?.tempPassword ?? "";
      if (!code) return;
    }
    await copyText(code);
  };

  const toggleActive = async (u: ApiUser, active: boolean) => {
    await api.setUserActive(u.id, active);
    showToast(m.users.activated_toast);
    void load();
  };

  const doDelete = async (u: ApiUser) => {
    await api.deleteUser(u.id);
    showToast(m.users.deleted_toast);
    setConfirmDel(null);
    void load();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Barre d'outils : recherche pleine largeur puis action, empilées sous
          `sm` — côte à côte elles se seraient réduites à une centaine de pixels. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-[320px] sm:flex-1 sm:basis-auto">
          {/* 16 px sous `md` : en dessous, iOS zoome à la prise de focus. */}
          <input className="input-champ text-base md:text-sm" placeholder={m.users.search} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="btn-primaire flex w-full items-center justify-center gap-1.5 text-sm sm:ms-auto sm:w-auto" onClick={() => setForm({ mode: "create" })}>
          <Icon path={UI_ICONS.plus} size={15} />
          {m.users.new_user}
        </button>
      </div>

      {/* Tableau : à partir de `md`, six colonnes redeviennent lisibles. */}
      <div className="carte hidden min-h-0 flex-1 overflow-auto p-0 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-start text-[11px] uppercase tracking-wide text-gray-400 dark:border-rdia-700/50 dark:text-rdia-400">
              <th className="px-4 py-3 font-semibold">{m.users.col_user}</th>
              <th className="px-4 py-3 font-semibold">{m.users.col_phone}</th>
              <th className="px-4 py-3 font-semibold">{m.users.col_roles}</th>
              <th className="px-4 py-3 font-semibold">{m.users.col_status}</th>
              <th className="px-4 py-3 font-semibold">{m.users.col_code}</th>
              <th className="px-4 py-3 text-end font-semibold">{m.users.col_actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-rdia-400">…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-rdia-400">{m.users.empty}</td></tr>
            ) : (
              filtered.map((u) => {
                const active = u.status === "active";
                const isSelf = currentMatricule != null && u.matricule === currentMatricule;
                const canManage = manageable(u);
                return (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0 dark:border-rdia-700/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-[11px] font-bold text-or-600 dark:text-or-400">
                          {initials(u.nom)}
                          <span title={u.online ? m.users.online : m.users.offline} className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-rdia-800 ${u.online ? "bg-green-500" : "bg-danger-500"}`} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-semibold text-rdia-600 dark:text-rdia-50">
                            <span className="truncate">{fullName(u)}</span>
                            {isSelf && <span className="text-[10px] font-normal text-gray-400 dark:text-rdia-400">({m.users.you})</span>}
                          </div>
                          <div className="truncate font-mono text-[11px] text-gray-400 dark:text-rdia-400">{u.matricule}{u.grade ? ` · ${u.grade}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.phone ? (
                        <span className="font-mono text-xs text-gray-600 dark:text-rdia-200" dir="ltr">{u.phone}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-rdia-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RoleChips roles={u.roles} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Pill tone={active ? "green" : "gray"} label={active ? m.users.status_active : m.users.status_inactive} />
                        {u.activatedByAdmin && u.hasTempCode && (
                          <span className="text-[9px] text-gray-400 dark:text-rdia-400">{m.users.admin_activated}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CodeCell
                        hasCode={u.hasTempCode}
                        code={codes[u.id]}
                        onReveal={() => void reveal(u)}
                        onCopy={() => void copyUserCode(u)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <RowActions
                          active={active}
                          showPower={superAdmin && !u.builtin && !isSelf}
                          canManage={canManage}
                          canDelete={canManage && !isSelf}
                          onToggleActive={(next) => void toggleActive(u, next)}
                          onEdit={() => setForm({ mode: "edit", user: u })}
                          onDelete={() => setConfirmDel(u)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Sous `md` : une carte par compte — mêmes colonnes, mêmes actions. */}
      <div className="flex flex-col gap-2 md:hidden">
        {loading ? (
          <div className="carte p-6 text-center text-sm text-gray-400 dark:text-rdia-400">…</div>
        ) : filtered.length === 0 ? (
          <div className="carte p-6 text-center text-sm text-gray-400 dark:text-rdia-400">{m.users.empty}</div>
        ) : (
          filtered.map((u) => {
            const active = u.status === "active";
            const isSelf = currentMatricule != null && u.matricule === currentMatricule;
            const canManage = manageable(u);
            return (
              <div key={u.id} className="carte flex flex-col gap-2.5 p-3">
                <div className="flex items-start gap-3">
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-[11px] font-bold text-or-600 dark:text-or-400">
                    {initials(u.nom)}
                    <span title={u.online ? m.users.online : m.users.offline} className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-rdia-800 ${u.online ? "bg-green-500" : "bg-danger-500"}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
                      <span className="break-words">{fullName(u)}</span>
                      {isSelf && <span className="text-[11px] font-normal text-gray-400 dark:text-rdia-400">({m.users.you})</span>}
                    </div>
                    <div className="break-all font-mono text-[11px] text-gray-400 dark:text-rdia-400">{u.matricule}{u.grade ? ` · ${u.grade}` : ""}</div>
                    {/* Sous le nom plutôt qu'en marge : à côté de la pastille,
                        cette mention réduisait le nom à quelques caractères. */}
                    {u.activatedByAdmin && u.hasTempCode && (
                      <div className="mt-0.5 text-[10px] text-gray-400 dark:text-rdia-400">{m.users.admin_activated}</div>
                    )}
                  </div>
                  <span className="shrink-0">
                    <Pill tone={active ? "green" : "gray"} label={active ? m.users.status_active : m.users.status_inactive} />
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                  <div className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.users.col_phone}</dt>
                    <dd className="break-all">
                      {u.phone ? (
                        <span className="font-mono text-gray-700 dark:text-rdia-100" dir="ltr">{u.phone}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-rdia-500">—</span>
                      )}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.users.col_code}</dt>
                    <dd>
                      <CodeCell
                        hasCode={u.hasTempCode}
                        code={codes[u.id]}
                        onReveal={() => void reveal(u)}
                        onCopy={() => void copyUserCode(u)}
                      />
                    </dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="mb-1 text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.users.col_roles}</dt>
                    <dd><RoleChips roles={u.roles} /></dd>
                  </div>
                </dl>

                <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-1 dark:border-rdia-700/50">
                  <RowActions
                    active={active}
                    showPower={superAdmin && !u.builtin && !isSelf}
                    canManage={canManage}
                    canDelete={canManage && !isSelf}
                    onToggleActive={(next) => void toggleActive(u, next)}
                    onEdit={() => setForm({ mode: "edit", user: u })}
                    onDelete={() => setConfirmDel(u)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="flex items-start gap-2 text-[11px] text-gray-400 dark:text-rdia-400">
        <Icon path={UI_ICONS.shield} size={13} className="mt-0.5 shrink-0 text-or-500" />
        {m.users.code_active_note}
      </p>

      <Modal open={form !== null} size="md" title={form?.mode === "edit" ? m.users.edit_user : m.users.new_user} onClose={() => setForm(null)}>
        {form && (
          <UserForm
            creatorRole={creatorRole}
            user={form.mode === "edit" ? form.user : undefined}
            onClose={() => setForm(null)}
            onDone={() => { setForm(null); void load(); }}
            onCreated={(user, code) => { setForm(null); setCreated({ user, code }); void load(); }}
          />
        )}
      </Modal>

      {/* Récapitulatif du compte créé : identités + identifiants à remettre. */}
      <Modal open={created !== null} size="md" title={m.users.created_title} onClose={() => setCreated(null)}>
        {created && (
          <div className="flex flex-col gap-4">
            {/* Les rôles passent à la ligne sous `sm` : sur 375 px ils écrasaient
                le nom du compte à quelques caractères. */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-rdia-900/40">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-xs font-bold text-or-600 dark:text-or-400">
                {initials(fullName(created.user))}
              </span>
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-bold text-rdia-600 dark:text-rdia-50">{fullName(created.user)}</div>
                <div className="truncate text-[11px] text-gray-400 dark:text-rdia-400">
                  {created.user.grade ?? "—"}
                </div>
              </div>
              <div className="w-full sm:ms-auto sm:w-auto">
                <RoleChips roles={created.user.roles} />
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <SummaryRow label={m.users.matricule} value={created.user.matricule} mono onCopy={() => void copyText(created.user.matricule)} copyLabel={m.users.copy_code} />
              <SummaryRow label={m.users.phone} value={created.user.phone ?? "—"} mono />
              <SummaryRow label={m.users.name} value={created.user.nom} />
              <SummaryRow label={m.users.firstname} value={created.user.prenom ?? "—"} />
              {/* Mot de passe provisoire — mis en avant, copiable en un clic. */}
              <div className="sm:col-span-2">
                <dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.users.col_code}</dt>
                <dd className="flex items-center gap-2 rounded-lg border border-or-500/40 bg-or-500/10 px-3 py-2">
                  <Icon path={UI_ICONS.key} size={15} className="shrink-0 text-or-500" />
                  <span className="min-w-0 flex-1 break-all font-mono text-base font-bold tracking-wider text-or-600 dark:text-or-400">{created.code}</span>
                  <button
                    title={m.users.copy_code}
                    aria-label={m.users.copy_code}
                    className="cible-tactile flex shrink-0 items-center justify-center rounded-md p-1.5 text-or-500 transition-colors hover:bg-or-500/20"
                    onClick={() => void copyText(created.code)}
                  >
                    <Icon path={UI_ICONS.copy} size={16} />
                  </button>
                </dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">
              <Icon path={UI_ICONS.shield} size={13} className="mt-0.5 shrink-0 text-or-500" />
              {m.users.created_hint}
            </p>

            <div className="flex justify-end">
              <button className="btn-primaire w-full text-sm sm:w-auto" onClick={() => setCreated(null)}>{m.users.created_close}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={confirmDel !== null} size="sm" title={m.users.delete_title} onClose={() => setConfirmDel(null)}>
        {confirmDel && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-rdia-900/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-500/15 text-[11px] font-bold text-danger-500">{initials(fullName(confirmDel))}</span>
              <div className="min-w-0">
                <div className="break-words font-semibold text-rdia-600 dark:text-rdia-50">{fullName(confirmDel)}</div>
                <div className="break-all font-mono text-[11px] text-gray-400 dark:text-rdia-400">{confirmDel.matricule}</div>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-rdia-300">{m.users.delete_body}</p>
            {/* Empilé sous `sm`, action destructrice en haut de pile. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondaire text-sm" onClick={() => setConfirmDel(null)}>{m.users.cancel}</button>
              <button className="rounded-lg bg-danger-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-danger-600 sm:py-2" onClick={() => void doDelete(confirmDel)}>
                {m.users.delete}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fragments partagés par la ligne de tableau (≥ md) et la carte (< md) : ils
// garantissent que la version mobile ne perd ni donnée ni action.
// ---------------------------------------------------------------------------

/** Étiquettes des rôles d'un compte. */
function RoleChips({ roles }: { roles: Role[] }) {
  const m = useModules();
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span key={r} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-rdia-700/60 dark:text-rdia-100">
          <Icon path={ROLE_ICONS[r]} size={11} className="text-or-500" />
          {m.roles[r]}
        </span>
      ))}
    </div>
  );
}

/** Mot de passe provisoire : masqué par défaut, révélable et copiable. */
function CodeCell({
  hasCode, code, onReveal, onCopy,
}: {
  hasCode: boolean;
  code?: string;
  onReveal: () => void;
  onCopy: () => void;
}) {
  const m = useModules();
  if (!hasCode) return <span className="text-gray-300 dark:text-rdia-500">{m.users.no_code}</span>;
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-xs text-or-600 dark:text-or-400">{code ?? "••••-••••"}</span>
      <button title={code ? m.users.hide : m.users.reveal} aria-label={code ? m.users.hide : m.users.reveal} className="cible-tactile flex items-center justify-center rounded-md p-1.5 text-gray-400 transition-colors hover:text-or-500" onClick={onReveal}>
        <Icon path={code ? UI_ICONS.eyeOff : UI_ICONS.eye} size={15} />
      </button>
      <button title={m.users.copy_code} aria-label={m.users.copy_code} className="cible-tactile flex items-center justify-center rounded-md p-1.5 text-gray-400 transition-colors hover:text-or-500" onClick={onCopy}>
        <Icon path={UI_ICONS.copy} size={14} />
      </button>
    </div>
  );
}

/** Actions d'un compte : (dés)activation, édition, suppression. */
function RowActions({
  active, showPower, canManage, canDelete, onToggleActive, onEdit, onDelete,
}: {
  active: boolean;
  showPower: boolean;
  canManage: boolean;
  canDelete: boolean;
  onToggleActive: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const m = useModules();
  const btn = "cible-tactile flex items-center justify-center rounded-md p-1.5 transition-colors disabled:opacity-30";
  return (
    <>
      {showPower && (
        active ? (
          <button title={m.users.deactivate} aria-label={m.users.deactivate} onClick={() => onToggleActive(false)} className={`${btn} text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-rdia-700`}>
            <Icon path={UI_ICONS.power} size={15} />
          </button>
        ) : (
          <button title={m.users.activate} aria-label={m.users.activate} onClick={() => onToggleActive(true)} className={`${btn} text-green-500 hover:bg-green-500/10`}>
            <Icon path={UI_ICONS.check} size={15} />
          </button>
        )
      )}
      <button title={m.users.edit} aria-label={m.users.edit} disabled={!canManage} onClick={onEdit} className={`${btn} text-gray-400 hover:bg-or-500/10 hover:text-or-500`}>
        <Icon path={UI_ICONS.edit} size={15} />
      </button>
      <button title={m.users.delete} aria-label={m.users.delete} disabled={!canDelete} onClick={onDelete} className={`${btn} text-gray-400 hover:bg-danger-500/10 hover:text-danger-500`}>
        <Icon path={UI_ICONS.trash} size={15} />
      </button>
    </>
  );
}

/** Ligne « libellé / valeur » du récapitulatif, avec copie optionnelle. */
function SummaryRow({
  label, value, mono, onCopy, copyLabel,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  copyLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className="flex items-center gap-1.5">
        <span className={`min-w-0 break-all text-sm text-gray-800 dark:text-rdia-50 ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : undefined}>{value}</span>
        {onCopy && (
          <button title={copyLabel} aria-label={copyLabel} className="cible-tactile flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:text-or-500" onClick={onCopy}>
            <Icon path={UI_ICONS.copy} size={13} />
          </button>
        )}
      </dd>
    </div>
  );
}

// ===========================================================================
// Formulaire création / édition (via l'API)
// ===========================================================================

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

// ===========================================================================
// Onglet Rôles & fonctionnalités (via l'API)
// ===========================================================================

function RolesTab() {
  const t = useDict();
  const m = useModules();
  const roleFeatures = useArgos((s) => s.roleFeatures);
  const setRoleFeatures = useArgos((s) => s.setRoleFeatures);

  const [selected, setSelected] = useState<Role>("strategic");

  const refresh = useCallback(async () => {
    const res = await api.getRoleFeatures();
    if (res.data) setRoleFeatures(res.data as Record<Role, Record<string, boolean>>);
  }, [setRoleFeatures]);

  useEffect(() => { void refresh(); }, [refresh]);

  const locked = selected === "superadmin" || selected === "admin";
  const feats = roleFeatures[selected] ?? {};
  const allowedCount = MODULE_FEATURES.filter((k) => feats[k]).length;

  const toggle = async (feature: ModuleFeature, enabled: boolean) => {
    await api.setRoleFeature(selected, feature, enabled);
    await refresh();
  };

  const reset = async () => {
    const def = DEFAULT_ROLE_FEATURES[selected];
    await Promise.all(
      MODULE_FEATURES.filter((k) => (feats[k] ?? false) !== def[k]).map((k) => api.setRoleFeature(selected, k as ModuleFeature, def[k])),
    );
    await refresh();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="carte flex shrink-0 flex-col gap-1 p-3 lg:w-64 lg:overflow-auto">
        <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400 dark:text-rdia-400">{m.users.select_role}</p>
        {/* Sous `lg` : bandeau défilable horizontalement — quinze rôles empilés
            repousseraient la matrice des fonctionnalités hors de l'écran. */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-x-visible lg:px-0 lg:pb-0">
          {ROLES.map((r) => {
            const on = r === selected;
            const count = MODULE_FEATURES.filter((k) => (roleFeatures[r] ?? {})[k]).length;
            return (
              <button key={r} onClick={() => setSelected(r)} className={`flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors lg:min-h-0 lg:w-full ${on ? "bg-or-500/15 text-or-600 dark:text-or-400" : "text-gray-600 hover:bg-gray-100 dark:text-rdia-200 dark:hover:bg-rdia-700/50"}`}>
                <Icon path={ROLE_ICONS[r]} size={16} className="shrink-0" />
                <span className="whitespace-nowrap text-start font-medium lg:flex-1 lg:truncate">{m.roles[r]}</span>
                <span className="text-[10px] text-gray-400 dark:text-rdia-400">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="carte flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5 lg:overflow-auto">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
              <Icon path={ROLE_ICONS[selected]} size={16} className="text-or-500" />
              {m.roles[selected]}
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-rdia-400">{locked ? m.users.locked_all : `${allowedCount} ${m.users.modules_count}`}</p>
          </div>
          {!locked && (
            <button className="cible-tactile flex items-center justify-center px-1 text-xs font-semibold text-or-500 hover:underline lg:px-0 lg:text-[11px]" onClick={() => void reset()}>{m.users.reset_role}</button>
          )}
        </div>

        <p className="text-[11px] text-gray-400 dark:text-rdia-400">{m.users.role_features_hint}</p>

        <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:gap-x-8">
          {MODULE_FEATURES.map((k) => {
            const on = locked ? true : feats[k] === true;
            const isDefault = DEFAULT_ROLE_FEATURES[selected][k];
            return (
              <button key={k} disabled={locked} onClick={() => void toggle(k as ModuleFeature, !on)} className="flex min-h-[44px] items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm transition-colors last:border-0 disabled:cursor-not-allowed lg:min-h-0 dark:border-rdia-700/50">
                <span className="flex min-w-0 items-center gap-1.5 text-start">
                  <span className={on ? "text-gray-700 dark:text-rdia-100" : "text-gray-400 line-through dark:text-rdia-400"}>{navLabel(k, t)}</span>
                  {!locked && on !== isDefault && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-or-500" title={m.settings.modified} />
                  )}
                </span>
                <span className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${on ? "bg-or-500" : "bg-gray-300 dark:bg-rdia-600"} ${locked ? "opacity-60" : ""}`}>
                  <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ insetInlineStart: on ? 18 : 2 }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
