// ============================================================================
// ARGOS — chaînes d'interface des modules (FR / AR / EN)
// Séparées du Dict principal pour que la coquille reste stable pendant que les
// modules opérationnels grandissent. À consommer via `useModules()` dans le store.
// ============================================================================

import type { Lang } from "@/lib/types";

export interface ModulesDict {
  common: {
    search: string;
    results: string;
    all: string;
    none: string;
    new: string;
    export: string;
    date: string;
    ref: string;
    status: string;
    actions: string;
    priority: string;
    unit: string;
    zone: string;
    updated: string;
    author: string;
    total: string;
    view: string;
  };
  equip: {
    tab_catalog: string;
    tab_movements: string;
    col_stock: string;
    col_threshold: string;
    cond_ok: string;
    cond_repair: string;
    cond_oos: string;
    low_stock: string;
    mv_in: string;
    mv_out: string;
    mv_transfer: string;
    col_item: string;
    col_from: string;
    col_to: string;
    col_type: string;
    kpi_refs: string;
    kpi_ok: string;
    kpi_alerts: string;
  };
  personnel: {
    search: string;
    col_matricule: string;
    col_availability: string;
    av_available: string;
    av_deployed: string;
    av_rest: string;
    av_unavailable: string;
    kpi_total: string;
    kpi_deployed: string;
    kpi_available: string;
  };
  workorders: {
    col_subject: string;
    col_assignee: string;
    col_sla: string;
    col_created: string;
    st_requested: string;
    st_approved: string;
    st_assigned: string;
    st_inprogress: string;
    st_done: string;
    st_verified: string;
    pr_low: string;
    pr_medium: string;
    pr_high: string;
    pr_urgent: string;
    kpi_open: string;
    kpi_progress: string;
    kpi_overdue: string;
  };
  triage: {
    red: string;
    yellow: string;
    green: string;
    black: string;
    kpi_victims: string;
    kpi_triaged: string;
    kpi_evac: string;
    zones: string;
    flow: string;
    flow_site: string;
    flow_evac: string;
    flow_hosp: string;
    col_tag: string;
    col_category: string;
    col_destination: string;
    per_zone: string;
  };
  shelters: {
    col_occupancy: string;
    col_occupants: string;
    col_supplies: string;
    col_needs: string;
    sup_ok: string;
    sup_low: string;
    sup_critical: string;
    kpi_active: string;
    kpi_capacity: string;
    kpi_displaced: string;
    adults: string;
    children: string;
    elderly: string;
  };
  damage: {
    col_building: string;
    col_grade: string;
    col_habitability: string;
    col_assessor: string;
    g1: string;
    g2: string;
    g3: string;
    g4: string;
    g5: string;
    hab_ok: string;
    hab_restricted: string;
    hab_no: string;
    kpi_assessments: string;
    kpi_uninhabitable: string;
    kpi_zones: string;
    by_grade: string;
  };
  orsec: {
    plan_level: string;
    activated: string;
    big_screen: string;
    casualties: string;
    resources: string;
    hospitals: string;
    shelters: string;
    org: string;
    decisions: string;
    col_decision: string;
    roster: string;
    n_dead: string;
    n_injured: string;
    n_missing: string;
    n_rescued: string;
    engaged: string;
    available: string;
    load: string;
  };
  plans: {
    col_plan: string;
    col_type: string;
    col_version: string;
    st_active: string;
    st_draft: string;
    st_review: string;
    st_expired: string;
    activate: string;
    checklist: string;
  };
  ics: {
    col_code: string;
    col_title: string;
    col_incident: string;
    st_draft: string;
    st_review: string;
    st_approved: string;
    f201: string;
    f202: string;
    f203: string;
    f204: string;
    f205: string;
    f206: string;
    f209: string;
    f214: string;
  };
  reports: {
    col_number: string;
    col_title: string;
    col_incident: string;
    col_period: string;
    col_published: string;
    st_draft: string;
    st_published: string;
    classification: string;
    kpi_published: string;
    kpi_draft: string;
  };
  analytics: {
    kpi_response: string;
    kpi_evac_admit: string;
    kpi_closed: string;
    kpi_util: string;
    response_times: string;
    incident_trend: string;
    resource_util: string;
    hospital_sat: string;
    triage_outcomes: string;
    severity_dist: string;
    minutes: string;
  };
  dispatch: {
    strip_ops: string;
    strip_units: string;
    strip_movements: string;
    strip_queue: string;
    strip_available: string;
    need: string;
    select_need: string;
    units_board: string;
    eta: string;
    score: string;
    match: string;
    engage: string;
    relieve: string;
    engaged: string;
    reco_title: string;
    reco_hint: string;
    apply: string;
    best: string;
    excluded: string;
    b_travel: string;
    b_cap: string;
    b_readiness: string;
    b_avail: string;
    caps_required: string;
    mv_mission: string;
    mv_vehicles: string;
    mv_origin: string;
    mv_dest: string;
    mv_cargo: string;
    mv_progress: string;
    mv_delay: string;
    mv_ontime: string;
    queue_title: string;
    treat: string;
    urg_urgent: string;
    urg_high: string;
    urg_medium: string;
    confirm_engage: string;
    reason: string;
    reason_ph: string;
    confirm: string;
    audit_note: string;
    min: string;
    sim: string;
    sim_hint: string;
    sim_reset: string;
    sim_active: string;
    weights_title: string;
  };
  ai: {
    subtitle: string;
    guardrail: string;
    provider_local: string;
    provider_online: string;
    provider_offline: string;
    mode_llm: string;
    mode_det: string;
    layer1: string;
    placeholder: string;
    send: string;
    clear: string;
    examples: string;
    ex_reach: string;
    ex_reach2: string;
    ex_sitrep: string;
    ex_anomaly: string;
    thinking: string;
    empty: string;
    model: string;
    no_models: string;
    configure: string;
  };
  settings: {
    reserved: string;
    ai_title: string;
    provider: string;
    endpoint: string;
    model: string;
    model_ph: string;
    detect: string;
    detected: string;
    status_connected: string;
    status_offline: string;
    status_checking: string;
    note: string;
    future_title: string;
    future_hint: string;
    reset: string;
    flags_title: string;
    flags_hint: string;
    module_disabled: string;
    types_title: string;
    types_hint: string;
    type_id: string;
    type_id_ph: string;
    type_icon: string;
    label_fr: string;
    label_ar: string;
    label_en: string;
    type_add: string;
    type_added: string;
    type_exists: string;
    type_builtin: string;
    types_search: string;
    types_empty: string;
    audit_title: string;
    audit_intact: string;
    audit_broken: string;
    audit_refresh: string;
    audit_empty: string;
    seis_title: string;
    seis_hint: string;
    seis_ma_lbl: string;
    seis_ma_hint: string;
    seis_world_lbl: string;
    seis_world_hint: string;
    seis_contacts: string;
    seis_c_name: string;
    seis_c_phone: string;
    seis_c_email: string;
    seis_add: string;
    seis_save: string;
    seis_saved: string;
    seis_log: string;
    seis_log_empty: string;
    seis_sent_to: string;
  };
  sup: { title: string; subtitle: string; viewing: string; back: string; empty: string };
  resp: {
    my_responsibility: string; manage: string; manage_title: string; loading: string;
    beds_free: string; icu_free: string; icu: string; staff: string; vehicles: string; amb_heli: string;
    load: string; beds_overall: string; wards: string; field_hosp: string; incidents: string;
    no_field: string; no_ward: string; no_incident: string;
    capacities: string; add_ward: string; edit_ward: string; edit: string; delete: string; cancel: string;
    save: string; saving: string; saved: string;
    ward_created: string; ward_saved: string; ward_deleted: string;
    delete_ward_title: string; delete_ward_text: string;
    f_beds: string; f_occ: string; f_icu: string; f_icu_occ: string; f_staff: string; f_amb: string; f_heli: string;
    f_ward_name: string; f_ward_name_ph: string; f_status: string; f_chief: string; f_chief_ph: string;
    err_occ: string; err_rea: string; err_name: string; err_denied: string;
    none_title: string; none_text: string; unassigned_title: string; unassigned_text: string; pending_text: string;
    manage_unit: string; manage_shelter: string;
    u_effectif: string; u_readiness: string; u_posture: string; u_posture_block: string; u_missions: string; u_engaged: string; u_cmdt: string;
    s_places_free: string; s_occupants: string; s_staff: string; s_supplies: string; s_occupancy: string; s_demography: string;
    s_adults: string; s_children: string; s_elderly: string; s_needs: string; s_needs_field: string; s_needs_ph: string;
    s_capacity: string; s_capacity_block: string; err_occupants: string;
    manage_morgue: string;
    g_places_free: string; g_unidentified: string; g_in_progress: string; g_released: string;
    g_occupancy: string; g_bodies_present: string; g_progress: string; g_register: string; g_no_record: string;
    g_reference: string; g_reference_ph: string; g_status: string; g_identity: string; g_identity_ph: string;
    g_samples: string; g_found_at: string; g_found_at_ph: string; g_sex: string; g_age: string;
    g_incident: string; g_incident_none: string; g_admit: string; g_admit_btn: string; g_admit_hint: string; g_admitted: string;
    g_record: string; g_record_saved: string; g_unknown: string; g_closed: string;
    g_released_to: string; g_released_field: string; g_released_ph: string; g_released_hint: string;
    g_site_block: string; g_capacity: string; g_staff: string;
    g_err_reference: string; g_err_identity: string; g_err_released: string; g_err_transition: string;
    e_park: string; e_articles: string; e_below: string; e_oos: string; e_inventory: string; e_empty: string;
    e_add: string; e_edit: string; e_added: string; e_saved: string; e_removed: string; e_low: string;
    e_desig: string; e_desig_ph: string; e_category: string; e_category_ph: string; e_condition: string;
    e_stock: string; e_threshold: string; e_threshold_field: string; e_err_fields: string;
    e_remove_title: string; e_remove_text: string;
    equip_cond: Record<"ok" | "repair" | "oos", string>;
    morgue_statut: Record<"op" | "partial" | "closed", string>;
    dvi_status: Record<"unidentified" | "in_progress" | "identified" | "released", string>;
    dvi_sample: Record<"dna" | "dental" | "fingerprint", string>;
    dvi_sex: Record<"m" | "f" | "unknown", string>;
    unit_dispo: Record<"ready" | "deployed" | "standby", string>;
    supply: Record<"ok" | "low" | "critical", string>;
    ward_status: Record<"open" | "saturated" | "closed", string>;
  };
  roles: Record<
    | "superadmin" | "admin" | "strategic" | "tacom" | "bluecell" | "greencell" | "orangecell"
    | "place_arme" | "wali" | "opcom"
    | "resp_hospital" | "resp_shelter" | "resp_morgue" | "resp_unit" | "resp_equipment",
    string
  >;
  users: {
    title: string;
    subtitle: string;
    tab_users: string;
    tab_roles: string;
    new_user: string;
    edit_user: string;
    edit: string;
    save: string;
    saved_toast: string;
    delete_title: string;
    delete_body: string;
    matricule_locked: string;
    matricule: string;
    matricule_ph: string;
    name: string;
    name_ph: string;
    firstname: string;
    firstname_ph: string;
    phone: string;
    phone_ph: string;
    grade: string;
    grade_ph: string;
    grade_none: string;
    created_title: string;
    created_hint: string;
    created_close: string;
    col_phone: string;
    identity: string;
    roles_multi: string;
    roles_single: string;
    multi_hint: string;
    single_hint: string;
    create: string;
    cancel: string;
    search: string;
    col_user: string;
    col_roles: string;
    col_status: string;
    col_code: string;
    col_actions: string;
    status_active: string;
    status_inactive: string;
    online: string;
    offline: string;
    reveal: string;
    hide: string;
    no_code: string;
    code_active_note: string;
    activate: string;
    deactivate: string;
    delete: string;
    confirm_delete: string;
    activate_hint: string;
    admin_activated: string;
    you: string;
    builtin: string;
    created_by: string;
    last_login: string;
    never: string;
    created_toast: string;
    deleted_toast: string;
    activated_toast: string;
    need_role: string;
    need_assignment: string;
    assignment: string;
    assignment_hint: string;
    assignment_none: string;
    assignment_id_ph: string;
    responsibility: Record<"hospital" | "unit" | "shelter" | "morgue" | "equipment", string>;
    need_fields: string;
    dup_matricule: string;
    role_features_title: string;
    role_features_hint: string;
    feature: string;
    allowed: string;
    reset_role: string;
    locked_all: string;
    select_role: string;
    modules_count: string;
    empty: string;
    cp_title: string;
    cp_hint: string;
    cp_new: string;
    cp_confirm: string;
    cp_submit: string;
    cp_skip: string;
    cp_mismatch: string;
    cp_weak: string;
    cp_done: string;
    rc_title: string;
    switch_role: string;
    role_switched: string;
    copy_code: string;
    copied_toast: string;
    rc_hint: string;
    rc_enter: string;
  };
}

