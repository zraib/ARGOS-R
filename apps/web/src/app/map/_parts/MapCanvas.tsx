"use client";

import dynamic from "next/dynamic";


export const MapCanvas = dynamic(() => import("@/components/map/MapCanvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs text-rdia-200">Chargement de la carte…</div>
  ),
});
