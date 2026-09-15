#!/usr/bin/env python3
# ============================================================================
# ARGOS / IRIS — provisionnement HORS LIGNE des tuiles de la carte souveraine
#
# Un seul outil, sans dépendance hors de la bibliothèque standard :
#
#   status                 ce que le volume contient (fichiers, zooms, nombre de tuiles)
#   fetch sat|dem          télécharge une source XYZ dans un MBTiles, par zones
#   assets                 polices et style OSM Bright → styles « plan » et « lbl »
#   pbf                    extrait OpenStreetMap du Maroc (Geofabrik) pour planetiler et Valhalla,
#                          et les jeux annexes de planetiler que GitHub héberge
#   placeholder            MBTiles VIDES (sat, dem) pour que le serveur démarre sans imagerie
#   estimate sat|dem       compte les tuiles du profil sans rien télécharger
#
# Le MBTiles est écrit au format de la spécification 1.3 (table `tiles`,
# lignes numérotées en TMS — l'axe y inversé par rapport au XYZ des URL) :
# c'est ce que tileserver-gl et martin lisent. Un téléchargement interrompu
# REPREND là où il s'est arrêté : les tuiles déjà en base sont sautées.
#
# Ce que l'outil ne décide PAS : la source d'imagerie. `SAT_TILE_URL` doit
# désigner une source pour laquelle l'organisme détient un droit d'usage hors
# ligne (mosaïque institutionnelle, service ArcGIS sous licence, Sentinel-2).
# Aspirer en masse un service public (Esri World Imagery, tuiles OSM) viole
# leurs conditions d'utilisation : l'outil ne le fait pas à votre place.
# ============================================================================

from __future__ import annotations

import argparse
import io
import json
import math
import os
import shutil
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

TILES_DIR = Path(os.environ.get("TILES_DIR", "/data"))
ZONES_FILE = Path(os.environ.get("ZONES_FILE", "/config/zones.json"))
PBF_DIR = Path(os.environ.get("PBF_DIR", "/pbf"))
# Cache des sources de planetiler (volume planetiler_cache) — pour y déposer ce
# que planetiler ne peut pas télécharger lui-même quand github.com est bloqué.
PLANETILER_SOURCES = Path(os.environ.get("PLANETILER_SOURCES", "/planetiler-sources"))
USER_AGENT = "ARGOS-IRIS-tiles/1.0 (provisionnement hors ligne)"
# Style OSM Bright courant et ses glyphes, fichier par fichier, depuis
# raw.githubusercontent.com. Source PRINCIPALE : les polices « Klokantech Noto
# Sans » y couvrent l'arabe, ce que l'archive de démonstration (Open Sans) ne
# fait pas — au Maroc, la moitié des toponymes s'écrivent en arabe.
OSM_BRIGHT_URL = os.environ.get("OSM_BRIGHT_URL", "https://raw.githubusercontent.com/openmaptiles/osm-bright-gl-style/master/style.json")
GLYPHS_URL = os.environ.get("GLYPHS_URL", "https://raw.githubusercontent.com/openmaptiles/fonts/gh-pages/{fontstack}/{range}.pbf")
# Les noms que le style demande → ceux que l'hébergement des glyphes connaît.
FONT_ALIASES = {
    "Noto Sans Regular": "Klokantech Noto Sans Regular",
    "Noto Sans Bold": "Klokantech Noto Sans Bold",
    "Noto Sans Italic": "Klokantech Noto Sans Italic",
}
# REPLI : les données de démonstration officielles de tileserver-gl (polices
# Open Sans, latin seulement, et style OSM Bright), si raw.githubusercontent.com
# est inaccessible mais github.com ouvert.
ASSETS_URL = os.environ.get("TILESERVER_ASSETS_URL", "https://github.com/maptiler/tileserver-gl/releases/download/v1.3.0/test_data.zip")
PBF_URL = os.environ.get("PBF_URL", "https://download.geofabrik.de/africa/morocco-latest.osm.pbf")
# Lignes centrales des lacs (planetiler) : hébergées sur github.com. Sans
# elles, seuls les noms des lacs se placent moins bien — un fichier VIDE mais
# valide suffit pour que planetiler continue.
LAKES_URL = os.environ.get("LAKES_URL", "https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip")


