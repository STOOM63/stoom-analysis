# ANALYSIS

**Retail Intelligence Engine — version 1.0.0**

ANALYSIS est une application web d'intelligence commerciale conçue pour transformer les exports d'un logiciel de caisse en diagnostics simples, analyses approfondies et plans d'action.

Elle ne remplace pas la caisse. Elle se place au-dessus des outils existants et croise :

- le catalogue ;
- le stock courant ;
- la valorisation du stock ;
- les ventes détaillées ;
- les clients ;
- les mouvements de stock ;
- les commandes et réceptions fournisseurs.

Toutes les analyses sont réalisées **dans le navigateur**. Les fichiers et les données clients ne sont pas envoyés à un serveur ANALYSIS.

## Démarrage

### GitHub Pages

1. Créer un dépôt GitHub.
2. Déposer tout le contenu de ce dossier à la racine du dépôt.
3. Ouvrir **Settings → Pages**.
4. Choisir **Deploy from a branch**.
5. Sélectionner la branche `main` et le dossier `/root`.
6. Ouvrir l'adresse GitHub Pages générée.

Le fichier `.nojekyll` est déjà présent.

### Sur un ordinateur Windows

Double-cliquer sur `START-WINDOWS.bat` si Python est installé.

Ou lancer :

```bash
python serve.py
```

Puis ouvrir `http://127.0.0.1:8080`.

> L'ouverture directe de `index.html` par double-clic n'est pas recommandée, car les modules JavaScript nécessitent un petit serveur HTTP.

## Démonstration

Cliquer sur **Explorer la démo** à l'écran de bienvenue. Les données de démonstration sont entièrement synthétiques.

Pour ouvrir directement la démonstration :

```text
https://votre-domaine/?demo=1
```

## Fichiers reconnus

| Type | Signature principale | Mode d'import |
|---|---|---|
| Catalogue | `Code article`, `Designation`, `Catalogue(s)`, `Vente HT` | Snapshot conservé |
| Stock | `Propriete du stock`, `Stock`, `Valeur stock`, `Achat moyen` | Snapshot conservé |
| Valorisation | `Valeur a l'achat`, `Valeur commerciale HT/TTC` | Snapshot conservé |
| Clients | `Code client`, `Nom prenom`, `Comm. commerciale` | Snapshot conservé |
| Ventes(2) | `Num. vente`, `Vendeur`, `Retour`, `Vente TTC` | Historique fusionné et dédupliqué |
| Mouvements | `Motif`, `Quantite`, `Total achat` | Historique fusionné et dédupliqué |
| Réceptions | `Expediteur`, `Quantite commandee`, `Quantite recue` | Historique fusionné et dédupliqué |

### Ventes(1)

L'ancien export `Ventes(1)` est volontairement rejeté. Il ne contient pas le numéro de vente, le vendeur et le marqueur de retour. S'il est importé avec `Ventes(2)`, il créerait des analyses incomplètes ou des doublons.

## Gestion de n'importe quelle période

ANALYSIS :

- détecte automatiquement la période de chaque export ;
- accepte des périodes successives ou chevauchantes ;
- calcule une clé de ligne et ignore les doublons ;
- conserve la traçabilité de chaque import ;
- permet de supprimer un import ;
- utilise le snapshot le plus récent pour le catalogue, le stock, la valorisation et les clients ;
- conserve l'historique cumulé des ventes, mouvements et réceptions.

## Modules

### Cockpit

- score de maîtrise du magasin ;
- chiffre d'affaires, marge, panier et stock ;
- comparaison avec la période précédente de même durée ;
- lecture automatique des forces et risques ;
- priorisation des actions.

### Ventes et saisonnalité

- CA et marge par jour ;
- tickets, panier, articles par ticket ;
- contribution des rayons et familles ;
- performance horaire ;
- performance par jour de semaine ;
- remises et produits offerts ;
- retours.

### Stock et produits

- valeur d'achat et valeur commerciale ;
- marge théorique ;
- rotation et vitesse de vente ;
- couverture en jours ;
- ruptures et réassorts urgents ;
- surstock ;
- dormance ;
- âge FIFO estimé à partir des réceptions ;
- stock antérieur à l'historique clairement signalé comme inconnu ;
- classification ABC/XYZ ;
- produits stars, produits trafic et marge à exploiter ;
- GMROI approché et marge par euro immobilisé.

