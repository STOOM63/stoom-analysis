import {
  addDays, clamp, daysBetween, groupBy, indexBy, isoDate, mean, median, normalizeText, parseDate, quantile, safeDiv, stddev, sum, toNumber
} from './utils.js';

function inPeriod(date, start, end) {
  const d = date instanceof Date ? date : parseDate(date);
  if (!d) return false;
  return (!start || d >= start) && (!end || d <= end);
}

function dateExtent(rows, fields = ['date']) {
  const dates = [];
  for (const row of rows) for (const field of fields) {
    const d = parseDate(row[field]); if (d) dates.push(d);
  }
  return dates.length ? { min: new Date(Math.min(...dates)), max: new Date(Math.max(...dates)) } : { min: null, max: null };
}

function buildProductMap(data) {
  const map = new Map();
  for (const source of [data.catalogue, data.stock, data.valuation]) {
    for (const row of source) map.set(row.code, { ...(map.get(row.code) || {}), ...row });
  }
  for (const row of data.sales) if (row.code && !map.has(row.code)) map.set(row.code, { code: row.code, name: row.name, department: row.department, family: row.family, subfamily: row.subfamily, supplier: '', stock: 0, historicalOnly: true });
  return map;
}

function lineFinancials(line, productMap) {
  const product = productMap.get(line.code) || {};
  const taxRate = Number.isFinite(product.taxRate) ? product.taxRate : 20;
  const revenueTTC = toNumber(line.saleTTC);
  const revenueHT = revenueTTC / (1 + taxRate / 100);
  const costHT = toNumber(line.purchaseHT);
  const marginHT = revenueHT - costHT;
  const listPrice = toNumber(product.priceTTC);
  const theoretical = line.quantity > 0 && listPrice > 0 ? listPrice * line.quantity : revenueTTC;
  const discountValue = line.quantity > 0 ? Math.max(0, theoretical - revenueTTC) : 0;
  return { revenueTTC, revenueHT, costHT, marginHT, discountValue, taxRate };
}

function groupTickets(lines, productMap) {
  const map = new Map();
  for (const line of lines) {
    const key = line.saleId || line.ticket || `${line.date}|${line.seller}|${line.customerName}`;
    if (!map.has(key)) map.set(key, { key, date: parseDate(line.date), seller: line.seller || 'NON RENSEIGNÉ', customer: line.customerName || '', lines: [], revenueTTC: 0, revenueHT: 0, costHT: 0, marginHT: 0, items: 0, discountValue: 0, families: new Set(), products: new Set(), hasReturn: false });
    const ticket = map.get(key); const fin = lineFinancials(line, productMap);
    ticket.lines.push(line); ticket.revenueTTC += fin.revenueTTC; ticket.revenueHT += fin.revenueHT; ticket.costHT += fin.costHT; ticket.marginHT += fin.marginHT;
    ticket.items += line.quantity; ticket.discountValue += fin.discountValue; if (line.family) ticket.families.add(line.family); if (line.code) ticket.products.add(line.code); ticket.hasReturn ||= line.isReturn || line.quantity < 0;
  }
  return [...map.values()].sort((a, b) => a.date - b.date);
}

function previousPeriod(start, end) {
  if (!start || !end) return null;
  const duration = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const prevEnd = new Date(start); prevEnd.setMilliseconds(-1);
  const prevStart = addDays(new Date(start), -duration);
  return { start: prevStart, end: prevEnd };
}

function kpisFromLines(lines, productMap) {
  const tickets = groupTickets(lines, productMap);
  const financials = lines.map(line => lineFinancials(line, productMap));
  const revenueTTC = sum(financials.map(x => x.revenueTTC)); const revenueHT = sum(financials.map(x => x.revenueHT)); const costHT = sum(financials.map(x => x.costHT)); const marginHT = revenueHT - costHT;
  const positiveTickets = tickets.filter(t => t.revenueTTC >= 0);
  const identified = tickets.filter(t => normalizeText(t.customer));
  return {
    revenueTTC, revenueHT, costHT, marginHT, markupRate: safeDiv(marginHT, revenueHT), marginRate: safeDiv(marginHT, costHT),
    tickets: tickets.length, items: sum(lines.map(r => r.quantity)), customers: new Set(identified.map(t => normalizeText(t.customer))).size,
    averageBasket: safeDiv(revenueTTC, positiveTickets.length || tickets.length), medianBasket: median(positiveTickets.map(t => t.revenueTTC)),
    itemsPerTicket: safeDiv(sum(lines.filter(r => r.quantity > 0).map(r => r.quantity)), positiveTickets.length || tickets.length),
    marginPerTicket: safeDiv(marginHT, positiveTickets.length || tickets.length), discountValue: sum(financials.map(x => x.discountValue)),
    returnValue: Math.abs(sum(lines.filter(r => r.isReturn || r.quantity < 0).map(r => lineFinancials(r, productMap).revenueTTC))),
    returnLines: lines.filter(r => r.isReturn || r.quantity < 0).length,
    freeUnits: sum(lines.filter(r => r.discountRate >= .999 && r.quantity > 0).map(r => r.quantity)),
    identifiedRate: safeDiv(identified.length, tickets.length), ticketsList: tickets
  };
}

