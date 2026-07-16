"use client";

import { useArgos } from "@/lib/store";
import { incidentFill } from "@/lib/helpers";

/** Silhouette stylisée du Maroc avec marqueurs unités/hôpitaux/incidents en direct (Disposition B). */
export function MoroccoSituation() {
  const incidents = useArgos((s) => s.incidents);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const activeInc = incidents.filter((i) => i.st !== "closed");

  return (
    <div className="flex-1 overflow-hidden rounded-lg" style={{ background: "#10202f", minHeight: 420 }}>
      <svg viewBox="10 30 420 430" className="h-full w-full" style={{ display: "block" }}>
        <path
          d="M218,52 L196,148 L176,176 L156,196 L136,240 L120,278 L112,330 L96,368 L82,404 L52,436 L58,458 L30,516 L24,596 L38,678 L120,676 L128,600 L180,560 L190,500 L232,470 L262,448 L306,428 L338,398 L356,342 L398,286 L420,208 L396,150 L390,94 L354,98 L302,86 L245,62 Z"
          fill="#1B4D2E"
          stroke="#C9A84C"
          strokeWidth={1}
          strokeOpacity={0.5}
        />
        <path d="M150,300 L180,282 L210,272 L250,250 L290,230 L330,214 L360,200" fill="none" stroke="#0f3d22" strokeWidth={7} strokeLinecap="round" opacity={0.8} />
        <path d="M130,340 L170,320 L220,300 L270,278" fill="none" stroke="#0f3d22" strokeWidth={5} strokeLinecap="round" opacity={0.6} />

        {units.map((u) => (
          <rect key={u.id} x={-4} y={-4} width={8} height={8} fill="#C9A84C" stroke="#0f1f14" strokeWidth={1} transform={`translate(${u.x} ${u.y})`} />
        ))}
        {hospitals.map((h) => (
          <g key={h.id} transform={`translate(${h.x} ${h.y})`}>
            <circle r={5} fill="#ffffff" />
            <path d="M-2.5,0 H2.5 M0,-2.5 V2.5" stroke="#EF4444" strokeWidth={1.6} />
          </g>
        ))}
        {activeInc.map((i) => {
          const fill = incidentFill(i.sev, false);
          return (
            <g key={i.id} transform={`translate(${i.x} ${i.y})`}>
              <circle r={7} fill={fill} opacity={0.6} style={{ animation: "cgc-ping 1.8s ease-out infinite", transformOrigin: "center" }} />
              <path d="M0,-6 L6,5 L-6,5 Z" fill={fill} stroke="#0f1f14" strokeWidth={1} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
