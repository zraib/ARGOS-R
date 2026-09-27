#!/usr/bin/env python3
# ============================================================================
# scripts/perf/attribution.py — à quel module appartient chaque octet du code
# INITIAL d'une route (les chunks que cite son HTML prérendu)
#
#   ARGOS_SOURCEMAPS=1 npm run build --prefix apps/web
#   python3 scripts/perf/attribution.py apps/web/.next dashboard [n=25]
#
# Décode les cartes des sources (mappings VLQ, cartes à sections comprises) et
# totalise par paquet npm et par fichier de l'application. Les cartes ne sont
# produites que sur demande (`ARGOS_SOURCEMAPS=1`, next.config.mjs) : un build
# ordinaire n'en livre aucune. Méthode : docs/07-performance.md.
# ============================================================================
import json, os, re, sys, collections

B64 = {c: i for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")}

def vlq(seg):
    out, val, shift = [], 0, 0
    for ch in seg:
        d = B64[ch]
        val += (d & 31) << shift
        if d & 32:
            shift += 5
        else:
            out.append(-(val >> 1) if val & 1 else val >> 1)
            val, shift = 0, 0
    return out

def attribuer(js_path, map_path, compte):
    code = open(js_path, encoding="utf8", errors="ignore").read().split("\n")
    m = json.load(open(map_path))
    sections = m.get("sections")
    cartes = [(s["offset"]["line"], s["offset"]["column"], s["map"]) for s in sections] if sections else [(0, 0, m)]
    for (l0, c0, mp) in cartes:
        sources = mp.get("sources", [])
        src = 0
        for li, ligne in enumerate(mp.get("mappings", "").split(";")):
            gl = l0 + li
            if gl >= len(code):
                break
            texte = code[gl]
            col = c0 if li == 0 else 0
            segs = []
            for seg in ligne.split(","):
                if not seg:
                    continue
                v = vlq(seg)
                col += v[0]
                if len(v) >= 4:
                    src += v[1]
                    segs.append((col, src))
                else:
                    segs.append((col, None))
            for k, (c, s) in enumerate(segs):
                fin = segs[k + 1][0] if k + 1 < len(segs) else len(texte)
                nom = sources[s] if s is not None and 0 <= s < len(sources) else "(sans source)"
                compte[nom] += max(0, fin - c)

base, route = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 25
html = open(f"{base}/server/app/{route}.html", encoding="utf8", errors="ignore").read()
refs = sorted(set(re.findall(r'static/chunks/[A-Za-z0-9_\-\.]+\.js', html)))
compte = collections.Counter()
for r in refs:
    js = f"{base}/{r}"
    fin = open(js, encoding="utf8", errors="ignore").read()[-200:]
    m = re.search(r"sourceMappingURL=([^\s]+)", fin)
    carte = os.path.join(os.path.dirname(js), m.group(1)) if m else js + ".map"
    if os.path.exists(carte):
        attribuer(js, carte, compte)
total = sum(compte.values())

def groupe(n):
    n = re.sub(r"^(turbopack:///|webpack://)", "", n).replace("[project]/", "")
    if "node_modules/" in n:
        rest = n.split("node_modules/")[-1].split("/")
        return "npm:" + ("/".join(rest[:2]) if rest[0].startswith("@") else rest[0])
    n = n.split("apps/web/src/")[-1]
    parts = n.split("/")
    return "/".join(parts[:2]) if len(parts) > 2 else n

g = collections.Counter()
for n, c in compte.items():
    g[groupe(n)] += c
print(f"route {route} : {len(refs)} chunks initiaux, {total/1024:.0f} Ko attribués")
for k, c in g.most_common(N):
    print(f"{c/1024:8.1f} Ko  {k}")
print("\n— fichiers de l'application les plus lourds :")
def propre(n):
    return re.sub(r"^(turbopack:///|webpack://)", "", n).replace("[project]/", "").split("apps/web/")[-1]
app = collections.Counter()
for n, c in compte.items():
    q = propre(n)
    if "node_modules" not in q and q.startswith("src/"):
        app[q] += c
for k, c in app.most_common(N):
    print(f"{c/1024:8.1f} Ko  {k}")