### Clients et revisite

- fiche analytique individuelle ;
- CA, marge, panier, fréquence et récence ;
- délai moyen entre visites ;
- prochaine visite estimée ;
- clients nouveaux, actifs, fidèles, VIP, en retard, à risque ou perdus ;
- RFM ;
- produit, famille et vendeur favoris ;
- revisite à 7, 14, 30, 60, 90, 180 et 365 jours ;
- calcul uniquement sur les clients disposant du recul nécessaire ;
- cohortes mensuelles.

### Paniers

- panier moyen et médian ;
- marge par ticket ;
- paniers mono- et multi-familles ;
- produits achetés ensemble ;
- fréquence et support des associations ;
- opportunités de ventes complémentaires.

### Vendeurs

- CA et marge ;
- tickets ;
- panier moyen ;
- articles par ticket ;
- taux d'identification client ;
- paniers multi-familles ;
- remises et retours ;
- potentiel de vente complémentaire.

Sans planning, ANALYSIS ne prétend pas calculer la performance par heure réellement travaillée. Un futur import de planning pourra compléter ce module.

### Fournisseurs et achats

- dépenses ;
- quantités commandées et reçues ;
- taux de service ;
- commandes exactes, partielles et surlivrées ;
- délai entre création et validation ;
- marge générée par les produits du fournisseur ;
- valeur du stock associé ;
- impact des mouvements de stock.

### Plans d'action

Les actions sont classées selon :

- urgence ;
- impact économique estimé ;
- confiance ;
- type : stock, client, fournisseur, vendeur ou qualité des données.

### Analysis Intelligence

Le moteur répond localement à des questions métier préparées :

- produits à forte marge ;
- stock dormant ;
- réassorts ;
- clients à réactiver ;
- vendeurs ;
- fournisseurs ;
- paniers.

Il ne génère pas les chiffres avec une IA distante. Il sélectionne et explique des calculs déterministes.

## Sauvegarde

Dans **Imports & qualité** :

- exporter une sauvegarde JSON complète ;
- restaurer la sauvegarde ;
- supprimer un import ;
- effacer le projet local.

Les données sont enregistrées dans IndexedDB, séparément pour chaque navigateur et appareil.

## Confidentialité

Ne jamais ajouter les exports du magasin au dépôt GitHub.

Le dépôt ne doit contenir que le code de l'application. Les fichiers importés restent dans le stockage local du navigateur.

La bibliothèque Excel est chargée lors du premier import. Pour un fonctionnement totalement autonome, voir `assets/vendor/README.md`.

## Tests

```bash
npm test
```

Les tests couvrent :

- la reconnaissance des formats ;
- le rejet de Ventes(1) ;
- les ventes, marges et paniers ;
- les analyses produits, clients, vendeurs et fournisseurs ;
- les associations de panier ;
- les plans d'action ;
- Analysis Intelligence.

## Structure

```text
analysis-retail/
├── index.html
├── manifest.webmanifest
├── sw.js
├── .nojekyll
├── assets/
│   ├── css/styles.css
│   ├── js/app.js
│   ├── js/core/
│   │   ├── analytics.js
│   │   ├── demo.js
│   │   ├── importer.js
│   │   ├── storage.js
│   │   └── utils.js
│   └── vendor/
├── tests/
├── README.md
├── ANALYTICS-METHODS.md
├── DATA-MAPPING.md
└── DEPLOYMENT.md
```

## Limites de cette version

Cette version est prête pour une utilisation locale ou GitHub Pages par un magasin, mais ce n'est pas encore une plateforme SaaS multi-entreprises.

Pour une commercialisation à grande échelle, il faudra ajouter notamment :

- comptes et authentification serveur ;
- isolation multi-tenant ;
- base PostgreSQL ;
- sauvegardes serveur chiffrées ;
- rôles et permissions ;
- gestion multi-magasins ;
- connecteurs automatiques aux logiciels de caisse ;
- journal de conformité et politique RGPD complète ;
- tests de charge et audit de sécurité.
