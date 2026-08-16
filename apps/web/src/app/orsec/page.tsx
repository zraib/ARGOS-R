"use client";

import { useArgos, useModules, useDict } from "@/lib/store";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { occBarClass } from "@/lib/helpers";

function BigNumber({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-rdia-800/50">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-gray-400 dark:text-rdia-400 md:text-[10px]">{label}</div>
    </div>
  );
}

export default function OrsecPage() {
  const catalog = useArgos((s) => s.catalog);
  const ORSEC_BOARD = catalog.orsec;
  const m = useModules();
  const t = useDict();
  const b = ORSEC_BOARD;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* Bandeau d'état du plan */}
      <div className="carte flex flex-wrap items-center gap-4 p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-danger-500/15 px-3 py-1.5 text-sm font-bold text-danger-500">{t.lvl3}</span>
          <div>
            <div className="text-xs text-gray-500 dark:text-rdia-300">{m.orsec.plan_level}</div>
            <div className="text-xs font-semibold text-gray-800 dark:text-rdia-50">{m.orsec.activated} · {b.activatedAt}</div>
          </div>
        </div>
        <button className="btn-secondaire cible-tactile ms-auto text-xs">{m.orsec.big_screen}</button>
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="carte p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.orsec.casualties}</h3>
          <div className="grid grid-cols-2 gap-2">
            <BigNumber value={b.casualties.dead} label={m.orsec.n_dead} color="text-danger-500" />
            <BigNumber value={b.casualties.injured} label={m.orsec.n_injured} color="text-or-500" />
            <BigNumber value={b.casualties.missing} label={m.orsec.n_missing} color="text-gray-500 dark:text-rdia-200" />
            <BigNumber value={b.casualties.rescued} label={m.orsec.n_rescued} color="text-green-600" />
          </div>
        </div>

        <div className="carte p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.orsec.resources}</h3>
          <div className="flex flex-col gap-2.5 text-sm md:text-xs">
            {[
              { label: t.nav_units, e: b.units.engaged, a: b.units.available },
              { label: t.kpi_pers, e: b.personnel.engaged, a: b.personnel.available },
              { label: t.lg_veh, e: b.vehicles.engaged, a: b.vehicles.available },
            ].map((r) => (
              <div key={r.label} className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="min-w-0 text-gray-500 dark:text-rdia-300">{r.label}</span>
                <span className="font-mono tabular-nums">
                  <span className="font-bold text-or-500">{r.e}</span>
                  <span className="text-gray-400 dark:text-rdia-400"> / {r.a} {m.orsec.available.toLowerCase()}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="carte p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.orsec.hospitals}</h3>
          <div className="flex flex-col items-center justify-center gap-2 py-2">
            <div className={`text-4xl font-bold tabular-nums ${b.hospitalLoad >= 90 ? "text-danger-500" : b.hospitalLoad >= 75 ? "text-or-500" : "text-green-600"}`}>{b.hospitalLoad}%</div>
            <ProgressBar value={b.hospitalLoad} fill={occBarClass(b.hospitalLoad)} height="h-2" />
            <div className="text-xs text-gray-400 dark:text-rdia-400 md:text-[10px]">{m.orsec.load}</div>
          </div>
        </div>

        <div className="carte flex flex-col items-center justify-center p-4">
          <h3 className="mb-3 self-start text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.orsec.shelters}</h3>
          <div className="text-4xl font-bold tabular-nums text-blue-500">{b.sheltersActive}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-gray-400 dark:text-rdia-400 md:text-[10px]">{m.orsec.shelters}</div>
        </div>
      </div>

      {/* Organisation + décisions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="carte p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{m.orsec.org}</h3>
          <div className="flex flex-col gap-2">
            {b.org.map((o, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-gray-100 py-1.5 last:border-0 dark:border-rdia-700/50">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-[10px] font-bold text-or-500">
                  {o.name.split(" ").slice(-1)[0].slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-gray-800 dark:text-rdia-50 md:truncate md:text-xs">{o.name}</div>
                  <div className="break-words text-xs text-gray-400 dark:text-rdia-400 md:truncate md:text-[10px]">{o.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="carte p-4 sm:p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{m.orsec.decisions}</h3>
          <div className="flex flex-col gap-3">
            {b.decisions.map((d, i) => (
              <div key={i} className="flex gap-3 border-b border-gray-100 pb-3 last:border-0 dark:border-rdia-700/50">
                <span className="w-12 shrink-0 font-mono text-xs text-gray-400 dark:text-rdia-400 sm:w-14 sm:text-[11px]">{d.time}</span>
                <div className="min-w-0">
                  <div className="break-words text-sm text-gray-700 dark:text-rdia-100">{d.decision}</div>
                  <div className="mt-0.5 text-xs font-semibold text-or-500 md:text-[10px]">{d.author}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Officiers de permanence */}
      <div className="carte p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{m.orsec.roster}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {b.duty.map((d, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-rdia-800/50">
              <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
              <div className="min-w-0">
                <div className="break-words text-sm font-semibold text-gray-800 dark:text-rdia-50 md:truncate md:text-xs">{d.name}</div>
                <div className="break-words text-xs text-gray-400 dark:text-rdia-400 md:truncate md:text-[10px]">{d.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
