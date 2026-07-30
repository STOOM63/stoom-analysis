# Rapport de validation — exports de référence

Le moteur ANALYSIS a été calibré et testé sur les structures réelles fournies, sans intégrer les fichiers ni les données personnelles dans le dépôt final.

## Volumes contrôlés

| Source | Volume |
|---|---:|
| Catalogue | 1 038 références |
| Stock | 1 038 références |
| Valorisation positive | 838 références |
| Clients | 1 260 fiches |
| Exports de ventes de référence | 7 079 lignes finales après fusion |
| Ventes distinctes | 2 537 |
| Mouvements | 213 lignes |
| Réceptions | 1 279 lignes |
| Commandes fournisseurs | 125 |

## Cohérences vérifiées

- les 1 038 codes du catalogue et du stock se recoupent ;
- les deux exports de ventes fournis se recouvrent ; leur import conjoint conserve 7 079 lignes finales sans doubler le chiffre d’affaires et enrichit les lignes communes ;
- 41 codes vendus mais absents du catalogue courant sont conservés comme produits historiques ;
- le rapprochement nominatif des lignes de ventes avec le fichier clients dépasse 99 % ;
- 838 lignes de valorisation correspondent aux références en stock positif ;
- les retours sont bien portés par des quantités et montants négatifs ;
- les lignes à 100 % de remise sont conservées comme sorties physiques offertes.

## Totaux de contrôle du moteur

Sur l'intégralité de Ventes(2) :

- CA TTC net : **107 429,85 €** ;
- coût d'achat HT exporté : **34 125,91 €** ;
- marge HT recalculée avec TVA produit : **55 398,97 €** ;
- 2 537 ventes reconstruites ;
- 765 clients nominatifs observés ;
- 5 vendeurs observés ;
- 134 lignes de retour ;
- 898 lignes à 100 % de remise.

Sur le stock courant :

- valeur d'achat : **19 574,24 €** ;
- valeur commerciale TTC : **66 625,17 €** ;
- marge théorique HT : **35 946,83 €** ;
- 838 références positives ;
- 195 références à zéro ;
- 5 références négatives.

Sur les réceptions :

- 17 404 unités commandées ;
- 16 456 unités reçues ;
- 34 078,91 € d'achats enregistrés.

## Tests automatisés

La commande suivante est validée :

```bash
npm test
```

Elle vérifie la reconnaissance des formats et l'exécution des principaux moteurs analytiques sur un jeu synthétique.

## Confidentialité du livrable

Aucun export original, numéro de téléphone, courriel, adresse ou nom de client réel n'est présent dans le ZIP.

## Validation fonctionnelle 2.0.0

- chaque indicateur critique ouvre sa liste détaillée ;
- les ruptures récentes affichent les références, le stock, les ventes, le fournisseur et la quantité recommandée ;
- les clients à risque affichent leur identité, leur âge, leur ville, leur retard, leurs changements de panier et de consommation ;
- le tableau Clients distingue acheteurs uniques, tickets uniques et tickets anonymes ;
- les montants commerciaux sont présentés en HT et TTC ;
- le moteur de commande respecte la période sélectionnée et les colisages fournisseurs configurables ;
- la lecture principale du stock utilise des statuts métier explicites, sans imposer le jargon ABC/XYZ.
