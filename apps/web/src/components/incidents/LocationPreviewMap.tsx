"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_CENTER, MAP_STYLE, MAP_ZOOM } from "@/lib/map/style";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

interface Props {
  /** Point courant [lng, lat] — pilote le marqueur et le recentrage. */
  value: [number, number] | null;
  /** Clic sur la carte : remonte le point choisi au parent. */
  onPick: (ll: [number, number]) => void;
  labels: { hint: string; full: string; exit: string };
}

/** Clé de comparaison arrondie (évite les recentrages en boucle). */
const key = (ll: [number, number]) => `${ll[0].toFixed(5)},${ll[1].toFixed(5)}`;

/**
 * Aperçu cartographique réel (MapLibre GL) pour l'étape de localisation.
 * Un seul marqueur reflète en direct la position résolue (adresse / province /
 * ville / coordonnées) ; un clic sur la carte pose le point. Bouton plein écran
 * en haut à droite, croix pour en sortir. Fond raster sans jeton (voir map/style).
 */
export function LocationPreviewMap({ value, onPick, labels }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const appliedRef = useRef<string>("");
  // Refs pour éviter les fermetures obsolètes dans les gestionnaires MapLibre.
  const onPickRef = useRef(onPick);
  const valueRef = useRef(value);
  onPickRef.current = onPick;
  valueRef.current = value;

  const [full, setFull] = useState(false);

  const placeMarker = (ll: [number, number]) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: "#C9A84C" }).setLngLat(ll).addTo(map);
    } else {
      markerRef.current.setLngLat(ll);
    }
  };

  // --- initialisation (une seule fois) ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const init = valueRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: init ?? MAP_CENTER,
      zoom: init ? 11 : MAP_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.getCanvas().style.cursor = "crosshair";

    map.on("click", (e) => {
      const ll: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      appliedRef.current = key(ll); // marque comme déjà appliqué → pas de recentrage
      placeMarker(ll);
      onPickRef.current(ll);
    });

    if (init) {
      appliedRef.current = key(init);
      placeMarker(init);
    }

    // Le conteneur peut être mesuré à 0 au montage (modale, chargement dynamique) :
    // on resynchronise la taille du canvas dès qu'il obtient ses dimensions réelles.
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- reflète les changements externes (adresse / province / ville / coords) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    if (key(value) === appliedRef.current) return; // provient de notre propre clic
    appliedRef.current = key(value);
    placeMarker(value);
    map.easeTo({ center: value, zoom: Math.max(map.getZoom(), 11), duration: 700 });
  }, [value]);

  // --- resynchronise la taille du canvas quand on (dé)bascule le plein écran ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.resize(), 60);
    return () => window.clearTimeout(id);
  }, [full]);

  // Échap ferme le plein écran (sans fermer la modale au-dessus).
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setFull(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [full]);

  return (
    <div
      ref={wrapRef}
      className={
        full
          ? "fixed inset-0 z-[9999] bg-rdia-900"
          : "relative h-[360px] w-full overflow-hidden rounded-xl border border-gray-200 dark:border-rdia-600"
      }
    >
      {/* Style inline (position absolute) : bat la règle .maplibregl-map { position: relative }
          de la feuille MapLibre, sinon le conteneur retombe à une hauteur nulle. */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Indice discret */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-black/45 px-2 py-1 text-[10px] font-semibold text-white/85">
        {labels.hint}
      </div>

      {/* Bouton plein écran / sortie — coin supérieur droit */}
      <button
        type="button"
        onClick={() => setFull((f) => !f)}
        title={full ? labels.exit : labels.full}
        aria-label={full ? labels.exit : labels.full}
        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-rdia-600 shadow-md transition-colors hover:bg-white dark:bg-rdia-700/90 dark:text-rdia-50 dark:hover:bg-rdia-700"
      >
        <Icon path={full ? UI_ICONS.close : UI_ICONS.expand} size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