function dailySeries(lines, productMap) {
  const map = new Map();
  for (const line of lines) {
    const key = isoDate(line.date); if (!key) continue;
    if (!map.has(key)) map.set(key, { date: key, revenue: 0, margin: 0, tickets: new Set(), items: 0 });
    const item = map.get(key); const fin = lineFinancials(line, productMap);
    item.revenue += fin.revenueTTC; item.margin += fin.marginHT; item.items += line.quantity; item.tickets.add(line.saleId || line.ticket);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ ...r, tickets: r.tickets.size }));
}

function categoryStats(lines, productMap, field = 'department') {
  const map = new Map();
  for (const line of lines) {
    const key = line[field] || 'NON CLASSÉ'; const fin = lineFinancials(line, productMap);
    if (!map.has(key)) map.set(key, { name: key, revenue: 0, margin: 0, quantity: 0, tickets: new Set(), customers: new Set() });
    const x = map.get(key); x.revenue += fin.revenueTTC; x.margin += fin.marginHT; x.quantity += line.quantity; x.tickets.add(line.saleId || line.ticket); if (line.customerName) x.customers.add(normalizeText(line.customerName));
  }
  return [...map.values()].map(x => ({ ...x, tickets: x.tickets.size, customers: x.customers.size, markupRate: safeDiv(x.margin, x.revenue / 1.2) })).sort((a, b) => b.revenue - a.revenue);
}

function receiptAgeMetrics(code, currentStock, receipts, referenceDate) {
  if (currentStock <= 0) return { knownQty: 0, unknownQty: 0, weightedAge: 0, oldestKnown: null, newestKnown: null };
  const rows = receipts.filter(r => r.code === code && r.quantityReceived > 0 && (r.validatedAt || r.createdAt)).sort((a, b) => new Date(b.validatedAt || b.createdAt) - new Date(a.validatedAt || a.createdAt));
  let remaining = currentStock; let weighted = 0; let knownQty = 0; const retained = [];
  for (const row of rows) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, row.quantityReceived); const date = parseDate(row.validatedAt || row.createdAt);
    if (date && qty > 0) { retained.push(date); weighted += qty * Math.max(0, daysBetween(date, referenceDate)); knownQty += qty; }
    remaining -= qty;
  }
  return { knownQty, unknownQty: Math.max(0, remaining), weightedAge: safeDiv(weighted, knownQty), oldestKnown: retained.length ? new Date(Math.min(...retained)) : null, newestKnown: retained.length ? new Date(Math.max(...retained)) : null };
}

