# ADR 0013 — Exposition temporaire de la station sur Internet par un tunnel tiers (tunnelto.dev)

- **Statut :** accepté — **démonstrations seulement**, jamais l'exploitation
- **Date :** 2026-09-15
- **Portée :** `deploy/scripts/tunnel.ps1`, `deploy/scripts/package.sh`
  (client épinglé dans le paquet), `deploy/README.md` § 10 ; côté API, la
  borne des échecs de connexion (`auth.controller.ts`, `RateWindow`) qui
  accompagne l'exposition ; côté web, le message « trop de tentatives ».

## Contexte

La station IRIS vit sur le réseau de l'organisme : une origine HTTP, un
proxy, aucune ressource externe, une CSP fermée (`MASTER_PLAN` §4.3). Le
projet a besoin de **montrer** la plateforme à des personnes qui ne sont pas
sur ce réseau — comité de projet, partenaires, démonstration à distance —
sans déplacer la station, sans ouvrir de port sur un pare-feu qu'on ne
maîtrise pas, et sans attendre un VPN.

Un tunnel sortant résout exactement cela : la station ouvre elle-même une
connexion vers un relais public qui lui attribue une adresse
`https://<sous-domaine>.tunnelto.dev` et lui renvoie le trafic. Rien n'entre
que ce que la station a demandé. Le service choisi est tunnelto.dev : client
libre (Rust, dépôt public, versions publiées avec binaires), une commande,
compte gratuit pour un sous-domaine aléatoire.

Le prix de cette commodité est une **déviation nette de la souveraineté** : le
relais termine le TLS public et voit le trafic en clair entre son bord et la
station ; l'écran de connexion devient atteignable depuis tout Internet ; le
client contacte `api.github.com` au démarrage pour proposer une mise à jour.

## Décision

1. **Le tunnel est un outil de démonstration**, documenté comme tel
   (`deploy/README.md` § 10, guide débutant § 12) : données fictives, comptes
   de démonstration, tunnel fermé dès la fin, mots de passe changés ensuite.
   Il n'est ni un mode d'exploitation ni une solution d'accès distant — en
   service, l'accès distant passe par le VPN de l'organisme.
2. **Le client est épinglé** : version 0.1.18, empreinte SHA-256 du binaire
   Windows inscrite dans `package.sh` et `tunnel.ps1`. Le paquet
   d'installation l'embarque ; s'il manque, le script le télécharge depuis les
   versions publiées du projet et refuse de l'exécuter si l'empreinte diffère.
3. **Rien ne change dans l'application pour le tunnel** : une seule origine,
   chemins relatifs, CSP en `'self'` — la politique suit l'origine de la page,
   quelle qu'elle soit. Aucune variable, aucun hôte à déclarer.
4. **L'API borne les échecs de connexion** — dix par compte et par quart
   d'heure, trois cents par adresse (derrière le proxy toutes les requêtes
   portent la même adresse : cette seconde borne n'est qu'un frein global).
   Seuls les échecs comptent ; au-delà, `429` « trop de tentatives », que le
   poste web affiche tel quel. Cette borne est utile aussi sur le réseau
   interne ; l'exposition la rend indispensable.
5. **La clé du compte** tunnelto.dev est celle de l'opérateur, mémorisée par le
   client dans son profil Windows (`%USERPROFILE%\.tunnelto\key.token`), jamais
   dans `.env`, jamais dans le dépôt.

## Conséquences

- **Positives** : une démonstration à distance en une commande, depuis
  n'importe quel réseau, sans intervention sur l'infrastructure ; le geste est
  réversible instantanément (`Ctrl+C`) ; la chaîne d'approvisionnement du
  client est vérifiée (version et empreinte) ; l'API est plus robuste face à
  la force brute, tunnel ou pas.
- **Négatives** : pendant le tunnel, un tiers peut lire le trafic et tout
  Internet peut tenter des connexions ; la documentation OpenAPI `/api/docs`
  est lisible (elle ne contient aucune donnée) ; le sous-domaine aléatoire
  change à chaque ouverture (un nom fixe suppose un compte payant) ; le
  client 0.1.18 date de 2021 — il fonctionne, mais une rupture du service ou
  du protocole côté relais imposerait de réévaluer l'outil ; la borne par
  adresse ne distingue pas les visiteurs derrière le proxy.
- **Ce qui reste interdit** : exposer une station qui porte des données
  réelles ; laisser un tunnel ouvert hors démonstration ; automatiser son
  ouverture au démarrage.

## Alternatives écartées

- **Ouvrir un port sur le pare-feu de l'organisme** (redirection vers la
  station) : pas de tiers, mais une exposition permanente et une démarche
  d'infrastructure hors de portée d'une démonstration.
- **VPN de l'organisme** : la bonne réponse pour l'accès distant en service —
  c'est la cible ; elle ne se met pas en place pour une démonstration.
- **Autres tunnels** (ngrok, Cloudflare Tunnel, Tailscale Funnel) : même
  nature de compromis ; tunnelto.dev a été demandé, son client est libre et
  minimal, et rien dans le script ne lui est propre au point d'empêcher d'en
  changer.
- **Ne rien exposer** (démonstration sur place ou en partage d'écran) : reste
  possible et préférable quand c'est faisable ; le tunnel couvre le cas où ce
  ne l'est pas.
