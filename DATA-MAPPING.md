# Cartographie des exports

## Catalogue

| Colonne source | Champ ANALYSIS |
|---|---|
| Code article | `code` |
| Designation | `name` |
| Annee | `year` |
| Rayon | `department` |
| Famille | `family` |
| Sous-famille | `subfamily` |
| Fournisseur | `supplier` |
| Stock | `stock` |
| Vente HT / TTC | `priceHT` / `priceTTC` |
| TVA | `taxRate` |
| Date de creation | `createdAt` |
| Derniere modification | `updatedAt` |
| Catalogue(s) | `visibility` |

## Stock

Ajoute notamment :

- dernier achat ;
- achat moyen ;
- valeur de stock ;
- marge unitaire ;
- taux de marge et de marque ;
- propriété du stock.

## Valorisation

- valeur à l'achat ;
- valeur commerciale HT ;
- valeur commerciale TTC ;
- stock positif au moment du snapshot.

## Ventes

| Colonne source | Usage |
|---|---|
| Date | saisonnalité et chronologie |
| Num. vente | reconstruction fiable du panier lorsqu'il est disponible |
| Vendeur | performance commerciale lorsqu'il est disponible |
| Client | revisite et segmentation |
| Code article | croisement catalogue/stock |
| Retour | neutralisation et analyse des retours lorsqu'il est disponible ; les quantités négatives restent également détectées |
| Quantite | volumes et sorties |
| Achat HT | coût de la ligne |
| Vente TTC | CA net de la ligne |
| % Remise | cadeaux et remises |
| Ticket | contrôle secondaire |

## Clients

Le rapprochement avec les ventes est actuellement effectué par nom normalisé, car le code client n'est pas présent dans les exports de ventes fournis.

ANALYSIS conserve :

- code client ;
- nom ;
- ville et code postal ;
- téléphone et courriel ;
- consentements ;
- âge et anniversaire ;
- date de création.

## Mouvements

- numéro ;
- date ;
- motif ;
- article ;
- quantité ;
- coût unitaire ;
- impact achat.

## Réceptions

- numéro de commande ;
- création ;
- date prévisionnelle ;
- validation ;
- fournisseur ;
- destinataire ;
- type de commande ;
- article ;
- coût ;
- quantité commandée ;
- quantité reçue ;
- total achat.

## Clés de déduplication

Les événements reçoivent une signature construite uniquement à partir des champs communs aux différents niveaux d'export : date, ticket ou facture, client, article, quantité, coût, vente et remise. Les champs optionnels comme le vendeur, le numéro de vente ou le marqueur de retour ne participent pas à la signature : ils enrichissent la ligne déjà reconnue. Un compteur d'occurrence préserve plusieurs lignes réellement identiques dans un même panier.

## Produits historiques

Un article présent dans les ventes mais absent du catalogue courant est conservé dans un catalogue historique virtuel. Il n'est jamais supprimé des analyses passées.
