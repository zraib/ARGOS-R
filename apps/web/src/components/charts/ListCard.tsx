// Recrée le <DashboardListCard> d'AminDesign avec la variante `afficher-progression` :
// une liste titrée où chaque ligne montre une pastille colorée, un libellé et une
// barre de progression optionnelle avec pourcentage. Utilisé pour « Opérations en cours ».

export interface ListItem {
  id: number;
  title: string;
  color: string;
  progression: number;
}

export function ListCard({
  titre,
  items,
  showProgress = true,
}: {
  titre: string;
  items: ListItem[];
  showProgress?: boolean;
}) {
  return (
    <div className="carte flex h-full flex-col p-4">
      <h3 className="mb-3 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{titre}</h3>
      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <div key={it.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: it.color }} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-rdia-100" title={it.title}>
                {it.title}
              </span>
              {showProgress && (
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-gray-400 dark:text-rdia-300">
                  {it.progression}%
                </span>
              )}
            </div>
            {showProgress && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${it.progression}%`, backgroundColor: it.color }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
