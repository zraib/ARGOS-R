"use client";

import { useEffect, useState } from "react";

/** Largeur de la fenêtre, suivie au redimensionnement ; 1280 hors navigateur. */
export function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
