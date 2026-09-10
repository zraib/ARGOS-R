// ============================================================================
// ARGOS — chaînes d'interface des flux externes (sismologie EMSC + météo)
// Regroupées à part pour ne pas alourdir le Dict principal. Contient aussi la
// correspondance des codes météo WMO (Open-Meteo) → libellé + pictogramme.
// ============================================================================

import type { Lang } from "@/lib/types";

export interface FluxDict {
  // --- sismologie ---
  seis_title: string;
  seis_sub: string;
  seis_region: string;
  seis_region_world: string;
  seis_region_morocco: string;
  seis_minmag: string;
  seis_live: string;
  seis_layer: string;
  seis_col_mag: string;
  seis_col_region: string;
  seis_col_depth: string;
  seis_col_time: string;
  seis_on_map: string;
  seis_empty: string;
  seis_updated: string;
  seis_count: string;
  seis_km: string;
  seis_strongest: string;
  seis_last24: string;
  seis_source: string;
  // --- alerte séisme (pop-up globale) ---
  alert_title: string;
  alert_body: string;
  alert_ma_title: string;
  alert_ma_body: string;
  alert_ma_sent: string;
  alert_ma_none: string;
  alert_view: string;
  alert_dismiss: string;
  // --- météo ---
  wx_title: string;
  wx_sub: string;
  wx_city: string;
  wx_now: string;
  wx_temp: string;
  wx_feels: string;
  wx_humidity: string;
  wx_wind: string;
  wx_precip: string;
  wx_forecast: string;
  wx_today: string;
  wx_updated: string;
  wx_unavailable: string;
  wx_source: string;
  wx_high: string;
  wx_low: string;
  // --- détails sismiques (zone dépliable) ---
  seis_details: string;
  seis_magtype: string;
  seis_agency: string;
  seis_evtype: string;
  seis_update: string;
  seis_ref: string;
  seis_coords: string;
  seis_local: string;
  // --- détails météo (jour déplié) ---
  wx_details: string;
  wx_feels_short: string;
  wx_pressure: string;
  wx_cloud: string;
  wx_gust: string;
  wx_wind_max: string;
  wx_precip_prob: string;
  wx_uv: string;
  wx_sunrise: string;
  wx_sunset: string;
  // --- animation de la carte météo ---
  wx_play: string;
  wx_pause: string;
  /** Menu contextuel : prévisions du point visé. */
  wx_here: string;
}

const fr: FluxDict = {
  seis_title: "Situation sismique",
  seis_sub: "Séismes récents — Centre sismologique euro-méditerranéen (CSEM/EMSC)",
  seis_region: "Périmètre",
  seis_region_world: "Monde",
  seis_region_morocco: "Maroc",
  seis_minmag: "Magnitude min.",
  seis_live: "En direct",
  seis_layer: "Afficher sur la carte",
  seis_col_mag: "Mag.",
  seis_col_region: "Région",
  seis_col_depth: "Profondeur",
  seis_col_time: "Heure (UTC)",
  seis_on_map: "Voir sur la carte",
  seis_empty: "Aucun séisme pour ce périmètre.",
  seis_updated: "Mis à jour",
  seis_count: "événements",
  seis_km: "km",
  seis_strongest: "Le plus fort",
  seis_last24: "Dernières 24 h",
  seis_source: "Source : CSEM/EMSC (proxy souverain IRIS)",
  alert_title: "Nouveau séisme détecté",
  alert_body: "Un séisme vient d'être enregistré par le CSEM/EMSC.",
  alert_ma_title: "ALERTE SISMIQUE NATIONALE",
  alert_ma_body: "Séisme enregistré sur le territoire national.",
  alert_ma_sent: "Autorités notifiées par SMS et e-mail :",
  alert_ma_none: "Aucune autorité configurée — voir Paramètres.",
  alert_view: "Afficher sur la carte",
  alert_dismiss: "Ignorer",
  wx_title: "Météo",
  wx_sub: "Prévisions par ville — service Open-Meteo",
  wx_city: "Ville",
  wx_now: "Conditions actuelles",
  wx_temp: "Température",
  wx_feels: "Ressenti",
  wx_humidity: "Humidité",
  wx_wind: "Vent",
  wx_precip: "Précipitations",
  wx_forecast: "Prévisions 7 jours",
  wx_today: "Aujourd'hui",
  wx_updated: "Mis à jour",
  wx_unavailable: "Prévisions indisponibles.",
  wx_source: "Source : Open-Meteo",
  wx_high: "Max",
  wx_low: "Min",
  seis_details: "Détails de l'événement",
  seis_magtype: "Type de magnitude",
  seis_agency: "Agence",
  seis_evtype: "Type d'événement",
  seis_update: "Dernière mise à jour",
  seis_ref: "Réf. source",
  seis_coords: "Coordonnées",
  seis_local: "Heure locale",
  wx_details: "Détails du jour",
  wx_feels_short: "Ressenti",
  wx_pressure: "Pression",
  wx_cloud: "Nébulosité",
  wx_gust: "Rafales",
  wx_wind_max: "Vent max",
  wx_precip_prob: "Prob. précip.",
  wx_uv: "Indice UV",
  wx_sunrise: "Lever du soleil",
  wx_sunset: "Coucher du soleil",
  wx_play: "Lecture",
  wx_pause: "Pause",
  wx_here: "Prévisions météo ici",
};