const fr: ModulesDict = {
  common: { search: "Rechercher…", results: "résultats", all: "Tous", none: "Aucun résultat", new: "Nouveau", export: "Exporter", date: "Date", ref: "Réf.", status: "Statut", actions: "Actions", priority: "Priorité", unit: "Unité", zone: "Zone", updated: "Mis à jour", author: "Auteur", total: "Total", view: "Ouvrir" },
  equip: { tab_catalog: "Catalogue", tab_movements: "Mouvements", col_stock: "Stock", col_threshold: "Seuil", cond_ok: "Opérationnel", cond_repair: "À réparer", cond_oos: "Hors service", low_stock: "Stock bas", mv_in: "Entrée", mv_out: "Sortie", mv_transfer: "Transfert", col_item: "Article", col_from: "De", col_to: "Vers", col_type: "Type", kpi_refs: "Références", kpi_ok: "Opérationnels", kpi_alerts: "Alertes stock" },
  personnel: { search: "Rechercher un agent…", col_matricule: "Matricule", col_availability: "Disponibilité", av_available: "Disponible", av_deployed: "Déployé", av_rest: "Repos", av_unavailable: "Indisponible", kpi_total: "Effectif total", kpi_deployed: "Déployés", kpi_available: "Disponibles" },
  workorders: { col_subject: "Objet", col_assignee: "Assigné à", col_sla: "Échéance", col_created: "Créé", st_requested: "Demandé", st_approved: "Approuvé", st_assigned: "Assigné", st_inprogress: "En cours", st_done: "Terminé", st_verified: "Vérifié", pr_low: "Basse", pr_medium: "Moyenne", pr_high: "Haute", pr_urgent: "Urgente", kpi_open: "Bons ouverts", kpi_progress: "En cours", kpi_overdue: "En retard" },
  triage: { red: "Rouge — Urgence absolue", yellow: "Jaune — Urgence relative", green: "Vert — Blessés légers", black: "Noir — Décédés", kpi_victims: "Victimes", kpi_triaged: "Triées", kpi_evac: "Évacuées", zones: "Zones de triage", flow: "Flux des victimes", flow_site: "Sur site", flow_evac: "En évacuation", flow_hosp: "Admises hôpital", col_tag: "Étiquette", col_category: "Catégorie", col_destination: "Destination", per_zone: "Par zone" },
  shelters: { col_occupancy: "Occupation", col_occupants: "Occupants", col_supplies: "Ravitaillement", col_needs: "Besoins", sup_ok: "Suffisant", sup_low: "Faible", sup_critical: "Critique", kpi_active: "Abris actifs", kpi_capacity: "Capacité totale", kpi_displaced: "Personnes hébergées", adults: "Adultes", children: "Enfants", elderly: "Personnes âgées" },
  damage: { col_building: "Type de bâtiment", col_grade: "Grade (EMS-98)", col_habitability: "Habitabilité", col_assessor: "Évaluateur", g1: "1 · Négligeable", g2: "2 · Modéré", g3: "3 · Sévère", g4: "4 · Très grave", g5: "5 · Destruction", hab_ok: "Habitable", hab_restricted: "Accès restreint", hab_no: "Inhabitable", kpi_assessments: "Évaluations", kpi_uninhabitable: "Inhabitables", kpi_zones: "Zones touchées", by_grade: "Répartition par grade" },
  orsec: { plan_level: "Niveau du plan ORSEC", activated: "Activé", big_screen: "Mode grand écran", casualties: "Bilan humain", resources: "Moyens engagés", hospitals: "Charge hospitalière", shelters: "Abris", org: "Structure de commandement activée", decisions: "Journal des décisions", col_decision: "Décision", roster: "Officiers de permanence", n_dead: "Décès", n_injured: "Blessés", n_missing: "Disparus", n_rescued: "Secourus", engaged: "Engagés", available: "Disponibles", load: "Taux d'occupation" },
  plans: { col_plan: "Plan", col_type: "Type", col_version: "Version", st_active: "Actif", st_draft: "Brouillon", st_review: "En révision", st_expired: "Expiré", activate: "Activer", checklist: "Liste d'activation" },
  ics: { col_code: "Code", col_title: "Intitulé", col_incident: "Incident", st_draft: "Brouillon", st_review: "En révision", st_approved: "Approuvé", f201: "Briefing d'incident", f202: "Objectifs", f203: "Organigramme", f204: "Listes d'affectation", f205: "Plan de communication", f206: "Plan médical", f209: "Résumé de situation", f214: "Journal d'activité" },
  reports: { col_number: "N°", col_title: "Intitulé", col_incident: "Incident", col_period: "Période", col_published: "Publié le", st_draft: "Brouillon", st_published: "Publié", classification: "Diffusion restreinte", kpi_published: "Publiés", kpi_draft: "Brouillons" },
  analytics: { kpi_response: "Délai moyen alerte→sur site", kpi_evac_admit: "Évac→admission", kpi_closed: "Taux de clôture", kpi_util: "Utilisation des moyens", response_times: "Temps de réponse (min)", incident_trend: "Tendance des incidents (7 j)", resource_util: "Utilisation des moyens", hospital_sat: "Saturation hospitalière", triage_outcomes: "Résultats du triage", severity_dist: "Répartition par gravité", minutes: "min" },
  dispatch: { strip_ops: "Opérations actives", strip_units: "Unités engagées", strip_movements: "Mouvements en cours", strip_queue: "File de dispatching", strip_available: "Unités disponibles", need: "Besoin à traiter", select_need: "Sélectionner une opération ou une demande", units_board: "Unités", eta: "ETA", score: "Score", match: "Adéquation", engage: "Engager", relieve: "Relever", engaged: "Engagée", reco_title: "Recommandations", reco_hint: "Moteur de recommandation — proximité × capacités × disponibilité", apply: "Appliquer", best: "Meilleure option", excluded: "Écartée", b_travel: "Temps de trajet", b_cap: "Capacités", b_readiness: "Dispo. opér.", b_avail: "Disponibilité", caps_required: "Capacités requises", mv_mission: "Mission", mv_vehicles: "Véhicules", mv_origin: "Origine", mv_dest: "Destination", mv_cargo: "Chargement", mv_progress: "Progression", mv_delay: "Retard", mv_ontime: "À l'heure", queue_title: "File de dispatching", treat: "Traiter", urg_urgent: "Urgent", urg_high: "Prioritaire", urg_medium: "Normal", confirm_engage: "Confirmer l'engagement", reason: "Motif (obligatoire)", reason_ph: "Justification de la décision…", confirm: "Confirmer l'engagement", audit_note: "Chaque décision est confirmée, motivée et auditée.", min: "min", sim: "Simulation « et si ? »", sim_hint: "Ajustez les poids du score pour comparer des scénarios, sans engager", sim_reset: "Réinitialiser", sim_active: "Simulation active", weights_title: "Poids du score" },
  ai: { subtitle: "Assistant opérationnel — requêtes en langage naturel", guardrail: "Lecture seule : l'assistant interroge le moteur Couche 1 et rédige ; il n'exécute aucune action et chaque échange est journalisé.", provider_local: "LLM local", provider_online: "connecté", provider_offline: "hors ligne — réponses déterministes", mode_llm: "reformulé par le LLM local", mode_det: "réponse déterministe (Couche 1)", layer1: "Requête Couche 1", placeholder: "Poser une question opérationnelle…", send: "Envoyer", clear: "Effacer", examples: "Exemples", ex_reach: "Quelles unités peuvent atteindre Al Haouz en moins d'une heure avec des groupes électrogènes ?", ex_reach2: "Unités de génie mobilisables pour le glissement d'Al Hoceïma en moins de 3 heures", ex_sitrep: "Génère un brouillon de SITREP pour l'opération SALAMA", ex_anomaly: "Résume les anomalies des mouvements en cours", thinking: "Analyse en cours…", empty: "Posez une question ou choisissez un exemple.", model: "Modèle", no_models: "aucun modèle détecté", configure: "Configurer" },
  settings: { reserved: "Réservé au Super Administrateur", ai_title: "Assistant IA — Modèle de langage (LLM)", provider: "Fournisseur", endpoint: "Point d'accès (URL)", model: "Modèle", model_ph: "nom du modèle (ex. llama3.1:8b)", detect: "Détecter / Tester", detected: "modèle(s) détecté(s)", status_connected: "Connecté", status_offline: "Hors ligne", status_checking: "Test…", note: "En production, ces réglages sont pilotés par le Super Admin et propagés à tous les postes via l'API ARGOS ; l'appel LLM s'exécute côté serveur.", future_title: "Autres paramètres", future_hint: "Registre des appareils, image de marque, rétention des journaux… (à venir)", reset: "Valeurs par défaut", flags_title: "Modules (feature flags)", flags_hint: "Activez ou désactivez les modules globalement. Un module désactivé disparaît de la navigation et sa page est verrouillée.", module_disabled: "Module désactivé par l'administrateur.", types_title: "Types d'incident", types_hint: "Ajoutez de nouveaux types ; ils apparaissent aussitôt dans l'assistant de déclaration avec l'icône choisie.", type_id: "Identifiant", type_id_ph: "ex. tempete_sable", type_icon: "Icône", label_fr: "Libellé FR", label_ar: "Libellé AR", label_en: "Libellé EN", type_add: "Ajouter le type", type_added: "Type d'incident ajouté", type_exists: "Ce type existe déjà.", type_builtin: "Fourni", types_search: "Rechercher un type…", types_empty: "Aucun type ne correspond.", audit_title: "Journal d'audit", audit_intact: "chaîne intègre", audit_broken: "chaîne rompue", audit_refresh: "Actualiser", audit_empty: "Aucune entrée — basculez un module pour générer une trace.", seis_title: "Alertes sismiques", seis_hint: "Un séisme sur le territoire national ≥ seuil national déclenche une alerte rouge dans l'app ET l'envoi SMS + e-mail aux autorités ci-dessous (surveillance côté serveur). Un séisme mondial ≥ seuil mondial ne déclenche qu'une notification dans l'app.", seis_ma_lbl: "Seuil national (SMS + e-mail)", seis_ma_hint: "magnitude min. d'un séisme au Maroc", seis_world_lbl: "Seuil mondial (notification app)", seis_world_hint: "magnitude min. d'un séisme hors Maroc", seis_contacts: "Autorités notifiées", seis_c_name: "Nom / fonction", seis_c_phone: "Téléphone (SMS)", seis_c_email: "E-mail", seis_add: "Ajouter une autorité", seis_save: "Enregistrer", seis_saved: "Configuration des alertes enregistrée", seis_log: "Derniers envois", seis_log_empty: "Aucun envoi pour l'instant.", seis_sent_to: "autorité(s)" },
  sup: { title: "Supervision des responsabilités", subtitle: "Consulter le tableau de bord de chaque responsable", viewing: "Vue du responsable", back: "Retour à la liste", empty: "Aucune entité de cette nature." },
  resp: {
    my_responsibility: "Ma responsabilité", manage: "Gérer", manage_title: "Gestion de mon établissement", loading: "Chargement…",
    beds_free: "Lits disponibles", icu_free: "Réanimation disponible", icu: "Réanimation", staff: "Effectif médical", vehicles: "Moyens", amb_heli: "ambulances + hélicoptères",
    load: "Charge de l'établissement", beds_overall: "Lits (toutes disciplines)", wards: "Services de soins", field_hosp: "Hôpitaux de campagne rattachés", incidents: "Incidents engageant l'établissement",
    no_field: "Aucun hôpital de campagne rattaché.", no_ward: "Aucun service enregistré.", no_incident: "Aucun incident en cours.",
    capacities: "Capacités de l'établissement", add_ward: "Nouveau service", edit_ward: "Modifier le service", edit: "Modifier", delete: "Supprimer", cancel: "Annuler",
    save: "Enregistrer", saving: "Enregistrement…", saved: "Capacités mises à jour.",
    ward_created: "Service ouvert.", ward_saved: "Service mis à jour.", ward_deleted: "Service fermé.",
    delete_ward_title: "Fermer le service", delete_ward_text: "Confirmer la fermeture définitive du service",
    f_beds: "Lits armés", f_occ: "Lits occupés", f_icu: "Lits de réanimation", f_icu_occ: "Réanimation occupée", f_staff: "Effectif", f_amb: "Ambulances", f_heli: "Hélicoptères",
    f_ward_name: "Intitulé du service", f_ward_name_ph: "ex. Réanimation polyvalente", f_status: "Statut", f_chief: "Médecin-chef", f_chief_ph: "ex. Cdt. S. Alaoui",
    err_occ: "Les lits occupés ne peuvent pas dépasser les lits armés.", err_rea: "La réanimation occupée ne peut pas dépasser les lits de réanimation.", err_name: "Renseignez l'intitulé du service.", err_denied: "Action refusée par le serveur : hors de votre périmètre.",
    none_title: "Aucune responsabilité", none_text: "Le rôle actif n'est rattaché à aucune entité. Changez de rôle depuis le menu utilisateur si votre compte en cumule plusieurs.",
    unassigned_title: "Aucune entité affectée", unassigned_text: "Votre compte porte un rôle de responsable mais aucune entité ne lui est affectée. Contactez l'administrateur.",
    pending_text: "Le module de gestion de cette responsabilité est en cours de livraison. Entité affectée",
    manage_unit: "Gestion de mon unité", manage_shelter: "Gestion de mon abri",
    u_effectif: "Effectif", u_readiness: "Taux de préparation", u_posture: "Posture", u_posture_block: "Posture et effectif", u_missions: "Missions en cours", u_engaged: "Incidents engageant l'unité", u_cmdt: "Commandant",
    s_places_free: "Places disponibles", s_occupants: "Personnes hébergées", s_staff: "Encadrement", s_supplies: "Approvisionnement", s_occupancy: "Taux d'occupation", s_demography: "Démographie",
    s_adults: "Adultes", s_children: "Enfants", s_elderly: "Personnes âgées", s_needs: "Besoins", s_needs_field: "Besoins exprimés", s_needs_ph: "ex. Couvertures, eau potable",
    s_capacity: "Capacité d'accueil", s_capacity_block: "Capacité et encadrement", err_occupants: "Les personnes hébergées ne peuvent pas dépasser la capacité.",
    manage_morgue: "Gestion de mon site mortuaire",
    g_places_free: "Emplacements libres", g_unidentified: "Non identifiés", g_in_progress: "Identification en cours", g_released: "Restitués",
    g_occupancy: "Occupation du site", g_bodies_present: "Corps présents", g_progress: "Avancement de l'identification", g_register: "Registre d'identification", g_no_record: "Aucun dossier enregistré.",
    g_reference: "Référence", g_reference_ph: "ex. AH-2026-004", g_status: "Statut", g_identity: "Identité confirmée", g_identity_ph: "Nom et prénom",
    g_samples: "Prélèvements", g_found_at: "Lieu de découverte", g_found_at_ph: "ex. Douar Tinzert", g_sex: "Sexe", g_age: "Tranche d'âge",
    g_incident: "Incident d'origine", g_incident_none: "— Non rattaché —", g_admit: "Admettre un corps", g_admit_btn: "Enregistrer l'admission", g_admit_hint: "Le dossier est ouvert au statut « non identifié ». L'identité se renseigne ensuite, au fil de l'identification.", g_admitted: "Corps admis au registre.",
    g_record: "Dossier", g_record_saved: "Dossier mis à jour.", g_unknown: "Non identifié", g_closed: "Dossier clos",
    g_released_to: "remis à", g_released_field: "Remis à", g_released_ph: "ex. Famille Ait Oussaid (frère)", g_released_hint: "La restitution clôt définitivement le dossier : il ne sera plus modifiable.",
    g_site_block: "Capacité et effectif du site", g_capacity: "Emplacements réfrigérés", g_staff: "Effectif du site",
    g_err_reference: "La référence provisoire est obligatoire.", g_err_identity: "L'identité confirmée est obligatoire à ce statut.", g_err_released: "Indiquez à qui le corps est remis.", g_err_transition: "Étape refusée par le serveur : transition interdite ou dossier clos.",
    e_park: "Parc d'équipement", e_articles: "Articles au parc", e_below: "Sous le seuil", e_oos: "Hors service", e_inventory: "Inventaire du parc", e_empty: "Aucun article au parc.",
    e_add: "Ajouter un article", e_edit: "Modifier l'article", e_added: "Article ajouté au parc.", e_saved: "Article mis à jour.", e_removed: "Article sorti du parc.", e_low: "Stock bas",
    e_desig: "Désignation", e_desig_ph: "ex. Groupe électrogène 20 kVA", e_category: "Catégorie", e_category_ph: "ex. Énergie", e_condition: "État",
    e_stock: "Quantité en parc", e_threshold: "seuil", e_threshold_field: "Seuil d'alerte", e_err_fields: "Renseignez la désignation et la catégorie.",
    e_remove_title: "Sortir l'article du parc", e_remove_text: "Confirmer la sortie définitive de",
    equip_cond: { ok: "Opérationnel", repair: "En réparation", oos: "Hors service" },
    morgue_statut: { op: "Opérationnel", partial: "Partiel", closed: "Fermé" },
    dvi_status: { unidentified: "Non identifié", in_progress: "En cours", identified: "Identifié", released: "Restitué" },
    dvi_sample: { dna: "ADN", dental: "Dentaire", fingerprint: "Empreintes" },
    dvi_sex: { m: "Masculin", f: "Féminin", unknown: "Indéterminé" },
    unit_dispo: { ready: "Disponible", deployed: "Déployée", standby: "En alerte" },
    supply: { ok: "Suffisant", low: "Faible", critical: "Critique" },
    ward_status: { open: "Ouvert", saturated: "Saturé", closed: "Fermé" },
  },
  roles: { superadmin: "Super Administrateur", admin: "Administrateur", strategic: "Utilisateur Stratégique", place_arme: "Place d'Armes", wali: "Wali / Gouverneur", opcom: "OPCOM", tacom: "TACOM", bluecell: "Cellule Bleue — Opérations", greencell: "Cellule Verte — Logistique", orangecell: "Cellule Orange — Sécurité", resp_hospital: "Responsable Hôpital", resp_shelter: "Responsable Abri", resp_morgue: "Responsable Morgue", resp_unit: "Responsable Unité", resp_equipment: "Responsable Équipement" },
  users: {
    title: "Gestion des utilisateurs", subtitle: "Création, rôles et cycle de vie des comptes",
    tab_users: "Utilisateurs", tab_roles: "Rôles & fonctionnalités",
    new_user: "Nouvel utilisateur", edit_user: "Modifier l'utilisateur", edit: "Modifier", save: "Enregistrer", saved_toast: "Utilisateur mis à jour",
    delete_title: "Supprimer l'utilisateur", delete_body: "Cette action est irréversible : le compte et son accès à la plateforme seront supprimés.",
    matricule_locked: "Seul le Super Administrateur peut modifier le nom d'utilisateur.",
    matricule: "Nom d'utilisateur", matricule_ph: "ex. y.tazi",
firstname: "Prénom", firstname_ph: "ex. Ahmed", phone: "Numéro de téléphone", phone_ph: "+212 6 00 00 00 00", grade_none: "— Sélectionner un grade —", created_title: "Utilisateur créé", created_hint: "Transmettez ces identifiants à l'utilisateur par un canal sûr. Le mot de passe provisoire doit être changé à la première connexion.", created_close: "Terminé", col_phone: "Téléphone", identity: "Identité",     name: "Nom", name_ph: "ex. Tazi", grade: "Grade", grade_ph: "ex. Capitaine",
    roles_multi: "Rôles (plusieurs possibles)", roles_single: "Rôle",
    multi_hint: "Super Administrateur : vous pouvez cocher plusieurs rôles.",
    single_hint: "Administrateur : un seul rôle par utilisateur (hors Admin/Super Admin).",
    create: "Créer le compte", cancel: "Annuler", search: "Rechercher un utilisateur…",
    col_user: "Utilisateur", col_roles: "Rôles", col_status: "Statut", col_code: "Code temporaire", col_actions: "Actions",
    status_active: "Actif", status_inactive: "Inactif", online: "Connecté", offline: "Déconnecté",
    reveal: "Révéler", hide: "Masquer", no_code: "—",
    code_active_note: "Le code temporaire reste consultable tant que l'utilisateur ne l'a pas changé.",
    activate: "Activer", deactivate: "Désactiver", delete: "Supprimer",
    confirm_delete: "Supprimer définitivement cet utilisateur ?",
    activate_hint: "Activer le compte malgré le mot de passe temporaire (Super Admin).",
    admin_activated: "Activé par le Super Admin",
    you: "vous", builtin: "compte système", created_by: "Créé par", last_login: "Dernière connexion", never: "jamais",
    created_toast: "Compte créé — code temporaire : ", deleted_toast: "Utilisateur supprimé", activated_toast: "Statut mis à jour",
    need_role: "Sélectionnez au moins un rôle.", need_fields: "Renseignez le matricule et le nom.", dup_matricule: "Ce nom d'utilisateur existe déjà.",
    need_assignment: "Affectez une entité à chaque responsabilité.",
    assignment: "Rattachement",
    assignment_hint: "Un responsable ne pilote que l'entité qui lui est affectée. L'API refuse toute action en dehors de ce périmètre.",
    assignment_none: "— Sélectionner —",
    assignment_id_ph: "Identifiant de l'entité",
    responsibility: { hospital: "Hôpital militaire", unit: "Unité", shelter: "Abri", morgue: "Morgue", equipment: "Parc d'équipement" },
    role_features_title: "Fonctionnalités par rôle", role_features_hint: "Activez ou désactivez les modules autorisés pour chaque rôle. Ces droits complètent l'application côté API.",
    feature: "Fonctionnalité", allowed: "autorisé(s)", reset_role: "Réinitialiser", locked_all: "Accès total (verrouillé)",
    select_role: "Choisir un rôle", modules_count: "modules autorisés", empty: "Aucun utilisateur.",
    cp_title: "Changer le mot de passe", cp_hint: "Premier login : définissez votre mot de passe personnel pour activer le compte.",
    cp_new: "Nouveau mot de passe", cp_confirm: "Confirmer le mot de passe", cp_submit: "Définir et continuer", cp_skip: "Ignorer pour l'instant",
    cp_mismatch: "Les mots de passe ne correspondent pas.", cp_weak: "8 caractères minimum.", cp_done: "Mot de passe défini — compte activé",
    rc_title: "Sélection du rôle", switch_role: "Changer de rôle", role_switched: "Rôle actif : ", copy_code: "Copier le code", copied_toast: "Code copié dans le presse-papiers", rc_hint: "Vous disposez de plusieurs rôles. Choisissez celui à activer pour cette session.", rc_enter: "Accéder à la plateforme",
  },
};

