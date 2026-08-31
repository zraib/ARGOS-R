import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

// ============================================================================
// ARGOS — détail journalisé au journal d'audit (lot V-2)
//
// `AuditInterceptor` journalise automatiquement chaque mutation réussie, mais
// n'en connaît que l'acteur, la méthode et la route. Pour la plupart des gestes
// cela suffit : `PATCH /api/incidents/INC-2607` dit ce qu'il faut savoir.
//
// Pas pour un déploiement. `POST /api/incidents/INC-2607/deployments` ne dit ni
// QUI a été déployé, ni de quelle opération il a été retiré au passage — c'est
// justement ce qu'on voudra relire six mois plus tard. Le champ `meta` de
// l'entrée d'audit existait déjà, chaîné dans le hash, mais RIEN ne le
// remplissait.
//
// Ce décorateur donne au gestionnaire un moyen d'y écrire sans manipuler l'objet
// requête ni court-circuiter l'intercepteur : une seule entrée d'audit par
// geste, avec son détail. Une seconde entrée écrite à la main aurait doublé
// chaque ligne du journal.
// ============================================================================

/** Enrichit l'entrée d'audit du geste en cours. Appels successifs = fusion. */
export type AuditMetaSetter = (meta: Record<string, unknown>) => void;

export interface RequestWithAuditMeta {
  auditMeta?: Record<string, unknown>;
}

export const AuditMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuditMetaSetter => {
  const req = ctx.switchToHttp().getRequest<RequestWithAuditMeta>();
  return (meta) => {
    req.auditMeta = { ...(req.auditMeta ?? {}), ...meta };
  };
});
