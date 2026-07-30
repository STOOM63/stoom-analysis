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
  { type: 'sales', required: ['DATE', 'CODE ARTICLE', 'VENTE TTC'], anyOf: ['TICKET', 'NUM. VENTE', 'FACTURE'] },
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
    if (rule.required.every(h => set.has(h)) && (!rule.anyOf || rule.anyOf.some(h => set.has(h))) && !(rule.forbidden || []).some(h => set.has(h))) return rule.type;
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

function hasHeader(headers, name) {
  const target = canonicalHeader(name);
  return headers.some(header => canonicalHeader(header) === target);
}

function salesCapabilities(headers = []) {
  return {
    saleId: hasHeader(headers, 'Num. vente'),
    seller: hasHeader(headers, 'Vendeur'),
    returns: hasHeader(headers, 'Retour'),
    completeDesignation: hasHeader(headers, 'Designation complete')
  };
}

function normalizeSale(row, headers = []) {
  const date = parseDate(value(row, 'Date'));
  const capabilities = salesCapabilities(headers);
  return {
    date: date?.toISOString() || null, saleId: capabilities.saleId ? String(value(row, 'Num. vente') ?? '').replace(/\.0$/, '').trim() : '', seller: capabilities.seller ? text(row, 'Vendeur') : '',
    customerType: text(row, 'Type de client'), customerName: text(row, 'Client'), code: normalizeCode(value(row, 'Code article')),
    name: text(row, 'Designation complete', 'Designation'), shortName: text(row, 'Designation'), department: text(row, 'Rayon'), family: text(row, 'Famille'), subfamily: text(row, 'Sous-famille'),
    isReturn: capabilities.returns ? boolOui(row, 'Retour') : null, quantity: toNumber(value(row, 'Quantite')), purchaseHT: toNumber(value(row, 'Achat HT')),
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
  const normalize = normalizers[type];
  const rows = rawRows.filter(meaningful).map(row => normalize(row, headers)).filter(row => Object.values(row).some(value => value !== null && value !== undefined && value !== ''));
  const capabilities = type === 'sales' ? salesCapabilities(headers) : null;
  const missingSalesDetails = capabilities ? ['saleId', 'seller', 'returns'].filter(field => !capabilities[field]) : [];
  const warning = type === 'sales' && missingSalesDetails.length
    ? `Export de ventes importé. Certaines analyses resteront partielles sur cette période (${missingSalesDetails.includes('seller') ? 'vendeur' : ''}${missingSalesDetails.includes('returns') ? `${missingSalesDetails.includes('seller') ? ', ' : ''}retours` : ''}${missingSalesDetails.includes('saleId') ? `${missingSalesDetails.some(field => ['seller','returns'].includes(field)) ? ', ' : ''}numéro de vente` : ''} non disponible${missingSalesDetails.length > 1 ? 's' : ''}). Un export plus détaillé pourra enrichir automatiquement les mêmes lignes.`
    : null;
  const dates = rows.flatMap(row => [row.date, row.createdAt, row.validatedAt]).filter(Boolean).map(d => new Date(d)).filter(d => !Number.isNaN(d.getTime()));
  return {
    file, hash, sheetName, headers, type, rows, capabilities, warning,
    periodStart: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    periodEnd: dates.length ? new Date(Math.max(...dates)).toISOString() : null
  };
}

function signatureNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : '';
}

