// ============================================================================
// ARGOS — chaînes d'interface (FR / AR / EN)
// Le FR est la langue de référence (MASTER_PLAN §A5). L'AR déclenche le RTL et
// la police Amiri. Les clés reprennent le prototype pour rester 1:1 avec l'export.
// ============================================================================

import type { Lang } from "@/lib/types";

export interface Dict {
  app: string;
  appSub: string;
  role: string;
  nav_dash: string;
  nav_map: string;
  nav_seismic: string;
  nav_weather: string;
  nav_inc: string;
  nav_units: string;
  nav_hosp: string;
  report: string;
  live: string;
  lvl1: string;
  lvl2: string;
  lvl3: string;
  lvl4: string;
  kpi_inc: string;
  kpi_pers: string;
  kpi_beds: string;
  kpi_units: string;
  layoutA: string;
  layoutB: string;
  overview: string;
  chart_types: string;
  chart_regions: string;
  chart_moyens: string;
  ops: string;
  feed: string;
  col_id: string;
  col_incident: string;
  col_region: string;
  col_sev: string;
  col_status: string;
  col_time: string;
  col_actions: string;
  search: string;
  to_map: string;
  sev_high: string;
  sev_med: string;
  sev_low: string;
  st_open: string;
  st_prog: string;
  st_closed: string;
  ty_earthquake: string;
  ty_flood: string;
  ty_wildfire: string;
  ty_landslide: string;
  ty_epidemic: string;
  ty_industrial: string;
  u_ready: string;
  u_deployed: string;
  u_standby: string;
  personnel: string;
  equipment: string;
  vehicles: string;
  commander: string;
  readiness: string;
  effectif: string;
  view: string;
  back: string;
  h_name: string;
  h_grade: string;
  h_role: string;
  h_status: string;
  h_desig: string;
  h_cat: string;
  h_qty: string;
  h_state: string;
  h_typev: string;
  h_plate: string;
  h_assign: string;
  h_spec: string;
  med_staff: string;
  beds: string;
  field: string;
  deploy_field: string;
  beds_total: string;
  beds_occ: string;
  beds_free: string;
  icu: string;
  occupancy: string;
  op_ok: string;
  op_partial: string;
  since: string;
  capacity: string;
  staff: string;
  wiz_title: string;
  wz1: string;
  wz2: string;
  wz3: string;
  f_title: string;
  f_desc: string;
  f_attach: string;
  f_attach_hint: string;
  f_prov: string;
  f_coords: string;
  pick_map: string;
  prev: string;
  next: string;
  submit: string;
  cancel: string;
  toast_ok: string;
  toast_field: string;
  layers: string;
  legend: string;
  sel_none: string;
  lg_veh: string;
  now: string;
  base_sat: string;
  base_plan: string;
  lg_units: string;
  lg_hosp: string;
  nav_triage: string;
  nav_res: string;
  nav_equip: string;
  nav_pers: string;
  nav_wo: string;
  nav_dis: string;
  nav_ics: string;
  nav_damage: string;
  nav_shelters: string;
  nav_cmd: string;
  nav_orsec: string;
  nav_plans: string;
  nav_comms: string;
  nav_reports: string;
  nav_analytics: string;
  nav_dispatch: string;
  nav_assistant: string;
  nav_users: string;
  nav_settings: string;
  stub_msg: string;
  cm_new_cat: string;
  cm_new_chan: string;
  cm_new_cat_ph: string;
  cm_msg_ph: string;
  cm_members: string;
  cm_online: string;
  cm_offline: string;
  cm_voice: string;
  cm_join: string;
  cm_connected: string;
  cm_joined: string;
  lg_welcome: string;
  lg_user: string;
  lg_pass: string;
  lg_btn: string;
  lg_restricted: string;
  lg_footer: string;
  lg_toast: string;
  lg_badpass: string;
  lg_api_down: string;
  lg_role_demo: string;
  logout: string;
  add_unit: string;
  add_hosp: string;
  lbl_city: string;
  lbl_create: string;
  lbl_amb: string;
  lbl_heli: string;
  toast_unit: string;
  toast_hosp: string;
  pr_settings: string;
  pr_title: string;
  pr_roles: string;
  pr_active_role: string;
  pr_submit: string;
  pr_name: string;
  pr_photo: string;
  pr_photo_remove: string;
  pr_photo_err: string;
  pr_profile_saved: string;
  pr_pw_submit: string;
  pr_saved: string;
  wz_mode_prov: string;
  wz_mode_city: string;
  wz_mode_address: string;
  f_city: string;
  wz_prov_anchor: string;
  wz_fullscreen: string;
  wz_exit_full: string;
  wz_map_hint: string;
  wz4: string;
  wz_casualties: string;
  wz_dead: string;
  wz_injured: string;
  wz_missing: string;
  wz_units_near: string;
  wz_hospitals_near: string;
  wz_suggested: string;
  act_view: string;
  act_edit: string;
  act_archive: string;
  flt_type: string;
  flt_sev: string;
  flt_region: string;
  flt_status: string;
  flt_all: string;
  sort_by: string;
  sort_time: string;
  sort_sev: string;
  sort_status: string;
  det_title: string;
  edit_title: string;
  save: string;
  det_responders: string;
  flt_clear: string;
  tab_active: string;
  tab_archived: string;
  act_unarchive: string;
  st_change_title: string;
  st_change_hint: string;
  st_change_pass: string;
  confirm: string;
  arch_title: string;
  arch_body: string;
  yes: string;
  no: string;
  det_personnel: string;
  det_vehicles: string;
  si_title: string;
  si_add: string;
  si_type: string;
  si_note: string;
  si_none: string;
  si_choose: string;
  si_added: string;
  si_removed: string;
  si_details: string;
  si_optional: string;
  si_loc_hint: string;
  map_measure: string;
  map_alt: string;
  map_distance: string;
  fam_forces: string;
  fam_health: string;
  map_measure_hint: string;
  map_route: string;
  map_direct: string;
  map_points: string;
  map_eta: string;
  wz_mode_coords: string;
  wz_mode_map: string;
  wz_mode_geo: string;
  wz_geo_btn: string;
  wz_geo_err: string;
  wz_lat: string;
  wz_lng: string;
  f_addr: string;
  dash_evolution: string;
  dash_opened: string;
  dash_closed: string;
  dash_hosp: string;
  dash_expand: string;
}

