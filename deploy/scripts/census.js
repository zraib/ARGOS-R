// ARGOS / IRIS - recensement des donnees de la station (ADR 0033)
//
// Fichier volontairement en ASCII : upgrade.ps1 le transmet a `node -` par un
// tube de Windows PowerShell 5.1, qui ne garde pas les accents.
//
// Lit les instantanes JSON du volume de l'API (/data) et imprime, sur UNE
// ligne JSON, le nombre d'elements de chaque collection : incidents, unites,
// hopitaux, abris, morgues, dossiers, croquis, messages, comptes... Aucune
// ecriture. upgrade.ps1 le lance avant et apres la mise a jour et compare :
// une mise a jour ne doit rien faire disparaitre.
//
//   docker run --rm -i -v iris_api_data:/data:ro iris-api:latest node - < census.js
"use strict";
const fs = require("fs");
const path = require("path");

const dir = process.env.CENSUS_DIR || "/data";

function read(name) {
  for (const f of [name + ".json", name + ".json.bak"]) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      // absent ou illisible : copie suivante
    }
  }
  return null;
}
const len = (a) => (Array.isArray(a) ? a.length : 0);
const out = {};

const d = read("domain") || {};
for (const k of ["incidents", "units", "hospitals", "fieldHospitals", "wards", "shelters", "morgues", "mortuaryRecords", "victims", "equipment", "posts", "drawings", "simulations"]) {
  out[k] = len(d[k]);
}
out.subIncidents = (d.incidents || []).reduce((n, i) => n + len(i && i.subIncidents), 0);
out.actionsLog = (d.incidents || []).reduce((n, i) => n + len(i && i.actionsLog), 0);

const c = read("comms") || {};
out.channels = (c.categories || []).reduce((n, cat) => n + len(cat && cat.chans), 0);
out.messages = Object.keys(c.messages || {}).reduce((n, k) => n + len(c.messages[k]), 0);
try {
  out.attachments = fs.readdirSync(path.join(dir, "attachments")).length;
} catch (e) {
  out.attachments = 0;
}

const iam = read("iam") || {};
out.users = len(iam.users);
out.missions = len(read("missions"));
const o = read("orders") || {};
out.orders = len(o.orders);
const r = read("resources") || {};
for (const k of ["persons", "teams", "vehicles", "supplies"]) out[k] = len(r[k]);
out.incidentTypes = len(read("incident-types"));
const t = read("tracking") || {};
out.trackers = len(t.trackers);

process.stdout.write(JSON.stringify(out) + "\n");