const en: FluxDict = {
  seis_title: "Seismic situation",
  seis_sub: "Recent earthquakes — Euro-Mediterranean Seismological Centre (EMSC)",
  seis_region: "Scope",
  seis_region_world: "World",
  seis_region_morocco: "Morocco",
  seis_minmag: "Min. magnitude",
  seis_live: "Live",
  seis_layer: "Show on map",
  seis_col_mag: "Mag.",
  seis_col_region: "Region",
  seis_col_depth: "Depth",
  seis_col_time: "Time (UTC)",
  seis_on_map: "View on map",
  seis_empty: "No earthquake for this scope.",
  seis_updated: "Updated",
  seis_count: "events",
  seis_km: "km",
  seis_strongest: "Strongest",
  seis_last24: "Last 24 h",
  seis_source: "Source: EMSC (IRIS sovereign proxy)",
  alert_title: "New earthquake detected",
  alert_body: "An earthquake has just been recorded by the EMSC.",
  alert_ma_title: "NATIONAL SEISMIC ALERT",
  alert_ma_body: "Earthquake recorded on national territory.",
  alert_ma_sent: "Authorities notified by SMS and e-mail:",
  alert_ma_none: "No authority configured — see Settings.",
  alert_view: "Show on map",
  alert_dismiss: "Dismiss",
  wx_title: "Weather",
  wx_sub: "Forecasts by city — Open-Meteo service",
  wx_city: "City",
  wx_now: "Current conditions",
  wx_temp: "Temperature",
  wx_feels: "Feels like",
  wx_humidity: "Humidity",
  wx_wind: "Wind",
  wx_precip: "Precipitation",
  wx_forecast: "7-day forecast",
  wx_today: "Today",
  wx_updated: "Updated",
  wx_unavailable: "Forecast unavailable.",
  wx_source: "Source: Open-Meteo",
  wx_high: "High",
  wx_low: "Low",
  seis_details: "Event details",
  seis_magtype: "Magnitude type",
  seis_agency: "Agency",
  seis_evtype: "Event type",
  seis_update: "Last update",
  seis_ref: "Source ref.",
  seis_coords: "Coordinates",
  seis_local: "Local time",
  wx_details: "Day details",
  wx_feels_short: "Feels like",
  wx_pressure: "Pressure",
  wx_cloud: "Cloud cover",
  wx_gust: "Gusts",
  wx_wind_max: "Max wind",
  wx_precip_prob: "Precip. prob.",
  wx_uv: "UV index",
  wx_sunrise: "Sunrise",
  wx_sunset: "Sunset",
  wx_play: "Play",
  wx_pause: "Pause",
  wx_here: "Weather forecast here",
};

