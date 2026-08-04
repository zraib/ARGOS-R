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
  };
  roles: Record<
    "superadmin" | "admin" | "auditor" | "command" | "dispatcher" | "unit_commander" | "field_agent",
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
    grade: string;
    grade_ph: string;
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
  settings: { reserved: "Réservé au Super Administrateur", ai_title: "Assistant IA — Modèle de langage (LLM)", provider: "Fournisseur", endpoint: "Point d'accès (URL)", model: "Modèle", model_ph: "nom du modèle (ex. llama3.1:8b)", detect: "Détecter / Tester", detected: "modèle(s) détecté(s)", status_connected: "Connecté", status_offline: "Hors ligne", status_checking: "Test…", note: "En production, ces réglages sont pilotés par le Super Admin et propagés à tous les postes via l'API ARGOS ; l'appel LLM s'exécute côté serveur.", future_title: "Autres paramètres", future_hint: "Registre des appareils, image de marque, rétention des journaux… (à venir)", reset: "Valeurs par défaut", flags_title: "Modules (feature flags)", flags_hint: "Activez ou désactivez les modules globalement. Un module désactivé disparaît de la navigation et sa page est verrouillée.", module_disabled: "Module désactivé par l'administrateur.", types_title: "Types d'incident", types_hint: "Ajoutez de nouveaux types ; ils apparaissent aussitôt dans l'assistant de déclaration avec l'icône choisie.", type_id: "Identifiant", type_id_ph: "ex. tempete_sable", type_icon: "Icône", label_fr: "Libellé FR", label_ar: "Libellé AR", label_en: "Libellé EN", type_add: "Ajouter le type", type_added: "Type d'incident ajouté", type_exists: "Ce type existe déjà.", type_builtin: "Fourni", types_search: "Rechercher un type…", types_empty: "Aucun type ne correspond.", audit_title: "Journal d'audit", audit_intact: "chaîne intègre", audit_broken: "chaîne rompue", audit_refresh: "Actualiser", audit_empty: "Aucune entrée — basculez un module pour générer une trace." },
  roles: { superadmin: "Super Administrateur", admin: "Administrateur", auditor: "Auditeur", command: "Commandement", dispatcher: "Répartiteur", unit_commander: "Chef d'Unité", field_agent: "Agent de Terrain" },
  users: {
    title: "Gestion des utilisateurs", subtitle: "Création, rôles et cycle de vie des comptes",
    tab_users: "Utilisateurs", tab_roles: "Rôles & fonctionnalités",
    new_user: "Nouvel utilisateur", edit_user: "Modifier l'utilisateur", edit: "Modifier", save: "Enregistrer", saved_toast: "Utilisateur mis à jour",
    delete_title: "Supprimer l'utilisateur", delete_body: "Cette action est irréversible : le compte et son accès à la plateforme seront supprimés.",
    matricule_locked: "L'identifiant de connexion n'est pas modifiable.",
    matricule: "Matricule", matricule_ph: "ex. y.tazi",
    name: "Nom complet", name_ph: "ex. Cne. Y. Tazi", grade: "Grade", grade_ph: "ex. Capitaine",
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
    need_role: "Sélectionnez au moins un rôle.", need_fields: "Renseignez le matricule et le nom.", dup_matricule: "Ce matricule existe déjà.",
    role_features_title: "Fonctionnalités par rôle", role_features_hint: "Activez ou désactivez les modules autorisés pour chaque rôle. Ces droits complètent l'application côté API.",
    feature: "Fonctionnalité", allowed: "autorisé(s)", reset_role: "Réinitialiser", locked_all: "Accès total (verrouillé)",
    select_role: "Choisir un rôle", modules_count: "modules autorisés", empty: "Aucun utilisateur.",
    cp_title: "Changer le mot de passe", cp_hint: "Premier login : définissez votre mot de passe personnel pour activer le compte.",
    cp_new: "Nouveau mot de passe", cp_confirm: "Confirmer le mot de passe", cp_submit: "Définir et continuer", cp_skip: "Ignorer pour l'instant",
    cp_mismatch: "Les mots de passe ne correspondent pas.", cp_weak: "8 caractères minimum.", cp_done: "Mot de passe défini — compte activé",
    rc_title: "Sélection du rôle", rc_hint: "Vous disposez de plusieurs rôles. Choisissez celui à activer pour cette session.", rc_enter: "Accéder à la plateforme",
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
  settings: { reserved: "Super Administrator only", ai_title: "AI assistant — Language model (LLM)", provider: "Provider", endpoint: "Endpoint (URL)", model: "Model", model_ph: "model name (e.g. llama3.1:8b)", detect: "Detect / Test", detected: "model(s) detected", status_connected: "Connected", status_offline: "Offline", status_checking: "Testing…", note: "In production these settings are managed by the Super Admin and propagated to all stations via the ARGOS API; the LLM call runs server-side.", future_title: "Other settings", future_hint: "Device registry, branding, log retention… (coming soon)", reset: "Defaults", flags_title: "Modules (feature flags)", flags_hint: "Enable or disable modules globally. A disabled module disappears from navigation and its page is locked.", module_disabled: "Module disabled by the administrator.", types_title: "Incident types", types_hint: "Add new types; they appear immediately in the report wizard with the chosen icon.", type_id: "Identifier", type_id_ph: "e.g. sandstorm", type_icon: "Icon", label_fr: "FR label", label_ar: "AR label", label_en: "EN label", type_add: "Add type", type_added: "Incident type added", type_exists: "This type already exists.", type_builtin: "Built-in", types_search: "Search a type…", types_empty: "No type matches.", audit_title: "Audit log", audit_intact: "chain intact", audit_broken: "chain broken", audit_refresh: "Refresh", audit_empty: "No entry — toggle a module to generate a trace." },
  roles: { superadmin: "Super Administrator", admin: "Administrator", auditor: "Auditor", command: "Command", dispatcher: "Dispatcher", unit_commander: "Unit commander", field_agent: "Field agent" },
  users: {
    title: "User management", subtitle: "Account creation, roles and lifecycle",
    tab_users: "Users", tab_roles: "Roles & features",
    new_user: "New user", edit_user: "Edit user", edit: "Edit", save: "Save", saved_toast: "User updated",
    delete_title: "Delete user", delete_body: "This action is irreversible: the account and its platform access will be removed.",
    matricule_locked: "The login ID cannot be changed.",
    matricule: "Service ID", matricule_ph: "e.g. y.tazi",
    name: "Full name", name_ph: "e.g. Cpt. Y. Tazi", grade: "Rank", grade_ph: "e.g. Captain",
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
    need_role: "Select at least one role.", need_fields: "Enter the service ID and name.", dup_matricule: "This service ID already exists.",
    role_features_title: "Features per role", role_features_hint: "Enable or disable the modules allowed for each role. These rights complement API-side enforcement.",
    feature: "Feature", allowed: "allowed", reset_role: "Reset", locked_all: "Full access (locked)",
    select_role: "Pick a role", modules_count: "allowed modules", empty: "No users.",
    cp_title: "Change password", cp_hint: "First login: set your personal password to activate the account.",
    cp_new: "New password", cp_confirm: "Confirm password", cp_submit: "Set and continue", cp_skip: "Skip for now",
    cp_mismatch: "Passwords do not match.", cp_weak: "8 characters minimum.", cp_done: "Password set — account activated",
    rc_title: "Role selection", rc_hint: "You hold several roles. Pick the one to activate for this session.", rc_enter: "Enter the platform",
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
  settings: { reserved: "مخصص للمدير الأعلى", ai_title: "المساعد الذكي — نموذج اللغة (LLM)", provider: "المزود", endpoint: "نقطة الوصول (URL)", model: "النموذج", model_ph: "اسم النموذج (مثال llama3.1:8b)", detect: "كشف / اختبار", detected: "نموذج مكتشف", status_connected: "متصل", status_offline: "غير متصل", status_checking: "اختبار…", note: "في الإنتاج، يدير المدير الأعلى هذه الإعدادات وتُنشر إلى جميع المحطات عبر واجهة ARGOS ؛ يُنفَّذ نداء LLM من جهة الخادم.", future_title: "إعدادات أخرى", future_hint: "سجل الأجهزة، الهوية البصرية، مدة حفظ السجلات… (قريبا)", reset: "القيم الافتراضية", flags_title: "الوحدات (أعلام الميزات)", flags_hint: "فعّل أو عطّل الوحدات عالميا. الوحدة المعطّلة تختفي من التنقل وتُقفل صفحتها.", module_disabled: "وحدة معطّلة من طرف المدير.", types_title: "أنواع الحوادث", types_hint: "أضف أنواعا جديدة ؛ تظهر فورا في مساعد التبليغ بالأيقونة المختارة.", type_id: "المعرّف", type_id_ph: "مثال: aasifa_ramliya", type_icon: "الأيقونة", label_fr: "التسمية بالفرنسية", label_ar: "التسمية بالعربية", label_en: "التسمية بالإنجليزية", type_add: "إضافة النوع", type_added: "تمت إضافة نوع الحادث", type_exists: "هذا النوع موجود بالفعل.", type_builtin: "أصلي", types_search: "ابحث عن نوع…", types_empty: "لا يوجد نوع مطابق.", audit_title: "سجل التدقيق", audit_intact: "السلسلة سليمة", audit_broken: "السلسلة مكسورة", audit_refresh: "تحديث", audit_empty: "لا يوجد سجل — بدّل وحدة لإنشاء أثر." },
  roles: { superadmin: "المدير الأعلى", admin: "المدير", auditor: "المدقق", command: "القيادة", dispatcher: "الموزع", unit_commander: "قائد الوحدة", field_agent: "عون ميداني" },
  users: {
    title: "إدارة المستخدمين", subtitle: "إنشاء الحسابات والأدوار ودورة الحياة",
    tab_users: "المستخدمون", tab_roles: "الأدوار والوظائف",
    new_user: "مستخدم جديد", edit_user: "تعديل المستخدم", edit: "تعديل", save: "حفظ", saved_toast: "تم تحديث المستخدم",
    delete_title: "حذف المستخدم", delete_body: "هذا الإجراء لا رجعة فيه: سيُحذف الحساب وحق ولوجه إلى المنصة.",
    matricule_locked: "لا يمكن تغيير معرّف الدخول.",
    matricule: "رقم التسجيل", matricule_ph: "مثال y.tazi",
    name: "الاسم الكامل", name_ph: "مثال نقيب ي. التازي", grade: "الرتبة", grade_ph: "مثال نقيب",
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
    need_role: "اختر دورا واحدا على الأقل.", need_fields: "أدخل رقم التسجيل والاسم.", dup_matricule: "رقم التسجيل موجود مسبقا.",
    role_features_title: "الوظائف حسب الدور", role_features_hint: "فعّل أو عطّل الوحدات المسموح بها لكل دور. تكمّل هذه الحقوق التطبيق من جهة الواجهة.",
    feature: "الوظيفة", allowed: "مسموح", reset_role: "إعادة تعيين", locked_all: "وصول كامل (مقفل)",
    select_role: "اختر دورا", modules_count: "وحدات مسموحة", empty: "لا مستخدمون.",
    cp_title: "تغيير كلمة السر", cp_hint: "أول اتصال: عيّن كلمة سرك الشخصية لتفعيل الحساب.",
    cp_new: "كلمة سر جديدة", cp_confirm: "تأكيد كلمة السر", cp_submit: "تعيين ومتابعة", cp_skip: "تجاهل الآن",
    cp_mismatch: "كلمتا السر غير متطابقتين.", cp_weak: "8 أحرف على الأقل.", cp_done: "تم تعيين كلمة السر — الحساب مفعّل",
    rc_title: "اختيار الدور", rc_hint: "لديك عدة أدوار. اختر الدور المراد تفعيله لهذه الجلسة.", rc_enter: "الدخول إلى المنصة",
  },
};

export const MODULES: Record<Lang, ModulesDict> = { fr, ar, en };