const en: ModulesDict = {
  common: { search: "Search…", results: "results", all: "All", none: "No results", new: "New", export: "Export", date: "Date", ref: "Ref.", status: "Status", actions: "Actions", priority: "Priority", unit: "Unit", zone: "Zone", updated: "Updated", author: "Author", total: "Total", view: "Open" },
  equip: { tab_catalog: "Catalog", tab_movements: "Movements", col_stock: "Stock", col_threshold: "Threshold", cond_ok: "Operational", cond_repair: "To repair", cond_oos: "Out of service", low_stock: "Low stock", mv_in: "In", mv_out: "Out", mv_transfer: "Transfer", col_item: "Item", col_from: "From", col_to: "To", col_type: "Type", kpi_refs: "References", kpi_ok: "Operational", kpi_alerts: "Stock alerts" },
  personnel: { search: "Search personnel…", col_matricule: "Service ID", col_availability: "Availability", av_available: "Available", av_deployed: "Deployed", av_rest: "Rest", av_unavailable: "Unavailable", kpi_total: "Total strength", kpi_deployed: "Deployed", kpi_available: "Available" },
  workorders: { col_subject: "Subject", col_assignee: "Assignee", col_sla: "Due", col_created: "Created", st_requested: "Requested", st_approved: "Approved", st_assigned: "Assigned", st_inprogress: "In progress", st_done: "Done", st_verified: "Verified", pr_low: "Low", pr_medium: "Medium", pr_high: "High", pr_urgent: "Urgent", kpi_open: "Open orders", kpi_progress: "In progress", kpi_overdue: "Overdue" },
  triage: { red: "Red — Immediate", yellow: "Yellow — Delayed", green: "Green — Minor", black: "Black — Deceased", kpi_victims: "Casualties", kpi_triaged: "Triaged", kpi_evac: "Evacuated", zones: "Triage zones", flow: "Casualty flow", flow_site: "On site", flow_evac: "In evacuation", flow_hosp: "Admitted", col_tag: "Tag", col_category: "Category", col_destination: "Destination", per_zone: "Per zone" },
  shelters: { col_occupancy: "Occupancy", col_occupants: "Occupants", col_supplies: "Supplies", col_needs: "Needs", sup_ok: "Sufficient", sup_low: "Low", sup_critical: "Critical", kpi_active: "Active shelters", kpi_capacity: "Total capacity", kpi_displaced: "People sheltered", adults: "Adults", children: "Children", elderly: "Elderly" },
  damage: { col_building: "Building type", col_grade: "Grade (EMS-98)", col_habitability: "Habitability", col_assessor: "Assessor", g1: "1 · Negligible", g2: "2 · Moderate", g3: "3 · Severe", g4: "4 · Very heavy", g5: "5 · Destruction", hab_ok: "Habitable", hab_restricted: "Restricted", hab_no: "Uninhabitable", kpi_assessments: "Assessments", kpi_uninhabitable: "Uninhabitable", kpi_zones: "Affected zones", by_grade: "By grade" },
  orsec: { plan_level: "ORSEC plan level", activated: "Activated", big_screen: "Big-screen mode", casualties: "Casualty count", resources: "Committed resources", hospitals: "Hospital load", shelters: "Shelters", org: "Activated command structure", decisions: "Decisions log", col_decision: "Decision", roster: "Duty officers", n_dead: "Deaths", n_injured: "Injured", n_missing: "Missing", n_rescued: "Rescued", engaged: "Engaged", available: "Available", load: "Occupancy" },
  plans: { col_plan: "Plan", col_type: "Type", col_version: "Version", st_active: "Active", st_draft: "Draft", st_review: "In review", st_expired: "Expired", activate: "Activate", checklist: "Activation checklist" },
  ics: { col_code: "Code", col_title: "Title", col_incident: "Incident", st_draft: "Draft", st_review: "In review", st_approved: "Approved", f201: "Incident briefing", f202: "Objectives", f203: "Organization chart", f204: "Assignment lists", f205: "Communications plan", f206: "Medical plan", f209: "Situation summary", f214: "Activity log" },
  reports: { col_number: "No.", col_title: "Title", col_incident: "Incident", col_period: "Period", col_published: "Published", st_draft: "Draft", st_published: "Published", classification: "Restricted distribution", kpi_published: "Published", kpi_draft: "Drafts" },
  analytics: { kpi_response: "Avg alert→on-site delay", kpi_evac_admit: "Evac→admission", kpi_closed: "Closure rate", kpi_util: "Resource utilization", response_times: "Response times (min)", incident_trend: "Incident trend (7 d)", resource_util: "Resource utilization", hospital_sat: "Hospital saturation", triage_outcomes: "Triage outcomes", severity_dist: "Severity distribution", minutes: "min" },
  dispatch: { strip_ops: "Active operations", strip_units: "Engaged units", strip_movements: "Movements in transit", strip_queue: "Dispatch queue", strip_available: "Available units", need: "Need to handle", select_need: "Select an operation or request", units_board: "Units", eta: "ETA", score: "Score", match: "Match", engage: "Engage", relieve: "Relieve", engaged: "Engaged", reco_title: "Recommendations", reco_hint: "Recommendation engine — proximity × capability × availability", apply: "Apply", best: "Best option", excluded: "Excluded", b_travel: "Travel time", b_cap: "Capabilities", b_readiness: "Op. readiness", b_avail: "Availability", caps_required: "Required capabilities", mv_mission: "Mission", mv_vehicles: "Vehicles", mv_origin: "Origin", mv_dest: "Destination", mv_cargo: "Cargo", mv_progress: "Progress", mv_delay: "Delay", mv_ontime: "On time", queue_title: "Dispatch queue", treat: "Handle", urg_urgent: "Urgent", urg_high: "Priority", urg_medium: "Normal", confirm_engage: "Confirm engagement", reason: "Reason (required)", reason_ph: "Justify the decision…", confirm: "Confirm engagement", audit_note: "Every decision is confirmed, reasoned and audited.", min: "min", sim: "Simulation « what if? »", sim_hint: "Adjust score weights to compare scenarios, without engaging", sim_reset: "Reset", sim_active: "Simulation active", weights_title: "Score weights" },
  ai: { subtitle: "Operational assistant — natural-language queries", guardrail: "Read-only: the assistant queries the Layer 1 engine and drafts; it executes no action and every exchange is logged.", provider_local: "Local LLM", provider_online: "connected", provider_offline: "offline — deterministic answers", mode_llm: "rephrased by the local LLM", mode_det: "deterministic answer (Layer 1)", layer1: "Layer 1 query", placeholder: "Ask an operational question…", send: "Send", clear: "Clear", examples: "Examples", ex_reach: "Which units can reach Al Haouz in under an hour with generators?", ex_reach2: "Engineering units available for the Al Hoceïma landslide within 3 hours", ex_sitrep: "Draft a SITREP for Operation SALAMA", ex_anomaly: "Summarize anomalies in current movements", thinking: "Analyzing…", empty: "Ask a question or pick an example.", model: "Model", no_models: "no model detected", configure: "Configure" },
  settings: { reserved: "Super Administrator only", ai_title: "AI assistant — Language model (LLM)", provider: "Provider", endpoint: "Endpoint (URL)", model: "Model", model_ph: "model name (e.g. llama3.1:8b)", detect: "Detect / Test", detected: "model(s) detected", status_connected: "Connected", status_offline: "Offline", status_checking: "Testing…", note: "In production these settings are managed by the Super Admin and propagated to all stations via the ARGOS API; the LLM call runs server-side.", future_title: "Other settings", future_hint: "Device registry, branding, log retention… (coming soon)", reset: "Defaults", flags_title: "Modules (feature flags)", flags_hint: "Enable or disable modules globally. A disabled module disappears from navigation and its page is locked.", module_disabled: "Module disabled by the administrator.", types_title: "Incident types", types_hint: "Add new types; they appear immediately in the report wizard with the chosen icon.", type_id: "Identifier", type_id_ph: "e.g. sandstorm", type_icon: "Icon", label_fr: "FR label", label_ar: "AR label", label_en: "EN label", type_add: "Add type", type_added: "Incident type added", type_exists: "This type already exists.", type_builtin: "Built-in", types_search: "Search a type…", types_empty: "No type matches.", audit_title: "Audit log", audit_intact: "chain intact", audit_broken: "chain broken", audit_refresh: "Refresh", audit_empty: "No entry — toggle a module to generate a trace.", seis_title: "Seismic alerts", seis_hint: "An earthquake on national territory ≥ the national threshold triggers a red in-app alert AND SMS + e-mail to the authorities below (server-side watch). A worldwide earthquake ≥ the global threshold only triggers an in-app notification.", seis_ma_lbl: "National threshold (SMS + e-mail)", seis_ma_hint: "min. magnitude of a quake in Morocco", seis_world_lbl: "Global threshold (app notification)", seis_world_hint: "min. magnitude of a quake outside Morocco", seis_contacts: "Notified authorities", seis_c_name: "Name / role", seis_c_phone: "Phone (SMS)", seis_c_email: "E-mail", seis_add: "Add an authority", seis_save: "Save", seis_saved: "Alert configuration saved", seis_log: "Recent dispatches", seis_log_empty: "No dispatch yet.", seis_sent_to: "authority(ies)" },
  sup: { title: "Responsibility oversight", subtitle: "Review each manager’s dashboard", viewing: "Manager view", back: "Back to list", empty: "No entity of this kind." },
  resp: {
    my_responsibility: "My responsibility", manage: "Manage", manage_title: "Manage my facility", loading: "Loading…",
    beds_free: "Available beds", icu_free: "Available ICU", icu: "Intensive care", staff: "Medical staff", vehicles: "Assets", amb_heli: "ambulances + helicopters",
    load: "Facility load", beds_overall: "Beds (all wards)", wards: "Care wards", field_hosp: "Attached field hospitals", incidents: "Incidents involving the facility",
    no_field: "No field hospital attached.", no_ward: "No ward registered.", no_incident: "No ongoing incident.",
    capacities: "Facility capacity", add_ward: "New ward", edit_ward: "Edit ward", edit: "Edit", delete: "Delete", cancel: "Cancel",
    save: "Save", saving: "Saving…", saved: "Capacity updated.",
    ward_created: "Ward opened.", ward_saved: "Ward updated.", ward_deleted: "Ward closed.",
    delete_ward_title: "Close ward", delete_ward_text: "Confirm permanent closure of ward",
    f_beds: "Staffed beds", f_occ: "Occupied beds", f_icu: "ICU beds", f_icu_occ: "ICU occupied", f_staff: "Staff", f_amb: "Ambulances", f_heli: "Helicopters",
    f_ward_name: "Ward name", f_ward_name_ph: "e.g. General intensive care", f_status: "Status", f_chief: "Head physician", f_chief_ph: "e.g. Maj. S. Alaoui",
    err_occ: "Occupied beds cannot exceed staffed beds.", err_rea: "Occupied ICU cannot exceed ICU beds.", err_name: "Enter the ward name.", err_denied: "Rejected by the server: outside your scope.",
    none_title: "No responsibility", none_text: "The active role is not attached to any entity. Switch role from the user menu if your account holds several.",
    unassigned_title: "No entity assigned", unassigned_text: "Your account holds a manager role but no entity is assigned to it. Contact the administrator.",
    pending_text: "The management module for this responsibility is being delivered. Assigned entity",
    manage_unit: "Manage my unit", manage_shelter: "Manage my shelter",
    u_effectif: "Headcount", u_readiness: "Readiness", u_posture: "Posture", u_posture_block: "Posture and headcount", u_missions: "Ongoing missions", u_engaged: "Incidents involving the unit", u_cmdt: "Commanding officer",
    s_places_free: "Available places", s_occupants: "People sheltered", s_staff: "Staff", s_supplies: "Supplies", s_occupancy: "Occupancy", s_demography: "Demographics",
    s_adults: "Adults", s_children: "Children", s_elderly: "Elderly", s_needs: "Needs", s_needs_field: "Stated needs", s_needs_ph: "e.g. Blankets, drinking water",
    s_capacity: "Capacity", s_capacity_block: "Capacity and staff", err_occupants: "People sheltered cannot exceed capacity.",
    manage_morgue: "Manage my mortuary site",
    g_places_free: "Free places", g_unidentified: "Unidentified", g_in_progress: "Identification ongoing", g_released: "Released",
    g_occupancy: "Site occupancy", g_bodies_present: "Bodies held", g_progress: "Identification progress", g_register: "Identification register", g_no_record: "No record.",
    g_reference: "Reference", g_reference_ph: "e.g. AH-2026-004", g_status: "Status", g_identity: "Confirmed identity", g_identity_ph: "Full name",
    g_samples: "Samples", g_found_at: "Place found", g_found_at_ph: "e.g. Douar Tinzert", g_sex: "Sex", g_age: "Age range",
    g_incident: "Source incident", g_incident_none: "— Unlinked —", g_admit: "Admit a body", g_admit_btn: "Record admission", g_admit_hint: "The record opens as « unidentified ». Identity is filled in later, as identification progresses.", g_admitted: "Body admitted to the register.",
    g_record: "Record", g_record_saved: "Record updated.", g_unknown: "Unidentified", g_closed: "Record closed",
    g_released_to: "released to", g_released_field: "Released to", g_released_ph: "e.g. Ait Oussaid family (brother)", g_released_hint: "Release closes the record permanently: it can no longer be edited.",
    g_site_block: "Site capacity and staff", g_capacity: "Refrigerated places", g_staff: "Site staff",
    g_err_reference: "The provisional reference is required.", g_err_identity: "Confirmed identity is required at this status.", g_err_released: "State who the body is released to.", g_err_transition: "Step rejected by the server: forbidden transition or closed record.",
    e_park: "Equipment pool", e_articles: "Items in pool", e_below: "Below threshold", e_oos: "Out of service", e_inventory: "Pool inventory", e_empty: "No item in the pool.",
    e_add: "Add an item", e_edit: "Edit item", e_added: "Item added to the pool.", e_saved: "Item updated.", e_removed: "Item removed from the pool.", e_low: "Low stock",
    e_desig: "Designation", e_desig_ph: "e.g. 20 kVA generator", e_category: "Category", e_category_ph: "e.g. Power", e_condition: "Condition",
    e_stock: "Quantity held", e_threshold: "threshold", e_threshold_field: "Alert threshold", e_err_fields: "Enter the designation and category.",
    e_remove_title: "Remove item from pool", e_remove_text: "Confirm permanent removal of",
    equip_cond: { ok: "Operational", repair: "Under repair", oos: "Out of service" },
    morgue_statut: { op: "Operational", partial: "Partial", closed: "Closed" },
    dvi_status: { unidentified: "Unidentified", in_progress: "In progress", identified: "Identified", released: "Released" },
    dvi_sample: { dna: "DNA", dental: "Dental", fingerprint: "Fingerprints" },
    dvi_sex: { m: "Male", f: "Female", unknown: "Undetermined" },
    unit_dispo: { ready: "Ready", deployed: "Deployed", standby: "Standby" },
    supply: { ok: "Sufficient", low: "Low", critical: "Critical" },
    ward_status: { open: "Open", saturated: "Saturated", closed: "Closed" },
  },
  roles: { superadmin: "Super Administrator", admin: "Administrator", strategic: "Strategic User", place_arme: "Place d'Armes", wali: "Wali / Governor", opcom: "OPCOM", tacom: "TACOM", bluecell: "Blue Cell — Operations", greencell: "Green Cell — Logistics", orangecell: "Orange Cell — Security", resp_hospital: "Hospital Manager", resp_shelter: "Shelter Manager", resp_morgue: "Morgue Manager", resp_unit: "Unit Manager", resp_equipment: "Equipment Manager" },
  users: {
    title: "User management", subtitle: "Account creation, roles and lifecycle",
    tab_users: "Users", tab_roles: "Roles & features",
    new_user: "New user", edit_user: "Edit user", edit: "Edit", save: "Save", saved_toast: "User updated",
    delete_title: "Delete user", delete_body: "This action is irreversible: the account and its platform access will be removed.",
    matricule_locked: "Only the Super Administrator can change the username.",
    matricule: "Username", matricule_ph: "e.g. y.tazi",
firstname: "First name", firstname_ph: "e.g. Ahmed", phone: "Phone number", phone_ph: "+212 6 00 00 00 00", grade_none: "— Select a rank —", created_title: "User created", created_hint: "Hand these credentials to the user over a secure channel. The temporary password must be changed at first sign-in.", created_close: "Done", col_phone: "Phone", identity: "Identity",     name: "Last name", name_ph: "e.g. Tazi", grade: "Rank", grade_ph: "e.g. Captain",
    roles_multi: "Roles (multiple allowed)", roles_single: "Role",
    multi_hint: "Super Administrator: you may tick several roles.",
    single_hint: "Administrator: one role per user (excluding Admin/Super Admin).",
    create: "Create account", cancel: "Cancel", search: "Search a user…",
    col_user: "User", col_roles: "Roles", col_status: "Status", col_code: "Temporary code", col_actions: "Actions",
    status_active: "Active", status_inactive: "Inactive", online: "Online", offline: "Offline",
    reveal: "Reveal", hide: "Hide", no_code: "—",
    code_active_note: "The temporary code stays visible until the user changes it.",
    activate: "Activate", deactivate: "Deactivate", delete: "Delete",
    confirm_delete: "Permanently delete this user?",
    activate_hint: "Activate the account despite the temporary password (Super Admin).",
    admin_activated: "Activated by Super Admin",
    you: "you", builtin: "system account", created_by: "Created by", last_login: "Last login", never: "never",
    created_toast: "Account created — temporary code: ", deleted_toast: "User deleted", activated_toast: "Status updated",
    need_role: "Select at least one role.", need_fields: "Enter the service ID and name.", dup_matricule: "This username already exists.",
    need_assignment: "Assign an entity to each responsibility.",
    assignment: "Assignment",
    assignment_hint: "A manager only operates the entity assigned to them. The API rejects any action outside that scope.",
    assignment_none: "— Select —",
    assignment_id_ph: "Entity identifier",
    responsibility: { hospital: "Military hospital", unit: "Unit", shelter: "Shelter", morgue: "Morgue", equipment: "Equipment pool" },
    role_features_title: "Features per role", role_features_hint: "Enable or disable the modules allowed for each role. These rights complement API-side enforcement.",
    feature: "Feature", allowed: "allowed", reset_role: "Reset", locked_all: "Full access (locked)",
    select_role: "Pick a role", modules_count: "allowed modules", empty: "No users.",
    cp_title: "Change password", cp_hint: "First login: set your personal password to activate the account.",
    cp_new: "New password", cp_confirm: "Confirm password", cp_submit: "Set and continue", cp_skip: "Skip for now",
    cp_mismatch: "Passwords do not match.", cp_weak: "8 characters minimum.", cp_done: "Password set — account activated",
    rc_title: "Role selection", switch_role: "Switch role", role_switched: "Active role: ", copy_code: "Copy code", copied_toast: "Code copied to clipboard", rc_hint: "You hold several roles. Pick the one to activate for this session.", rc_enter: "Enter the platform",
  },
};

