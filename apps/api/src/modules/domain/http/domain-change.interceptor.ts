import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { Request } from "express";
import { RealtimeService } from "@/modules/realtime/realtime.service";

// ============================================================================
// ARGOS — « tout le monde voit ce qui change » (ADR 0029)
//
// Une écriture sur le domaine — incident déclaré, sous-incident ouvert,
// incident rattaché, victime relevée, unité créée ou déplacée, abri ouvert,
// morgue mobile déployée, affectation, engagement — doit atteindre TOUS les
// postes sans qu'on recharge la page. Les croquis, les postes de commandement,
// les ressources posées et les hôpitaux poussaient déjà leur événement ; les
// incidents et les entités, non : leurs écrans restaient figés jusqu'au
// prochain rechargement.
//
// Plutôt que semer un `emit` derrière chaque route — et en oublier à la
// prochaine —, cet intercepteur observe les contrôleurs qu'il habille : toute
// requête d'écriture (POST, PATCH, PUT, DELETE) qui RÉUSSIT pousse un
// événement `domain`, que chaque poste traduit par une relecture. Une requête
// refusée (403) ou en erreur ne pousse rien : on ne réveille pas les postes
// pour une écriture qui n'a pas eu lieu.
//
// `what` sert d'indication (la tranche web relit tout le domaine) : il dit
// d'où vient le changement, et la tranche `missions` ne se relit que pour les
// unités.
// ============================================================================

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Ce que la route a touché, lu sur son chemin — le mot le plus spécifique gagne. */
export function domainTopicOf(path: string): "units" | "shelters" | "morgues" | "incidents" {
  if (/\/units\b/.test(path)) return "units";
  if (/\/shelters\b/.test(path)) return "shelters";
  if (/\/morgues\b/.test(path) || /\/mobile-morgues\b/.test(path)) return "morgues";
  return "incidents";
}

@Injectable()
export class DomainChangeInterceptor implements NestInterceptor {
  constructor(private readonly realtime: RealtimeService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!WRITE_METHODS.has(req.method)) return next.handle();
    const what = domainTopicOf(req.path ?? req.url ?? "");
    return next.handle().pipe(tap(() => this.realtime.emit({ kind: "domain", what })));
  }
}
