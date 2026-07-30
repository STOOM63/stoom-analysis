import { fileHash, hashString, normalizeCode, normalizeText, parseDate, toNumber, toPercent, uid } from './utils.js';


let xlsxPromise = null;
export async function ensureXlsx() {
  if (window.XLSX) return window.XLSX;
  if (xlsxPromise) return xlsxPromise;
  const sources = [
    './assets/vendor/xlsx.full.min.js',
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
  ];
  xlsxPromise = new Promise(async (resolve, reject) => {
    for (const src of sources) {
      try {
        await new Promise((ok, fail) => {
          const script = document.createElement('script'); script.src = src; script.async = true;
          const timer = setTimeout(() => { script.remove(); fail(new Error('timeout')); }, 12000);
          script.onload = () => { clearTimeout(timer); window.XLSX ? ok() : fail(new Error('XLSX absent')); };
          script.onerror = () => { clearTimeout(timer); script.remove(); fail(new Error('chargement impossible')); };
          document.head.appendChild(script);
        });
        return resolve(window.XLSX);
      } catch (error) { console.warn('Source XLSX indisponible', src, error); }
    }
    reject(new Error("Impossible de charger le moteur Excel. Une connexion internet est requise lors du premier import."));
  });
  return xlsxPromise;
}

const HEADER_SIGNATURES = [
  { type: 'sales', required: ['DATE', 'NUM. VENTE', 'VENDEUR', 'CODE ARTICLE', 'VENTE TTC'] },
  { type: 'sales_legacy', required: ['DATE', 'CLIENT', 'CODE ARTICLE', 'VENTE TTC', 'TICKET'], forbidden: ['NUM. VENTE'] },
  { type: 'receipts', required: ['DATE DE CREATION', 'EXPEDITEUR', 'QUANTITE COMMANDEE', 'QUANTITE RECUE'] },
  { type: 'movements', required: ['DATE DE CREATION', 'MOTIF', 'CODE ARTICLE', 'QUANTITE', 'TOTAL ACHAT'] },
  { type: 'stock', required: ['CODE ARTICLE', 'PROPRIETE DU STOCK', 'VALEUR STOCK', 'ACHAT MOYEN'] },
  { type: 'valuation', required: ['CODE ARTICLE', 'VALEUR A L\'ACHAT', 'VALEUR COMMERCIALE HT'] },
  { type: 'clients', required: ['CODE CLIENT', 'NOM PRENOM', 'COMM. COMMERCIALE'] },
  { type: 'catalogue', required: ['CODE ARTICLE', 'DESIGNATION', 'CATALOGUE(S)', 'VENTE HT'], forbidden: ['PROPRIETE DU STOCK'] }
];

const aliases = {
  'VALEUR A L’ACHAT': "VALEUR A L'ACHAT",
  'E-MAIL': 'E-MAIL',
  'NUM VENTE': 'NUM. VENTE',
  'QUANTITÉ COMMANDÉE': 'QUANTITE COMMANDEE',
  'QUANTITÉ REÇUE': 'QUANTITE RECUE'
};

