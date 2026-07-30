# Méthodes analytiques d'ANALYSIS

Ce document décrit les règles principales afin que les résultats restent explicables.

## Chiffre d'affaires et marge

Pour chaque ligne de vente :

```text
CA TTC = Vente TTC exportée
CA HT = CA TTC / (1 + TVA / 100)
Marge HT = CA HT - Achat HT exporté
Taux de marque = Marge HT / CA HT
Taux de marge = Marge HT / Achat HT
```

La TVA du catalogue ou du stock est utilisée. À défaut, le moteur applique 20 % et cette hypothèse doit être considérée comme une limite.

Les retours sont conservés avec leurs valeurs négatives.

## Tickets et paniers

La clé prioritaire est `Num. vente`. Le ticket est utilisé en secours. Toutes les lignes partageant la même clé forment un panier.

```text
Panier moyen = CA TTC net / nombre de ventes
Articles par ticket = quantités positives / nombre de ventes
Marge par ticket = marge HT / nombre de ventes
```

Les produits offerts restent comptabilisés dans les quantités et les sorties de stock.

## Remises estimées

Lorsque le prix catalogue courant est disponible :

```text
Remise estimée = prix catalogue TTC × quantité - Vente TTC
```

Cette valeur est une estimation lorsque le prix catalogue a changé depuis la vente.

## Comparaison de périodes

La période sélectionnée est comparée à la période immédiatement précédente de même nombre de jours.

Exemple : une période de 30 jours est comparée aux 30 jours précédents.

## Couverture de stock

```text
Vitesse quotidienne = quantités positives vendues sur les 30 derniers jours / jours d'historique disponibles, plafonnés à 30
Couverture = stock actuel / vitesse quotidienne
```

- `∞` signifie que du stock existe mais qu'aucune rotation récente n'est observée ;
- une couverture nulle avec des ventes récentes indique une rupture active.

Les seuils sont configurables dans l'application.

## Dormance

La date de dernière vente est recherchée sur tout l'historique importé.

- ralentissement : seuil intermédiaire ;
- dormant : seuil configurable, 45 jours par défaut ;
- stock mort : seuil critique configurable, 90 jours par défaut ou aucune vente observée.

Si l'historique débute après l'entrée du stock, ANALYSIS ne prétend pas connaître l'âge absolu de l'article.

## Âge FIFO estimé

Pour estimer l'âge du stock courant :

1. les réceptions sont classées par date ;
2. le moteur suppose que les unités les plus anciennes ont été vendues en premier ;
3. le stock restant est donc rattaché aux réceptions les plus récentes ;
4. si le stock courant dépasse les réceptions disponibles, le surplus est marqué comme antérieur à l'historique.

Ce calcul est une estimation FIFO, pas une traçabilité de lot certifiée.

## ABC

Les produits sont classés selon leur marge positive cumulée sur la période :

- A : jusqu'à environ 80 % de la marge ;
- B : de 80 à 95 % ;
- C : solde.

## XYZ

La régularité est calculée à partir des quantités hebdomadaires :

```text
Coefficient de variation = écart-type hebdomadaire / moyenne hebdomadaire
```

- X : coefficient ≤ 0,5 ;
- Y : coefficient ≤ 1 ;
- Z : coefficient > 1 ou historique insuffisant.

## Revisite

Pour un horizon de 30 jours :

1. seuls les clients dont la première visite observée remonte à au moins 30 jours sont éligibles ;
2. le client est revisiteur s'il possède une deuxième visite dans les 30 jours suivant la première.

```text
Taux de revisite = clients revenus / clients éligibles
```

Cette méthode évite de classer à tort un client récent comme non revisiteur.

## Statut client

Le statut dépend de la récence, de la fréquence et du rythme propre du client.

```text
Retard = récence actuelle - délai moyen historique entre visites
```

Les seuils combinent un minimum calendaire et un multiple du rythme habituel.

## RFM

- Récence : moins de jours = meilleur score ;
- Fréquence : plus de visites = meilleur score ;
- Montant : plus de marge cumulée = meilleur score.

Chaque dimension reçoit une note de 1 à 5 fondée sur les quintiles du portefeuille observé.

## Fournisseurs

```text
Taux de service = quantité reçue / quantité commandée
```

Une valeur supérieure à 100 % signale une surlivraison.

Le délai mesuré est le délai entre création et validation. Sans date prévisionnelle, il ne représente pas nécessairement un retard contractuel.

## Associations de panier

Pour chaque paire de produits distincts :

```text
Support = nombre de paniers contenant la paire / nombre total de paniers
```

Le moteur présente les paires les plus fréquentes. Une version ultérieure pourra ajouter confiance, lift et substitution.

## Impacts et plans d'action

Les impacts sont indicatifs. Ils combinent selon le cas :

- marge récente ;
- vitesse de vente ;
- valeur immobilisée ;
- panier du client ;
- taux de service fournisseur ;
- écart à la moyenne vendeur.

Chaque action affiche un niveau de confiance. Les impacts ne sont pas une promesse de résultat.