# --- géométrie des tuiles (Web Mercator) ---------------------------------------

def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    """Indice XYZ de la tuile contenant un point, au zoom z."""
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(max(min(lat, 85.05112878), -85.05112878))
    y = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tiles_in_bbox(bbox: list[float], z: int):
    """Toutes les tuiles (z, x, y) couvrant une emprise [ouest, sud, est, nord]."""
    w, s, e, n = bbox
    x0, y0 = lonlat_to_tile(w, n, z)
    x1, y1 = lonlat_to_tile(e, s, z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            yield z, x, y


def count_in_bbox(bbox: list[float], z: int) -> int:
    w, s, e, n = bbox
    x0, y0 = lonlat_to_tile(w, n, z)
    x1, y1 = lonlat_to_tile(e, s, z)
    return (x1 - x0 + 1) * (y1 - y0 + 1)


# --- MBTiles ----------------------------------------------------------------

class MBTiles:
    """Écriture incrémentale d'un MBTiles raster (spécification 1.3)."""

    def __init__(self, path: Path, fmt: str, name: str, bounds: list[float] | None = None, kind: str = "baselayer"):
        self.path = path
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT)")
        self.db.execute("CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
        self.db.execute("CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row)")
        self.set_meta("name", name)
        self.set_meta("format", fmt)
        self.set_meta("type", kind)
        self.set_meta("version", "1.3")
        if bounds:
            self.set_meta("bounds", ",".join(str(round(v, 6)) for v in bounds))
        self.db.commit()

    def set_meta(self, key: str, value: str) -> None:
        self.db.execute("DELETE FROM metadata WHERE name = ?", (key,))
        self.db.execute("INSERT INTO metadata (name, value) VALUES (?, ?)", (key, value))

    def has(self, z: int, x: int, y: int) -> bool:
        row = 2 ** z - 1 - y
        return self.db.execute("SELECT 1 FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?", (z, x, row)).fetchone() is not None

    def existing(self, z: int) -> set[tuple[int, int]]:
        """Colonnes/lignes déjà présentes à un zoom — en XYZ."""
        n = 2 ** z
        return {(x, n - 1 - row) for x, row in self.db.execute("SELECT tile_column, tile_row FROM tiles WHERE zoom_level=?", (z,))}

    def put(self, z: int, x: int, y: int, data: bytes) -> None:
        row = 2 ** z - 1 - y
        self.db.execute("INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)", (z, x, row, sqlite3.Binary(data)))

    def finalize_zooms(self) -> None:
        lo, hi = self.db.execute("SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles").fetchone()
        if lo is not None:
            self.set_meta("minzoom", str(lo))
            self.set_meta("maxzoom", str(hi))
        self.db.commit()

    def commit(self) -> None:
        self.db.commit()

    def close(self) -> None:
        self.finalize_zooms()
        # Retour au journal classique : tileserver-gl monte le volume en lecture
        # seule, et un fichier resté en mode WAL exige ses -wal/-shm à côté.
        self.db.execute("PRAGMA journal_mode=DELETE")
        self.db.close()


# --- zones -------------------------------------------------------------------

def load_zones(source: str) -> list[dict]:
    """Les zones actives d'une source (`sat` ou `dem`) — voir zones.json."""
    if not ZONES_FILE.exists():
        sys.exit(f"Fichier de zones introuvable : {ZONES_FILE}")
    conf = json.loads(ZONES_FILE.read_text(encoding="utf-8"))
    zones = [z for z in conf.get(source, []) if z.get("enabled", True)]
    if not zones:
        sys.exit(f"Aucune zone active pour « {source} » dans {ZONES_FILE}")
    return zones


def plan_tiles(zones: list[dict]):
    """(z, x, y) de toutes les zones, dédoublonnés — une tuile n'est demandée qu'une fois."""
    seen: set[tuple[int, int, int]] = set()
    for zone in zones:
        for z in range(zone["minzoom"], zone["maxzoom"] + 1):
            for t in tiles_in_bbox(zone["bbox"], z):
                if t not in seen:
                    seen.add(t)
                    yield t


def estimate(zones: list[dict]) -> dict[int, int]:
    """Tuiles par zoom (borne haute : les recouvrements de zones comptent deux fois)."""
    per_zoom: dict[int, int] = {}
    for zone in zones:
        for z in range(zone["minzoom"], zone["maxzoom"] + 1):
            per_zoom[z] = per_zoom.get(z, 0) + count_in_bbox(zone["bbox"], z)
    return per_zoom


# --- téléchargement ----------------------------------------------------------

def fetch_one(url: str, retries: int = 4, timeout: int = 30) -> bytes | None:
    """Une tuile. `None` si elle n'existe pas (404) ; relance sur erreur passagère."""
    delay = 1.0
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 204):
                return None
            if e.code == 429 or e.code >= 500:
                time.sleep(delay)
                delay *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay)
            delay *= 2
    return None