function eventBaseSignature(type, row) {
  if (type === 'sales') return [
    row.date,
    row.ticket || row.invoice || '',
    normalizeText(row.customerName),
    row.code,
    signatureNumber(row.quantity),
    signatureNumber(row.purchaseHT),
    signatureNumber(row.saleTTC),
    signatureNumber(row.discountRate),
    normalizeText(row.invoice)
  ].join('|');
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

const INTERNAL_EVENT_FIELDS = new Set(['_key', '_importId', '_importIds', '_sources']);
function cleanEventRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !INTERNAL_EVENT_FIELDS.has(key)));
}
function hasValue(value) { return value !== null && value !== undefined && value !== ''; }
function sourceScore(type, row) {
  if (type !== 'sales') return Object.values(row).filter(hasValue).length;
  return Object.values(row).filter(hasValue).length + (row.saleId ? 8 : 0) + (row.seller ? 8 : 0) + (row.isReturn !== null && row.isReturn !== undefined ? 6 : 0) + (row.name && row.name !== row.shortName ? 2 : 0);
}
function eventSources(record) {
  if (Array.isArray(record._sources) && record._sources.length) return record._sources;
  return [{ importId: record._importId || 'project-existing', row: cleanEventRow(record) }];
}
function consolidateEvent(type, key, sources) {
  const ordered = [...sources].sort((a, b) => sourceScore(type, b.row) - sourceScore(type, a.row));
  const fields = new Set(ordered.flatMap(source => Object.keys(source.row)));
  const merged = {};
  for (const field of fields) {
    const source = ordered.find(item => hasValue(item.row[field]));
    if (source) merged[field] = source.row[field];
  }
  if (type === 'sales') {
    if (ordered.some(source => source.row.isReturn === true)) merged.isReturn = true;
    else if (ordered.some(source => source.row.isReturn === false)) merged.isReturn = false;
    else merged.isReturn = null;
  }
  return { ...merged, _key: key, _importId: sources[0]?.importId || null, _importIds: [...new Set(sources.map(source => source.importId))], _sources: sources };
}
function addsInformation(type, existing, candidate) {
  if (type === 'sales') {
    if (!existing.saleId && candidate.saleId) return true;
    if (!existing.seller && candidate.seller) return true;
    if ((existing.isReturn === null || existing.isReturn === undefined) && candidate.isReturn !== null && candidate.isReturn !== undefined) return true;
    if ((!existing.name || existing.name === existing.shortName) && candidate.name && candidate.name !== candidate.shortName) return true;
  }
  return Object.entries(candidate).some(([field, value]) => hasValue(value) && !hasValue(existing[field]));
}
function rekeyEventRecords(project, type) {
  const records = project.events[type] || [];
  const counts = new Map();
  project.events[type] = records.map(record => {
    const base = eventBaseSignature(type, record);
    const occurrence = counts.get(base) || 0;
    counts.set(base, occurrence + 1);
    const key = `${hashString(base)}_${occurrence}`;
    return consolidateEvent(type, key, eventSources(record));
  });
}

function latestSnapshot(project, type) {
  const batches = project.snapshots[type] || [];
  return batches.at(-1) || null;
}

export function mergeImport(project, result) {
  if (project.imports.some(item => item.hash === result.hash && item.status === 'imported')) return { project, status: 'duplicate-file', added: 0, ignored: result.rows.length, enriched: 0 };
  const importId = uid('imp');
  let added = 0; let ignored = 0; let enriched = 0;
  if (['catalogue', 'stock', 'valuation', 'clients'].includes(result.type)) {
    project.snapshots[result.type].push({ id: importId, fileName: result.file.name, hash: result.hash, importedAt: new Date().toISOString(), rows: result.rows });
    added = result.rows.length;
  } else {
    rekeyEventRecords(project, result.type);
    const keyed = addOccurrenceKeys(result.type, result.rows);
    const positions = new Map(project.events[result.type].map((row, index) => [row._key, index]));
    for (const row of keyed) {
      const position = positions.get(row._key);
      if (position !== undefined) {
        const existing = project.events[result.type][position];
        if (addsInformation(result.type, existing, row)) enriched += 1;
        const sources = [...eventSources(existing), { importId, row: cleanEventRow(row) }];
        project.events[result.type][position] = consolidateEvent(result.type, row._key, sources);
        ignored += 1;
      } else {
        const record = consolidateEvent(result.type, row._key, [{ importId, row: cleanEventRow(row) }]);
        positions.set(row._key, project.events[result.type].length);
        project.events[result.type].push(record);
        added += 1;
      }
    }
    project.events[result.type].sort((a, b) => new Date(a.date || a.createdAt || a.validatedAt || 0) - new Date(b.date || b.createdAt || b.validatedAt || 0));
  }
  project.imports.push({
    id: importId, name: result.file.name, hash: result.hash, type: result.type, status: 'imported', importedAt: new Date().toISOString(),
    rows: result.rows.length, added, ignored, enriched, periodStart: result.periodStart, periodEnd: result.periodEnd, sheetName: result.sheetName,
    capabilities: result.capabilities || null, warning: result.warning || null
  });
  return { project, status: 'imported', added, ignored, enriched, warning: result.warning || null };
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
    project.events[imp.type] = project.events[imp.type].flatMap(record => {
      const remaining = eventSources(record).filter(source => source.importId !== importId);
      return remaining.length ? [consolidateEvent(imp.type, record._key, remaining)] : [];
    });
    rekeyEventRecords(project, imp.type);
  }
  project.imports = project.imports.filter(i => i.id !== importId);
  return project;
}