function productStats(data, selectedSales, productMap, referenceDate, periodStart, settings = {}) {
  const dormantDays = Number(settings.dormantDays) || 45; const criticalDormantDays = Number(settings.criticalDormantDays) || 90; const targetCoverageDays = Number(settings.targetCoverageDays) || 28;
  const selectedByCode = groupBy(selectedSales, r => r.code);
  const allByCode = groupBy(data.sales, r => r.code);
  const receiptsByCode = groupBy(data.receipts, r => r.code);
  const periodDays = Math.max(1, daysBetween(periodStart, referenceDate) + 1);
  const rows = [];
  for (const [code, product] of productMap) {
    const sales = selectedByCode.get(code) || []; const allSales = allByCode.get(code) || [];
    const fins = sales.map(r => lineFinancials(r, productMap));
    const revenue = sum(fins.map(x => x.revenueTTC)); const revenueHT = sum(fins.map(x => x.revenueHT)); const cost = sum(fins.map(x => x.costHT)); const margin = revenueHT - cost;
    const quantity = sum(sales.map(r => r.quantity)); const positiveQty = sum(sales.filter(r => r.quantity > 0).map(r => r.quantity));
    const allPositive = allSales.filter(r => r.quantity > 0 && parseDate(r.date)); const lastSale = allPositive.length ? new Date(Math.max(...allPositive.map(r => +parseDate(r.date)))) : null;
    const daysSinceSale = lastSale ? Math.max(0, daysBetween(lastSale, referenceDate)) : null;
    const recentStart = addDays(referenceDate, -29); const recentQty = sum(allPositive.filter(r => parseDate(r.date) >= recentStart && parseDate(r.date) <= referenceDate).map(r => r.quantity));
    const dataExtent = dateExtent(data.sales); const availableDays = dataExtent.min ? clamp(daysBetween(dataExtent.min, referenceDate) + 1, 1, 30) : 30;
    const dailyVelocity = recentQty / availableDays; const stock = toNumber(product.stock); const coverageDays = dailyVelocity > 0 ? stock / dailyVelocity : (stock > 0 ? Infinity : 0);
    const stockValue = Number.isFinite(product.stockValue) ? product.stockValue : stock * toNumber(product.averageCost);
    const age = receiptAgeMetrics(code, stock, receiptsByCode.get(code) || [], referenceDate);
    const weekly = new Map();
    for (const r of sales.filter(x => x.quantity > 0)) {
      const d = parseDate(r.date); if (!d) continue; const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const key = isoDate(monday);
      weekly.set(key, (weekly.get(key) || 0) + r.quantity);
    }
    const weekValues = [...weekly.values()]; const cv = mean(weekValues) ? stddev(weekValues) / mean(weekValues) : Infinity;
    const xyz = weekValues.length < 3 || positiveQty < 3 ? 'Z' : cv <= .5 ? 'X' : cv <= 1 ? 'Y' : 'Z';
    rows.push({
      code, name: product.name || sales[0]?.name || code, department: product.department || sales[0]?.department || 'NON CLASSÉ', family: product.family || sales[0]?.family || '', subfamily: product.subfamily || sales[0]?.subfamily || '', supplier: product.supplier || '',
      stock, stockValue, averageCost: toNumber(product.averageCost), priceTTC: toNumber(product.priceTTC), unitMargin: toNumber(product.unitMargin), markupRateCurrent: toNumber(product.markupRate),
      revenue, revenueHT, cost, margin, quantity, positiveQty, tickets: new Set(sales.map(r => r.saleId || r.ticket)).size, customers: new Set(sales.filter(r => r.customerName).map(r => normalizeText(r.customerName))).size,
      marginRate: safeDiv(margin, cost), markupRate: safeDiv(margin, revenueHT), marginPerStockEuro: safeDiv(margin, stockValue), sellThroughProxy: safeDiv(positiveQty, positiveQty + Math.max(stock, 0)),
      lastSale, daysSinceSale, recentQty, dailyVelocity, coverageDays, xyz, variability: cv, age, historicalOnly: !!product.historicalOnly, periodDays
    });
  }
  const ranked = [...rows].sort((a, b) => b.margin - a.margin); const totalMargin = sum(ranked.map(r => Math.max(0, r.margin))); let cumulative = 0;
  for (const row of ranked) { cumulative += Math.max(0, row.margin); const share = safeDiv(cumulative, totalMargin); row.abc = share <= .8 ? 'A' : share <= .95 ? 'B' : 'C'; }
  const qtyQ75 = quantile(rows.map(r => r.positiveQty), .75); const marginQ75 = quantile(rows.map(r => r.markupRate).filter(Number.isFinite), .75);
  for (const row of rows) {
    if (row.stock < 0) row.status = 'Stock négatif';
    else if (row.stock <= 0 && row.recentQty > 0) row.status = 'Rupture active';
    else if (row.stock > 0 && (row.daysSinceSale == null || row.daysSinceSale >= criticalDormantDays)) row.status = 'Stock mort';
    else if (row.stock > 0 && row.daysSinceSale >= dormantDays) row.status = `Dormant ${dormantDays} j`;
    else if (row.stock > 0 && row.daysSinceSale >= Math.max(15, Math.round(dormantDays * .65))) row.status = 'Ralentissement';
    else if (row.coverageDays !== Infinity && row.coverageDays < targetCoverageDays * .35 && row.recentQty > 0) row.status = 'Réassort urgent';
    else if (row.coverageDays > targetCoverageDays * 3.2 && row.recentQty > 0) row.status = 'Surstock';
    else if (row.abc === 'A' && row.xyz === 'X' && row.markupRate >= marginQ75) row.status = 'Star';
    else if (row.markupRate >= marginQ75 && row.positiveQty < qtyQ75) row.status = 'Marge à exploiter';
    else if (row.positiveQty >= qtyQ75 && row.markupRate < marginQ75) row.status = 'Produit trafic';
    else row.status = 'Sain';
    const dormantRisk = row.stockValue * clamp((row.daysSinceSale || 0) / 90, 0, 1.5);
    const ruptureOpportunity = row.stock <= 0 ? row.margin * .3 + row.recentQty * Math.max(0, row.unitMargin) : 0;
    row.priorityScore = dormantRisk + ruptureOpportunity + (row.stock < 0 ? 500 : 0);
  }
  return rows.sort((a, b) => b.priorityScore - a.priorityScore);
}