def cmd_fetch(args: argparse.Namespace) -> None:
    source = args.source
    template = args.source_url or os.environ.get("SAT_TILE_URL" if source == "sat" else "DEM_TILE_URL", "")
    if not template:
        sys.exit(f"Aucun gabarit d'URL pour « {source} » : passer --source-url ou renseigner {'SAT_TILE_URL' if source == 'sat' else 'DEM_TILE_URL'} dans deploy/.env")
    for ph in ("{z}", "{x}", "{y}"):
        if ph not in template:
            sys.exit(f"Le gabarit doit contenir {{z}}, {{x}} et {{y}} — reçu : {template}")
    fmt = args.format or ("png" if source == "dem" else "jpg")
    zones = load_zones(source)
    if args.zones:
        wanted = set(args.zones.split(","))
        zones = [z for z in zones if z["name"] in wanted]
    total = sum(estimate(zones).values())
    TILES_DIR.mkdir(parents=True, exist_ok=True)
    out = TILES_DIR / f"{source}.mbtiles"
    print(f"{source} → {out} · {len(zones)} zone(s) · ≤ {total:,} tuiles · {args.workers} téléchargements en parallèle")
    mb = MBTiles(out, fmt, f"IRIS {source}", bounds=union_bbox(zones), kind="baselayer")
    if source == "dem":
        mb.set_meta("encoding", "terrarium")
    done = skipped = missing = failed = 0
    t0 = time.time()
    batch: list[tuple[int, int, int]] = []

    def flush(batch: list[tuple[int, int, int]]) -> None:
        nonlocal done, missing, failed
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(fetch_one, template.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))): (z, x, y) for z, x, y in batch}
            for fut in as_completed(futures):
                z, x, y = futures[fut]
                try:
                    data = fut.result()
                except Exception as e:  # noqa: BLE001 — une tuile ratée ne doit pas arrêter le lot
                    failed += 1
                    if failed <= 5:
                        print(f"  échec {z}/{x}/{y} : {e}", file=sys.stderr)
                    continue
                if data is None:
                    missing += 1
                    continue
                mb.put(z, x, y, data)
                done += 1
        mb.commit()
        elapsed = time.time() - t0
        rate = done / elapsed if elapsed > 0 else 0
        print(f"  {done + skipped:,}/{total:,} ({100 * (done + skipped) / max(total, 1):.1f} %) · {rate:.0f} tuiles/s · absentes {missing} · échecs {failed}")

    current_z = None
    present: set[tuple[int, int]] = set()
    for z, x, y in plan_tiles(zones):
        if z != current_z:
            current_z = z
            present = mb.existing(z)
        if (x, y) in present:
            skipped += 1
            continue
        batch.append((z, x, y))
        if len(batch) >= args.batch:
            flush(batch)
            batch = []
    if batch:
        flush(batch)
    mb.close()
    print(f"Terminé : {done:,} téléchargées, {skipped:,} déjà présentes, {missing} inexistantes à la source, {failed} en échec → {out} ({out.stat().st_size / 1e6:.0f} Mo)")
    if failed:
        print("Relancer la même commande : seules les tuiles manquantes seront redemandées.")


