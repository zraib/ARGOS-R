import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, concatMap } from "rxjs";
import { AuditService } from "@/modules/audit/audit.service";
import type { AuthUser } from "@/common/types/auth-user";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Journalise automatiquement chaque MUTATION réussie (POST/PUT/PATCH/DELETE)
 * dans le journal d'audit chaîné, avec l'acteur, le rôle et la route. Les
 * lectures privilégiées peuvent aussi être auditées explicitement au besoin.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ method: string; originalUrl: string; url: string; user?: AuthUser }>();
    if (!MUTATING.has(req.method)) return next.handle();

    return next.handle().pipe(
      // On journalise AVANT d'émettre la réponse (garantit l'écriture du log).
      concatMap(async (data) => {
        const res = ctx.switchToHttp().getResponse<{ statusCode: number }>();
        await this.audit.record({
          actor: req.user?.username ?? "anonyme",
          role: req.user?.role ?? "-",
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
        });
        return data;
      }),
    );
  }
}