function customerStats(data, selectedTickets, productMap, referenceDate) {
  const allTickets = groupTickets(data.sales, productMap).filter(t => normalizeText(t.customer));
  const selectedNames = new Set(selectedTickets.filter(t => normalizeText(t.customer)).map(t => normalizeText(t.customer)));
  const byName = groupBy(allTickets, t => normalizeText(t.customer)); const clientIndex = indexBy(data.clients, c => normalizeText(c.name));
  const rows = [];
  for (const [name, visitsRaw] of byName) {
    const visits = visitsRaw.sort((a, b) => a.date - b.date); const selected = visits.filter(v => selectedNames.has(name) && selectedTickets.some(t => t.key === v.key));
    if (!selected.length) continue;
    const first = visits[0].date; const last = visits.at(-1).date; const gaps = visits.slice(1).map((v, i) => Math.max(0, daysBetween(visits[i].date, v.date))).filter(Boolean);
    const avgGap = mean(gaps); const recency = daysBetween(last, referenceDate); const expectedGap = avgGap || (visits.length === 1 ? 45 : 30); const lateness = recency - expectedGap;
    const selectedRevenue = sum(selected.map(v => v.revenueTTC)); const selectedMargin = sum(selected.map(v => v.marginHT)); const selectedItems = sum(selected.map(v => v.items));
    const allRevenue = sum(visits.map(v => v.revenueTTC)); const allMargin = sum(visits.map(v => v.marginHT));
    const productCounts = new Map(); const familyCounts = new Map(); const sellerCounts = new Map();
    for (const visit of visits) { sellerCounts.set(visit.seller, (sellerCounts.get(visit.seller) || 0) + 1); for (const line of visit.lines.filter(x => x.quantity > 0)) { productCounts.set(line.name, (productCounts.get(line.name) || 0) + line.quantity); familyCounts.set(line.family || 'NON CLASSÉ', (familyCounts.get(line.family || 'NON CLASSÉ') || 0) + line.quantity); } }
    const favorite = map => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    let status = 'Actif';
    if (visits.length === 1 && recency <= 30) status = 'Nouveau';
    else if (recency > Math.max(120, expectedGap * 3)) status = 'Perdu';
    else if (recency > Math.max(60, expectedGap * 1.8)) status = 'À risque';
    else if (visits.length >= 10) status = 'VIP';
    else if (visits.length >= 5) status = 'Fidèle';
    else if (lateness > 7) status = 'En retard';
    const profile = clientIndex.get(name) || {};
    rows.push({ name, code: profile.code || '', city: profile.city || '', age: profile.age, phone: profile.phone || '', email: profile.email || '', consent: normalizeText(profile.commercialConsent).includes('ACCORD'),
      firstVisit: first, lastVisit: last, visits: visits.length, selectedVisits: selected.length, recency, avgGap, expectedNext: addDays(last, Math.round(expectedGap)), lateness,
      revenue: selectedRevenue, margin: selectedMargin, lifetimeRevenue: allRevenue, lifetimeMargin: allMargin, averageBasket: safeDiv(selectedRevenue, selected.length), itemsPerVisit: safeDiv(selectedItems, selected.length),
      favoriteProduct: favorite(productCounts), favoriteFamily: favorite(familyCounts), favoriteSeller: favorite(sellerCounts), status, riskScore: clamp(safeDiv(recency, expectedGap), 0, 5) * Math.max(20, allMargin), visitsList: visits });
  }
  const recencies = rows.map(r => r.recency); const freqs = rows.map(r => r.visits); const amounts = rows.map(r => r.lifetimeMargin);
  const thresholds = arr => [quantile(arr, .2), quantile(arr, .4), quantile(arr, .6), quantile(arr, .8)]; const rt = thresholds(recencies); const ft = thresholds(freqs); const mt = thresholds(amounts);
  const scoreHigh = (v, t) => 1 + t.filter(x => v > x).length; const scoreLow = (v, t) => 5 - t.filter(x => v > x).length;
  for (const row of rows) { row.rfm = `${scoreLow(row.recency, rt)}${scoreHigh(row.visits, ft)}${scoreHigh(row.lifetimeMargin, mt)}`; }
  return rows.sort((a, b) => b.riskScore - a.riskScore);
}

function revisitAnalysis(data, productMap, referenceDate) {
  const tickets = groupTickets(data.sales, productMap).filter(t => normalizeText(t.customer)); const by = groupBy(tickets, t => normalizeText(t.customer)); const horizons = [7, 14, 30, 60, 90, 180, 365];
  return horizons.map(days => {
    let eligible = 0; let returned = 0;
    for (const visitsRaw of by.values()) {
      const visits = visitsRaw.sort((a, b) => a.date - b.date); const first = visits[0].date;
      if (daysBetween(first, referenceDate) < days) continue;
      eligible += 1; if (visits.slice(1).some(v => daysBetween(first, v.date) <= days)) returned += 1;
    }
    return { days, eligible, returned, rate: safeDiv(returned, eligible) };
  });
}

function cohortAnalysis(data, productMap, referenceDate) {
  const tickets = groupTickets(data.sales, productMap).filter(t => normalizeText(t.customer)); const by = groupBy(tickets, t => normalizeText(t.customer)); const cohorts = new Map();
  for (const visitsRaw of by.values()) {
    const visits = visitsRaw.sort((a, b) => a.date - b.date); const first = visits[0].date; const key = isoDate(first).slice(0, 7);
    if (!cohorts.has(key)) cohorts.set(key, { cohort: key, customers: 0, revenue: 0, margin: 0, retained30: 0, eligible30: 0, retained60: 0, eligible60: 0, retained90: 0, eligible90: 0 });
    const c = cohorts.get(key); c.customers += 1; c.revenue += sum(visits.map(v => v.revenueTTC)); c.margin += sum(visits.map(v => v.marginHT));
    for (const h of [30, 60, 90]) { if (daysBetween(first, referenceDate) >= h) { c[`eligible${h}`] += 1; if (visits.slice(1).some(v => daysBetween(first, v.date) <= h)) c[`retained${h}`] += 1; } }
  }
  return [...cohorts.values()].sort((a, b) => b.cohort.localeCompare(a.cohort)).map(c => ({ ...c, rate30: safeDiv(c.retained30, c.eligible30), rate60: safeDiv(c.retained60, c.eligible60), rate90: safeDiv(c.retained90, c.eligible90) }));
}

