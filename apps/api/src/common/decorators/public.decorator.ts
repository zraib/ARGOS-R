import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Marque une route comme publique (contourne la garde d'authentification). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
