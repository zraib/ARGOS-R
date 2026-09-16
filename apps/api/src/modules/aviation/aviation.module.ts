import { Module } from "@nestjs/common";
import { AviationService } from "@/modules/aviation/aviation.service";
import { AviationController } from "@/modules/aviation/http/aviation.controller";
import { AIRCRAFT_WATCHLIST } from "@/modules/aviation/ports/aircraft-watchlist.port";
import { FLIGHT_FEED } from "@/modules/aviation/ports/flight-feed.port";
import { ExerciseFeed } from "@/modules/aviation/infrastructure/exercise.feed";
import { InMemoryWatchlistRepository } from "@/modules/aviation/infrastructure/in-memory-watchlist.repository";
import { OpenSkyFeed } from "@/modules/aviation/infrastructure/opensky.feed";
import { DEMO_DATA } from "@/common/data-profile";

// ============================================================================
// ARGOS — module de suivi aérien : le SEUL endroit qui câble les adaptateurs
//
// C'est ici, et nulle part ailleurs, qu'on choisit d'où viennent les positions
// et où vit la liste de suivi. Changer de fournisseur ne touche pas une ligne
// du service applicatif : c'est tout l'intérêt du port. Voir docs/adr/0004.
// ============================================================================

/**
 * Fournisseur de positions, choisi par `AVIATION_FEED` :
 *
 * - `opensky` (défaut) — flux ADS-B réel, mondial, filtré sur l'emprise nationale.
 * - `exercise` — noria simulée pour l'instruction et la démonstration, sans réseau.
 *   Elle n'est honorée qu'en profil de données « demo » (ADR 0015) : une station
 *   vide ne fait voler aucun appareil fictif, quoi que dise cette variable.
 */
const feedProvider = {
  provide: FLIGHT_FEED,
  useClass: process.env.AVIATION_FEED === "exercise" && DEMO_DATA ? ExerciseFeed : OpenSkyFeed,
};

@Module({
  controllers: [AviationController],
  providers: [
    AviationService,
    feedProvider,
    { provide: AIRCRAFT_WATCHLIST, useClass: InMemoryWatchlistRepository },
  ],
  exports: [AviationService],
})
export class AviationModule {}
