# Déploiement et exploitation

## GitHub Pages

ANALYSIS utilise uniquement des chemins relatifs. Le projet fonctionne donc :

- sur un domaine GitHub Pages utilisateur ;
- dans un sous-dossier de dépôt ;
- sur un hébergement statique classique.

Le déploiement ne nécessite aucune compilation.

## Mise à jour

1. Sauvegarder les données depuis l'application en JSON.
2. Remplacer les fichiers du dépôt par la nouvelle version.
3. Incrémenter la constante de cache dans `sw.js`.
4. Recharger la page deux fois ou vider le cache de l'application.
5. Restaurer le JSON uniquement si le navigateur a changé.

## Stockage

Les données sont dans IndexedDB. Elles ne sont pas incluses dans GitHub et ne suivent pas automatiquement l'utilisateur sur un autre ordinateur.

Une sauvegarde JSON régulière est recommandée.

## PWA

L'application est installable depuis un navigateur compatible. Le service worker met en cache le cœur de l'application.

Lors du premier import Excel, ANALYSIS charge SheetJS. Pour un fonctionnement sans aucun accès réseau, placer `xlsx.full.min.js` dans `assets/vendor/` selon les instructions du dossier.

## Sécurité minimale

- ne pas publier les exports ;
- ne pas publier les sauvegardes JSON ;
- protéger le compte GitHub ;
- utiliser HTTPS ;
- réserver l'ordinateur aux utilisateurs autorisés ;
- chiffrer le disque si des données clients sont conservées localement ;
- supprimer les données avant de céder l'appareil.

## Passage en SaaS

Cette architecture statique est volontairement simple pour le premier magasin. Une version SaaS devra déplacer le stockage et les traitements sensibles vers une architecture sécurisée avec :

- authentification ;
- base PostgreSQL ;
- multi-tenant ;
- chiffrement ;
- sauvegardes ;
- permissions ;
- journal d'audit ;
- conformité RGPD ;
- connecteurs automatiques.
