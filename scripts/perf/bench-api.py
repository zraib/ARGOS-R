#!/usr/bin/env python3
# ============================================================================
# scripts/perf/bench-api.py — banc de l'API : les vingt lectures du domaine
#
#   python3 scripts/perf/bench-api.py <sortie.json> [essais=7]
#
# Les vingt appels du chargement du domaine (au démarrage ET à chaque événement
# temps réel « domain »). Pour chacun : temps (médiane des essais), poids reçu
# quand le client accepte la compression, poids brut, et poids qu'aurait la
# réponse compressée (gzip -6 local). Puis la rafale : les vingt en parallèle,
# comme le navigateur.
#
# Réglages (variables d'environnement) :
#   ARGOS_API    origine mesurée (http://localhost:3005 ; derrière le proxy de la
#                station : son origine, ex. http://localhost — la compression de
#                Traefik apparaît alors dans « reçu »)
#   ARGOS_TOKEN  jeton à utiliser ; à défaut, jeton de développement (API en mode dev)
#   ARGOS_USER   compte du jeton de développement (m.zraib)
#
# Aucune dépendance : curl et la bibliothèque standard de Python.
# ============================================================================
import gzip, json, os, statistics, subprocess, sys, time

BASE = os.environ.get("ARGOS_API", "http://localhost:3005").rstrip("/")
if len(sys.argv) < 2:
    sys.exit("usage : python3 scripts/perf/bench-api.py <sortie.json> [essais=7]")
SORTIE = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 7
# À tenir alignées sur apps/web/src/lib/store/slices/domain.ts (et commun.mjs).
CHEMINS = [
    "/api/incidents", "/api/units", "/api/hospitals", "/api/field-hospitals", "/api/feed",
    "/api/dispatch/queue", "/api/dispatch/movements", "/api/catalog", "/api/comms", "/api/reference",
    "/api/incident-types", "/api/dashboard/stats", "/api/sub-incident-types", "/api/comms/responsables",
    "/api/comms/notices", "/api/posts", "/api/shelters", "/api/morgues", "/api/resources/placed", "/api/incidents/map",
]


def jeton():
    if os.environ.get("ARGOS_TOKEN"):
        return os.environ["ARGOS_TOKEN"]
    corps = json.dumps({"username": os.environ.get("ARGOS_USER", "m.zraib"), "role": "superadmin"})
    out = subprocess.run(["curl", "-s", "-X", "POST", f"{BASE}/api/auth/dev-token", "-H", "Content-Type: application/json", "-d", corps],
                         capture_output=True, text=True).stdout
    try:
        return json.loads(out)["access_token"]
    except (ValueError, KeyError):
        sys.exit(f"jeton de développement refusé — l'API tourne-t-elle en mode dev sur {BASE} ? (sinon : ARGOS_TOKEN)")


def mesure(chemin, tok, compression):
    fmt = "%{http_code} %{size_download} %{time_starttransfer} %{time_total}"
    cmd = ["curl", "-s", "-o", "/dev/null", "-w", fmt, "-H", f"Authorization: Bearer {tok}", f"{BASE}{chemin}"]
    if compression:
        cmd[1:1] = ["-H", "Accept-Encoding: gzip, br"]
    code, taille, ttfb, total = subprocess.run(cmd, capture_output=True, text=True).stdout.split()
    return int(code), int(taille), float(ttfb) * 1000, float(total) * 1000


def corps(chemin, tok):
    return subprocess.run(["curl", "-s", "-H", f"Authorization: Bearer {tok}", f"{BASE}{chemin}"], capture_output=True).stdout


tok = jeton()
lignes = []
for c in CHEMINS:
    mesure(c, tok, True)  # chauffe
    essais = [mesure(c, tok, True) for _ in range(N)]
    brut = mesure(c, tok, False)
    lignes.append({
        "chemin": c,
        "code": essais[0][0],
        "octets_recus_compression_acceptee": essais[0][1],
        "octets_bruts": brut[1],
        "octets_si_gzip": len(gzip.compress(corps(c, tok), 6)),
        "ttfb_ms_mediane": round(statistics.median(e[2] for e in essais), 1),
        "total_ms_mediane": round(statistics.median(e[3] for e in essais), 1),
        "total_ms_max": round(max(e[3] for e in essais), 1),
    })


def rafale():
    """Le chargement du domaine tel que le fait le navigateur : les vingt appels en parallèle."""
    t0 = time.perf_counter()
    procs = [subprocess.Popen(["curl", "-s", "-o", "/dev/null", "-H", "Accept-Encoding: gzip, br", "-H", f"Authorization: Bearer {tok}", f"{BASE}{c}"])
             for c in CHEMINS]
    for p in procs:
        p.wait()
    return (time.perf_counter() - t0) * 1000


rafales = [rafale() for _ in range(N)]
res = {
    "origine": BASE,
    "horodatage": time.strftime("%Y-%m-%dT%H:%M:%S"),
    "essais": N,
    "appels": lignes,
    "total_octets_recus": sum(l["octets_recus_compression_acceptee"] for l in lignes),
    "total_octets_bruts": sum(l["octets_bruts"] for l in lignes),
    "total_octets_si_gzip": sum(l["octets_si_gzip"] for l in lignes),
    "somme_ms_medianes": round(sum(l["total_ms_mediane"] for l in lignes), 1),
    "rafale_parallele_ms_mediane": round(statistics.median(rafales), 1),
}
with open(SORTIE, "w") as f:
    json.dump(res, f, indent=2, ensure_ascii=False)
print(f"{'chemin':34} {'code':>4} {'reçu':>9} {'brut':>9} {'si gzip':>8} {'ttfb':>8} {'total':>8}")
for l in lignes:
    print(f"{l['chemin']:34} {l['code']:>4} {l['octets_recus_compression_acceptee']:>9} {l['octets_bruts']:>9} {l['octets_si_gzip']:>8} "
          f"{l['ttfb_ms_mediane']:>6}ms {l['total_ms_mediane']:>6}ms")
print(f"TOTAL reçu {res['total_octets_recus']} o · brut {res['total_octets_bruts']} o · si gzip {res['total_octets_si_gzip']} o · "
      f"somme {res['somme_ms_medianes']} ms · rafale parallèle {res['rafale_parallele_ms_mediane']} ms")
