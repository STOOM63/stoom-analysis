import { addDays, isoDate, uid } from './utils.js';
import { emptyProject } from './storage.js';

function rng(seed = 42) { let x = seed; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; }
function pick(random, values) { return values[Math.floor(random() * values.length)]; }
function weighted(random, values) { const total = values.reduce((a, x) => a + x[1], 0); let p = random() * total; for (const [value, weight] of values) { p -= weight; if (p <= 0) return value; } return values.at(-1)[0]; }

export function createDemoProject() {
  const random = rng(20260730); const project = emptyProject(); project.settings.storeName = 'Boutique démonstration';
  const departments = [
    ['E-LIQUIDES', ['10ML', '50ML', '100ML']], ['MATÉRIEL', ['POD', 'RÉSISTANCE', 'CARTOUCHE', 'ACCESSOIRE']], ['DIY', ['ARÔME', 'BASE', 'BOOSTER']]
  ];
  const suppliers = ['NOVA DISTRIBUTION', 'VAPELAB PRO', 'HEXAGONE SUPPLY', 'ORBITAL'];
  const products = [];
  for (let i = 1; i <= 86; i++) {
    const [department, families] = weighted(random, [[departments[0], 55], [departments[1], 32], [departments[2], 13]]); const family = pick(random, families); const supplier = random() < .08 ? '' : pick(random, suppliers);
    const averageCost = family === 'POD' ? 14 + random() * 15 : family === 'ACCESSOIRE' ? 2 + random() * 8 : 1.2 + random() * 5;
    const markup = .4 + random() * .32; const priceHT = averageCost / (1 - markup); const priceTTC = Math.round(priceHT * 1.2 * 10) / 10;
    const stock = Math.max(-2, Math.round(random() * (family === '10ML' ? 45 : 18) - (random() < .08 ? 8 : 0)));
    products.push({ code: String(3700000000000 + i), name: `${family} ANALYSIS ${String(i).padStart(2, '0')}`, year: 2026, department, family, subfamily: '', supplier, stock, averageCost, lastCost: averageCost * (.95 + random() * .12), stockValue: stock * averageCost, unitMargin: priceHT - averageCost, marginRate: (priceHT - averageCost) / averageCost, markupRate: markup, priceHT, taxRate: 20, priceTTC, createdAt: addDays(new Date(), -Math.round(random() * 420)).toISOString(), updatedAt: new Date().toISOString() });
  }
  const catalogue = products.map(p => ({ ...p, visibility: 'Commun' }));
  const valuation = products.filter(p => p.stock > 0).map(p => ({ code: p.code, name: p.name, department: p.department, family: p.family, subfamily: p.subfamily, stock: p.stock, averageCost: p.averageCost, purchaseValue: p.stockValue, marginRate: p.marginRate, markupRate: p.markupRate, marketValueHT: p.stock * p.priceHT, marketValueTTC: p.stock * p.priceTTC }));
  const firstNames = ['ALICE', 'AMINE', 'CHLOÉ', 'DAVID', 'EMMA', 'FABIEN', 'INÈS', 'JULIEN', 'LINA', 'MATHIS', 'NORA', 'QUENTIN', 'SARAH', 'THOMAS'];
  const lastNames = ['MARTIN', 'BERNARD', 'DUBOIS', 'ROBERT', 'RICHARD', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON'];
  const clients = Array.from({ length: 240 }, (_, i) => ({ code: String(9000000 + i), name: `${pick(random, lastNames)} ${pick(random, firstNames)} ${i + 1}`, city: pick(random, ['Clermont-Ferrand', 'Aubière', 'Riom', 'Chamalières', 'Cournon-d’Auvergne']), zip: pick(random, ['63000', '63170', '63200', '63400', '63800']), phone: random() < .9 ? `06${String(Math.floor(random() * 1e8)).padStart(8, '0')}` : '', email: random() < .72 ? `client${i + 1}@exemple.fr` : '', commercialConsent: random() < .78 ? 'Accord' : 'Refus', age: 20 + Math.floor(random() * 48), createdAt: addDays(new Date(), -Math.round(random() * 500)).toISOString() }));
  const sellers = ['ALEX', 'CAMILLE', 'LÉA', 'SAM']; const start = addDays(new Date(), -210); const sales = []; let saleId = 1000;
  const customerAffinity = new Map(clients.map(c => [c.name, pick(random, departments)[0]]));
  for (let day = 0; day <= 210; day++) {
    const date = addDays(start, day); const dow = date.getDay(); if (dow === 0) continue;
    const seasonal = 1 + .22 * Math.sin((day / 210) * Math.PI * 3); const ticketCount = Math.max(3, Math.round((dow === 6 ? 17 : 12) * seasonal + random() * 8));
    for (let t = 0; t < ticketCount; t++) {
      saleId += 1; const seller = weighted(random, [['ALEX', 31], ['CAMILLE', 29], ['LÉA', 24], ['SAM', 16]]); const client = random() < .97 ? pick(random, clients) : null;
      const hour = 8 + Math.floor(random() * 11); const minute = Math.floor(random() * 60); const when = new Date(date); when.setHours(hour, minute, Math.floor(random() * 60));
      const lineCount = 1 + (random() < .58 ? 1 : 0) + (random() < .25 ? 1 : 0); const affinity = client ? customerAffinity.get(client.name) : null;
      for (let l = 0; l < lineCount; l++) {
        let pool = products.filter(p => !affinity || l > 0 || p.department === affinity); if (!pool.length) pool = products;
        const product = pick(random, pool); const qty = product.family === '10ML' ? 1 + Math.floor(random() * 8) : 1 + (random() < .12 ? 1 : 0); const free = product.family === '10ML' && qty >= 5 && random() < .4; const discount = free && l === lineCount - 1 ? 1 : random() < .08 ? .05 : 0;
        const saleTTC = discount === 1 ? 0 : product.priceTTC * qty * (1 - discount); const purchaseHT = product.averageCost * qty;
        sales.push({ _key: uid('demo'), date: when.toISOString(), saleId: String(saleId), seller, customerType: 'Particulier', customerName: client?.name || '', code: product.code, name: product.name, shortName: product.name, department: product.department, family: product.family, subfamily: '', isReturn: false, quantity: qty, purchaseHT, saleTTC, discountRate: discount, ticket: `D-${saleId}`, catalogue: 'Commun' });
      }
      if (random() < .018 && sales.length) {
        const original = sales.at(-1); sales.push({ ...original, _key: uid('return'), date: addDays(when, Math.floor(random() * 7)).toISOString(), quantity: -1, purchaseHT: -original.purchaseHT / Math.max(1, original.quantity), saleTTC: -original.saleTTC / Math.max(1, original.quantity), isReturn: true });
      }
    }
  }
  const receipts = []; let orderId = 400;
  for (let day = 0; day <= 210; day += 9 + Math.floor(random() * 7)) {
    orderId += 1; const supplier = pick(random, suppliers); const created = addDays(start, day); const validated = addDays(created, 2 + Math.floor(random() * 5)); const selected = products.filter(p => p.supplier === supplier).sort(() => random() - .5).slice(0, 8 + Math.floor(random() * 10));
    for (const product of selected) { const qo = 5 + Math.floor(random() * 25); const service = random() < .15 ? .65 + random() * .25 : .95 + random() * .1; const qr = Math.round(qo * service); receipts.push({ _key: uid('rec'), orderId: String(orderId), createdAt: created.toISOString(), expectedAt: addDays(created, 4).toISOString(), validatedAt: validated.toISOString(), supplier, recipient: 'Boutique démonstration', orderType: 'RÉASSORT', code: product.code, name: product.name, department: product.department, family: product.family, unitCost: product.averageCost * (.96 + random() * .08), quantityOrdered: qo, quantityReceived: qr, totalCost: qr * product.averageCost }); }
  }
  const movements = [];
  for (let i = 0; i < 54; i++) { const product = pick(random, products); const negative = random() < .82; const quantity = negative ? -(1 + Math.floor(random() * 4)) : 1 + Math.floor(random() * 3); const reason = negative ? pick(random, ['DDM_DEPASSEE', 'CONSOMMATION_MAGASIN', 'AJUSTEMENT_NEGATIF', 'RETOUR_SAV']) : 'AJUSTEMENT_POSITIF'; movements.push({ _key: uid('mov'), movementId: String(700 + i), date: addDays(start, Math.floor(random() * 210)).toISOString(), store: 'Boutique démonstration', reason, code: product.code, name: product.name, department: product.department, family: product.family, unitCost: product.averageCost, quantity, totalCost: quantity * product.averageCost }); }
  const now = new Date().toISOString();
  project.snapshots.catalogue.push({ id: 'demo-cat', fileName: 'Catalogue-demo.xlsx', hash: 'demo-cat', importedAt: now, rows: catalogue });
  project.snapshots.stock.push({ id: 'demo-stock', fileName: 'Stock-demo.xlsx', hash: 'demo-stock', importedAt: now, rows: products });
  project.snapshots.valuation.push({ id: 'demo-val', fileName: 'Valorisation-demo.xlsx', hash: 'demo-val', importedAt: now, rows: valuation });
  project.snapshots.clients.push({ id: 'demo-clients', fileName: 'Clients-demo.xlsx', hash: 'demo-clients', importedAt: now, rows: clients });
  project.events.sales = sales; project.events.receipts = receipts; project.events.movements = movements;
  project.imports = [
    ['demo-cat', 'Catalogue-demo.xlsx', 'catalogue', catalogue.length], ['demo-stock', 'Stock-demo.xlsx', 'stock', products.length], ['demo-val', 'Valorisation-demo.xlsx', 'valuation', valuation.length], ['demo-clients', 'Clients-demo.xlsx', 'clients', clients.length], ['demo-sales', 'Ventes-demo.xlsx', 'sales', sales.length], ['demo-receipts', 'Réceptions-demo.xlsx', 'receipts', receipts.length], ['demo-movements', 'Mouvements-demo.xlsx', 'movements', movements.length]
  ].map(([id, name, type, rows]) => ({ id, name, type, rows, added: rows, ignored: 0, status: 'imported', importedAt: now, hash: id }));
  return project;
}
