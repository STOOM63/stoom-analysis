# Changelog

## 2.0.0 — 30 juillet 2026

- refonte complète de l’interface sous la marque ANALYSIS ;
- affichage systématique HT et TTC pour le chiffre d’affaires, les paniers, les remises, la valeur commerciale et les impacts ;
- décomposition explicable des hausses et baisses : effet tickets, effet panier, familles, produits, vendeurs, clients et mix matériel ;
- cartes et alertes entièrement cliquables avec listes et preuves détaillées ;
- acheteurs uniques, tickets uniques et tickets non identifiés ;
- clients à risque nommés individuellement avec probabilité, confiance et raisons détaillées ;
- détection des changements de panier, fréquence, part matériel et habitudes de renouvellement ;
- démographie complète : âge moyen, médiane, tranches d’âge, villes et zone de chalandise ;
- module de commandes automatiques par fournisseur fondé sur la période choisie, le stock restant et les colisages ;
- scénarios Minimum, Recommandé et Confort, quantités modifiables et export CSV ;
- règles par défaut 10 ml par 10 et 50 ml par 4 pour Openvap, Flavour Power et Auvergne Phyto, entièrement configurables ;
- suppression du jargon ABC/XYZ dans la lecture principale au profit de statuts métier immédiatement compréhensibles ;
- moteur Analysis Intelligence enrichi pour expliquer le chiffre, les risques clients, la démographie, le stock et les commandes ;
- amélioration des fiches Produit, Client, Vendeur et Fournisseur ;
- cache PWA mis à jour et documentation corrigée.

## 1.0.1 — 30 juillet 2026

- tous les fichiers de ventes reconnus sont désormais acceptés, quel que soit leur nom ;
- suppression de la règle erronée rejetant `Ventes(1)` ;
- signature de déduplication commune aux exports standards et enrichis ;
- rapprochement des ventes sans ticket grâce au numéro de facture ;
- enrichissement automatique des lignes recouvrantes avec vendeur, numéro de vente, retour et désignation complète ;
- suppression d'un import sans effacer les lignes également fournies par un autre export ;
- historique des imports complété par le nombre de lignes enrichies ;
- tests de non-régression couvrant les périodes recouvrantes et les lignes identiques réelles.

## 1.0.0 — 30 juillet 2026

- lancement de la marque ANALYSIS ;
- moteur d'import Excel multi-périodes ;
- reconnaissance des sept exports de référence ;
- première prise en charge des exports de ventes ;
- déduplication des imports et des périodes chevauchantes ;
- analyses ventes, stock, clients, paniers, vendeurs, fournisseurs et mouvements ;
- classification ABC/XYZ, couverture, dormance et âge FIFO estimé ;
- revisite statistiquement éligible à 7/14/30/60/90/180/365 jours ;
- moteur de diagnostic et plans d'action ;
- Analysis Intelligence en langage naturel déterministe ;
- sauvegarde/restauration JSON et stockage local IndexedDB ;
- PWA installable et compatible GitHub Pages ;
- jeu de données synthétique de démonstration ;
- tests automatisés du moteur analytique.