function canonicalHeader(value) {
  const h = normalizeText(value).replace(/[’`]/g, "'");
  return aliases[h] || h;
}

export function detectFileType(headers) {
  const set = new Set(headers.map(canonicalHeader));
  for (const rule of HEADER_SIGNATURES) {
    if (rule.required.every(h => set.has(h)) && !(rule.forbidden || []).some(h => set.has(h))) return rule.type;
  }
  return 'unknown';
}

function value(row, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    const target = canonicalHeader(name);
    const found = Object.keys(row).find(k => canonicalHeader(k) === target);
    if (found) return row[found];
  }
  return null;
}

function text(row, ...names) { return String(value(row, ...names) ?? '').replace(/\u00a0/g, ' ').trim(); }
function boolOui(row, ...names) { return /OUI|YES|VRAI|TRUE/.test(normalizeText(value(row, ...names))); }

function normalizeCatalogue(row) {
  return {
    code: normalizeCode(value(row, 'Code article')),
    name: text(row, 'Designation'), year: toNumber(value(row, 'Annee'), null),
    department: text(row, 'Rayon'), family: text(row, 'Famille'), subfamily: text(row, 'Sous-famille'),
    supplier: text(row, 'Fournisseur'), stock: toNumber(value(row, 'Stock')),
    priceHT: toNumber(value(row, 'Vente HT')), taxRate: toNumber(value(row, 'TVA'), 20), priceTTC: toNumber(value(row, 'Vente TTC')),
    createdAt: parseDate(value(row, 'Date de creation'))?.toISOString() || null,
    updatedAt: parseDate(value(row, 'Derniere modification'))?.toISOString() || null,
    visibility: text(row, 'Catalogue(s)')
  };
}

function normalizeStock(row) {
  return {
    code: normalizeCode(value(row, 'Code article')), name: text(row, 'Designation'), year: toNumber(value(row, 'Annee'), null),
    department: text(row, 'Rayon'), family: text(row, 'Famille'), subfamily: text(row, 'Sous-famille'), supplier: text(row, 'Fournisseur'),
    ownership: text(row, 'Propriete du stock'), stock: toNumber(value(row, 'Stock')), lastCost: toNumber(value(row, 'Dernier achat')),
    averageCost: toNumber(value(row, 'Achat moyen')), stockValue: toNumber(value(row, 'Valeur stock')), unitMargin: toNumber(value(row, 'Marge')),
    marginRate: toPercent(value(row, 'Taux de marge')), markupRate: toPercent(value(row, 'Taux de marque')),
    coefficientHT: toNumber(value(row, 'Coeff. multiplicateur HT')), coefficientTTC: toNumber(value(row, 'Coeff. multiplicateur TTC')),
    priceHT: toNumber(value(row, 'Vente HT')), taxRate: toNumber(value(row, 'TVA'), 20), priceTTC: toNumber(value(row, 'Vente TTC')),
    createdAt: parseDate(value(row, 'Date de creation'))?.toISOString() || null,
    updatedAt: parseDate(value(row, 'Derniere modification'))?.toISOString() || null
  };
}

function normalizeValuation(row) {
  return {
    code: normalizeCode(value(row, 'Code article')), name: text(row, 'Designation'), department: text(row, 'Rayon'), family: text(row, 'Famille'), subfamily: text(row, 'Sous-famille'),
    stock: toNumber(value(row, 'Stock')), averageCost: toNumber(value(row, 'Achat moyen')), purchaseValue: toNumber(value(row, "Valeur a l'achat", "Valeur à l'achat")),
    marginRate: toPercent(value(row, 'Taux de marge')), markupRate: toPercent(value(row, 'Taux de marque')),
    coefficientHT: toNumber(value(row, 'Coeff. multiplicateur HT')), coefficientTTC: toNumber(value(row, 'Coeff. multiplicateur TTC')),
    marketValueHT: toNumber(value(row, 'Valeur commerciale HT')), marketValueTTC: toNumber(value(row, 'Valeur commerciale TTC'))
  };
}

function normalizeClient(row) {
  return {
    code: String(value(row, 'Code client') ?? '').replace(/\.0$/, '').trim(), identifier: text(row, 'Identifiant'), title: text(row, 'Etat civil'), name: text(row, 'Nom prenom'),
    address1: text(row, 'Adresse 1'), address2: text(row, 'Adresse 2'), address3: text(row, 'Adresse 3'), zip: text(row, 'Code postal'), city: text(row, 'Ville'), country: text(row, 'Pays'),
    phone: text(row, 'Telephone'), email: text(row, 'E-mail'), commercialConsent: text(row, 'Comm. commerciale'), nonCommercialConsent: text(row, 'Comm. non commerciale'),
    birthday: text(row, 'Anniversaire'), age: toNumber(value(row, 'Age'), null), profession: text(row, 'Profession'), alert: text(row, 'Alerte'),
    createdAt: parseDate(value(row, 'Date creation'))?.toISOString() || null, createdOn: text(row, 'Creation sur')
  };
}

function normalizeSale(row) {
  const date = parseDate(value(row, 'Date'));
  return {
    date: date?.toISOString() || null, saleId: String(value(row, 'Num. vente') ?? '').replace(/\.0$/, '').trim(), seller: text(row, 'Vendeur'),
    customerType: text(row, 'Type de client'), customerName: text(row, 'Client'), code: normalizeCode(value(row, 'Code article')),
    name: text(row, 'Designation complete', 'Designation'), shortName: text(row, 'Designation'), department: text(row, 'Rayon'), family: text(row, 'Famille'), subfamily: text(row, 'Sous-famille'),
    isReturn: boolOui(row, 'Retour'), quantity: toNumber(value(row, 'Quantite')), purchaseHT: toNumber(value(row, 'Achat HT')),
    coefficientHT: toNumber(value(row, 'Coeff. multiplicateur HT')), coefficientTTC: toNumber(value(row, 'Coeff. multiplicateur TTC')),
    saleTTC: toNumber(value(row, 'Vente TTC')), discountRate: toPercent(value(row, '% Remise')), invoice: text(row, 'Facture'), ticket: text(row, 'Ticket'), catalogue: text(row, 'Catalogue(s)')
  };
}

function normalizeMovement(row) {
  return {
    movementId: String(value(row, 'Numero') ?? '').replace(/\.0$/, '').trim(), date: parseDate(value(row, 'Date de creation'))?.toISOString() || null,
    store: text(row, 'Point de vente'), reason: text(row, 'Motif'), code: normalizeCode(value(row, 'Code article')), name: text(row, 'Designation'), size: text(row, 'Taille'), color: text(row, 'Couleur'),
    department: text(row, 'Rayon'), family: text(row, 'Famille'), unitCost: toNumber(value(row, 'Achat unitaire')), quantity: toNumber(value(row, 'Quantite')), totalCost: toNumber(value(row, 'Total achat'))
  };
}

function normalizeReceipt(row) {
  return {
    orderId: String(value(row, 'Numero') ?? '').replace(/\.0$/, '').trim(), createdAt: parseDate(value(row, 'Date de creation'))?.toISOString() || null,
    expectedAt: parseDate(value(row, 'Date previsionnelle'))?.toISOString() || null, validatedAt: parseDate(value(row, 'Date de validation'))?.toISOString() || null,
    supplier: text(row, 'Expediteur'), recipient: text(row, 'Destinataire'), orderType: text(row, 'Type de commande'), code: normalizeCode(value(row, 'Code article')),
    name: text(row, 'Designation'), size: text(row, 'Taille'), color: text(row, 'Couleur'), department: text(row, 'Rayon'), family: text(row, 'Famille'),
    unitCost: toNumber(value(row, 'Achat unitaire')), quantityOrdered: toNumber(value(row, 'Quantite commandee')), quantityReceived: toNumber(value(row, 'Quantite recue')), totalCost: toNumber(value(row, 'Total achat'))
  };
}

const normalizers = { catalogue: normalizeCatalogue, stock: normalizeStock, valuation: normalizeValuation, clients: normalizeClient, sales: normalizeSale, movements: normalizeMovement, receipts: normalizeReceipt };

function meaningful(row) { return Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== ''); }

export async function readWorkbookFile(file) {
  await ensureXlsx();
  const hash = await fileHash(file);
  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = window.XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  const type = detectFileType(headers);
  if (type === 'unknown') throw new Error(`Format non reconnu : ${file.name}`);
  if (type === 'sales_legacy') return { file, hash, sheetName, headers, type, rows: rawRows, rejected: true, warning: 'Ancien export de ventes détecté : utilisez Ventes(2), qui contient le numéro de vente, le vendeur et les retours.' };
  const normalize = normalizers[type];
  const rows = rawRows.filter(meaningful).map(normalize).filter(row => Object.values(row).some(Boolean));
  const dates = rows.flatMap(row => [row.date, row.createdAt, row.validatedAt]).filter(Boolean).map(d => new Date(d)).filter(d => !Number.isNaN(d.getTime()));
  return {
    file, hash, sheetName, headers, type, rows,
    periodStart: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    periodEnd: dates.length ? new Date(Math.max(...dates)).toISOString() : null
  };
}

function eventBaseSignature(type, row) {
  if (type === 'sales') return [row.date, row.saleId, row.seller, normalizeText(row.customerName), row.code, row.quantity, row.purchaseHT, row.saleTTC, row.discountRate, row.ticket].join('|');
  if (type === 'movements') return [row.movementId, row.date, row.reason, row.code, row.quantity, row.totalCost].join('|');
  if (type === 'receipts') return [row.orderId, row.createdAt, row.validatedAt, row.supplier, row.code, row.quantityOrdered, row.quantityReceived, row.unitCost].join('|');
  return JSON.stringify(row);
}

function addOccurrenceKeys(type, rows) {
  const counts = new Map();
  return rows.map(row => {
    const base = eventBaseSignature(type, row);
    const occurrence = counts.get(base) || 0;
    counts.set(base, occurrence + 1);
    return { ...row, _key: `${hashString(base)}_${occurrence}` };
  });
}

function latestSnapshot(project, type) {
  const batches = project.snapshots[type] || [];
  return batches.at(-1) || null;
}

export function mergeImport(project, result) {
  if (project.imports.some(item => item.hash === result.hash)) return { project, status: 'duplicate-file', added: 0, ignored: result.rows.length };
  if (result.rejected) {
    project.imports.push({ id: uid('imp'), name: result.file.name, hash: result.hash, type: result.type, status: 'rejected', warning: result.warning, importedAt: new Date().toISOString(), rows: result.rows.length });
    return { project, status: 'rejected', added: 0, ignored: result.rows.length, warning: result.warning };
  }
  const importId = uid('imp');
  let added = 0; let ignored = 0;
  if (['catalogue', 'stock', 'valuation', 'clients'].includes(result.type)) {
    project.snapshots[result.type].push({ id: importId, fileName: result.file.name, hash: result.hash, importedAt: new Date().toISOString(), rows: result.rows });
    added = result.rows.length;
  } else {
    const keyed = addOccurrenceKeys(result.type, result.rows);
    const existing = new Set(project.events[result.type].map(row => row._key));
    for (const row of keyed) {
      if (existing.has(row._key)) ignored += 1;
      else { project.events[result.type].push({ ...row, _importId: importId }); existing.add(row._key); added += 1; }
    }
    project.events[result.type].sort((a, b) => new Date(a.date || a.createdAt || a.validatedAt || 0) - new Date(b.date || b.createdAt || b.validatedAt || 0));
  }
  project.imports.push({
    id: importId, name: result.file.name, hash: result.hash, type: result.type, status: 'imported', importedAt: new Date().toISOString(),
    rows: result.rows.length, added, ignored, periodStart: result.periodStart, periodEnd: result.periodEnd, sheetName: result.sheetName
  });
  return { project, status: 'imported', added, ignored };
}

export function activeData(project) {
  return {
    catalogue: latestSnapshot(project, 'catalogue')?.rows || [],
    stock: latestSnapshot(project, 'stock')?.rows || [],
    valuation: latestSnapshot(project, 'valuation')?.rows || [],
    clients: latestSnapshot(project, 'clients')?.rows || [],
    sales: project.events.sales || [], movements: project.events.movements || [], receipts: project.events.receipts || []
  };
}

export function removeImport(project, importId) {
  const imp = project.imports.find(i => i.id === importId);
  if (!imp) return project;
  if (['catalogue', 'stock', 'valuation', 'clients'].includes(imp.type)) {
    project.snapshots[imp.type] = project.snapshots[imp.type].filter(batch => batch.id !== importId);
  } else if (project.events[imp.type]) {
    project.events[imp.type] = project.events[imp.type].filter(row => row._importId !== importId);
  }
  project.imports = project.imports.filter(i => i.id !== importId);
  return project;
}