const ar: FluxDict = {
  seis_title: "الوضع الزلزالي",
  seis_sub: "الزلازل الأخيرة — المركز الأورومتوسطي لعلم الزلازل (CSEM/EMSC)",
  seis_region: "النطاق",
  seis_region_world: "العالم",
  seis_region_morocco: "المغرب",
  seis_minmag: "أدنى قوة",
  seis_live: "مباشر",
  seis_layer: "إظهار على الخريطة",
  seis_col_mag: "القوة",
  seis_col_region: "المنطقة",
  seis_col_depth: "العمق",
  seis_col_time: "الوقت (UTC)",
  seis_on_map: "عرض على الخريطة",
  seis_empty: "لا زلازل في هذا النطاق.",
  seis_updated: "آخر تحديث",
  seis_count: "أحداث",
  seis_km: "كم",
  seis_strongest: "الأقوى",
  seis_last24: "آخر 24 ساعة",
  seis_source: "المصدر: CSEM/EMSC (وسيط سيادي IRIS)",
  alert_title: "رُصد زلزال جديد",
  alert_body: "سُجِّل زلزال للتو من طرف CSEM/EMSC.",
  alert_ma_title: "إنذار زلزالي وطني",
  alert_ma_body: "سُجِّل زلزال على التراب الوطني.",
  alert_ma_sent: "تم إشعار السلطات عبر رسائل نصية وبريد إلكتروني:",
  alert_ma_none: "لا توجد سلطة مُعدَّة — راجع الإعدادات.",
  alert_view: "عرض على الخريطة",
  alert_dismiss: "تجاهل",
  wx_title: "الطقس",
  wx_sub: "توقعات حسب المدينة — خدمة Open-Meteo",
  wx_city: "المدينة",
  wx_now: "الأحوال الحالية",
  wx_temp: "درجة الحرارة",
  wx_feels: "الإحساس",
  wx_humidity: "الرطوبة",
  wx_wind: "الرياح",
  wx_precip: "التساقطات",
  wx_forecast: "توقعات 7 أيام",
  wx_today: "اليوم",
  wx_updated: "آخر تحديث",
  wx_unavailable: "التوقعات غير متاحة.",
  wx_source: "المصدر: Open-Meteo",
  wx_high: "العظمى",
  wx_low: "الصغرى",
  seis_details: "تفاصيل الحدث",
  seis_magtype: "نوع القوة",
  seis_agency: "الوكالة",
  seis_evtype: "نوع الحدث",
  seis_update: "آخر تحديث",
  seis_ref: "مرجع المصدر",
  seis_coords: "الإحداثيات",
  seis_local: "التوقيت المحلي",
  wx_details: "تفاصيل اليوم",
  wx_feels_short: "الإحساس",
  wx_pressure: "الضغط",
  wx_cloud: "الغيوم",
  wx_gust: "الهبات",
  wx_wind_max: "أقصى رياح",
  wx_precip_prob: "احتمال التساقط",
  wx_uv: "مؤشر UV",
  wx_sunrise: "الشروق",
  wx_sunset: "الغروب",
  wx_play: "تشغيل",
  wx_pause: "إيقاف",
  wx_here: "توقعات الطقس هنا",
};

export const FLUX: Record<Lang, FluxDict> = { fr, ar, en };

// --- Codes météo WMO (Open-Meteo) → libellé trilingue + pictogramme ---------
// Regroupés par familles (ciel clair, nuageux, brouillard, bruine, pluie, neige,
// averses, orages). Le pictogramme est un emoji (glyphe système, aucune ressource
// externe — conforme §4.3).

interface WmoEntry {
  icon: string;
  fr: string;
  ar: string;
  en: string;
}

