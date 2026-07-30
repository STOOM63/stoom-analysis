import assert from 'node:assert/strict';
import { createDemoProject } from '../assets/js/core/demo.js';
import { activeData, detectFileType, mergeImport, removeImport } from '../assets/js/core/importer.js';
import { emptyProject } from '../assets/js/core/storage.js';
import { answerQuestion, buildAnalysis } from '../assets/js/core/analytics.js';

assert.equal(detectFileType(['Date','Num. vente','Vendeur','Client','Code article','Vente TTC','Ticket']), 'sales');
assert.equal(detectFileType(['Date','Client','Code article','Vente TTC','Ticket']), 'sales');
assert.equal(detectFileType(['Code article','Propriete du stock','Valeur stock','Achat moyen']), 'stock');
assert.equal(detectFileType(['Date de creation','Expediteur','Quantite commandee','Quantite recue']), 'receipts');

function salesResult(name, hash, rows, capabilities) {
  return {
    file: { name }, hash, sheetName: 'Ventes.xlsx', headers: [], type: 'sales', rows, capabilities,
    periodStart: rows[0]?.date || null, periodEnd: rows.at(-1)?.date || null,
    warning: capabilities?.seller ? null : 'Détails vendeurs absents'
  };
}

const base = {
  customerType: 'Particulier', customerName: 'CLIENT TEST', code: '3700000000001', name: 'Produit test', shortName: 'Produit test',
  department: 'E-LIQUIDES', family: '10ML', subfamily: '', quantity: 1, purchaseHT: 2, coefficientHT: 3,
  coefficientTTC: 3.6, saleTTC: 7.2, discountRate: 0, invoice: '', catalogue: 'Commun'
};
const basicRows = [
  { ...base, date: '2026-05-02T09:09:11.000Z', saleId: '', seller: '', isReturn: null, ticket: 'T-100' },
  { ...base, date: '2026-05-02T09:09:11.000Z', saleId: '', seller: '', isReturn: null, ticket: 'T-100' },
  { ...base, date: '2026-05-03T10:00:00.000Z', saleId: '', seller: '', isReturn: null, ticket: 'T-101', code: '3700000000002' },
  { ...base, date: '2026-05-04T11:00:00.000Z', saleId: '', seller: '', isReturn: null, ticket: '', invoice: 'F-102', code: '3700000000004' }
];
const detailedRows = basicRows.map((row, index) => ({ ...row, saleId: index < 2 ? '500' : '501', seller: 'ARNAUD', isReturn: false, name: `Produit test détaillé ${index + 1}` }));

const project = emptyProject();
const basicMerge = mergeImport(project, salesResult('Ventes(1).xlsx', 'basic-hash', basicRows, { saleId: false, seller: false, returns: false, completeDesignation: false }));
assert.equal(basicMerge.added, 4, 'Toutes les lignes du premier export doivent être importées');
assert.equal(project.events.sales.length, 4, 'Deux lignes identiques réelles dans un même ticket doivent être préservées');

const detailedMerge = mergeImport(project, salesResult('Ventes(2).xlsx', 'detailed-hash', detailedRows, { saleId: true, seller: true, returns: true, completeDesignation: true }));
assert.equal(detailedMerge.added, 0, 'La période recouvrante ne doit pas doubler les ventes');
assert.equal(detailedMerge.ignored, 4, 'Les lignes recouvrantes doivent être reconnues');
assert.equal(detailedMerge.enriched, 4, 'Les lignes moins détaillées doivent être enrichies');
assert.equal(project.events.sales.length, 4, 'Le CA ne doit pas être doublé après enrichissement');
assert.ok(project.events.sales.every(row => row.seller === 'ARNAUD'), 'Le vendeur de l’export détaillé doit enrichir les lignes existantes');
assert.ok(project.events.sales.every(row => row.saleId), 'Le numéro de vente doit enrichir les lignes existantes');

const extraRows = [{ ...base, date: '2026-08-01T12:00:00.000Z', saleId: '', seller: '', isReturn: null, ticket: 'T-200', code: '3700000000003' }];
const extraMerge = mergeImport(project, salesResult('Ventes-aout.xlsx', 'august-hash', extraRows, { saleId: false, seller: false, returns: false, completeDesignation: false }));
assert.equal(extraMerge.added, 1, 'Une nouvelle période doit être ajoutée même avec un export moins détaillé');
assert.equal(project.events.sales.length, 5);

const detailedImportId = project.imports.find(item => item.hash === 'detailed-hash').id;
removeImport(project, detailedImportId);
assert.equal(project.events.sales.length, 5, 'Supprimer l’export détaillé ne doit pas supprimer les lignes également présentes dans l’export standard');
assert.ok(!project.events.sales.filter(row => row.ticket === 'T-100')[0].seller, 'Les métadonnées propres à l’export supprimé doivent disparaître');

