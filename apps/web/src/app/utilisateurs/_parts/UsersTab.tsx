"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { noticeTime } from "@/lib/notices";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { UI_ICONS } from "@/lib/icons";
import {
  assignableRoles,
  isSuperAdmin,
  type Role,
} from "@/lib/roles";
import { initials } from "@/lib/data/users";
import {
  ApiUser,
  fullName,
} from "@/app/utilisateurs/_parts/shared";
import { RoleChips } from "@/app/utilisateurs/_parts/RoleChips";
import { CodeCell } from "@/app/utilisateurs/_parts/CodeCell";
import { RowActions } from "@/app/utilisateurs/_parts/RowActions";
import { SummaryRow } from "@/app/utilisateurs/_parts/SummaryRow";
import { UserForm } from "@/app/utilisateurs/_parts/UserForm";

// ===========================================================================
// Onglet Utilisateurs (données depuis l'API)
// ===========================================================================
export 
function UsersTab({ creatorRole, currentMatricule }: { creatorRole: Role; currentMatricule: string | null }) {
  const m = useModules();
  const t = useDict();
  const showToast = useArgos((s) => s.showToast);
  // Une demande « mot de passe oublié » arrive par la cloche : la liste se
  // relit pour la montrer, sans attendre un rafraîchissement.
  const resetNotices = useArgos((s) => s.rtNotices.filter((n) => n.kind === "password_reset_requested").length);

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  // Pop-up récapitulatif des identifiants à remettre : compte créé, ou code
  // provisoire régénéré — même geste de remise, même écran.
  const [recap, setRecap] = useState<{ user: ApiUser; code: string; mode: "created" | "reset" } | null>(null);
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; user: ApiUser } | null>(null);
  const [confirmDel, setConfirmDel] = useState<ApiUser | null>(null);
  const [confirmReset, setConfirmReset] = useState<ApiUser | null>(null);

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

  // Relecture à chaque nouvelle demande reçue — pas au montage, `load` s'en charge.
  const premiereAlerte = useRef(true);
  useEffect(() => {
    if (premiereAlerte.current) {
      premiereAlerte.current = false;
      return;
    }
    void load();
  }, [resetNotices, load]);

  const manageable = (u: ApiUser) =>
    !u.builtin && (superAdmin || u.roles.every((r) => adminRoles.includes(r)));

  // Les comptes qui appellent à l'aide passent en tête : c'est ce que
  // l'administrateur vient chercher quand la cloche l'a mené ici.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const liste = q ? users.filter((u) => u.matricule.toLowerCase().includes(q) || u.nom.toLowerCase().includes(q)) : users;
    return [...liste].sort((a, b) => Number(!!b.resetRequestedAt) - Number(!!a.resetRequestedAt));
  }, [users, query]);
  const enAttente = useMemo(() => users.filter((u) => u.resetRequestedAt).length, [users]);

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

  /**
   * Régénère le code provisoire : l'ancien mot de passe cesse de valoir, le
   * compte repasse par le premier login. Le code n'est montré qu'ici, une
   * fois, à remettre par un canal sûr — comme à la création.
   */
  const doReset = async (u: ApiUser) => {
    const res = await api.resetUserCode(u.id);
    const code = (res.data as { tempPassword?: string } | undefined)?.tempPassword;
    setConfirmReset(null);
    if (!code) {
      showToast(t.toast_fail);
      return;
    }
    setCodes((s) => ({ ...s, [u.id]: code }));
    setRecap({ user: u, code, mode: "reset" });
    void load();
  };

  /** Pastille « réinitialisation demandée », avec l'heure de la demande. */
  const demande = (u: ApiUser) =>
    u.resetRequestedAt ? (
      <span className="flex items-center gap-1" title={m.users.reset_requested_hint}>
        <Pill tone="amber" label={m.users.reset_requested} size="sm" />
        <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">{noticeTime(u.resetRequestedAt)}</span>
      </span>
    ) : null;

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
      {enAttente > 0 && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
          <Icon path={UI_ICONS.key} size={14} className="shrink-0" />
          {enAttente} {enAttente > 1 ? m.users.reset_pending_many : m.users.reset_pending_one}
        </p>
      )}

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
                        {demande(u)}
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
                          canReset={canManage && !isSelf}
                          resetPending={!!u.resetRequestedAt}
                          canDelete={canManage && !isSelf}
                          onToggleActive={(next) => void toggleActive(u, next)}
                          onReset={() => setConfirmReset(u)}
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
                    {u.resetRequestedAt && <div className="mt-1">{demande(u)}</div>}
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
                    canReset={canManage && !isSelf}
                    resetPending={!!u.resetRequestedAt}
                    canDelete={canManage && !isSelf}
                    onToggleActive={(next) => void toggleActive(u, next)}
                    onReset={() => setConfirmReset(u)}
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
            onCreated={(user, code) => { setForm(null); setRecap({ user, code, mode: "created" }); void load(); }}
          />
        )}
      </Modal>

      {/* Récapitulatif des identifiants à remettre : compte créé, ou code
          provisoire régénéré pour un compte qui avait oublié son mot de passe. */}
      <Modal
        open={recap !== null}
        size="md"
        title={recap?.mode === "reset" ? m.users.reset_pw_done_title : m.users.created_title}
        onClose={() => setRecap(null)}
      >
        {recap && (
          <div className="flex flex-col gap-4">
            {/* Les rôles passent à la ligne sous `sm` : sur 375 px ils écrasaient
                le nom du compte à quelques caractères. */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-rdia-900/40">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-xs font-bold text-or-600 dark:text-or-400">
                {initials(fullName(recap.user))}
              </span>
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-bold text-rdia-600 dark:text-rdia-50">{fullName(recap.user)}</div>
                <div className="truncate text-[11px] text-gray-400 dark:text-rdia-400">
                  {recap.user.grade ?? "—"}
                </div>
              </div>
              <div className="w-full sm:ms-auto sm:w-auto">
                <RoleChips roles={recap.user.roles} />
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <SummaryRow label={m.users.matricule} value={recap.user.matricule} mono onCopy={() => void copyText(recap.user.matricule)} copyLabel={m.users.copy_code} />
              <SummaryRow label={m.users.phone} value={recap.user.phone ?? "—"} mono />
              <SummaryRow label={m.users.name} value={recap.user.nom} />
              <SummaryRow label={m.users.firstname} value={recap.user.prenom ?? "—"} />
              {/* Mot de passe provisoire — mis en avant, copiable en un clic. */}
              <div className="sm:col-span-2">
                <dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.users.col_code}</dt>
                <dd className="flex items-center gap-2 rounded-lg border border-or-500/40 bg-or-500/10 px-3 py-2">
                  <Icon path={UI_ICONS.key} size={15} className="shrink-0 text-or-500" />
                  <span className="min-w-0 flex-1 break-all font-mono text-base font-bold tracking-wider text-or-600 dark:text-or-400">{recap.code}</span>
                  <button
                    title={m.users.copy_code}
                    aria-label={m.users.copy_code}
                    className="cible-tactile flex shrink-0 items-center justify-center rounded-md p-1.5 text-or-500 transition-colors hover:bg-or-500/20"
                    onClick={() => void copyText(recap.code)}
                  >
                    <Icon path={UI_ICONS.copy} size={16} />
                  </button>
                </dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">
              <Icon path={UI_ICONS.shield} size={13} className="mt-0.5 shrink-0 text-or-500" />
              {recap.mode === "reset" ? m.users.reset_pw_done_hint : m.users.created_hint}
            </p>

            <div className="flex justify-end">
              <button className="btn-primaire w-full text-sm sm:w-auto" onClick={() => setRecap(null)}>{m.users.created_close}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Réinitialiser n'est pas anodin : l'ancien mot de passe cesse de valoir. */}
      <Modal open={confirmReset !== null} size="sm" title={m.users.reset_pw} onClose={() => setConfirmReset(null)}>
        {confirmReset && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-rdia-900/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-[11px] font-bold text-or-600 dark:text-or-400">{initials(fullName(confirmReset))}</span>
              <div className="min-w-0">
                <div className="break-words font-semibold text-rdia-600 dark:text-rdia-50">{fullName(confirmReset)}</div>
                <div className="break-all font-mono text-[11px] text-gray-400 dark:text-rdia-400">{confirmReset.matricule}</div>
              </div>
            </div>
            {confirmReset.resetRequestedAt && (
              <p className="flex items-center gap-2 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                <Icon path={UI_ICONS.key} size={14} className="shrink-0" />
                {m.users.reset_requested} · {noticeTime(confirmReset.resetRequestedAt)}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-rdia-300">{m.users.reset_pw_body}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondaire text-sm" onClick={() => setConfirmReset(null)}>{m.users.cancel}</button>
              <button className="btn-primaire text-sm" onClick={() => void doReset(confirmReset)}>{m.users.reset_pw_confirm}</button>
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
