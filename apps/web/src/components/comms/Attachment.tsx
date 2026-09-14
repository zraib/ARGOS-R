"use client";

import { useEffect, useState } from "react";
import { useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { fetchAttachmentBlob, formatBytes } from "@/lib/comms/attachments";
import type { CommAttachment } from "@/lib/types";

/**
 * Rendu d'une pièce jointe — centre de communication et fenêtres flottantes.
 *
 * L'image et la vidéo s'affichent EN PLACE : une photo de dégâts qu'il faut
 * télécharger pour voir arrive trop tard. Le reste — PDF, texte, CSV — se
 * télécharge, parce que rendre un document dans la page est une surface
 * d'attaque que rien ne justifie ici. `compact` : dans une bulle, moins haut.
 */
export function Attachment({ att, compact = false }: { att: CommAttachment; compact?: boolean }) {
  const t = useDict();
  const [url, setUrl] = useState<string | null>(null);
  const [echec, setEchec] = useState(false);
  const image = att.mime.startsWith("image/");
  const video = att.mime.startsWith("video/");

  useEffect(() => {
    if (!image && !video) return;
    let vivant = true;
    let objet: string | null = null;
    void (async () => {
      const blob = await fetchAttachmentBlob(att.id);
      if (!blob) {
        if (vivant) setEchec(true);
        return;
      }
      objet = URL.createObjectURL(blob);
      if (vivant) setUrl(objet);
    })();
    return () => {
      vivant = false;
      // L'URL d'objet est RÉVOQUÉE : sans cela chaque défilement du fil
      // retiendrait des mégaoctets de vidéo jusqu'au rechargement de la page.
      if (objet) URL.revokeObjectURL(objet);
    };
  }, [att.id, image, video]);

  const telecharger = async () => {
    const blob = await fetchAttachmentBlob(att.id);
    if (!blob) return;
    const objet = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objet;
    a.download = att.name;
    a.click();
    URL.revokeObjectURL(objet);
  };

  const taille = formatBytes(att.bytes);
  const hauteur = compact ? "max-h-[200px]" : "max-h-[320px]";

  if ((image || video) && !echec) {
    return (
      <figure className={`mt-1.5 overflow-hidden rounded-lg border border-gray-200 dark:border-rdia-600 ${compact ? "max-w-full" : "max-w-[380px]"}`}>
        {url ? (
          image ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL d'objet locale : `next/image` ne sait pas la servir.
            <img src={url} alt={att.name} className={`block w-full bg-black/5 object-contain ${hauteur}`} />
          ) : (
            <video src={url} controls className={`block w-full bg-black ${hauteur}`} />
          )
        ) : (
          <div className={`w-full animate-pulse bg-gray-100 motion-reduce:animate-none dark:bg-rdia-800/40 ${compact ? "h-24" : "h-32"}`} />
        )}
        <figcaption className="flex items-center gap-2 px-2 py-1.5 text-[10.5px] text-gray-500 dark:text-rdia-300">
          <span className="min-w-0 flex-1 truncate">{att.name}</span>
          <span className="shrink-0 tabular-nums">{taille}</span>
          <button type="button" onClick={() => void telecharger()} title={t.cm_download} aria-label={`${t.cm_download} — ${att.name}`}>
            <Icon path={UI_ICONS.download} size={13} className="shrink-0 hover:text-or-500" />
          </button>
        </figcaption>
      </figure>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void telecharger()}
      className={`mt-1.5 flex w-full items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-2 text-start transition-colors hover:border-or-500/60 dark:border-rdia-600 ${compact ? "max-w-full" : "max-w-[320px]"}`}
    >
      <Icon path={UI_ICONS.file} size={16} className="shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-gray-800 dark:text-rdia-50">{att.name}</span>
        <span className="block text-[10.5px] tabular-nums text-gray-500 dark:text-rdia-300">{taille}</span>
      </span>
      <Icon path={UI_ICONS.download} size={14} className="shrink-0 text-gray-400" />
    </button>
  );
}