const richFirstProject = emptyProject();
mergeImport(richFirstProject, salesResult('Ventes-detail.xlsx', 'rich-first', detailedRows, { saleId: true, seller: true, returns: true, completeDesignation: true }));
const basicSecond = mergeImport(richFirstProject, salesResult('Ventes-standard.xlsx', 'basic-second', basicRows, { saleId: false, seller: false, returns: false, completeDesignation: false }));
assert.equal(basicSecond.added, 0);
assert.equal(basicSecond.enriched, 0, 'Un export moins détaillé ne doit pas dégrader les données déjà enrichies');
assert.ok(richFirstProject.events.sales.every(row => row.seller === 'ARNAUD'));

const demoProject = createDemoProject();
const data = activeData(demoProject);
const analysis = buildAnalysis(data, {}, demoProject.settings);
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

assert.ok(analysis.kpis.uniqueTickets > 0, 'Le nombre de tickets uniques doit être calculé');
assert.ok(analysis.kpis.uniqueIdentifiedCustomers > 0, 'Le nombre d’acheteurs uniques doit être calculé');
assert.ok(Number.isFinite(analysis.kpis.revenueHT) && Number.isFinite(analysis.kpis.revenueTTC), 'Les montants HT et TTC doivent être présents');
assert.ok(analysis.demographics.ageBands.length >= 6, 'Les tranches d’âge doivent être calculées');
assert.ok(analysis.demographics.cities.length > 0, 'Les villes doivent être analysées');
assert.ok(analysis.customers.some(c => Array.isArray(c.riskReasons) && c.riskReasons.length), 'Chaque client doit disposer d’une raison de statut');
assert.ok(analysis.products.every(p => p.status && p.statusReason), 'Chaque produit doit avoir un statut métier et une explication');
assert.ok(analysis.drivers && Number.isFinite(analysis.drivers.changeTTC) && Number.isFinite(analysis.drivers.changeHT), 'Les causes de variation HT/TTC doivent être calculées');

const orderSales = Array.from({ length: 10 }, (_, index) => ({
  date: `2026-07-${String(21 + index).padStart(2, '0')}T10:00:00.000Z`,
  saleId: `ORDER-${index + 1}`, seller: 'ARNAUD', customerName: `CLIENT ${index + 1}`,
  code: 'MAVERICK-50', name: 'MAVERICK FP - 50ML', department: 'E-LIQUIDES', family: '50ML', subfamily: 'MENTHES',
  isReturn: false, quantity: 1, purchaseHT: 3, saleTTC: 12, discountRate: 0, ticket: `T-${index + 1}`, invoice: ''
}));
const orderData = {
  catalogue: [{ code: 'MAVERICK-50', name: 'MAVERICK FP - 50ML', department: 'E-LIQUIDES', family: '50ML', subfamily: 'MENTHES', supplier: 'OPENVAP', stock: 6, priceHT: 10, priceTTC: 12, taxRate: 20 }],
  stock: [{ code: 'MAVERICK-50', name: 'MAVERICK FP - 50ML', department: 'E-LIQUIDES', family: '50ML', subfamily: 'MENTHES', supplier: 'OPENVAP', stock: 6, averageCost: 3, stockValue: 18, priceHT: 10, priceTTC: 12, taxRate: 20 }],
  valuation: [{ code: 'MAVERICK-50', stock: 6, marketValueHT: 60, marketValueTTC: 72 }],
  clients: orderSales.map((row, index) => ({ code: String(index + 1), name: row.customerName, age: 25 + index, city: 'CLERMONT-FERRAND', commercialConsent: 'ACCORD' })),
  sales: orderSales, movements: [], receipts: []
};
const orderAnalysis = buildAnalysis(orderData, { start: '2026-07-21', end: '2026-07-30' }, { orderTargetDays: 10, orderLeadDays: 3, orderSafetyPct: .15 });
const maverickOrder = orderAnalysis.reorder.lines.find(row => row.code === 'MAVERICK-50');
assert.equal(maverickOrder.packSize, 4, 'Le colisage OPENVAP 50 ml doit être de 4');
assert.equal(maverickOrder.recommendedOrder, 4, '10 vendus, stock 6 et lot de 4 doivent proposer 4 unités');
assert.equal(orderAnalysis.kpis.uniqueTickets, 10, 'Les tickets uniques de la période doivent être exacts');
assert.equal(orderAnalysis.kpis.uniqueIdentifiedCustomers, 10, 'Les visiteurs identifiés uniques doivent être exacts');
assert.equal(orderAnalysis.demographics.cities[0].activeCustomers, 10, 'La démographie active doit refléter les acheteurs de la période');
console.log('✓ ANALYSIS : tous les tests sont validés');