const ar: ModulesDict = {
  common: { search: "بحث…", results: "نتائج", all: "الكل", none: "لا توجد نتائج", new: "جديد", export: "تصدير", date: "التاريخ", ref: "مرجع", status: "الحالة", actions: "إجراءات", priority: "الأولوية", unit: "الوحدة", zone: "المنطقة", updated: "آخر تحديث", author: "المحرر", total: "المجموع", view: "فتح" },
  equip: { tab_catalog: "الجرد", tab_movements: "الحركات", col_stock: "المخزون", col_threshold: "العتبة", cond_ok: "عملياتي", cond_repair: "قيد الإصلاح", cond_oos: "خارج الخدمة", low_stock: "مخزون منخفض", mv_in: "دخول", mv_out: "خروج", mv_transfer: "تحويل", col_item: "العنصر", col_from: "من", col_to: "إلى", col_type: "النوع", kpi_refs: "المراجع", kpi_ok: "العملياتية", kpi_alerts: "تنبيهات المخزون" },
  personnel: { search: "البحث عن فرد…", col_matricule: "رقم التسجيل", col_availability: "الجاهزية", av_available: "متاح", av_deployed: "منتشر", av_rest: "راحة", av_unavailable: "غير متاح", kpi_total: "التعداد الإجمالي", kpi_deployed: "المنتشرون", kpi_available: "المتاحون" },
  workorders: { col_subject: "الموضوع", col_assignee: "مُسند إلى", col_sla: "الأجل", col_created: "أُنشئ", st_requested: "مطلوب", st_approved: "مُعتمد", st_assigned: "مُسند", st_inprogress: "جارٍ", st_done: "منجز", st_verified: "مُتحقق", pr_low: "منخفضة", pr_medium: "متوسطة", pr_high: "عالية", pr_urgent: "عاجلة", kpi_open: "أوامر مفتوحة", kpi_progress: "جارية", kpi_overdue: "متأخرة" },
  triage: { red: "أحمر — استعجال مطلق", yellow: "أصفر — استعجال نسبي", green: "أخضر — إصابات خفيفة", black: "أسود — وفيات", kpi_victims: "الضحايا", kpi_triaged: "المفروزون", kpi_evac: "المُجلَون", zones: "مناطق الفرز", flow: "تدفق الضحايا", flow_site: "في الموقع", flow_evac: "قيد الإجلاء", flow_hosp: "مُستقبَلون", col_tag: "البطاقة", col_category: "الفئة", col_destination: "الوجهة", per_zone: "حسب المنطقة" },
  shelters: { col_occupancy: "نسبة الإشغال", col_occupants: "الشاغلون", col_supplies: "التموين", col_needs: "الاحتياجات", sup_ok: "كافٍ", sup_low: "منخفض", sup_critical: "حرج", kpi_active: "الملاجئ النشطة", kpi_capacity: "السعة الإجمالية", kpi_displaced: "الأشخاص المؤوون", adults: "بالغون", children: "أطفال", elderly: "مسنون" },
  damage: { col_building: "نوع المبنى", col_grade: "الدرجة (EMS-98)", col_habitability: "قابلية السكن", col_assessor: "المُقيِّم", g1: "1 · طفيف", g2: "2 · متوسط", g3: "3 · شديد", g4: "4 · بالغ الخطورة", g5: "5 · تدمير", hab_ok: "صالح للسكن", hab_restricted: "دخول مقيد", hab_no: "غير صالح للسكن", kpi_assessments: "التقييمات", kpi_uninhabitable: "غير صالحة", kpi_zones: "المناطق المتضررة", by_grade: "حسب الدرجة" },
  orsec: { plan_level: "مستوى مخطط ORSEC", activated: "مُفعَّل", big_screen: "وضع الشاشة الكبيرة", casualties: "الحصيلة البشرية", resources: "الموارد المعبأة", hospitals: "الحمل الاستشفائي", shelters: "الملاجئ", org: "هيكل القيادة المفعّل", decisions: "سجل القرارات", col_decision: "القرار", roster: "ضباط المداومة", n_dead: "وفيات", n_injured: "جرحى", n_missing: "مفقودون", n_rescued: "منقذون", engaged: "معبأة", available: "متاحة", load: "نسبة الإشغال" },
  plans: { col_plan: "المخطط", col_type: "النوع", col_version: "الإصدار", st_active: "نشط", st_draft: "مسودة", st_review: "قيد المراجعة", st_expired: "منتهٍ", activate: "تفعيل", checklist: "قائمة التفعيل" },
  ics: { col_code: "الرمز", col_title: "العنوان", col_incident: "الحادث", st_draft: "مسودة", st_review: "قيد المراجعة", st_approved: "معتمد", f201: "إحاطة الحادث", f202: "الأهداف", f203: "الهيكل التنظيمي", f204: "قوائم التكليف", f205: "خطة الاتصالات", f206: "الخطة الطبية", f209: "ملخص الوضع", f214: "سجل النشاط" },
  reports: { col_number: "الرقم", col_title: "العنوان", col_incident: "الحادث", col_period: "الفترة", col_published: "نُشر في", st_draft: "مسودة", st_published: "منشور", classification: "توزيع مقيد", kpi_published: "منشورة", kpi_draft: "مسودات" },
  analytics: { kpi_response: "متوسط زمن الإنذار→الموقع", kpi_evac_admit: "الإجلاء→الاستقبال", kpi_closed: "معدل الإغلاق", kpi_util: "استخدام الموارد", response_times: "أزمنة الاستجابة (دقيقة)", incident_trend: "اتجاه الحوادث (7 أيام)", resource_util: "استخدام الموارد", hospital_sat: "الإشباع الاستشفائي", triage_outcomes: "نتائج الفرز", severity_dist: "التوزيع حسب الخطورة", minutes: "دقيقة" },
  dispatch: { strip_ops: "العمليات النشطة", strip_units: "الوحدات المعبأة", strip_movements: "التنقلات الجارية", strip_queue: "قائمة التوزيع", strip_available: "الوحدات المتاحة", need: "الحاجة المطلوب معالجتها", select_need: "اختر عملية أو طلبا", units_board: "الوحدات", eta: "الوصول المقدر", score: "النقطة", match: "الملاءمة", engage: "تعبئة", relieve: "سحب", engaged: "معبأة", reco_title: "التوصيات", reco_hint: "محرك التوصية — القرب × القدرات × التوفر", apply: "تطبيق", best: "الخيار الأفضل", excluded: "مستبعدة", b_travel: "زمن التنقل", b_cap: "القدرات", b_readiness: "الجاهزية العملياتية", b_avail: "التوفر", caps_required: "القدرات المطلوبة", mv_mission: "المهمة", mv_vehicles: "المركبات", mv_origin: "المصدر", mv_dest: "الوجهة", mv_cargo: "الحمولة", mv_progress: "التقدم", mv_delay: "التأخير", mv_ontime: "في الوقت", queue_title: "قائمة التوزيع", treat: "معالجة", urg_urgent: "عاجل", urg_high: "ذو أولوية", urg_medium: "عادي", confirm_engage: "تأكيد التعبئة", reason: "المبرر (إلزامي)", reason_ph: "مبرر القرار…", confirm: "تأكيد التعبئة", audit_note: "كل قرار مؤكد ومبرر ومدقق.", min: "دقيقة", sim: "محاكاة « ماذا لو؟ »", sim_hint: "اضبط أوزان النقطة لمقارنة السيناريوهات دون تعبئة", sim_reset: "إعادة تعيين", sim_active: "محاكاة نشطة", weights_title: "أوزان النقطة" },
  ai: { subtitle: "مساعد عملياتي — استعلامات باللغة الطبيعية", guardrail: "قراءة فقط: يستعلم المساعد محرك الطبقة 1 ويحرر ؛ لا ينفذ أي إجراء وكل تبادل مُسجَّل.", provider_local: "نموذج محلي", provider_online: "متصل", provider_offline: "غير متصل — إجابات حتمية", mode_llm: "أعاد صياغته النموذج المحلي", mode_det: "إجابة حتمية (الطبقة 1)", layer1: "استعلام الطبقة 1", placeholder: "اطرح سؤالا عملياتيا…", send: "إرسال", clear: "مسح", examples: "أمثلة", ex_reach: "ما الوحدات التي يمكنها بلوغ الحوز في أقل من ساعة بمولدات كهربائية؟", ex_reach2: "وحدات الهندسة القابلة للتعبئة لانزلاق الحسيمة في أقل من 3 ساعات", ex_sitrep: "أنشئ مسودة تقرير وضع لعملية سلامة", ex_anomaly: "لخّص شذوذات التنقلات الجارية", thinking: "جارٍ التحليل…", empty: "اطرح سؤالا أو اختر مثالا.", model: "النموذج", no_models: "لا نموذج مكتشف", configure: "إعداد" },
  settings: { reserved: "مخصص للمدير الأعلى", ai_title: "المساعد الذكي — نموذج اللغة (LLM)", provider: "المزود", endpoint: "نقطة الوصول (URL)", model: "النموذج", model_ph: "اسم النموذج (مثال llama3.1:8b)", detect: "كشف / اختبار", detected: "نموذج مكتشف", status_connected: "متصل", status_offline: "غير متصل", status_checking: "اختبار…", note: "في الإنتاج، يدير المدير الأعلى هذه الإعدادات وتُنشر إلى جميع المحطات عبر واجهة ARGOS ؛ يُنفَّذ نداء LLM من جهة الخادم.", future_title: "إعدادات أخرى", future_hint: "سجل الأجهزة، الهوية البصرية، مدة حفظ السجلات… (قريبا)", reset: "القيم الافتراضية", flags_title: "الوحدات (أعلام الميزات)", flags_hint: "فعّل أو عطّل الوحدات عالميا. الوحدة المعطّلة تختفي من التنقل وتُقفل صفحتها.", module_disabled: "وحدة معطّلة من طرف المدير.", types_title: "أنواع الحوادث", types_hint: "أضف أنواعا جديدة ؛ تظهر فورا في مساعد التبليغ بالأيقونة المختارة.", type_id: "المعرّف", type_id_ph: "مثال: aasifa_ramliya", type_icon: "الأيقونة", label_fr: "التسمية بالفرنسية", label_ar: "التسمية بالعربية", label_en: "التسمية بالإنجليزية", type_add: "إضافة النوع", type_added: "تمت إضافة نوع الحادث", type_exists: "هذا النوع موجود بالفعل.", type_builtin: "أصلي", types_search: "ابحث عن نوع…", types_empty: "لا يوجد نوع مطابق.", audit_title: "سجل التدقيق", audit_intact: "السلسلة سليمة", audit_broken: "السلسلة مكسورة", audit_refresh: "تحديث", audit_empty: "لا يوجد سجل — بدّل وحدة لإنشاء أثر.", seis_title: "الإنذارات الزلزالية", seis_hint: "زلزال على التراب الوطني ≥ العتبة الوطنية يطلق إنذارا أحمر في التطبيق وإرسال رسائل نصية وبريد إلكتروني إلى السلطات أدناه (مراقبة من جهة الخادم). زلزال عالمي ≥ العتبة العالمية يطلق إشعارا في التطبيق فقط.", seis_ma_lbl: "العتبة الوطنية (رسائل + بريد)", seis_ma_hint: "أدنى قوة لزلزال في المغرب", seis_world_lbl: "العتبة العالمية (إشعار التطبيق)", seis_world_hint: "أدنى قوة لزلزال خارج المغرب", seis_contacts: "السلطات المُشعَرة", seis_c_name: "الاسم / الصفة", seis_c_phone: "الهاتف (SMS)", seis_c_email: "البريد الإلكتروني", seis_add: "إضافة سلطة", seis_save: "حفظ", seis_saved: "تم حفظ إعدادات الإنذار", seis_log: "آخر الإرسالات", seis_log_empty: "لا إرسال حتى الآن.", seis_sent_to: "سلطة" },
  sup: { title: "الإشراف على المسؤوليات", subtitle: "الاطلاع على لوحة قيادة كل مسؤول", viewing: "عرض المسؤول", back: "العودة إلى القائمة", empty: "لا يوجد كيان من هذا النوع." },
  resp: {
    my_responsibility: "مسؤوليتي", manage: "إدارة", manage_title: "إدارة مؤسستي", loading: "جار التحميل…",
    beds_free: "الأسرة المتاحة", icu_free: "الإنعاش المتاح", icu: "الإنعاش", staff: "الطاقم الطبي", vehicles: "الوسائل", amb_heli: "سيارات إسعاف + مروحيات",
    load: "حمولة المؤسسة", beds_overall: "الأسرة (كل التخصصات)", wards: "أقسام العلاج", field_hosp: "المستشفيات الميدانية المرتبطة", incidents: "الحوادث التي تعني المؤسسة",
    no_field: "لا يوجد مستشفى ميداني مرتبط.", no_ward: "لا يوجد قسم مسجل.", no_incident: "لا توجد حادثة جارية.",
    capacities: "طاقات المؤسسة", add_ward: "قسم جديد", edit_ward: "تعديل القسم", edit: "تعديل", delete: "حذف", cancel: "إلغاء",
    save: "حفظ", saving: "جار الحفظ…", saved: "تم تحديث الطاقات.",
    ward_created: "تم فتح القسم.", ward_saved: "تم تحديث القسم.", ward_deleted: "تم إغلاق القسم.",
    delete_ward_title: "إغلاق القسم", delete_ward_text: "تأكيد الإغلاق النهائي للقسم",
    f_beds: "الأسرة المجهزة", f_occ: "الأسرة المشغولة", f_icu: "أسرة الإنعاش", f_icu_occ: "الإنعاش المشغول", f_staff: "الطاقم", f_amb: "سيارات الإسعاف", f_heli: "المروحيات",
    f_ward_name: "اسم القسم", f_ward_name_ph: "مثال: الإنعاش متعدد التخصصات", f_status: "الحالة", f_chief: "الطبيب الرئيس", f_chief_ph: "مثال: الرائد س. علوي",
    err_occ: "لا يمكن أن تتجاوز الأسرة المشغولة الأسرة المجهزة.", err_rea: "لا يمكن أن يتجاوز الإنعاش المشغول أسرة الإنعاش.", err_name: "أدخل اسم القسم.", err_denied: "رُفض من الخادم: خارج نطاقك.",
    none_title: "لا توجد مسؤولية", none_text: "الدور النشط غير مرتبط بأي كيان. غيّر الدور من قائمة المستخدم إذا كان حسابك يجمع عدة أدوار.",
    unassigned_title: "لا يوجد كيان مسند", unassigned_text: "حسابك يحمل دور مسؤول لكن لم يُسند إليه أي كيان. اتصل بالمدير.",
    pending_text: "وحدة إدارة هذه المسؤولية قيد التسليم. الكيان المسند",
    manage_unit: "إدارة وحدتي", manage_shelter: "إدارة ملجئي",
    u_effectif: "التعداد", u_readiness: "نسبة الجاهزية", u_posture: "الوضعية", u_posture_block: "الوضعية والتعداد", u_missions: "المهام الجارية", u_engaged: "الحوادث التي تعني الوحدة", u_cmdt: "القائد",
    s_places_free: "الأماكن المتاحة", s_occupants: "الأشخاص المؤويون", s_staff: "التأطير", s_supplies: "التموين", s_occupancy: "نسبة الإشغال", s_demography: "التركيبة السكانية",
    s_adults: "بالغون", s_children: "أطفال", s_elderly: "مسنون", s_needs: "الاحتياجات", s_needs_field: "الاحتياجات المعبر عنها", s_needs_ph: "مثال: أغطية، ماء صالح للشرب",
    s_capacity: "الطاقة الاستيعابية", s_capacity_block: "الطاقة والتأطير", err_occupants: "لا يمكن أن يتجاوز عدد المؤويين الطاقة الاستيعابية.",
    manage_morgue: "إدارة موقع المشرحة",
    g_places_free: "الأماكن الشاغرة", g_unidentified: "غير محددي الهوية", g_in_progress: "تحديد الهوية جار", g_released: "مسلَّمون",
    g_occupancy: "إشغال الموقع", g_bodies_present: "الجثث الموجودة", g_progress: "تقدم تحديد الهوية", g_register: "سجل تحديد الهوية", g_no_record: "لا يوجد ملف مسجل.",
    g_reference: "المرجع", g_reference_ph: "مثال: AH-2026-004", g_status: "الحالة", g_identity: "الهوية المؤكدة", g_identity_ph: "الاسم الكامل",
    g_samples: "العينات", g_found_at: "مكان العثور", g_found_at_ph: "مثال: دوار تينزرت", g_sex: "الجنس", g_age: "الفئة العمرية",
    g_incident: "الحادثة الأصلية", g_incident_none: "— غير مرتبط —", g_admit: "قبول جثة", g_admit_btn: "تسجيل القبول", g_admit_hint: "يُفتح الملف بحالة « غير محدد الهوية ». تُملأ الهوية لاحقا مع تقدم عملية التعرف.", g_admitted: "تم قبول الجثة في السجل.",
    g_record: "ملف", g_record_saved: "تم تحديث الملف.", g_unknown: "غير محدد الهوية", g_closed: "ملف مغلق",
    g_released_to: "سُلِّم إلى", g_released_field: "سُلِّم إلى", g_released_ph: "مثال: عائلة أيت أوسعيد (الأخ)", g_released_hint: "التسليم يغلق الملف نهائيا: لن يعود قابلا للتعديل.",
    g_site_block: "طاقة الموقع وطاقمه", g_capacity: "الأماكن المبردة", g_staff: "طاقم الموقع",
    g_err_reference: "المرجع المؤقت إلزامي.", g_err_identity: "الهوية المؤكدة إلزامية في هذه الحالة.", g_err_released: "حدد إلى من سُلِّمت الجثة.", g_err_transition: "رُفضت الخطوة من الخادم: انتقال ممنوع أو ملف مغلق.",
    e_park: "حظيرة المعدات", e_articles: "الأصناف في الحظيرة", e_below: "دون العتبة", e_oos: "خارج الخدمة", e_inventory: "جرد الحظيرة", e_empty: "لا يوجد صنف في الحظيرة.",
    e_add: "إضافة صنف", e_edit: "تعديل الصنف", e_added: "تمت إضافة الصنف.", e_saved: "تم تحديث الصنف.", e_removed: "تم إخراج الصنف.", e_low: "مخزون منخفض",
    e_desig: "التسمية", e_desig_ph: "مثال: مولد كهربائي 20 كيلوفولت أمبير", e_category: "الفئة", e_category_ph: "مثال: الطاقة", e_condition: "الحالة",
    e_stock: "الكمية المتوفرة", e_threshold: "العتبة", e_threshold_field: "عتبة التنبيه", e_err_fields: "أدخل التسمية والفئة.",
    e_remove_title: "إخراج الصنف من الحظيرة", e_remove_text: "تأكيد الإخراج النهائي لـ",
    equip_cond: { ok: "عملياتي", repair: "قيد الإصلاح", oos: "خارج الخدمة" },
    morgue_statut: { op: "عملياتي", partial: "جزئي", closed: "مغلق" },
    dvi_status: { unidentified: "غير محدد الهوية", in_progress: "قيد الإنجاز", identified: "محدد الهوية", released: "مسلَّم" },
    dvi_sample: { dna: "الحمض النووي", dental: "الأسنان", fingerprint: "البصمات" },
    dvi_sex: { m: "ذكر", f: "أنثى", unknown: "غير محدد" },
    unit_dispo: { ready: "جاهزة", deployed: "منتشرة", standby: "في حالة تأهب" },
    supply: { ok: "كاف", low: "ضعيف", critical: "حرج" },
    ward_status: { open: "مفتوح", saturated: "مشبع", closed: "مغلق" },
  },
  roles: { superadmin: "المدير الأعلى", admin: "المدير", strategic: "المستخدم الاستراتيجي", place_arme: "ساحة السلاح", wali: "الوالي / العامل", opcom: "أوبكوم OPCOM", tacom: "تاكوم TACOM", bluecell: "الخلية الزرقاء — العمليات", greencell: "الخلية الخضراء — اللوجستيك", orangecell: "الخلية البرتقالية — الأمن", resp_hospital: "مسؤول المستشفى", resp_shelter: "مسؤول الملجأ", resp_morgue: "مسؤول المشرحة", resp_unit: "مسؤول الوحدة", resp_equipment: "مسؤول المعدات" },
  users: {
    title: "إدارة المستخدمين", subtitle: "إنشاء الحسابات والأدوار ودورة الحياة",
    tab_users: "المستخدمون", tab_roles: "الأدوار والوظائف",
    new_user: "مستخدم جديد", edit_user: "تعديل المستخدم", edit: "تعديل", save: "حفظ", saved_toast: "تم تحديث المستخدم",
    delete_title: "حذف المستخدم", delete_body: "هذا الإجراء لا رجعة فيه: سيُحذف الحساب وحق ولوجه إلى المنصة.",
    matricule_locked: "المدير الأعلى وحده يمكنه تغيير اسم المستخدم.",
    matricule: "اسم المستخدم", matricule_ph: "مثال y.tazi",
firstname: "الاسم الشخصي", firstname_ph: "مثال: أحمد", phone: "رقم الهاتف", phone_ph: "+212 6 00 00 00 00", grade_none: "— اختر رتبة —", created_title: "تم إنشاء المستخدم", created_hint: "سلّم هذه البيانات للمستخدم عبر قناة آمنة. يجب تغيير كلمة السر المؤقتة عند أول اتصال.", created_close: "تم", col_phone: "الهاتف", identity: "الهوية",     name: "الاسم العائلي", name_ph: "مثال: التازي", grade: "الرتبة", grade_ph: "مثال نقيب",
    roles_multi: "الأدوار (يمكن تعدُّدها)", roles_single: "الدور",
    multi_hint: "المدير الأعلى: يمكنك تحديد عدة أدوار.",
    single_hint: "المدير: دور واحد لكل مستخدم (باستثناء المدير/المدير الأعلى).",
    create: "إنشاء الحساب", cancel: "إلغاء", search: "البحث عن مستخدم…",
    col_user: "المستخدم", col_roles: "الأدوار", col_status: "الحالة", col_code: "الرمز المؤقت", col_actions: "إجراءات",
    status_active: "نشط", status_inactive: "غير نشط", online: "متصل", offline: "غير متصل",
    reveal: "إظهار", hide: "إخفاء", no_code: "—",
    code_active_note: "يبقى الرمز المؤقت قابلا للاطلاع ما لم يغيّره المستخدم.",
    activate: "تفعيل", deactivate: "تعطيل", delete: "حذف",
    confirm_delete: "حذف هذا المستخدم نهائيا؟",
    activate_hint: "تفعيل الحساب رغم كلمة السر المؤقتة (المدير الأعلى).",
    admin_activated: "مُفعّل من المدير الأعلى",
    you: "أنت", builtin: "حساب النظام", created_by: "أنشأه", last_login: "آخر اتصال", never: "أبدا",
    created_toast: "تم إنشاء الحساب — الرمز المؤقت: ", deleted_toast: "تم حذف المستخدم", activated_toast: "تم تحديث الحالة",
    need_role: "اختر دورا واحدا على الأقل.", need_fields: "أدخل رقم التسجيل والاسم.", dup_matricule: "اسم المستخدم موجود مسبقا.",
    need_assignment: "خصص كيانا لكل مسؤولية.",
    assignment: "الإسناد",
    assignment_hint: "المسؤول لا يدير إلا الكيان المسند إليه. واجهة البرمجة ترفض أي إجراء خارج هذا النطاق.",
    assignment_none: "— اختر —",
    assignment_id_ph: "معرف الكيان",
    responsibility: { hospital: "مستشفى عسكري", unit: "وحدة", shelter: "ملجأ", morgue: "مشرحة", equipment: "حظيرة المعدات" },
    role_features_title: "الوظائف حسب الدور", role_features_hint: "فعّل أو عطّل الوحدات المسموح بها لكل دور. تكمّل هذه الحقوق التطبيق من جهة الواجهة.",
    feature: "الوظيفة", allowed: "مسموح", reset_role: "إعادة تعيين", locked_all: "وصول كامل (مقفل)",
    select_role: "اختر دورا", modules_count: "وحدات مسموحة", empty: "لا مستخدمون.",
    cp_title: "تغيير كلمة السر", cp_hint: "أول اتصال: عيّن كلمة سرك الشخصية لتفعيل الحساب.",
    cp_new: "كلمة سر جديدة", cp_confirm: "تأكيد كلمة السر", cp_submit: "تعيين ومتابعة", cp_skip: "تجاهل الآن",
    cp_mismatch: "كلمتا السر غير متطابقتين.", cp_weak: "8 أحرف على الأقل.", cp_done: "تم تعيين كلمة السر — الحساب مفعّل",
    rc_title: "اختيار الدور", switch_role: "تغيير الدور", role_switched: "الدور النشط: ", copy_code: "نسخ الرمز", copied_toast: "تم نسخ الرمز إلى الحافظة", rc_hint: "لديك عدة أدوار. اختر الدور المراد تفعيله لهذه الجلسة.", rc_enter: "الدخول إلى المنصة",
  },
};

export const MODULES: Record<Lang, ModulesDict> = { fr, ar, en };
