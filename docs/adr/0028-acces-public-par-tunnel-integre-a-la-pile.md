# ADR 0028 — Accès public à la station par un tunnel sortant intégré à la pile (Cloudflare Tunnel), sans toucher au routeur

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-21
- **Révise :** ADR 0013 (tunnel tunnelto.dev lancé à la main, démonstrations seulement) — le
  principe (un tunnel SORTANT, rien à ouvrir) reste ; le client, le mode d'exécution et
  l'usage changent.
- **Portée :** `deploy/docker-compose.yml` (services `tunnel-quick`, `tunnel`, profils
  `public-quick` / `public`), `deploy/scripts/expose.ps1`, `status.ps1`, `install.ps1`
  (message de fin), `package.sh` (image embarquée), `.env.example`
  (`CLOUDFLARE_TUNNEL_TOKEN`), `deploy/README.md` § 10, `MISE-A-JOUR-STATION.md` § 15.

## Contexte

La station tourne sur un poste Windows 11 (Docker Desktop) derrière un routeur que l'on ne
veut pas toucher : pas de redirection de port, pas d'adresse fixe, pas de certificat à
gérer. L'état-major veut pourtant **atteindre l'application depuis Internet**, avec le moins
de manipulations possible — « zéro tracas » — et que cela fasse partie de l'application
plutôt que d'une procédure à côté. L'ADR 0013 avait apporté un tunnel tunnelto.dev : un
exécutable à lancer et à garder ouvert au premier plan, un compte et une clé à créer, une
adresse aléatoire sauf abonnement, et l'usage borné aux démonstrations.

## Décision

1. **Le tunnel est un conteneur de la pile**, pas un programme à côté : `cloudflared`
   (image officielle `2026.9.1`, **épinglée par version dans Compose et par empreinte
   dans `package.sh`** — `sha256:b269e8ab…`, vérifiée au moment d'embarquer l'image dans le
   paquet ; une référence par empreinte dans Compose aurait forcé la station à retélécharger
   l'image, `docker load` ne conservant pas les empreintes) tourne dans deux
   profils Compose exclusifs, `restart: unless-stopped` : il redémarre avec Docker Desktop
   et survit aux mises à jour (`docker compose up -d` le relance avec le reste). Il ne cible
   que le proxy interne (`http://proxy:80`) : rien d'autre n'est exposé.
2. **Deux niveaux, un seul geste** (`scripts\expose.ps1`) :
   - **rapide** (`public-quick`, défaut) : `cloudflared tunnel --url http://proxy:80` —
     **aucun compte, aucune clé** ; Cloudflare attribue une adresse
     `https://<quatre-mots>.trycloudflare.com`, lue dans le journal et affichée par le script
     (et par `status.ps1`). L'adresse change à chaque (re)démarrage du tunnel ; Cloudflare
     ne garantit rien sur ces tunnels — c'est l'accès « tout de suite » ;
   - **nommé** (`public`) : `cloudflared tunnel run --token <jeton>` — un compte Cloudflare
     gratuit et un nom de domaine chez eux donnent une **adresse fixe**
     (`iris.<votre-domaine>`), configurée dans le tableau de bord Zero Trust (service :
     `http://proxy:80`) ; le jeton s'écrit dans `.env` (`CLOUDFLARE_TUNNEL_TOKEN`), jamais
     dans le dépôt. Le même tableau de bord permet, plus tard, de poser une porte
     d'identité (Cloudflare Access) devant l'adresse — sans rien changer à la station.
   - `expose.ps1 -Off` retire le tunnel et son profil : la station redevient locale.
3. **Rien ne change dans l'application** (comme l'ADR 0013) : une seule origine, des
   chemins relatifs, une CSP en `'self'` qui suit l'origine de la page ; le fond de carte
   souverain est rebasé sur l'origine courante (ADR 0023) et se sert donc aussi par le
   tunnel ; la borne des échecs de connexion (ADR 0013) reste.
4. **La déviation de souveraineté est assumée et écrite** : le relais termine le TLS public
   et voit le trafic en clair entre son bord et la station ; l'écran de connexion est
   atteignable de tout Internet. Le script l'annonce avant d'ouvrir ; la documentation dit
   quoi faire (mots de passe forts, comptes de démonstration désactivés, fermer quand on n'en
   a plus besoin). Ce n'est pas le mode d'exploitation en service (réseau de l'organisme,
   VPN) — c'est l'accès distant « sans toucher au routeur » que l'état-major a demandé.
5. `tunnel.ps1` (tunnelto.dev) reste dans le paquet, marqué ancien chemin.

## Alternatives écartées

- **Redirection de port sur le routeur + DNS dynamique + certificat** : exactement ce que
  l'état-major refuse de toucher, et une surface exposée directement sur la station.
- **VPN (WireGuard/Tailscale) sans exposition publique** : plus sûr, mais chaque visiteur
  doit installer un client et être enrôlé — pas « public », pas « zéro tracas ».
- **Tailscale Funnel** : adresse fixe sans nom de domaine, mais compte, clé, activation
  dans la console d'administration, certificat par nœud : plus d'étapes, moins connu.
- **ngrok** : compte et jeton obligatoires, page interstitielle sur l'offre gratuite.
- **Garder tunnelto.dev** : clé obligatoire, exécutable au premier plan, adresse fixe
  payante.

## Conséquences

- Sur la station : `.\scripts\expose.ps1` → une adresse `https://` en quelques secondes, qui
  tient tant que le tunnel tourne (et revient au redémarrage) ; `-Status`, `-Off`.
- Vérifié (2026-09-21, pile locale sovereign sur Docker Desktop) : tunnel rapide ouvert en
  8 s, `https://<mots>.trycloudflare.com/api/health` → 200 depuis Internet, page 200,
  style de tuiles hors ligne 200, connexion refusée 401 ; dans le navigateur, connexion puis
  carte avec les tuiles de la station (14 requêtes de tuiles par le tunnel, 0 requête
  externe) ; `-Off` → 530 (origine injoignable).
