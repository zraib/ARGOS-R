import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "@/common/types/auth-user";

/** Injecte l'utilisateur authentifié (posé par la garde JWT) dans le handler. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return req.user;
});