def union_bbox(zones: list[dict]) -> list[float]:
    ws = [z["bbox"][0] for z in zones]; ss = [z["bbox"][1] for z in zones]
    es = [z["bbox"][2] for z in zones]; ns = [z["bbox"][3] for z in zones]
    return [min(ws), min(ss), max(es), max(ns)]


def cmd_estimate(args: argparse.Namespace) -> None:
    zones = load_zones(args.source)
    per_zoom = estimate(zones)
    kb = 30 if args.source == "dem" else 22
    total = 0
    print(f"{args.source} — {len(zones)} zone(s) active(s) : " + ", ".join(z["name"] for z in zones))
    for z in sorted(per_zoom):
        total += per_zoom[z]
        print(f"  zoom {z:>2} : {per_zoom[z]:>12,} tuiles")
    print(f"  total   : {total:>12,} tuiles ≈ {total * kb / 1e6:.1f} Go (à ~{kb} Ko par tuile)")


# --- polices, sprites, styles ---------------------------------------------------

def _derive_styles(style_json: dict, styles_dir: Path) -> None:
    """« plan » (OSM Bright sur plan-vector, sans pictogrammes) et « lbl » (étiquettes seules)."""
    plan = dict(style_json)
    plan["name"] = "IRIS plan"
    plan["sources"] = {"openmaptiles": {"type": "vector", "url": "mbtiles://{plan-vector}"}}
    plan["glyphs"] = "{fontstack}/{range}.pbf"
    plan.pop("sprite", None)
    # Sans sprites (icônes) : les calques qui en dépendent sont retirés — un
    # fond de plan se lit sans pictogrammes de commerces, et rien ne peut
    # manquer au rendu.
    plan["layers"] = [l for l in style_json["layers"] if "icon-image" not in (l.get("layout") or {}) and l.get("source", "openmaptiles") == "openmaptiles"]
    for l in plan["layers"]:
        l["source"] = "openmaptiles"
    # Intégrité territoriale (ADR 0014, même règle que lib/map/plan.ts côté
    # web) : aucune frontière contestée n'est tracée — la couche qui les
    # dessine en pointillé disparaît et toute couche de frontières exclut
    # `disputed = 1`. La frontière du Royaume court ainsi sans rupture jusqu'à
    # la Mauritanie et à l'Algérie.
    plan["layers"] = [l for l in plan["layers"] if not (l.get("source-layer") == "boundary" and "disputed" in l.get("id", "").lower())]
    for l in plan["layers"]:
        if l.get("source-layer") == "boundary":
            cond = ["!=", ["get", "disputed"], 1] if _is_expression_filter(l.get("filter")) else ["!=", "disputed", 1]
            l["filter"] = ["all", l["filter"], cond] if l.get("filter") is not None else cond
    (styles_dir / "plan").mkdir(parents=True, exist_ok=True)
    (styles_dir / "plan" / "style.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    # « lbl » : les seuls calques d'étiquettes, sur fond transparent — la
    # surcouche de toponymes posée au-dessus de l'imagerie.
    lbl = dict(plan)
    lbl["name"] = "IRIS toponymes"
    lbl["layers"] = [l for l in plan["layers"] if l.get("type") == "symbol"]
    (styles_dir / "lbl").mkdir(parents=True, exist_ok=True)
    (styles_dir / "lbl" / "style.json").write_text(json.dumps(lbl, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  styles  : plan ({len(plan['layers'])} calques) · lbl ({len(lbl['layers'])} calques d'étiquettes) → {styles_dir}")


def _is_expression_filter(f) -> bool:
    """Même règle que MapLibre : un filtre est une expression (`["==", ["get", "k"], v]`) ou de l'ancienne syntaxe (`["==", "k", v]`) ; on ne les mélange pas."""
    if f is True or f is False:
        return True
    if not isinstance(f, list) or not f:
        return False
    op, rest = f[0], f[1:]
    if op == "has":
        return len(f) >= 2 and rest[0] not in ("$id", "$type")
    if op == "in":
        return len(f) >= 3 and (not isinstance(rest[0], str) or isinstance(rest[1], list))
    if op in ("!in", "!has", "none"):
        return False
    if op in ("==", "!=", ">", ">=", "<", "<="):
        return len(f) != 3 or isinstance(rest[0], list) or isinstance(rest[1], list)
    if op in ("any", "all"):
        return all(isinstance(x, bool) or _is_expression_filter(x) for x in rest)
    return True


def _fonts_needed(style_json: dict) -> list[str]:
    fonts: set[str] = set()
    for l in style_json["layers"]:
        fonts.update((l.get("layout") or {}).get("text-font", []))
    return sorted(fonts)


def _assets_from_archive(fonts_dir: Path, sprites_dir: Path) -> dict | None:
    """Polices et style depuis l'archive officielle de tileserver-gl ; `None` si elle est inaccessible."""
    print(f"  repli : archive de démonstration {ASSETS_URL} (polices latines seulement)")
    try:
        req = urllib.request.Request(ASSETS_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r:
            blob = r.read()
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        print(f"  archive inaccessible ({e})")
        return None
    zf = zipfile.ZipFile(io.BytesIO(blob))
    n_fonts = 0
    style_json = None
    for name in zf.namelist():
        parts = name.split("/")
        if "fonts" in parts and name.endswith(".pbf"):
            target = fonts_dir.joinpath(*parts[parts.index("fonts") + 1:])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(name))
            n_fonts += 1
        elif name.endswith("style.json") and "osm-bright" in name.lower():
            style_json = json.loads(zf.read(name).decode("utf-8"))
        elif "sprites" in parts and (name.endswith(".png") or name.endswith(".json")):
            target = sprites_dir.joinpath(*parts[parts.index("sprites") + 1:])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(name))
    print(f"  polices : {n_fonts} fichiers de glyphes (archive)")
    return style_json


def _apply_font_aliases(style_json: dict) -> None:
    for l in style_json["layers"]:
        layout = l.get("layout") or {}
        if "text-font" in layout:
            layout["text-font"] = [FONT_ALIASES.get(f, f) for f in layout["text-font"]]


def _assets_from_raw(fonts_dir: Path) -> dict | None:
    """Style OSM Bright courant et ses glyphes, fichier par fichier (256 plages par police) ; `None` si l'hôte est inaccessible."""
    print(f"  style   : {OSM_BRIGHT_URL}")
    try:
        req = urllib.request.Request(OSM_BRIGHT_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as r:
            style_json = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        print(f"  raw.githubusercontent.com inaccessible ({e})")
        return None
    _apply_font_aliases(style_json)
    fonts = _fonts_needed(style_json)
    ranges = [f"{i * 256}-{i * 256 + 255}" for i in range(256)]
    jobs = [(f, rg) for f in fonts for rg in ranges if not (fonts_dir / f / f"{rg}.pbf").exists()]
    print(f"  glyphes : {len(fonts)} polices ({', '.join(fonts)}) · {len(jobs)} fichiers à télécharger")
    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_one, GLYPHS_URL.replace("{fontstack}", urllib.request.quote(f)).replace("{range}", rg)): (f, rg) for f, rg in jobs}
        for fut in as_completed(futures):
            f, rg = futures[fut]
            data = fut.result()
            if data:
                target = fonts_dir / f / f"{rg}.pbf"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                done += 1
    print(f"  polices : {done} fichiers de glyphes (raw.githubusercontent.com)")
    manquantes = [f for f in fonts if not (fonts_dir / f / "0-255.pbf").exists()]
    if manquantes:
        print(f"  polices introuvables : {manquantes} — vérifier GLYPHS_URL")
        return None
    return style_json


def cmd_assets(args: argparse.Namespace) -> None:
    """Polices, sprites et style OSM Bright → styles « plan » et « lbl » du serveur."""
    TILES_DIR.mkdir(parents=True, exist_ok=True)
    fonts_dir = TILES_DIR / "fonts"
    sprites_dir = TILES_DIR / "sprites"
    styles_dir = TILES_DIR / "styles"
    for d in (fonts_dir, sprites_dir, styles_dir):
        d.mkdir(parents=True, exist_ok=True)
    print("Ressources du fond de plan (style OSM Bright et glyphes)")
    style_json = _assets_from_raw(fonts_dir)
    if style_json is None:
        style_json = _assets_from_archive(fonts_dir, sprites_dir)
    if style_json is None:
        sys.exit("Aucune source de polices accessible — réessayer quand le réseau le permet, ou déposer fonts/ et styles/ à la main (voir infra/geo/README.md)")
    _derive_styles(style_json, styles_dir)


# --- extrait OSM ------------------------------------------------------------

def _empty_shapefile_zip(target: Path, stem: str, shape_type: int = 3) -> None:
    """Un shapefile sans aucune entité, mais complet (.shp .shx .dbf .prj) — lisible par planetiler/GeoTools."""
    import struct
    header = struct.pack(">i5i", 9994, 0, 0, 0, 0, 0) + struct.pack(">i", 50) + struct.pack("<ii", 1000, shape_type) + struct.pack("<8d", *([0.0] * 8))
    dbf = bytes([0x03, 26, 1, 1]) + struct.pack("<IHH", 0, 65, 11) + bytes(20)
    dbf += b"OSM_ID".ljust(11, b"\0") + b"N" + bytes(4) + bytes([10, 0]) + bytes(14) + b"\r\x1a"
    prj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{stem}.shp", header)
        zf.writestr(f"{stem}.shx", header)
        zf.writestr(f"{stem}.dbf", dbf)
        zf.writestr(f"{stem}.prj", prj)


def cmd_pbf(args: argparse.Namespace) -> None:
    PBF_DIR.mkdir(parents=True, exist_ok=True)
    target = PBF_DIR / "morocco-latest.osm.pbf"
    if target.exists() and not args.force:
        print(f"Déjà présent : {target} ({target.stat().st_size / 1e6:.0f} Mo) — --force pour retélécharger")
    else:
        print(f"Téléchargement : {PBF_URL} → {target}")
        req = urllib.request.Request(PBF_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r, open(target, "wb") as f:
            shutil.copyfileobj(r, f, length=1 << 20)
        print(f"Terminé : {target.stat().st_size / 1e6:.0f} Mo")
    # Les lignes centrales des lacs vivent sur github.com, que planetiler ne
    # saura pas contourner s'il est bloqué : on les dépose ici, ou un fichier
    # vide mais valide à leur place — planetiler lit ce qu'il trouve.
    PLANETILER_SOURCES.mkdir(parents=True, exist_ok=True)
    lakes = PLANETILER_SOURCES / "lake_centerline.shp.zip"
    if lakes.exists() and not args.force:
        print(f"Lacs : {lakes} présent ({lakes.stat().st_size / 1e6:.1f} Mo)")
        return
    data = fetch_one(LAKES_URL, retries=2, timeout=30)
    if data and len(data) > 100_000:
        lakes.write_bytes(data)
        print(f"Lacs : téléchargés ({len(data) / 1e6:.1f} Mo)")
    else:
        _empty_shapefile_zip(lakes, "lake_centerline")
        print("Lacs : github.com inaccessible — fichier vide déposé (les noms de lacs se placent moins finement, rien d'autre ne change)")


# --- fichiers vides ---------------------------------------------------------

def cmd_placeholder(args: argparse.Namespace) -> None:
    """Des MBTiles vides mais valides : le serveur démarre, la carte n'a simplement pas cette couche."""
    TILES_DIR.mkdir(parents=True, exist_ok=True)
    for source, fmt in (("sat", "jpg"), ("dem", "png")):
        out = TILES_DIR / f"{source}.mbtiles"
        if out.exists():
            print(f"  {out.name} : présent, conservé")
            continue
        mb = MBTiles(out, fmt, f"IRIS {source} (vide)", bounds=[-17.2, 20.7, -0.95, 36.0])
        mb.set_meta("minzoom", "0"); mb.set_meta("maxzoom", "0")
        if source == "dem":
            mb.set_meta("encoding", "terrarium")
        mb.commit(); mb.close()
        print(f"  {out.name} : créé vide")


# --- état ---------------------------------------------------------------------

def cmd_status(args: argparse.Namespace) -> None:
    print(f"Volume des tuiles : {TILES_DIR}")
    found = False
    for f in sorted(TILES_DIR.glob("*.mbtiles")):
        found = True
        try:
            db = sqlite3.connect(f"file:{f}?mode=ro", uri=True)
            meta = dict(db.execute("SELECT name, value FROM metadata"))
            per_zoom = db.execute("SELECT zoom_level, COUNT(*) FROM tiles GROUP BY zoom_level ORDER BY zoom_level").fetchall()
            db.close()
            total = sum(c for _, c in per_zoom)
            zooms = f"z{per_zoom[0][0]}–{per_zoom[-1][0]}" if per_zoom else "aucune tuile"
            print(f"  {f.name:<22} {f.stat().st_size / 1e6:>8.0f} Mo · {meta.get('format', '?'):<4} · {total:>11,} tuiles · {zooms}")
        except sqlite3.Error as e:
            print(f"  {f.name:<22} illisible : {e}")
    for d, what in (("fonts", "polices"), ("styles", "styles"), ("sprites", "sprites")):
        p = TILES_DIR / d
        if p.exists():
            found = True
            print(f"  {d + '/':<22} {what} : {sum(1 for _ in p.rglob('*') if _.is_file())} fichiers")
    if not found:
        print("  (vide) — voir infra/geo/README.md")
    pbf = PBF_DIR / "morocco-latest.osm.pbf"
    if pbf.exists():
        print(f"  extrait OSM (Valhalla / planetiler) : {pbf} ({pbf.stat().st_size / 1e6:.0f} Mo)")


def main() -> None:
    p = argparse.ArgumentParser(description="ARGOS / IRIS — provisionnement des tuiles souveraines")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status", help="état du volume").set_defaults(fn=cmd_status)
    f = sub.add_parser("fetch", help="télécharger une source XYZ dans un MBTiles")
    f.add_argument("source", choices=["sat", "dem"])
    f.add_argument("--source-url", help="gabarit d'URL avec {z} {x} {y} (sinon SAT_TILE_URL / DEM_TILE_URL)")
    f.add_argument("--zones", help="zones à traiter, séparées par des virgules (défaut : toutes les zones actives)")
    f.add_argument("--format", choices=["jpg", "png", "webp"], help="format déclaré du MBTiles (défaut : jpg pour sat, png pour dem)")
    f.add_argument("--workers", type=int, default=int(os.environ.get("TILES_WORKERS", "8")), help="téléchargements simultanés")
    f.add_argument("--batch", type=int, default=2000, help="tuiles par lot (une écriture disque par lot)")
    f.set_defaults(fn=cmd_fetch)
    e = sub.add_parser("estimate", help="compter les tuiles d'un profil sans télécharger")
    e.add_argument("source", choices=["sat", "dem"])
    e.set_defaults(fn=cmd_estimate)
    sub.add_parser("assets", help="polices, sprites et styles plan/lbl").set_defaults(fn=cmd_assets)
    b = sub.add_parser("pbf", help="extrait OSM du Maroc (Geofabrik)")
    b.add_argument("--force", action="store_true")
    b.set_defaults(fn=cmd_pbf)
    sub.add_parser("placeholder", help="MBTiles vides sat/dem").set_defaults(fn=cmd_placeholder)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
