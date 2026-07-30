import assert from 'node:assert/strict';
import { createDemoProject } from '../assets/js/core/demo.js';
import { activeData, detectFileType } from '../assets/js/core/importer.js';
import { answerQuestion, buildAnalysis } from '../assets/js/core/analytics.js';

assert.equal(detectFileType(['Date','Num. vente','Vendeur','Code article','Vente TTC']), 'sales');
assert.equal(detectFileType(['Date','Client','Code article','Vente TTC','Ticket']), 'sales_legacy');
assert.equal(detectFileType(['Code article','Propriete du stock','Valeur stock','Achat moyen']), 'stock');
assert.equal(detectFileType(['Date de creation','Expediteur','Quantite commandee','Quantite recue']), 'receipts');

const project = createDemoProject();
const data = activeData(project);
const analysis = buildAnalysis(data, {}, project.settings);
assert.ok(analysis.kpis.revenueTTC > 0, 'Le CA doit être positif');
assert.ok(analysis.kpis.marginHT > 0, 'La marge doit être calculée');
assert.equal(analysis.sellers.length, 4, 'Quatre vendeurs de démonstration attendus');
assert.ok(analysis.products.length >= 80, 'Catalogue analytique incomplet');
assert.ok(analysis.customers.length >= 200, 'Analyse client incomplète');
assert.ok(analysis.suppliers.length >= 4, 'Analyse fournisseur incomplète');
assert.ok(analysis.baskets.associations.length > 0, 'Associations de panier absentes');
assert.ok(analysis.actions.length > 0, 'Plans d’action absents');
assert.ok(analysis.revisit.find(x => x.days === 30), 'Revisite 30 jours absente');
assert.ok(answerQuestion('Quels produits génèrent le plus de marge ?', analysis).rows.length > 0);
console.log('✓ ANALYSIS : tous les tests sont validés');