export const LANGS: Record<Lang, Dict> = {
  fr: {
    app: "ARGOS", appSub: "Gestion des Catastrophes · Forces Armées Royales", role: "Chef de Division",
    nav_dash: "Tableau de bord", nav_map: "Carte opérationnelle", nav_seismic: "Sismologie", nav_weather: "Météo", nav_inc: "Incidents", nav_units: "Équipes", nav_hosp: "Hospinet",
    report: "Signaler un incident", live: "DIRECT",
    lvl1: "NIVEAU 1 · ROUTINE", lvl2: "NIVEAU 2 · VIGILANCE", lvl3: "NIVEAU 3 · VIGILANCE RENFORCÉE", lvl4: "NIVEAU 4 · URGENCE NATIONALE",
    kpi_inc: "Incidents actifs", kpi_pers: "Personnel déployé", kpi_beds: "Lits disponibles", kpi_units: "Unités en alerte",
    layoutA: "Disposition A", layoutB: "Disposition B", overview: "Situation générale",
    chart_types: "Incidents par type (30 j)", chart_regions: "Incidents par région", chart_moyens: "Moyens engagés",
    ops: "Opérations en cours", feed: "Fil des événements",
    col_id: "Réf.", col_incident: "Incident", col_region: "Région", col_sev: "Gravité", col_status: "Statut", col_time: "Heure", col_actions: "Actions",
    search: "Rechercher un incident…", to_map: "Carte",
    sev_high: "Critique", sev_med: "Modérée", sev_low: "Faible",
    st_open: "Ouvert", st_prog: "En cours", st_closed: "Clôturé",
    ty_earthquake: "Séisme", ty_flood: "Inondation", ty_wildfire: "Feu de forêt", ty_landslide: "Glissement de terrain", ty_epidemic: "Épidémie", ty_industrial: "Accident industriel",
    u_ready: "Opérationnelle", u_deployed: "Déployée", u_standby: "En attente",
    personnel: "Personnel", equipment: "Équipements", vehicles: "Véhicules", commander: "Commandant", readiness: "Disponibilité opérationnelle", effectif: "Effectif", view: "Détails", back: "Retour",
    h_name: "Nom", h_grade: "Grade", h_role: "Fonction", h_status: "Statut", h_desig: "Désignation", h_cat: "Catégorie", h_qty: "Qté", h_state: "État", h_typev: "Type", h_plate: "Immatriculation", h_assign: "Affectation", h_spec: "Spécialité",
    med_staff: "Personnel médical", beds: "Lits", field: "Hôpitaux de campagne", deploy_field: "Déployer un hôpital de campagne",
    beds_total: "Lits totaux", beds_occ: "Occupés", beds_free: "Disponibles", icu: "Réanimation", occupancy: "Occupation",
    op_ok: "Opérationnel", op_partial: "Montée en charge", since: "Déployé", capacity: "Capacité", staff: "Effectif médical",
    wiz_title: "Signaler un incident", wz1: "Type d'incident", wz2: "Détails", wz3: "Localisation",
    f_title: "Titre de l'incident", f_desc: "Description", f_attach: "Pièces jointes", f_attach_hint: "Photo, vidéo ou document — cliquer pour joindre",
    f_prov: "Province", f_coords: "Coordonnées", pick_map: "Cliquer sur la carte pour positionner l’incident",
    prev: "Précédent", next: "Suivant", submit: "Soumettre le rapport", cancel: "Annuler",
    toast_ok: "Rapport transmis au centre des opérations", toast_field: "Hôpital de campagne en cours de déploiement",
    layers: "Couches", legend: "Légende", sel_none: "Sélectionner un élément sur la carte", lg_veh: "Véhicules / convois", now: "Maintenant", base_sat: "Satellite", base_plan: "Plan", lg_units: "Unités", lg_hosp: "Hôpitaux", nav_triage: "Triage de masse", nav_res: "Ressources", nav_equip: "Inventaire équipements", nav_pers: "Personnel", nav_wo: "Bons de travail", nav_dis: "Gestion de désastres", nav_ics: "Formulaire ICS", nav_damage: "Évaluation des dommages", nav_shelters: "Gestion des abris", nav_cmd: "Commandement", nav_orsec: "Tableau ORSEC", nav_plans: "Plans", nav_comms: "Centre de communication", nav_reports: "Rapports d'incidents", nav_analytics: "Analytique", nav_dispatch: "Répartition", nav_assistant: "Assistant IA", nav_users: "Gestion des utilisateurs", nav_settings: "Paramètres", stub_msg: "Module en préparation — son contenu sera conçu prochainement. Dites-nous ce qui doit y figurer en priorité.", cm_new_cat: "Nouveau groupe", cm_new_chan: "Nom du canal…", cm_new_cat_ph: "Nom du groupe…", cm_msg_ph: "Écrire un message…", cm_members: "Membres", cm_online: "En ligne", cm_offline: "Hors ligne", cm_voice: "Salle vocale", cm_join: "Rejoindre", cm_connected: "Connectés", cm_joined: "Connexion à la salle vocale…", lg_welcome: "Authentification requise", lg_user: "Matricule", lg_pass: "Mot de passe", lg_btn: "Se connecter", lg_restricted: "Accès restreint — Usage officiel uniquement", lg_footer: "État-Major Général · Forces Armées Royales", lg_toast: "Session ouverte — bienvenue Col. Benjelloun", lg_badpass: "Matricule ou mot de passe incorrect.", lg_api_down: "API injoignable — vérifiez la connexion au serveur ARGOS.", lg_role_demo: "Rôle (démo — sinon fourni par Keycloak)", logout: "Se déconnecter", add_unit: "Ajouter une unité", add_hosp: "Ajouter un hôpital", lbl_city: "Ville", lbl_create: "Créer", lbl_amb: "Ambulances", lbl_heli: "Hélicoptères", toast_unit: "Unité créée et intégrée au dispositif", toast_hosp: "Hôpital intégré au réseau Hospinet", pr_settings: "Paramètres du profil", pr_title: "Mon profil", pr_roles: "Rôles du compte", pr_active_role: "actif", pr_submit: "Enregistrer le profil", pr_name: "Nom affiché", pr_photo: "Changer la photo", pr_photo_remove: "Retirer la photo", pr_photo_err: "Image illisible.", pr_profile_saved: "Profil mis à jour", pr_pw_submit: "Mettre à jour le mot de passe", pr_saved: "Mot de passe mis à jour", wz_mode_prov: "Province", wz_mode_city: "Ville", wz_mode_address: "Adresse", f_city: "Ville", wz_prov_anchor: "Province de rattachement", wz_fullscreen: "Plein écran", wz_exit_full: "Quitter le plein écran", wz_map_hint: "Cliquez sur la carte pour poser le point", wz4: "Victimes & moyens", wz_casualties: "Bilan humain", wz_dead: "Décès", wz_injured: "Blessés", wz_missing: "Disparus", wz_units_near: "Unités les plus proches", wz_hospitals_near: "Hôpitaux les plus proches", wz_suggested: "Suggéré", act_view: "Voir", act_edit: "Modifier", act_archive: "Archiver", flt_type: "Type", flt_sev: "Gravité", flt_region: "Région", flt_status: "Statut", flt_all: "Tous", sort_by: "Trier par", sort_time: "Heure", sort_sev: "Gravité", sort_status: "Statut", det_title: "Détails de l'incident", edit_title: "Modifier l'incident", save: "Enregistrer", det_responders: "Moyens engagés", flt_clear: "Effacer", tab_active: "Actifs", tab_archived: "Archivés", act_unarchive: "Désarchiver", st_change_title: "Confirmer le changement de statut", st_change_hint: "Cette action requiert votre mot de passe superadmin.", st_change_pass: "Mot de passe", confirm: "Confirmer", arch_title: "Archiver l'incident ?", arch_body: "Cet incident est clôturé. Voulez-vous l'archiver ?", yes: "Oui", no: "Non", det_personnel: "Personnel engagé", det_vehicles: "Véhicules & ambulances", si_title: "Sous-incidents", si_add: "Ajouter un sous-incident", si_type: "Type de sous-incident", si_note: "Précision (optionnel)", si_none: "Aucun sous-incident rattaché", si_choose: "Choisir un type…", si_added: "Sous-incident rattaché", si_removed: "Sous-incident retiré", si_details: "Détails complémentaires", si_optional: "optionnel", si_loc_hint: "Coordonnées reprises de l'incident principal — ajustez si le sous-incident est ailleurs.", map_measure: "Mesure", map_alt: "Alt.", map_distance: "Distance", fam_forces: "Forces", fam_health: "Santé", map_measure_hint: "Cliquez pour ajouter des points", map_route: "Itinéraire routier", map_direct: "À vol d'oiseau", map_points: "Points", map_eta: "Durée", wz_mode_coords: "Coordonnées", wz_mode_map: "Sur la carte", wz_mode_geo: "Ma position", wz_geo_btn: "Utiliser ma position actuelle", wz_geo_err: "Position indisponible — autorisez la géolocalisation.", wz_lat: "Latitude", wz_lng: "Longitude", f_addr: "Adresse / lieu-dit (optionnel)", dash_evolution: "Évolution des incidents (30 j)", dash_opened: "Déclarés", dash_closed: "Clôturés", dash_hosp: "Saturation hospitalière", dash_expand: "Agrandir",
  },
  en: {
    app: "ARGOS", appSub: "Disaster Management · Royal Armed Forces", role: "Division Chief",
    nav_dash: "Dashboard", nav_map: "Operational map", nav_seismic: "Seismology", nav_weather: "Weather", nav_inc: "Incidents", nav_units: "Teams", nav_hosp: "Hospinet",
    report: "Report an incident", live: "LIVE",
    lvl1: "LEVEL 1 · ROUTINE", lvl2: "LEVEL 2 · VIGILANCE", lvl3: "LEVEL 3 · HIGH VIGILANCE", lvl4: "LEVEL 4 · NATIONAL EMERGENCY",
    kpi_inc: "Active incidents", kpi_pers: "Deployed personnel", kpi_beds: "Available beds", kpi_units: "Units on alert",
    layoutA: "Layout A", layoutB: "Layout B", overview: "Situation overview",
    chart_types: "Incidents by type (30 d)", chart_regions: "Incidents by region", chart_moyens: "Committed resources",
    ops: "Ongoing operations", feed: "Event feed",
    col_id: "Ref.", col_incident: "Incident", col_region: "Region", col_sev: "Severity", col_status: "Status", col_time: "Time", col_actions: "Actions",
    search: "Search incidents…", to_map: "Map",
    sev_high: "Critical", sev_med: "Moderate", sev_low: "Low",
    st_open: "Open", st_prog: "Ongoing", st_closed: "Closed",
    ty_earthquake: "Earthquake", ty_flood: "Flood", ty_wildfire: "Wildfire", ty_landslide: "Landslide", ty_epidemic: "Epidemic", ty_industrial: "Industrial accident",
    u_ready: "Ready", u_deployed: "Deployed", u_standby: "Standby",
    personnel: "Personnel", equipment: "Equipment", vehicles: "Vehicles", commander: "Commander", readiness: "Operational readiness", effectif: "Strength", view: "Details", back: "Back",
    h_name: "Name", h_grade: "Rank", h_role: "Role", h_status: "Status", h_desig: "Designation", h_cat: "Category", h_qty: "Qty", h_state: "State", h_typev: "Type", h_plate: "Plate", h_assign: "Assignment", h_spec: "Specialty",
    med_staff: "Medical staff", beds: "Beds", field: "Field hospitals", deploy_field: "Deploy a field hospital",
    beds_total: "Total beds", beds_occ: "Occupied", beds_free: "Available", icu: "ICU", occupancy: "Occupancy",
    op_ok: "Operational", op_partial: "Ramping up", since: "Deployed", capacity: "Capacity", staff: "Medical strength",
    wiz_title: "Report an incident", wz1: "Incident type", wz2: "Details", wz3: "Location",
    f_title: "Incident title", f_desc: "Description", f_attach: "Attachments", f_attach_hint: "Photo, video or document — click to attach",
    f_prov: "Province", f_coords: "Coordinates", pick_map: "Click the map to position the incident",
    prev: "Previous", next: "Next", submit: "Submit report", cancel: "Cancel",
    toast_ok: "Report transmitted to the operations center", toast_field: "Field hospital deployment initiated",
    layers: "Layers", legend: "Legend", sel_none: "Select an element on the map", lg_veh: "Vehicles / convoys", now: "Now", base_sat: "Satellite", base_plan: "Map", lg_units: "Units", lg_hosp: "Hospitals", nav_triage: "Mass triage", nav_res: "Resources", nav_equip: "Equipment inventory", nav_pers: "Personnel", nav_wo: "Work orders", nav_dis: "Disaster management", nav_ics: "ICS form", nav_damage: "Damage assessment", nav_shelters: "Shelter management", nav_cmd: "Command", nav_orsec: "ORSEC board", nav_plans: "Plans", nav_comms: "Communication center", nav_reports: "Incident reports", nav_analytics: "Analytics", nav_dispatch: "Dispatching", nav_assistant: "AI assistant", nav_users: "User management", nav_settings: "Settings", stub_msg: "Module in preparation — its content will be designed shortly.", cm_new_cat: "New group", cm_new_chan: "Channel name…", cm_new_cat_ph: "Group name…", cm_msg_ph: "Write a message…", cm_members: "Members", cm_online: "Online", cm_offline: "Offline", cm_voice: "Voice room", cm_join: "Join", cm_connected: "Connected", cm_joined: "Joining voice room…", lg_welcome: "Authentication required", lg_user: "Service ID", lg_pass: "Password", lg_btn: "Sign in", lg_restricted: "Restricted access — Official use only", lg_footer: "General Staff · Royal Armed Forces", lg_toast: "Session opened — welcome Col. Benjelloun", lg_badpass: "Incorrect service ID or password.", lg_api_down: "API unreachable — check the ARGOS server connection.", lg_role_demo: "Role (demo — otherwise provided by Keycloak)", logout: "Sign out", add_unit: "Add a unit", add_hosp: "Add a hospital", lbl_city: "City", lbl_create: "Create", lbl_amb: "Ambulances", lbl_heli: "Helicopters", toast_unit: "Unit created and added to the force", toast_hosp: "Hospital added to the Hospinet network", pr_settings: "Profile settings", pr_title: "My profile", pr_roles: "Account roles", pr_active_role: "active", pr_submit: "Save profile", pr_name: "Display name", pr_photo: "Change photo", pr_photo_remove: "Remove photo", pr_photo_err: "Unreadable image.", pr_profile_saved: "Profile updated", pr_pw_submit: "Update password", pr_saved: "Password updated", wz_mode_prov: "Province", wz_mode_city: "City", wz_mode_address: "Address", f_city: "City", wz_prov_anchor: "Attached province", wz_fullscreen: "Fullscreen", wz_exit_full: "Exit fullscreen", wz_map_hint: "Click the map to drop the point", wz4: "Casualties & assets", wz_casualties: "Human toll", wz_dead: "Deaths", wz_injured: "Injured", wz_missing: "Missing", wz_units_near: "Nearest units", wz_hospitals_near: "Nearest hospitals", wz_suggested: "Suggested", act_view: "View", act_edit: "Edit", act_archive: "Archive", flt_type: "Type", flt_sev: "Severity", flt_region: "Region", flt_status: "Status", flt_all: "All", sort_by: "Sort by", sort_time: "Time", sort_sev: "Severity", sort_status: "Status", det_title: "Incident details", edit_title: "Edit incident", save: "Save", det_responders: "Assigned assets", flt_clear: "Clear", tab_active: "Active", tab_archived: "Archived", act_unarchive: "Unarchive", st_change_title: "Confirm status change", st_change_hint: "This action requires your superadmin password.", st_change_pass: "Password", confirm: "Confirm", arch_title: "Archive incident?", arch_body: "This incident is closed. Archive it?", yes: "Yes", no: "No", det_personnel: "Personnel engaged", det_vehicles: "Vehicles & ambulances", si_title: "Sub-incidents", si_add: "Add a sub-incident", si_type: "Sub-incident type", si_note: "Note (optional)", si_none: "No sub-incident attached", si_choose: "Choose a type…", si_added: "Sub-incident attached", si_removed: "Sub-incident removed", si_details: "Additional details", si_optional: "optional", si_loc_hint: "Coordinates copied from the main incident — adjust if the sub-incident is elsewhere.", map_measure: "Measure", map_alt: "Alt.", map_distance: "Distance", fam_forces: "Forces", fam_health: "Health", map_measure_hint: "Click to add points", map_route: "Road route", map_direct: "Straight line", map_points: "Points", map_eta: "ETA", wz_mode_coords: "Coordinates", wz_mode_map: "On the map", wz_mode_geo: "My location", wz_geo_btn: "Use my current location", wz_geo_err: "Location unavailable — allow geolocation.", wz_lat: "Latitude", wz_lng: "Longitude", f_addr: "Address / locality (optional)", dash_evolution: "Incident evolution (30 d)", dash_opened: "Reported", dash_closed: "Closed", dash_hosp: "Hospital saturation", dash_expand: "Enlarge",
  },
  ar: {
    app: "ARGOS", appSub: "تدبير الكوارث · القوات المسلحة الملكية", role: "رئيس قسم",
    nav_dash: "لوحة القيادة", nav_map: "الخريطة العملياتية", nav_seismic: "علم الزلازل", nav_weather: "الطقس", nav_inc: "الحوادث", nav_units: "الفرق", nav_hosp: "هوسبينت",
    report: "التبليغ عن حادث", live: "مباشر",
    lvl1: "المستوى 1 · عادي", lvl2: "المستوى 2 · يقظة", lvl3: "المستوى 3 · يقظة معززة", lvl4: "المستوى 4 · طوارئ وطنية",
    kpi_inc: "الحوادث النشطة", kpi_pers: "الأفراد المنتشرون", kpi_beds: "الأسرّة المتاحة", kpi_units: "وحدات في حالة تأهب",
    layoutA: "التنسيق أ", layoutB: "التنسيق ب", overview: "الوضع العام",
    chart_types: "الحوادث حسب النوع (30 يوما)", chart_regions: "الحوادث حسب الجهة", chart_moyens: "الموارد المعبأة",
    ops: "العمليات الجارية", feed: "سجل الأحداث",
    col_id: "مرجع", col_incident: "الحادث", col_region: "الجهة", col_sev: "الخطورة", col_status: "الحالة", col_time: "الوقت", col_actions: "إجراءات",
    search: "البحث عن حادث…", to_map: "الخريطة",
    sev_high: "حرجة", sev_med: "متوسطة", sev_low: "ضعيفة",
    st_open: "مفتوح", st_prog: "جارٍ", st_closed: "مغلق",
    ty_earthquake: "زلزال", ty_flood: "فيضان", ty_wildfire: "حريق غابة", ty_landslide: "انزلاق تربة", ty_epidemic: "وباء", ty_industrial: "حادث صناعي",
    u_ready: "جاهزة", u_deployed: "منتشرة", u_standby: "في الانتظار",
    personnel: "الأفراد", equipment: "المعدات", vehicles: "المركبات", commander: "القائد", readiness: "الجاهزية العملياتية", effectif: "التعداد", view: "تفاصيل", back: "رجوع",
    h_name: "الاسم", h_grade: "الرتبة", h_role: "المهمة", h_status: "الحالة", h_desig: "التسمية", h_cat: "الفئة", h_qty: "الكمية", h_state: "الوضع", h_typev: "النوع", h_plate: "الترقيم", h_assign: "التخصيص", h_spec: "التخصص",
    med_staff: "الطاقم الطبي", beds: "الأسرّة", field: "المستشفيات الميدانية", deploy_field: "نشر مستشفى ميداني",
    beds_total: "مجموع الأسرّة", beds_occ: "مشغولة", beds_free: "متاحة", icu: "الإنعاش", occupancy: "نسبة الإشغال",
    op_ok: "عملياتي", op_partial: "قيد التجهيز", since: "منتشر منذ", capacity: "السعة", staff: "الطاقم الطبي",
    wiz_title: "التبليغ عن حادث", wz1: "نوع الحادث", wz2: "التفاصيل", wz3: "الموقع",
    f_title: "عنوان الحادث", f_desc: "الوصف", f_attach: "المرفقات", f_attach_hint: "صورة أو فيديو أو وثيقة — انقر للإرفاق",
    f_prov: "الإقليم", f_coords: "الإحداثيات", pick_map: "انقر على الخريطة لتحديد موقع الحادث",
    prev: "السابق", next: "التالي", submit: "إرسال التقرير", cancel: "إلغاء",
    toast_ok: "تم إرسال التقرير إلى مركز العمليات", toast_field: "جارٍ نشر المستشفى الميداني",
    layers: "الطبقات", legend: "مفتاح الخريطة", sel_none: "اختر عنصرا على الخريطة", lg_veh: "المركبات / القوافل", now: "الآن", base_sat: "قمر صناعي", base_plan: "خريطة", lg_units: "الوحدات", lg_hosp: "المستشفيات", nav_triage: "الفرز الجماعي", nav_res: "الموارد", nav_equip: "جرد المعدات", nav_pers: "الأفراد", nav_wo: "أوامر العمل", nav_dis: "تدبير الكوارث", nav_ics: "استمارة ICS", nav_damage: "تقييم الأضرار", nav_shelters: "تدبير الملاجئ", nav_cmd: "القيادة", nav_orsec: "جدول ORSEC", nav_plans: "الخطط", nav_comms: "مركز الاتصالات", nav_reports: "تقارير الحوادث", nav_analytics: "التحليلات", nav_dispatch: "التوزيع", nav_assistant: "المساعد الذكي", nav_users: "إدارة المستخدمين", nav_settings: "الإعدادات", stub_msg: "الوحدة قيد الإعداد — سيتم تصميم محتواها قريبا.", cm_new_cat: "مجموعة جديدة", cm_new_chan: "اسم القناة…", cm_new_cat_ph: "اسم المجموعة…", cm_msg_ph: "اكتب رسالة…", cm_members: "الأعضاء", cm_online: "متصل", cm_offline: "غير متصل", cm_voice: "غرفة صوتية", cm_join: "انضمام", cm_connected: "المتصلون", cm_joined: "جارٍ الاتصال بالغرفة الصوتية…", lg_welcome: "المصادقة مطلوبة", lg_user: "رقم التسجيل", lg_pass: "كلمة السر", lg_btn: "تسجيل الدخول", lg_restricted: "دخول مقيد — للاستعمال الرسمي فقط", lg_footer: "الأركان العامة · القوات المسلحة الملكية", lg_toast: "تم فتح الجلسة — مرحبا", lg_badpass: "رقم التسجيل أو كلمة السر غير صحيحة.", lg_api_down: "الواجهة غير متاحة — تحقق من الاتصال بخادم ARGOS.", lg_role_demo: "الدور (تجريبي — أو يوفّره Keycloak)", logout: "تسجيل الخروج", add_unit: "إضافة وحدة", add_hosp: "إضافة مستشفى", lbl_city: "المدينة", lbl_create: "إنشاء", lbl_amb: "سيارات الإسعاف", lbl_heli: "المروحيات", toast_unit: "تم إنشاء الوحدة وإدماجها في الجهاز", toast_hosp: "تم إدماج المستشفى في شبكة هوسبينت", pr_settings: "إعدادات الملف الشخصي", pr_title: "ملفي الشخصي", pr_roles: "أدوار الحساب", pr_active_role: "نشط", pr_submit: "حفظ الملف", pr_name: "الاسم المعروض", pr_photo: "تغيير الصورة", pr_photo_remove: "إزالة الصورة", pr_photo_err: "صورة غير مقروءة.", pr_profile_saved: "تم تحديث الملف", pr_pw_submit: "تحديث كلمة السر", pr_saved: "تم تحديث كلمة السر", wz_mode_prov: "الإقليم", wz_mode_city: "المدينة", wz_mode_address: "العنوان", f_city: "المدينة", wz_prov_anchor: "الإقليم التابع", wz_fullscreen: "ملء الشاشة", wz_exit_full: "إنهاء ملء الشاشة", wz_map_hint: "انقر على الخريطة لتحديد الموقع", wz4: "الضحايا والوسائل", wz_casualties: "الحصيلة البشرية", wz_dead: "وفيات", wz_injured: "جرحى", wz_missing: "مفقودون", wz_units_near: "أقرب الوحدات", wz_hospitals_near: "أقرب المستشفيات", wz_suggested: "مقترح", act_view: "عرض", act_edit: "تعديل", act_archive: "أرشفة", flt_type: "النوع", flt_sev: "الخطورة", flt_region: "الجهة", flt_status: "الحالة", flt_all: "الكل", sort_by: "ترتيب حسب", sort_time: "الوقت", sort_sev: "الخطورة", sort_status: "الحالة", det_title: "تفاصيل الحادث", edit_title: "تعديل الحادث", save: "حفظ", det_responders: "الوسائل المعبأة", flt_clear: "مسح", tab_active: "نشطة", tab_archived: "مؤرشفة", act_unarchive: "إلغاء الأرشفة", st_change_title: "تأكيد تغيير الحالة", st_change_hint: "يتطلب هذا الإجراء كلمة مرور المشرف الأعلى.", st_change_pass: "كلمة المرور", confirm: "تأكيد", arch_title: "أرشفة الحادث؟", arch_body: "هذا الحادث مغلق. هل تريد أرشفته؟", yes: "نعم", no: "لا", det_personnel: "الأفراد المعبأون", det_vehicles: "المركبات والإسعاف", si_title: "الحوادث الفرعية", si_add: "إضافة حادث فرعي", si_type: "نوع الحادث الفرعي", si_note: "توضيح (اختياري)", si_none: "لا يوجد حادث فرعي مرتبط", si_choose: "اختر نوعا…", si_added: "تم ربط الحادث الفرعي", si_removed: "تمت إزالة الحادث الفرعي", si_details: "تفاصيل إضافية", si_optional: "اختياري", si_loc_hint: "الإحداثيات منقولة من الحادث الرئيسي — عدّلها إذا كان الحادث الفرعي في مكان آخر.", map_measure: "قياس", map_alt: "الارتفاع", map_distance: "المسافة", fam_forces: "القوات", fam_health: "الصحة", map_measure_hint: "انقر لإضافة نقاط", map_route: "مسار الطريق", map_direct: "خط مستقيم", map_points: "النقاط", map_eta: "المدة", wz_mode_coords: "الإحداثيات", wz_mode_map: "على الخريطة", wz_mode_geo: "موقعي", wz_geo_btn: "استخدام موقعي الحالي", wz_geo_err: "الموقع غير متاح — اسمح بتحديد الموقع.", wz_lat: "خط العرض", wz_lng: "خط الطول", f_addr: "العنوان / المكان (اختياري)", dash_evolution: "تطور الحوادث (30 يوما)", dash_opened: "مُبلَّغ عنها", dash_closed: "مُغلقة", dash_hosp: "الإشباع الاستشفائي", dash_expand: "تكبير",
  },
};