function sellerStats(selectedTickets) {
  const by = groupBy(selectedTickets, t => t.seller || 'NON RENSEIGNÉ'); const rows = [];
  for (const [seller, tickets] of by) {
    const revenue = sum(tickets.map(t => t.revenueTTC)); const margin = sum(tickets.map(t => t.marginHT));
    rows.push({ seller, revenue, margin, tickets: tickets.length, averageBasket: safeDiv(revenue, tickets.length), itemsPerTicket: safeDiv(sum(tickets.map(t => Math.max(0, t.items))), tickets.length),
      marginPerTicket: safeDiv(margin, tickets.length), discountValue: sum(tickets.map(t => t.discountValue)), returns: tickets.filter(t => t.hasReturn).length,
      identifiedRate: safeDiv(tickets.filter(t => normalizeText(t.customer)).length, tickets.length), uniqueCustomers: new Set(tickets.filter(t => t.customer).map(t => normalizeText(t.customer))).size,
      multiFamilyRate: safeDiv(tickets.filter(t => t.families.size >= 2).length, tickets.length) });
  }
  const avgMulti = mean(rows.map(r => r.multiFamilyRate)); const avgBasket = mean(rows.map(r => r.averageBasket));
  for (const row of rows) { row.potential = Math.max(0, avgMulti - row.multiFamilyRate) * row.tickets * avgBasket; row.score = clamp(50 + (safeDiv(row.averageBasket, avgBasket) - 1) * 25 + (safeDiv(row.multiFamilyRate, avgMulti) - 1) * 20 + (row.identifiedRate - .8) * 20, 0, 100); }
  return rows.sort((a, b) => b.margin - a.margin);
}

function basketAnalysis(tickets, productMap) {
  const pairs = new Map(); const hours = Array.from({ length: 11 }, (_, i) => ({ hour: i + 8, tickets: 0, revenue: 0, margin: 0 }));
  const weekdays = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'].map((day, i) => ({ day, index: i, tickets: 0, revenue: 0, margin: 0 }));
  for (const ticket of tickets) {
    if (ticket.date) { const h = ticket.date.getHours(); const hb = hours.find(x => x.hour === h); if (hb) { hb.tickets += 1; hb.revenue += ticket.revenueTTC; hb.margin += ticket.marginHT; } const wb = weekdays[ticket.date.getDay()]; wb.tickets += 1; wb.revenue += ticket.revenueTTC; wb.margin += ticket.marginHT; }
    const codes = [...new Set(ticket.lines.filter(l => l.quantity > 0).map(l => l.code).filter(Boolean))].sort();
    for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) { const key = `${codes[i]}|${codes[j]}`; if (!pairs.has(key)) pairs.set(key, { a: codes[i], b: codes[j], count: 0, revenue: 0 }); const pair = pairs.get(key); pair.count += 1; pair.revenue += ticket.revenueTTC; }
  }
  const associations = [...pairs.values()].map(p => ({ ...p, nameA: productMap.get(p.a)?.name || p.a, nameB: productMap.get(p.b)?.name || p.b, support: safeDiv(p.count, tickets.length) })).sort((a, b) => b.count - a.count).slice(0, 50);
  return { associations, hours, weekdays: weekdays.filter(x => x.index !== 0) };
}

function supplierStats(data, selectedReceipts, selectedSales, productMap) {
  const productSupplier = new Map([...productMap].map(([code, p]) => [code, p.supplier || 'NON RENSEIGNÉ']));
  const ordersBySupplier = groupBy(selectedReceipts, r => r.supplier || 'NON RENSEIGNÉ'); const salesBySupplier = groupBy(selectedSales, r => productSupplier.get(r.code) || 'NON RENSEIGNÉ'); const rows = [];
  const suppliers = new Set([...ordersBySupplier.keys(), ...salesBySupplier.keys()]);
  for (const supplier of suppliers) {
    const receipts = ordersBySupplier.get(supplier) || []; const sales = salesBySupplier.get(supplier) || []; const orderGroups = groupBy(receipts, r => r.orderId);
    let exact = 0, partial = 0, over = 0; const delays = [];
    for (const lines of orderGroups.values()) { const qo = sum(lines.map(r => r.quantityOrdered)); const qr = sum(lines.map(r => r.quantityReceived)); if (Math.abs(qo - qr) < .001) exact += 1; else if (qr < qo) partial += 1; else over += 1; const d0 = parseDate(lines[0].createdAt); const d1 = parseDate(lines[0].validatedAt); if (d0 && d1) delays.push(daysBetween(d0, d1)); }
    const fins = sales.map(r => lineFinancials(r, productMap)); const ordered = sum(receipts.map(r => r.quantityOrdered)); const received = sum(receipts.map(r => r.quantityReceived));
    rows.push({ supplier, orders: orderGroups.size, lines: receipts.length, ordered, received, serviceRate: safeDiv(received, ordered), exact, partial, over, exactRate: safeDiv(exact, orderGroups.size),
      purchaseSpend: sum(receipts.map(r => r.totalCost)), avgValidationDays: mean(delays), salesRevenue: sum(fins.map(x => x.revenueTTC)), salesMargin: sum(fins.map(x => x.marginHT)),
      stockValue: sum(data.stock.filter(p => (p.supplier || 'NON RENSEIGNÉ') === supplier).map(p => p.stockValue)) });
  }
  return rows.sort((a, b) => b.purchaseSpend - a.purchaseSpend);
}