const WMO: Record<number, WmoEntry> = {
  0: { icon: "☀️", fr: "Ciel dégagé", ar: "سماء صافية", en: "Clear sky" },
  1: { icon: "🌤️", fr: "Plutôt dégagé", ar: "صافٍ غالبا", en: "Mainly clear" },
  2: { icon: "⛅", fr: "Partiellement nuageux", ar: "غائم جزئيا", en: "Partly cloudy" },
  3: { icon: "☁️", fr: "Couvert", ar: "غائم", en: "Overcast" },
  45: { icon: "🌫️", fr: "Brouillard", ar: "ضباب", en: "Fog" },
  48: { icon: "🌫️", fr: "Brouillard givrant", ar: "ضباب متجمد", en: "Rime fog" },
  51: { icon: "🌦️", fr: "Bruine légère", ar: "رذاذ خفيف", en: "Light drizzle" },
  53: { icon: "🌦️", fr: "Bruine", ar: "رذاذ", en: "Drizzle" },
  55: { icon: "🌧️", fr: "Bruine dense", ar: "رذاذ كثيف", en: "Dense drizzle" },
  56: { icon: "🌧️", fr: "Bruine verglaçante", ar: "رذاذ متجمد", en: "Freezing drizzle" },
  57: { icon: "🌧️", fr: "Bruine verglaçante dense", ar: "رذاذ متجمد كثيف", en: "Dense freezing drizzle" },
  61: { icon: "🌧️", fr: "Pluie faible", ar: "مطر خفيف", en: "Light rain" },
  63: { icon: "🌧️", fr: "Pluie modérée", ar: "مطر معتدل", en: "Moderate rain" },
  65: { icon: "🌧️", fr: "Pluie forte", ar: "مطر غزير", en: "Heavy rain" },
  66: { icon: "🌧️", fr: "Pluie verglaçante", ar: "مطر متجمد", en: "Freezing rain" },
  67: { icon: "🌧️", fr: "Pluie verglaçante forte", ar: "مطر متجمد غزير", en: "Heavy freezing rain" },
  71: { icon: "🌨️", fr: "Neige faible", ar: "ثلج خفيف", en: "Light snow" },
  73: { icon: "🌨️", fr: "Neige modérée", ar: "ثلج معتدل", en: "Moderate snow" },
  75: { icon: "❄️", fr: "Neige forte", ar: "ثلج غزير", en: "Heavy snow" },
  77: { icon: "❄️", fr: "Grains de neige", ar: "حبيبات ثلجية", en: "Snow grains" },
  80: { icon: "🌦️", fr: "Averses faibles", ar: "زخات خفيفة", en: "Light showers" },
  81: { icon: "🌧️", fr: "Averses", ar: "زخات", en: "Showers" },
  82: { icon: "⛈️", fr: "Averses violentes", ar: "زخات عنيفة", en: "Violent showers" },
  85: { icon: "🌨️", fr: "Averses de neige", ar: "زخات ثلجية", en: "Snow showers" },
  86: { icon: "❄️", fr: "Fortes averses de neige", ar: "زخات ثلجية قوية", en: "Heavy snow showers" },
  95: { icon: "⛈️", fr: "Orage", ar: "عاصفة رعدية", en: "Thunderstorm" },
  96: { icon: "⛈️", fr: "Orage avec grêle", ar: "عاصفة رعدية مع برد", en: "Thunderstorm with hail" },
  99: { icon: "⛈️", fr: "Orage violent avec grêle", ar: "عاصفة رعدية عنيفة مع برد", en: "Severe thunderstorm with hail" },
};

const WMO_FALLBACK: WmoEntry = { icon: "🌡️", fr: "Conditions variables", ar: "أحوال متغيرة", en: "Variable conditions" };

/** Libellé + pictogramme d'un code météo WMO pour la langue active. */
export function wmoText(code: number, lang: Lang): { icon: string; label: string } {
  const e = WMO[code] ?? WMO_FALLBACK;
  return { icon: e.icon, label: e[lang] };
}
