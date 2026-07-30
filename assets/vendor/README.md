# Dépendance Excel optionnelle

ANALYSIS cherche d'abord `xlsx.full.min.js` dans ce dossier. Si le fichier n'est pas présent, il charge la version officielle SheetJS CE 0.20.3 depuis le CDN lors du premier import.

Pour un déploiement totalement autonome, télécharger :

`https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`

et l'enregistrer ici sous le nom `xlsx.full.min.js`.

Ne placez jamais les fichiers d'export du magasin dans le dépôt GitHub.