function movementStats(rows) {
  const by = groupBy(rows, r => r.reason || 'NON RENSEIGNÉ');
  return [...by].map(([reason, items]) => ({ reason, lines: items.length, quantity: sum(items.map(r => r.quantity)), impact: sum(items.map(r => r.totalCost)), products: new Set(items.map(r => r.code)).size })).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

function dataQuality(data, productMap) {
  const catalogueCodes = new Set(data.catalogue.map(r => r.code)); const clientNames = new Set(data.clients.map(r => normalizeText(r.name))); const namedSales = data.sales.filter(r => normalizeText(r.customerName));
  const issues = [
    { key: 'negative-stock', severity: 'critical', label: 'Stocks négatifs', count: data.stock.filter(r => r.stock < 0).length, detail: 'Quantités impossibles nécessitant une vérification immédiate.' },
    { key: 'missing-supplier', severity: 'warning', label: 'Produits sans fournisseur', count: data.stock.filter(r => !normalizeText(r.supplier)).length, detail: 'Limite les analyses fournisseurs et le réassort.' },
    { key: 'orphan-products', severity: 'warning', label: 'Articles vendus absents du catalogue', count: new Set(data.sales.filter(r => !catalogueCodes.has(r.code)).map(r => r.code)).size, detail: 'Anciens articles à conserver dans le catalogue historique.' },
    { key: 'unmatched-clients', severity: 'warning', label: 'Lignes clients non rapprochées', count: namedSales.filter(r => !clientNames.has(normalizeText(r.customerName))).length, detail: 'Noms différents ou fiches absentes.' },
    { key: 'anonymous-sales', severity: 'info', label: 'Lignes de ventes anonymes', count: data.sales.filter(r => !normalizeText(r.customerName)).length, detail: 'Réduit la portée des analyses de revisite.' },
    { key: 'missing-created', severity: 'info', label: 'Produits sans date de création', count: data.catalogue.filter(r => !r.createdAt).length, detail: 'Limite l’analyse exacte des nouveautés.' },
    { key: 'missing-expected', severity: 'info', label: 'Réceptions sans date prévisionnelle', count: data.receipts.filter(r => !r.expectedAt).length, detail: 'Le retard fournisseur contractuel ne peut pas être calculé.' }
  ];
  const weighted = issues.reduce((acc, i) => acc + Math.min(i.count, 100) * (i.severity === 'critical' ? 1 : i.severity === 'warning' ? .35 : .08), 0);
  return { score: clamp(Math.round(100 - weighted / 3), 0, 100), issues, counts: { products: productMap.size, sales: data.sales.length, clients: data.clients.length, receipts: data.receipts.length, movements: data.movements.length } };
}

function actionsEngine({ products, customers, sellers, suppliers, quality, kpis }) {
  const actions = [];
  const push = (type, priority, title, reason, impact, confidence, target) => actions.push({ id: `${type}-${actions.length}`, type, priority, title, reason, impact: Math.max(0, impact || 0), confidence, target });
  for (const p of products.filter(x => x.status === 'Rupture active').sort((a, b) => b.margin - a.margin).slice(0, 5)) push('stock', 'Critique', `Réapprovisionner ${p.name}`, `${p.recentQty} unité(s) vendue(s) sur les 30 derniers jours et stock actuel nul.`, Math.max(p.margin * .35, p.recentQty * Math.max(1, p.unitMargin)), .85, p.code);
  for (const p of products.filter(x => /Stock mort|Dormant/.test(x.status) && x.stockValue > 20).sort((a, b) => b.stockValue - a.stockValue).slice(0, 5)) push('stock', 'Haute', `Libérer le stock de ${p.name}`, `${p.stockValue.toFixed(0)} € immobilisés, dernière vente ${p.daysSinceSale == null ? 'jamais observée' : `il y a ${p.daysSinceSale} jours`}.`, p.stockValue * .25, .8, p.code);
  for (const c of customers.filter(x => ['À risque', 'Perdu'].includes(x.status) && x.consent).sort((a, b) => b.lifetimeMargin - a.lifetimeMargin).slice(0, 5)) push('client', 'Haute', `Réactiver ${c.name}`, `Client ${c.status.toLowerCase()}, ${c.visits} visites et ${c.lifetimeRevenue.toFixed(0)} € de CA observé.`, c.averageBasket * .6, .72, c.name);
  for (const s of suppliers.filter(x => x.orders >= 3 && x.serviceRate < .95).slice(0, 3)) push('supplier', 'Haute', `Sécuriser les commandes ${s.supplier}`, `Taux de réception ${(s.serviceRate * 100).toFixed(1)} % sur ${s.orders} commandes.`, Math.max(50, s.salesMargin * (1 - s.serviceRate) * .25), .76, s.supplier);
  for (const s of sellers.filter(x => x.potential > 20).sort((a, b) => b.potential - a.potential).slice(0, 3)) push('seller', 'Moyenne', `Développer les ventes complémentaires de ${s.seller}`, `Taux de paniers multi-familles ${(s.multiFamilyRate * 100).toFixed(1)} %, sous la moyenne de l’équipe.`, s.potential * .2, .65, s.seller);
  const negative = quality.issues.find(i => i.key === 'negative-stock'); if (negative?.count) push('quality', 'Critique', `Corriger ${negative.count} stock(s) négatif(s)`, 'Une analyse fiable du réassort exige un stock physique cohérent.', 0, .98, 'stock');
  const missingSupplier = quality.issues.find(i => i.key === 'missing-supplier'); if (missingSupplier?.count) push('quality', 'Moyenne', `Renseigner ${missingSupplier.count} fournisseur(s) manquant(s)`, 'Cela améliorera le pilotage des achats et la mesure de dépendance fournisseur.', 0, .95, 'catalogue');
  return actions.sort((a, b) => (({ Critique: 4, Haute: 3, Moyenne: 2, Basse: 1 }[b.priority] || 0) - ({ Critique: 4, Haute: 3, Moyenne: 2, Basse: 1 }[a.priority] || 0)) || (b.impact - a.impact)).slice(0, 15);
}

function executiveInsights(analysis) {
  const { kpis, comparison, products, customers, suppliers } = analysis; const positives = []; const risks = [];
  if (comparison?.revenueDelta > .03) positives.push(`Le chiffre d’affaires progresse de ${(comparison.revenueDelta * 100).toFixed(1)} % par rapport à la période précédente.`);
  if (comparison?.marginDelta > .03) positives.push(`La marge progresse de ${(comparison.marginDelta * 100).toFixed(1)} %.`);
  const stars = products.filter(p => p.status === 'Star').length; if (stars) positives.push(`${stars} produit(s) combinent forte contribution, régularité et rentabilité.`);
  const dormantValue = sum(products.filter(p => /Dormant|Stock mort/.test(p.status)).map(p => p.stockValue)); if (dormantValue > 0) risks.push(`${dormantValue.toFixed(0)} € sont immobilisés dans des produits dormants ou morts.`);
  const stockouts = products.filter(p => p.status === 'Rupture active').length; if (stockouts) risks.push(`${stockouts} référence(s) vendue(s) récemment sont actuellement en rupture.`);
  const atRisk = customers.filter(c => c.status === 'À risque').length; if (atRisk) risks.push(`${atRisk} client(s) présentent un retard significatif par rapport à leur rythme habituel.`);
  const weakSuppliers = suppliers.filter(s => s.orders >= 3 && s.serviceRate < .95).length; if (weakSuppliers) risks.push(`${weakSuppliers} fournisseur(s) ont un taux de réception inférieur à 95 %.`);
  if (!positives.length) positives.push(`La période génère ${kpis.marginHT.toFixed(0)} € de marge HT observée.`);
  if (!risks.length) risks.push('Aucun risque majeur ne domine la période, mais les alertes détaillées restent à contrôler.');
  return { positives: positives.slice(0, 3), risks: risks.slice(0, 4) };
}

export function buildAnalysis(data, filters = {}, settings = {}) {
  const productMap = buildProductMap(data); const salesExtent = dateExtent(data.sales);
  const start = filters.start ? new Date(`${filters.start}T00:00:00`) : salesExtent.min; const end = filters.end ? new Date(`${filters.end}T23:59:59`) : salesExtent.max;
  const referenceDate = end || new Date(); const selectedSales = data.sales.filter(r => inPeriod(r.date, start, end)); const selectedReceipts = data.receipts.filter(r => inPeriod(r.validatedAt || r.createdAt, start, end)); const selectedMovements = data.movements.filter(r => inPeriod(r.date, start, end));
  const kpis = kpisFromLines(selectedSales, productMap); const prev = previousPeriod(start, end); const previousLines = prev ? data.sales.filter(r => inPeriod(r.date, prev.start, prev.end)) : []; const previousKpis = kpisFromLines(previousLines, productMap);
  const comparison = prev ? { revenueDelta: safeDiv(kpis.revenueTTC - previousKpis.revenueTTC, Math.abs(previousKpis.revenueTTC)), marginDelta: safeDiv(kpis.marginHT - previousKpis.marginHT, Math.abs(previousKpis.marginHT)), ticketDelta: safeDiv(kpis.tickets - previousKpis.tickets, previousKpis.tickets), basketDelta: safeDiv(kpis.averageBasket - previousKpis.averageBasket, Math.abs(previousKpis.averageBasket)), previous: previousKpis } : null;
  const products = productStats(data, selectedSales, productMap, referenceDate, start || referenceDate, settings); const selectedTickets = kpis.ticketsList; const customers = customerStats(data, selectedTickets, productMap, referenceDate);
  const sellers = sellerStats(selectedTickets); const baskets = basketAnalysis(selectedTickets, productMap); const suppliers = supplierStats(data, selectedReceipts, selectedSales, productMap); const quality = dataQuality(data, productMap);
  const analysis = {
    meta: { start, end, referenceDate, salesExtent, selectedLines: selectedSales.length, periodDays: start && end ? daysBetween(start, end) + 1 : 0 },
    kpis, comparison, daily: dailySeries(selectedSales, productMap), departments: categoryStats(selectedSales, productMap, 'department'), families: categoryStats(selectedSales, productMap, 'family'),
    products, customers, baskets, revisit: revisitAnalysis(data, productMap, salesExtent.max || referenceDate), cohorts: cohortAnalysis(data, productMap, salesExtent.max || referenceDate), sellers, suppliers,
    movements: movementStats(selectedMovements), quality, stockSummary: {
      units: sum(data.stock.map(r => r.stock)), value: sum(data.stock.map(r => r.stockValue)), marketValueTTC: sum(data.valuation.map(r => r.marketValueTTC)), potentialMarginHT: sum(data.valuation.map(r => r.marketValueHT - r.purchaseValue)),
      positive: data.stock.filter(r => r.stock > 0).length, zero: data.stock.filter(r => r.stock === 0).length, negative: data.stock.filter(r => r.stock < 0).length,
      dormantValue: sum(products.filter(p => /Dormant|Stock mort/.test(p.status)).map(p => p.stockValue)), stockoutCount: products.filter(p => p.status === 'Rupture active').length
    }
  };
  analysis.actions = actionsEngine(analysis); analysis.insights = executiveInsights(analysis); return analysis;
}

export function answerQuestion(question, analysis) {
  const q = normalizeText(question); const top = (rows, field, n = 5) => [...rows].sort((a, b) => b[field] - a[field]).slice(0, n);
  if (/MARGE.*(PRODUIT|REFERENCE)|PRODUIT.*MARGE/.test(q)) return { title: 'Produits générant le plus de marge', rows: top(analysis.products, 'margin').map(p => ({ label: p.name, value: p.margin, detail: `${p.positiveQty} unité(s) · ${p.status}` })), unit: 'currency' };
  if (/DORM|IMMOBIL|NE TOURNE|STOCK MORT/.test(q)) return { title: 'Stock dormant prioritaire', rows: top(analysis.products.filter(p => /Dormant|Stock mort/.test(p.status)), 'stockValue').map(p => ({ label: p.name, value: p.stockValue, detail: `${p.daysSinceSale ?? '∞'} jours sans vente · stock ${p.stock}` })), unit: 'currency' };
  if (/RUPTURE|REASSORT|COMMANDER/.test(q)) return { title: 'Réassorts prioritaires', rows: analysis.products.filter(p => /Rupture|Réassort/.test(p.status)).sort((a, b) => b.recentQty - a.recentQty).slice(0, 8).map(p => ({ label: p.name, value: p.recentQty, detail: `${p.coverageDays === Infinity ? 'aucune rotation' : p.coverageDays.toFixed(0)} jours de couverture` })), unit: 'number' };
  if (/CLIENT.*(RISQUE|PERD|REVEN)|REVISITE/.test(q)) return { title: 'Clients à réactiver', rows: top(analysis.customers.filter(c => ['À risque', 'Perdu', 'En retard'].includes(c.status)), 'riskScore').map(c => ({ label: c.name, value: c.lifetimeRevenue, detail: `${c.status} · dernière visite il y a ${c.recency} jours` })), unit: 'currency' };
  if (/VENDEUR|EQUIPE/.test(q)) return { title: 'Performance vendeurs', rows: top(analysis.sellers, 'margin').map(s => ({ label: s.seller, value: s.margin, detail: `${s.tickets} tickets · panier ${s.averageBasket.toFixed(2)} €` })), unit: 'currency' };
  if (/FOURNISSEUR|RECEPTION|LIVRAISON/.test(q)) return { title: 'Fiabilité fournisseurs', rows: [...analysis.suppliers].sort((a, b) => a.serviceRate - b.serviceRate).slice(0, 8).map(s => ({ label: s.supplier, value: s.serviceRate, detail: `${s.orders} commande(s) · ${s.partial} partielle(s)` })), unit: 'percent' };
  if (/PANIER|ACHETE.*ENSEMBLE|COMPLEMENT/.test(q)) return { title: 'Lecture des paniers', text: `Le panier moyen est de ${analysis.kpis.averageBasket.toFixed(2)} €, avec ${analysis.kpis.itemsPerTicket.toFixed(1)} article(s) par ticket. Consultez l’onglet Paniers pour les associations détaillées.` };
  return { title: 'Synthèse ANALYSIS', text: `${analysis.insights.positives[0]} ${analysis.insights.risks[0]} L’action prioritaire est : ${analysis.actions[0]?.title || 'contrôler les alertes de données'}.` };
}
