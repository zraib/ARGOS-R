"use client";

import { useEffect, useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import type { DescriptionProposalInput } from "@/lib/ai/draft";
import { LAST_STEP, buildIncidentBody, canNext, cityOptionsFor, formFromIncident, rankByDistance } from "@/lib/incidents/wizard";
import { StepCasualties } from "@/components/incidents/wizard/StepCasualties";
import { StepDetails } from "@/components/incidents/wizard/StepDetails";
import { StepLocation } from "@/components/incidents/wizard/StepLocation";
import { StepType } from "@/components/incidents/wizard/StepType";
import { Stepper } from "@/components/incidents/wizard/Stepper";
import { useDraftGeneration } from "@/components/incidents/wizard/useDraftGeneration";
import { useLocationFields } from "@/components/incidents/wizard/useLocationFields";
import { useWizardForm } from "@/components/incidents/wizard/useWizardForm";

/**
 * Assistant « Signaler un incident » en 4 étapes (type → détails → localisation
 * → bilan et moyens), aussi utilisé en ÉDITION d'une fiche existante.
 *
 * Ce fichier est la coquille : il relie le magasin, tient l'étape courante et
 * envoie la charge. Le formulaire vit dans `wizard/useWizardForm`, chaque étape
 * dans `wizard/Step*.tsx`, et tout ce qui se décide (validation, rattachement,
 * charge envoyée, pré-remplissage) dans `lib/incidents/wizard.ts`, testé seul.
 */
export function IncidentWizard() {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const open = useArgos((s) => s.wizOpen);
  const initLL = useArgos((s) => s.wizInitLL);
  const wizEdit = useArgos((s) => s.wizEdit);
  const close = useArgos((s) => s.closeWizard);
  const loadDomain = useArgos((s) => s.loadDomain);
  const provinces = useArgos((s) => s.provinces);
  const cities = useArgos((s) => s.cities);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const showToast = useArgos((s) => s.showToast);
  const nrbcSubstances = useArgos((s) => s.nrbcSubstances);
  const ensureNrbcSubstances = useArgos((s) => s.ensureNrbcSubstances);

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const { form, actions } = useWizardForm();
  const loc = useLocationFields(actions, cities, provinces);

  // Le catalogue de substances n'est tiré que lorsqu'il devient nécessaire.
  useEffect(() => {
    if (open && form.type === "nrbc") void ensureNrbcSubstances();
  }, [open, form.type, ensureNrbcSubstances]);

  const province = useMemo(() => provinces.find((p) => p.v === form.prov), [form.prov, provinces]);
  const cityOptions = useMemo(() => cityOptionsFor(province, cities), [province, cities]);
  // Moyens classés par proximité au point de l'incident (suggestion = le plus proche).
  const nearUnits = useMemo(() => rankByDistance(units, form.pt), [units, form.pt]);
  const nearHosps = useMemo(() => rankByDistance(hospitals, form.pt), [hospitals, form.pt]);

  const keywordsFlat = form.keywords.join(" , ");
  const draftInput = useMemo<DescriptionProposalInput>(
    () => ({
      type: form.type,
      titre: form.title,
      adresse: form.adresse,
      province: form.prov,
      ville: form.city,
      pt: form.pt,
      lang: (lang as "fr" | "ar" | "en") ?? "fr",
      incidentTypes,
      keywords: keywordsFlat,
    }),
    [form.type, form.title, form.adresse, form.prov, form.city, form.pt, lang, incidentTypes, keywordsFlat],
  );
  const ai = useDraftGeneration(draftInput, form, actions.patch);

  // Ouverture depuis la carte (Shift+clic droit) : point pré-rempli.
  useEffect(() => {
    if (open && initLL) {
      setStep(1);
      actions.setPoint(initLL);
    }
  }, [open, initLL, actions]);

  // Ouverture en mode édition : pré-remplissage depuis l'incident existant ;
  // titre et description existent déjà, on montre donc les champs.
  useEffect(() => {
    if (open && wizEdit) {
      setStep(1);
      actions.load(formFromIncident(wizEdit));
      ai.markGenerated(true);
    }
    // `ai` change à chaque rendu (fonctions recréées) : on ne dépend que de l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wizEdit, actions]);

  const onClose = () => {
    setStep(1);
    actions.reset();
    ai.reset();
    loc.resetGeoErr();
    close();
  };

  const suivant = canNext(step, form);
  const canSubmit = form.pt !== null;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const body = buildIncidentBody(form, { cities, provinces, incidentTypes, lang });
      if (!body) {
        // Région non résolvable : le référentiel géographique n'est pas chargé,
        // la création échouerait de toute façon — on le dit au lieu d'envoyer.
        showToast(t.toast_fail);
        return;
      }
      // Édition : PATCH (conserve gravité/statut). Sinon création (auditée).
      if (wizEdit) {
        await api.updateIncident(wizEdit.id, body as never);
      } else {
        await api.createIncident({ ...body, sev: "medium", st: "open" } as never);
      }
      await loadDomain();
      showToast(t.toast_ok);
      onClose();
    } catch (err: unknown) {
      // Un refus de l'API (validation, droits) se lisait seulement en console.
      showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={wizEdit ? t.edit_title : t.wiz_title} onClose={onClose} size="xl">
      <div className="flex flex-col gap-5">
        <Stepper steps={[t.wz1, t.wz2, t.wz3, t.wz4]} step={step} />

        {step === 1 && <StepType types={incidentTypes} lang={lang} value={form.type} onSelect={(id) => actions.patch({ type: id })} />}
        {step === 2 && <StepDetails form={form} actions={actions} ai={ai} lang={lang} nrbcSubstances={nrbcSubstances} />}
        {step === 3 && <StepLocation form={form} cities={cities} provinces={provinces} cityOptions={cityOptions} loc={loc} />}
        {step === 4 && <StepCasualties form={form} actions={actions} nearUnits={nearUnits} nearHosps={nearHosps} />}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-rdia-700/50">
          <button className="btn-secondaire text-sm" onClick={onClose}>
            {t.cancel}
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button className="btn-secondaire text-sm" onClick={() => setStep((s) => Math.max(1, s - 1))}>
                {t.prev}
              </button>
            )}
            {step < LAST_STEP && (
              <button className="btn-primaire text-sm" onClick={() => suivant && setStep((s) => Math.min(LAST_STEP, s + 1))} disabled={!suivant}>
                {t.next}
              </button>
            )}
            {step === LAST_STEP && (
              <button className="btn-primaire text-sm" onClick={() => void submit()} disabled={!canSubmit || busy}>
                {busy ? "…" : t.submit}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
