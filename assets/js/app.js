import { activeData, mergeImport, readWorkbookFile, removeImport } from './core/importer.js';
import { buildAnalysis, answerQuestion } from './core/analytics.js';
import { createDemoProject } from './core/demo.js';
import { emptyProject, loadProject, resetProject, saveProject } from './core/storage.js';
import { clamp, colorForStatus, dateFmt, decimal, downloadBlob, escapeHtml, euro, formatDelta, integer, isoDate, normalizeText, percent, safeDiv, sum } from './core/utils.js';

const state = {
  project: null, data: null, analysis: null, view: 'dashboard', filters: { start: '', end: '' },
  productFilter: 'all', productSearch: '', customerFilter: 'all', customerSearch: '', tablePage: 0,
  orderSupplier: 'all', orderMode: 'recommended', orderDraft: new Map(), drawer: null
};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function icon(name, size = 18) {
  const paths = {
    dashboard: '<path d="M4 4h6v6H4zM14 4h6v10h-6zM4 14h6v6H4zM14 18h6v2h-6z"/>',
    sales: '<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
    stock: '<path d="M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/>',
    customers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    baskets: '<path d="M3 9h18l-2 10H5zM8 9l4-6 4 6M8 13v2m4-2v2m4-2v2"/>',
    sellers: '<path d="M3 21v-4a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>',
    suppliers: '<path d="M3 6h12v12H3zM15 10h4l2 3v5h-6zM7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    orders: '<path d="M4 5h16v14H4zM8 9h8M8 13h5M7 5V3m10 2V3"/>',
    actions: '<path d="M12 3a6 6 0 0 0-3 11.2V17h6v-2.8A6 6 0 0 0 12 3zM9 21h6M9 17h6"/>',
    explorer: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6m-3-3h6"/>',
    import: '<path d="M12 3v12m0-12-4 4m4-4 4 4M4 15v5h16v-5"/>'
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.dashboard}</svg>`;
}

function latestDataDate() { return state.analysis?.meta?.salesExtent?.max || null; }
function dataReady() { return state.data?.sales?.length > 0; }
function toast(message, type = 'success') { const el = $('#toast'); el.textContent = message; el.className = `toast show ${type}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 4200); }
function showLoader(label = 'Analyse des données…') { $('#loaderText').textContent = label; $('#loader').classList.add('show'); }
function hideLoader() { $('#loader').classList.remove('show'); }
function fmtDate(value) { return value ? dateFmt.format(value instanceof Date ? value : new Date(value)) : '—'; }
function moneyPair(ht, ttc, options = {}) {
  const labelHT = options.labelHT || 'HT'; const labelTTC = options.labelTTC || 'TTC';
  return `<span class="money-pair"><strong>${euro.format(ttc || 0)} <small>${labelTTC}</small></strong><em>${euro.format(ht || 0)} ${labelHT}</em></span>`;
}
function pctPoints(value) { return `${value >= 0 ? '+' : ''}${decimal.format(value * 100)} pts`; }

function recalculate({ preservePeriod = true } = {}) {
  state.data = activeData(state.project);
  const provisional = buildAnalysis(state.data, {}, state.project.settings);
  if ((!preservePeriod || !state.filters.end) && provisional.meta.salesExtent.max) {
    const end = provisional.meta.salesExtent.max;
    const start = new Date(end);
    start.setDate(start.getDate() - 89);
    state.filters = { start: isoDate(start), end: isoDate(end) };
  }
  state.analysis = buildAnalysis(state.data, state.filters, state.project.settings);
  syncOrderDraft();
}

function syncOrderDraft(force = false) {
  if (!state.analysis?.reorder?.lines) return;
  for (const row of state.analysis.reorder.lines) {
    if (force || !state.orderDraft.has(row.code)) state.orderDraft.set(row.code, row.recommendedOrder);
  }
}

function renderShell() {
  const menu = [
    ['dashboard', 'Cockpit', 'dashboard'], ['sales', 'Ventes & explications', 'sales'], ['stock', 'Stock & produits', 'stock'],
    ['customers', 'Clients & revisite', 'customers'], ['baskets', 'Paniers & associations', 'baskets'], ['sellers', 'Vendeurs', 'sellers'],
    ['orders', 'Commandes automatiques', 'orders'], ['suppliers', 'Achats & fournisseurs', 'suppliers'], ['actions', 'Plans d’action', 'actions'],
    ['explorer', 'Analysis Intelligence', 'explorer'], ['imports', 'Imports & qualité', 'import']
  ];
  $('#nav').innerHTML = menu.map(([id, label, ico]) => `<button class="nav-item ${state.view === id ? 'active' : ''}" data-view="${id}">${icon(ico)}<span>${label}</span>${id === 'actions' && state.analysis?.actions?.length ? `<em>${state.analysis.actions.length}</em>` : ''}${id === 'orders' && state.analysis?.reorder?.lines?.filter(x => x.recommendedOrder > 0).length ? `<em>${state.analysis.reorder.lines.filter(x => x.recommendedOrder > 0).length}</em>` : ''}</button>`).join('');
  $$('.nav-item').forEach(btn => btn.onclick = () => { state.view = btn.dataset.view; state.tablePage = 0; render(); if (window.innerWidth < 900) document.body.classList.remove('menu-open'); });
  $('#storeName').textContent = state.project.settings.storeName || 'Mon magasin';
  $('#syncStatus').textContent = dataReady() ? `${integer.format(state.data.sales.length)} lignes · ${integer.format(state.analysis.kpis.uniqueTickets)} tickets` : 'Aucune donnée importée';
  $('#periodStart').value = state.filters.start;
  $('#periodEnd').value = state.filters.end;
}

function score() {
  if (!state.analysis) return 0;
  const a = state.analysis;
  const stockRisk = safeDiv(a.stockSummary.dormantValueHT, a.stockSummary.purchaseValueHT || 1);
  const trend = (a.comparison?.revenueDelta || 0) * 20 + (a.comparison?.marginDelta || 0) * 25;
  const clientRisk = safeDiv(a.customers.filter(c => ['À risque', 'Probablement perdu'].includes(c.status)).length, Math.max(1, a.customers.length));
  return clamp(Math.round(58 + a.quality.score * .3 + trend - stockRisk * 20 - clientRisk * 16 - a.stockSummary.stockoutCount * .6), 0, 100);
}

function metricCard(label, value, note, delta = null, tone = '', drill = '') {
  return `<article class="metric-card ${tone} ${drill ? 'clickable' : ''}" ${drill ? `data-drill="${escapeHtml(drill)}" tabindex="0"` : ''}><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${value}</div><div class="metric-foot">${delta == null ? '' : `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${formatDelta(delta)}</span>`}<span>${note || ''}</span></div>${drill ? '<i class="metric-open">Voir le détail →</i>' : ''}</article>`;
}

function emptyState(text) { return `<div class="empty-state"><span>◌</span><p>${escapeHtml(text)}</p></div>`; }
function sectionHeader(title, subtitle, action = '') { return `<div class="section-header"><div><p class="eyebrow">ANALYSIS ENGINE</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>${action}</div>`; }
function badge(label) { return `<span class="badge ${colorForStatus(label)}">${escapeHtml(label)}</span>`; }

function lineChart(points, valueKey = 'revenueTTC', height = 260) {
  if (!points?.length) return emptyState('Pas de données sur cette période.');
  const width = 900, padX = 34, padY = 24;
  const values = points.map(p => p[valueKey]); const min = Math.min(0, ...values), max = Math.max(...values, 1);
  const x = i => padX + i * ((width - padX * 2) / Math.max(1, points.length - 1));
  const y = v => height - padY - ((v - min) / Math.max(1, max - min)) * (height - padY * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[valueKey]).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${height - padY} L${x(0)},${height - padY} Z`;
  const ticks = [0, .25, .5, .75, 1].map(r => min + (max - min) * r);
  return `<div class="svg-chart"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Évolution"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cyan)" stop-opacity=".28"/><stop offset="1" stop-color="var(--cyan)" stop-opacity="0"/></linearGradient></defs>${ticks.map(v => `<line x1="${padX}" y1="${y(v)}" x2="${width - padX}" y2="${y(v)}" class="grid-line"/>`).join('')}<path d="${area}" fill="url(#areaGradient)"/><path d="${path}" class="line-path"/>${points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 7)) === 0 || i === points.length - 1).map(p => { const i = points.indexOf(p); return `<circle cx="${x(i)}" cy="${y(p[valueKey])}" r="3.5" class="line-point"><title>${p.date} : ${euro.format(p[valueKey])}</title></circle>`; }).join('')}</svg></div>`;
}

function barList(rows, field, formatter = euro.format, limit = 7, drillType = '') {
  const items = rows.slice(0, limit); const max = Math.max(...items.map(x => Math.abs(x[field] || 0)), 1);
  return `<div class="bar-list">${items.map((x, i) => `<button class="bar-row ${drillType ? 'clickable' : ''}" ${drillType ? `data-drill="${drillType}:${escapeHtml(x.code || x.name || x.key)}"` : ''}><span>${String(i + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(x.name || x.key || '—')}</strong><i style="width:${Math.max(2, Math.abs(x[field] || 0) / max * 100)}%"></i></div><b>${formatter(x[field] || 0)}</b></button>`).join('') || emptyState('Aucune donnée disponible.')}</div>`;
}

function donut(segments, totalLabel) {
  const total = sum(segments.map(s => Math.max(0, s.value))) || 1; let offset = 0;
  const circles = segments.map((s, i) => { const pct = s.value / total; const dash = `${pct * 100} ${100 - pct * 100}`; const html = `<circle cx="60" cy="60" r="45" pathLength="100" stroke="var(--chart-${i + 1})" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"/>`; offset += pct * 100; return html; }).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 120 120" class="donut"><circle cx="60" cy="60" r="45" class="donut-bg"/>${circles}</svg><div class="donut-center"><strong>${integer.format(total)}</strong><span>${escapeHtml(totalLabel)}</span></div><div class="donut-legend">${segments.map((s, i) => `<span><i style="background:var(--chart-${i + 1})"></i>${escapeHtml(s.label)} <b>${integer.format(s.value)}</b></span>`).join('')}</div></div>`;
}

function driverCard(driver) {
  return `<button class="driver-card ${driver.impactTTC >= 0 ? 'positive' : 'negative'}" data-drill="driver:${escapeHtml(driver.type)}:${escapeHtml(driver.target || driver.label)}"><span>${driver.impactTTC >= 0 ? '↗' : '↘'}</span><div><strong>${escapeHtml(driver.label)}</strong><small>${escapeHtml(driver.detail)}</small></div><b>${driver.impactTTC >= 0 ? '+' : ''}${euro.format(driver.impactTTC)} TTC<em>${driver.impactHT >= 0 ? '+' : ''}${euro.format(driver.impactHT)} HT</em></b></button>`;
}

function dashboardView() {
  const a = state.analysis, s = score(); const delta = a.comparison || {};
  const risks = a.customers.filter(c => ['À risque', 'Probablement perdu', 'Premier achat sans retour'].includes(c.status));
  return `<div class="view-page dashboard-view">
    <section class="hero-command"><div class="hero-copy"><p class="eyebrow">SUPERINTELLIGENCE COMMERCIALE EXPLICABLE</p><h1>Chaque chiffre. Chaque cause. <span>Chaque décision.</span></h1><p>ANALYSIS explique ce qui monte, ce qui baisse, quels clients changent de comportement et quelles commandes préparer — avec les preuves derrière chaque conclusion.</p><div class="hero-actions"><button class="btn primary" data-go="actions">Voir les priorités</button><button class="btn secondary" data-go="orders">Préparer les commandes</button></div></div><div class="performance-core"><div class="score-ring" style="--score:${s}"><div><strong>${s}</strong><span>/100</span></div></div><p>Indice de maîtrise</p><small>${s >= 80 ? 'Performance forte, risques sous contrôle' : s >= 60 ? 'Base solide, leviers importants détectés' : 'Plusieurs risques prioritaires à traiter'}</small></div></section>
    <section class="metric-grid">${metricCard('Chiffre d’affaires', moneyPair(a.kpis.revenueHT, a.kpis.revenueTTC), `${integer.format(a.kpis.uniqueTickets)} tickets uniques`, delta.revenueDelta, '', 'revenue')}${metricCard('Marge commerciale', `<strong>${euro.format(a.kpis.marginHT)} <small>HT</small></strong>`, `${percent.format(a.kpis.markupRate)} de taux de marque`, delta.marginDelta, '', 'margin')}${metricCard('Acheteurs uniques', integer.format(a.kpis.uniqueIdentifiedCustomers), `${integer.format(a.kpis.anonymousTickets)} ticket(s) non identifiés`, delta.ticketDelta, '', 'customers-active')}${metricCard('Valeur du stock', moneyPair(a.stockSummary.marketValueHT, a.stockSummary.marketValueTTC), `${euro.format(a.stockSummary.purchaseValueHT)} HT au coût d’achat`, null, a.stockSummary.dormantValueHT > a.stockSummary.purchaseValueHT * .2 ? 'warn' : '', 'stock-value')}</section>
    <section class="command-grid"><article class="panel trend-panel"><div class="panel-head"><div><span>Trajectoire</span><h3>Chiffre d’affaires quotidien TTC</h3></div><span class="confidence">${a.meta.periodDays} jours</span></div>${lineChart(a.daily)}</article>
    <article class="panel cause-panel"><div class="panel-head"><div><span>Explication exacte</span><h3>Pourquoi le chiffre ${a.drivers.changeTTC >= 0 ? 'monte' : 'baisse'}</h3></div><button class="link-btn" data-go="sales">Analyse complète →</button></div><div class="cause-total ${a.drivers.changeTTC >= 0 ? 'up' : 'down'}"><strong>${a.drivers.changeTTC >= 0 ? '+' : ''}${euro.format(a.drivers.changeTTC)} TTC</strong><span>${a.drivers.changeHT >= 0 ? '+' : ''}${euro.format(a.drivers.changeHT)} HT</span></div><div class="cause-split"><button data-drill="driver:tickets"><span>Effet nombre de tickets</span><strong>${a.drivers.ticketEffectTTC >= 0 ? '+' : ''}${euro.format(a.drivers.ticketEffectTTC)} TTC</strong><small>${a.drivers.currentTickets} contre ${a.drivers.previousTickets}</small></button><button data-drill="driver:basket"><span>Effet panier moyen</span><strong>${a.drivers.basketEffectTTC >= 0 ? '+' : ''}${euro.format(a.drivers.basketEffectTTC)} TTC</strong><small>${euro.format(a.drivers.currentBasketTTC)} contre ${euro.format(a.drivers.previousBasketTTC)}</small></button></div>${a.drivers.reasons.slice(0, 4).map(driverCard).join('')}</article></section>
    <section class="dashboard-lower"><article class="panel insight-panel"><div class="panel-head"><div><span>Lecture automatique</span><h3>Ce qu’il faut retenir</h3></div></div><div class="insight-stack"><div class="insight positive"><i>↗</i><div><strong>Points forts</strong>${a.insights.positives.map(x => `<button data-drill="insight:${x.type}:${escapeHtml(x.target || '')}">${escapeHtml(x.text)}</button>`).join('')}</div></div><div class="insight risk"><i>!</i><div><strong>Points de vigilance</strong>${a.insights.risks.map(x => `<button data-drill="insight:${x.type}:${escapeHtml(x.target || '')}">${escapeHtml(x.text)}</button>`).join('')}</div></div></div></article>
    <article class="panel"><div class="panel-head"><div><span>Clients</span><h3>Risque de non-retour expliqué</h3></div><button class="link-btn" data-go="customers">Voir tous →</button></div><div class="risk-preview">${risks.slice(0, 5).map(c => `<button data-drill="customer:${escapeHtml(c.name)}"><div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.city || 'Ville inconnue')} · ${escapeHtml(c.riskReasons[0])}</small></div><b>${percent.format(c.riskProbability)}</b></button>`).join('') || emptyState('Aucun client prioritaire détecté.')}</div></article>
    <article class="panel"><div class="panel-head"><div><span>Décisions</span><h3>Actions prioritaires</h3></div><button class="link-btn" data-go="actions">Plan complet →</button></div><div class="action-mini-list">${a.actions.slice(0, 6).map((x, i) => `<button class="action-mini" data-drill="action:${x.id}"><span>${String(i + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.reason)}</small></div>${badge(x.priority)}</button>`).join('') || emptyState('Aucune action prioritaire.')}</div></article></section>
  </div>`;
}

function salesView() {
  const a = state.analysis; const maxHour = Math.max(...a.baskets.hours.map(x => x.revenueTTC), 1); const maxDay = Math.max(...a.baskets.weekdays.map(x => x.revenueTTC), 1);
  const positives = a.drivers.families.filter(x => x.impactTTC > 0).sort((x, y) => y.impactTTC - x.impactTTC).slice(0, 8);
  const negatives = a.drivers.families.filter(x => x.impactTTC < 0).sort((x, y) => x.impactTTC - y.impactTTC).slice(0, 8);
  return `<div class="view-page">${sectionHeader('Ventes & explications', 'Le chiffre d’affaires n’est jamais présenté seul : ANALYSIS décompose précisément les volumes, les paniers, les familles, les clients et les vendeurs responsables de l’évolution.')}
  <section class="metric-grid compact">${metricCard('CA période', moneyPair(a.kpis.revenueHT, a.kpis.revenueTTC), 'Période sélectionnée', a.comparison?.revenueDelta, '', 'revenue')}${metricCard('Tickets uniques', integer.format(a.kpis.uniqueTickets), `${integer.format(a.kpis.uniqueIdentifiedCustomers)} acheteurs identifiés`, a.comparison?.ticketDelta, '', 'tickets')}${metricCard('Panier moyen', moneyPair(a.kpis.averageBasketHT, a.kpis.averageBasketTTC), `${decimal.format(a.kpis.itemsPerTicket)} article(s)`, a.comparison?.basketDelta, '', 'baskets')}${metricCard('Remises', moneyPair(a.kpis.discountHT, a.kpis.discountTTC), `${integer.format(a.kpis.freeUnits)} unités offertes`, null, '', 'discounts')}</section>
  <section class="cause-dashboard"><article class="panel"><div class="panel-head"><div><span>Décomposition exacte</span><h3>Écart par rapport à la période précédente</h3></div></div><div class="cause-total ${a.drivers.changeTTC >= 0 ? 'up' : 'down'}"><strong>${a.drivers.changeTTC >= 0 ? '+' : ''}${euro.format(a.drivers.changeTTC)} TTC</strong><span>${a.drivers.changeHT >= 0 ? '+' : ''}${euro.format(a.drivers.changeHT)} HT</span></div><div class="cause-split large"><button data-drill="driver:tickets"><span>Nombre de tickets</span><strong>${a.drivers.ticketEffectTTC >= 0 ? '+' : ''}${euro.format(a.drivers.ticketEffectTTC)} TTC</strong><small>${a.kpis.tickets} vs ${a.previousKpis.tickets}</small></button><button data-drill="driver:basket"><span>Valeur du panier</span><strong>${a.drivers.basketEffectTTC >= 0 ? '+' : ''}${euro.format(a.drivers.basketEffectTTC)} TTC</strong><small>${euro.format(a.kpis.averageBasketTTC)} vs ${euro.format(a.previousKpis.averageBasketTTC)}</small></button><button data-drill="driver:customers"><span>Clients non revenus</span><strong>-${euro.format(a.customerFlow.nonReturnedRevenueTTC)} TTC</strong><small>${a.customerFlow.nonReturnedCount} client(s)</small></button><button data-drill="driver:mix"><span>Part matériel</span><strong>${pctPoints(a.drivers.materialShareDelta)}</strong><small>${percent.format(a.drivers.materialShareCurrent)} du CA actuel</small></button></div></article><article class="panel"><div class="panel-head"><div><span>Moteurs positifs</span><h3>Ce qui fait monter le chiffre</h3></div></div>${positives.map(x => driverCard({ type: 'family', target: x.key, label: x.key, detail: `${euro.format(x.revenueTTC)} TTC actuellement`, impactTTC: x.impactTTC, impactHT: x.impactHT })).join('') || emptyState('Aucune contribution positive majeure.')}</article><article class="panel"><div class="panel-head"><div><span>Freins</span><h3>Ce qui fait baisser le chiffre</h3></div></div>${negatives.map(x => driverCard({ type: 'family', target: x.key, label: x.key, detail: `${euro.format(x.previousRevenueTTC)} TTC précédemment`, impactTTC: x.impactTTC, impactHT: x.impactHT })).join('') || emptyState('Aucune contribution négative majeure.')}</article></section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Évolution</span><h3>CA quotidien TTC</h3></div></div>${lineChart(a.daily)}</article><article class="panel"><div class="panel-head"><div><span>Rythme magasin</span><h3>Performance horaire</h3></div></div><div class="hour-bars">${a.baskets.hours.map(h => `<div><span>${h.hour}h</span><i style="height:${Math.max(3, h.revenueTTC / maxHour * 100)}%"><b>${integer.format(h.tickets)}</b><em>${euro.format(h.revenueTTC)}</em></i></div>`).join('')}</div></article></section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Saisonnalité hebdomadaire</span><h3>Contribution par jour</h3></div></div><div class="weekday-grid">${a.baskets.weekdays.map(d => `<div style="--power:${Math.max(.08, d.revenueTTC / maxDay)}"><strong>${d.day.slice(0, 3)}</strong><span>${euro.format(d.revenueTTC)} TTC</span><small>${euro.format(d.revenueHT)} HT · ${d.tickets} tickets</small></div>`).join('')}</div></article><article class="panel"><div class="panel-head"><div><span>Mix commercial</span><h3>Évolution matériel / liquides</h3></div></div><div class="mix-comparison"><div><span>Part matériel actuelle</span><strong>${percent.format(a.drivers.materialShareCurrent)}</strong></div><div><span>Période précédente</span><strong>${percent.format(a.drivers.materialSharePrevious)}</strong></div><div class="${a.drivers.materialShareDelta >= 0 ? 'up' : 'down'}"><span>Évolution</span><strong>${pctPoints(a.drivers.materialShareDelta)}</strong></div></div>${barList(a.drivers.segments.map(x => ({ name: x.key, impact: x.impactTTC })), 'impact', value => `${value >= 0 ? '+' : ''}${euro.format(value)}`, 7, 'segment')}</article></section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Lecture détaillée</span><h3>Performance par rayon</h3></div></div>${dataTable(['Rayon','CA TTC','CA HT','Marge HT','Taux de marque','Quantité','Tickets'], a.departments.map(r => ({ cells: [r.name, euro.format(r.revenueTTC), euro.format(r.revenueHT), euro.format(r.marginHT), percent.format(r.markupRate), integer.format(r.quantity), integer.format(r.tickets)], attrs: `data-drill="family:${escapeHtml(r.name)}"` })))}</article></div>`;
}

function filteredProducts() {
  let rows = state.analysis.products;
  if (state.productFilter !== 'all') rows = rows.filter(p => p.status === state.productFilter);
  if (state.productSearch) rows = rows.filter(p => normalizeText(`${p.name} ${p.code} ${p.family} ${p.supplier} ${p.statusReason}`).includes(normalizeText(state.productSearch)));
  return rows;
}

function stockView() {
  const a = state.analysis; const rows = filteredProducts();
  const statuses = [
    { label: 'Essentiels / réguliers', value: a.products.filter(p => ['Produit essentiel', 'Vente régulière', 'Produit de trafic', 'Forte marge à développer'].includes(p.status)).length },
    { label: 'Dormants / immobilisés', value: a.products.filter(p => ['Dormant', 'Stock immobilisé'].includes(p.status)).length },
    { label: 'À commander / ruptures', value: a.products.filter(p => ['Rupture récente', 'À commander maintenant'].includes(p.status)).length },
    { label: 'Surstocks', value: a.products.filter(p => p.status === 'Surstock').length }
  ];
  return `<div class="view-page">${sectionHeader('Stock & intelligence produit', 'Des statuts immédiatement compréhensibles remplacent le jargon ABC/XYZ. Chaque référence explique son rôle, son risque, ses montants HT/TTC et l’action recommandée.')}
  <section class="metric-grid compact">${metricCard('Valeur au coût d’achat', `<strong>${euro.format(a.stockSummary.purchaseValueHT)} <small>HT</small></strong>`, `${integer.format(a.stockSummary.units)} unités`, null, '', 'stock-value')}${metricCard('Valeur commerciale', moneyPair(a.stockSummary.marketValueHT, a.stockSummary.marketValueTTC), `${euro.format(a.stockSummary.potentialMarginHT)} marge théorique HT`, null, '', 'stock-value')}${metricCard('Capital immobilisé', `<strong>${euro.format(a.stockSummary.dormantValueHT)} <small>HT</small></strong>`, `${percent.format(safeDiv(a.stockSummary.dormantValueHT, a.stockSummary.purchaseValueHT))} du stock`, null, 'warn', 'products:Dormant')}${metricCard('Ruptures récentes', integer.format(a.stockSummary.stockoutCount), `${a.stockSummary.negative} stock(s) négatif(s)`, null, a.stockSummary.stockoutCount ? 'danger' : '', 'products:Rupture récente')}</section>
  <section class="two-col stock-overview"><article class="panel">${donut(statuses, 'références')}</article><article class="panel"><div class="panel-head"><div><span>Capital à libérer</span><h3>Références immobilisant le plus</h3></div></div>${barList(a.products.filter(p => ['Dormant', 'Stock immobilisé'].includes(p.status)).sort((x, y) => y.stockValueHT - x.stockValueHT), 'stockValueHT', euro.format, 8, 'product')}</article></section>
  <article class="panel table-panel"><div class="table-toolbar"><div><span>Catalogue analytique</span><h3>${integer.format(rows.length)} références — cliquez sur une ligne</h3></div><div class="toolbar-actions"><select id="productStatus"><option value="all">Tous les statuts</option>${[...new Set(a.products.map(x => x.status))].sort().map(x => `<option value="${escapeHtml(x)}" ${state.productFilter === x ? 'selected' : ''}>${escapeHtml(x)}</option>`).join('')}</select><input id="productSearch" value="${escapeHtml(state.productSearch)}" placeholder="Produit, code, raison…"></div></div>${productTable(rows)}</article></div>`;
}

function productTable(rows) {
  const pageSize = 35, start = state.tablePage * pageSize, page = rows.slice(start, start + pageSize);
  return `${dataTable(['Produit','Lecture immédiate','Vendu période','Stock','CA TTC / HT','Marge HT','Couverture','Commande'], page.map(p => ({ attrs: `data-drill="product:${escapeHtml(p.code)}"`, cells: [
    `<div class="cell-main"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.code)} · ${escapeHtml(p.family || p.department)} · ${escapeHtml(p.supplier || 'Fournisseur non renseigné')}</small></div>`,
    `<div class="status-explain">${badge(p.status)}<small>${escapeHtml(p.statusReason)}</small></div>`,
    `<strong>${integer.format(p.positiveQty)}</strong><small class="subcell">avant : ${integer.format(p.previousQty)} · ${p.quantityChange >= 0 ? '+' : ''}${integer.format(p.quantityChange)}</small>`,
    `<strong>${integer.format(p.stock)}</strong><small class="subcell">${euro.format(p.stockValueHT)} HT achat</small>`,
    moneyPair(p.revenueHT, p.revenueTTC),
    `<strong>${euro.format(p.marginHT)}</strong><small class="subcell">${percent.format(p.markupRate)} marque</small>`,
    p.coverageDays === Infinity ? 'Aucune rotation' : `${decimal.format(p.coverageDays)} jours`,
    `<strong>${integer.format(state.analysis.reorder.lines.find(x => x.code === p.code)?.recommendedOrder || 0)}</strong><small class="subcell">lot ${state.analysis.reorder.lines.find(x => x.code === p.code)?.packSize || 1}</small>`
  ] }))) }<div class="pagination"><button data-page="${Math.max(0, state.tablePage - 1)}" ${state.tablePage === 0 ? 'disabled' : ''}>← Précédent</button><span>Page ${state.tablePage + 1} / ${Math.max(1, Math.ceil(rows.length / pageSize))}</span><button data-page="${state.tablePage + 1}" ${start + pageSize >= rows.length ? 'disabled' : ''}>Suivant →</button></div>`;
}

function filteredCustomers() {
  let rows = state.analysis.customers;
  if (state.customerFilter === 'risk') rows = rows.filter(c => ['À risque', 'Probablement perdu', 'Premier achat sans retour', 'En retard'].includes(c.status));
  else if (state.customerFilter === 'active') rows = rows.filter(c => c.activeInPeriod);
  else if (state.customerFilter === 'non-returned') rows = state.analysis.customerFlow.nonReturned;
  if (state.customerSearch) rows = rows.filter(c => normalizeText(`${c.name} ${c.city} ${c.zip} ${c.status} ${(c.riskReasons || []).join(' ')}`).includes(normalizeText(state.customerSearch)));
  return rows;
}

function customersView() {
  const a = state.analysis; const risk = a.customers.filter(c => ['À risque', 'Probablement perdu', 'Premier achat sans retour', 'En retard'].includes(c.status)); const rows = filteredCustomers();
  const ageKnown = percent.format(a.demographics.ageCoverage);
  return `<div class="view-page">${sectionHeader('Clients, revisite & changements de consommation', 'ANALYSIS identifie chaque client à risque, explique pourquoi, mesure les changements de panier, de fréquence, de matériel et calcule les données démographiques.')}
  <section class="metric-grid compact">${metricCard('Acheteurs uniques identifiés', integer.format(a.kpis.uniqueIdentifiedCustomers), `sur ${integer.format(a.kpis.uniqueTickets)} tickets uniques`, null, '', 'customers-active')}${metricCard('Tickets non identifiés', integer.format(a.kpis.anonymousTickets), `${percent.format(a.kpis.identifiedRate)} des tickets sont identifiés`, null, a.kpis.anonymousTickets ? 'warn' : '', 'tickets-anonymous')}${metricCard('Clients à surveiller', integer.format(risk.length), `${euro.format(sum(risk.map(c => c.lifetimeRevenueTTC)))} TTC de valeur historique`, null, 'warn', 'customers-risk')}${metricCard('Clients non revenus', integer.format(a.customerFlow.nonReturnedCount), `${euro.format(a.customerFlow.nonReturnedRevenueTTC)} TTC sur la période précédente`, null, 'danger', 'customers-nonreturned')}</section>
  <section class="demographic-grid"><article class="panel"><div class="panel-head"><div><span>Démographie</span><h3>Âge des clients</h3></div><span class="confidence">Couverture ${ageKnown}</span></div><div class="demographic-summary"><div><span>Âge moyen</span><strong>${decimal.format(a.demographics.averageAge)} ans</strong></div><div><span>Âge médian</span><strong>${integer.format(a.demographics.medianAge)} ans</strong></div><div><span>Fiches clients</span><strong>${integer.format(a.demographics.portfolioClients)}</strong></div></div><div class="age-bars">${a.demographics.ageBands.map(b => `<button data-drill="age:${escapeHtml(b.label)}"><span>${escapeHtml(b.label)}</span><i style="width:${safeDiv(b.customers, Math.max(...a.demographics.ageBands.map(x => x.customers), 1)) * 100}%"></i><strong>${integer.format(b.customers)}</strong><small>${integer.format(b.activeCustomers)} actifs · ${euro.format(b.revenueTTC)} TTC</small></button>`).join('')}</div></article><article class="panel"><div class="panel-head"><div><span>Zone de chalandise</span><h3>Villes principales</h3></div><span class="confidence">Couverture ${percent.format(a.demographics.cityCoverage)}</span></div>${dataTable(['Ville','Clients','Actifs période','CA TTC','CA HT','Marge HT'], a.demographics.cities.slice(0, 12).map(c => ({ attrs: `data-drill="city:${escapeHtml(c.city)}"`, cells: [c.city, integer.format(c.customers), integer.format(c.activeCustomers), euro.format(c.revenueTTC), euro.format(c.revenueHT), euro.format(c.marginHT)] })))}</article></section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Risque explicable</span><h3>Pourquoi ces clients peuvent ne pas revenir</h3></div><button class="link-btn" data-filter-customers="risk">Afficher tous →</button></div><div class="customer-risk-list">${risk.sort((x, y) => y.riskScore - x.riskScore).slice(0, 12).map(c => `<button data-drill="customer:${escapeHtml(c.name)}"><div class="risk-name"><strong>${escapeHtml(c.name)}</strong>${badge(c.status)}<small>${escapeHtml(c.city || 'Ville inconnue')} · ${Number.isFinite(c.age) ? `${c.age} ans` : 'âge inconnu'}</small></div><div class="risk-reason">${escapeHtml(c.riskReasons[0])}<small>${c.behavior.changes[0] ? escapeHtml(c.behavior.changes[0].label) : 'Aucun changement supplémentaire significatif.'}</small></div><div class="risk-score"><strong>${percent.format(c.riskProbability)}</strong><small>risque estimé</small></div></button>`).join('') || emptyState('Aucun risque client significatif.')}</div></article><article class="panel"><div class="panel-head"><div><span>Absence observée</span><h3>Clients présents avant, absents maintenant</h3></div><button class="link-btn" data-drill="customers-nonreturned">Liste complète →</button></div><div class="risk-preview">${a.customerFlow.nonReturned.slice(0, 12).map(c => `<button data-drill="customer:${escapeHtml(c.name)}"><div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.city || 'Ville inconnue')} · dernière visite il y a ${integer.format(c.recency || 0)} jours</small></div><b>${euro.format(c.previousRevenueTTC)} TTC<em>${euro.format(c.previousRevenueHT)} HT</em></b></button>`).join('') || emptyState('Tous les clients de la période précédente sont revenus ou la comparaison est indisponible.')}</div></article></section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Fidélisation</span><h3>Taux de deuxième visite</h3></div></div><div class="revisit-bars">${a.revisit.map(r => `<div><div><strong>${r.days} jours</strong><span>${r.eligible} clients réellement éligibles</span></div><div class="progress"><i style="width:${r.rate * 100}%"></i><b>${percent.format(r.rate)}</b></div></div>`).join('')}</div></article><article class="panel"><div class="panel-head"><div><span>Flux clients</span><h3>Nouveaux, fidèles et absents</h3></div></div><div class="flow-grid"><button data-drill="customers-new"><span>Nouveaux</span><strong>${a.customerFlow.newCount}</strong><small>${moneyPair(a.customerFlow.newRevenueHT, a.customerFlow.newRevenueTTC)}</small></button><button data-drill="customers-active"><span>Déjà connus revenus</span><strong>${a.customerFlow.retainedCount}</strong><small>${moneyPair(a.customerFlow.retainedRevenueHT, a.customerFlow.retainedRevenueTTC)}</small></button><button data-drill="customers-nonreturned"><span>Non revenus</span><strong>${a.customerFlow.nonReturnedCount}</strong><small>${moneyPair(a.customerFlow.nonReturnedRevenueHT, a.customerFlow.nonReturnedRevenueTTC)}</small></button></div></article></section>
  <article class="panel table-panel"><div class="table-toolbar"><div><span>Portefeuille client</span><h3>${integer.format(rows.length)} clients — cliquez pour comprendre</h3></div><div class="toolbar-actions"><select id="customerFilter"><option value="all" ${state.customerFilter === 'all' ? 'selected' : ''}>Tout le portefeuille</option><option value="active" ${state.customerFilter === 'active' ? 'selected' : ''}>Actifs sur la période</option><option value="risk" ${state.customerFilter === 'risk' ? 'selected' : ''}>À surveiller</option><option value="non-returned" ${state.customerFilter === 'non-returned' ? 'selected' : ''}>Non revenus</option></select><input id="customerSearch" value="${escapeHtml(state.customerSearch)}" placeholder="Nom, ville, raison…"></div></div>${customerTable(rows)}</article>
  <article class="panel table-panel"><div class="panel-head"><div><span>Cohortes</span><h3>Fidélisation des nouveaux clients</h3></div></div>${dataTable(['Mois de 1re visite','Clients','CA TTC','CA HT','Marge HT','Retour 30 j','Retour 60 j','Retour 90 j'], a.cohorts.map(c => [c.cohort, integer.format(c.customers), euro.format(c.revenueTTC), euro.format(c.revenueHT), euro.format(c.marginHT), c.eligible30 ? percent.format(c.rate30) : 'Non éligible', c.eligible60 ? percent.format(c.rate60) : 'Non éligible', c.eligible90 ? percent.format(c.rate90) : 'Non éligible']))}</article></div>`;
}

function customerTable(rows) {
  const pageSize = 40, start = state.tablePage * pageSize, page = rows.slice(start, start + pageSize);
  return `${dataTable(['Client','Âge / ville','Statut et raison','Visites','CA TTC / HT','Panier TTC / HT','Dernière visite','Évolution'], page.map(c => ({ attrs: `data-drill="customer:${escapeHtml(c.name)}"`, cells: [
    `<div class="cell-main"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.code || 'Code inconnu')} · ${escapeHtml(c.favoriteSeller || 'Vendeur inconnu')}</small></div>`,
    `${Number.isFinite(c.age) ? `${integer.format(c.age)} ans` : 'Âge inconnu'}<small class="subcell">${escapeHtml(c.city || 'Ville inconnue')} ${escapeHtml(c.zip || '')}</small>`,
    `<div class="status-explain">${badge(c.status || 'Non revenu')}<small>${escapeHtml(c.riskReasons?.[0] || `Absent sur la période actuelle après ${euro.format(c.previousRevenueTTC || 0)} TTC auparavant.`)}</small></div>`,
    integer.format(c.visits || 0),
    moneyPair(c.lifetimeRevenueHT || 0, c.lifetimeRevenueTTC || 0),
    moneyPair(c.lifetimeAverageBasketHT || c.averageBasketHT || 0, c.lifetimeAverageBasketTTC || c.averageBasketTTC || 0),
    c.lastVisit ? `${integer.format(c.recency)} jours` : '—',
    c.behavior?.changes?.[0] ? escapeHtml(c.behavior.changes[0].label) : 'Stable / à établir'
  ] }))) }<div class="pagination"><button data-page="${Math.max(0, state.tablePage - 1)}" ${state.tablePage === 0 ? 'disabled' : ''}>← Précédent</button><span>Page ${state.tablePage + 1} / ${Math.max(1, Math.ceil(rows.length / pageSize))}</span><button data-page="${state.tablePage + 1}" ${start + pageSize >= rows.length ? 'disabled' : ''}>Suivant →</button></div>`;
}

function basketsView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Paniers & associations', 'Identifier ce qui est acheté ensemble, les compléments naturels et les ventes additionnelles manquées.')}
  <section class="metric-grid compact">${metricCard('Panier moyen', moneyPair(a.kpis.averageBasketHT, a.kpis.averageBasketTTC), `Médiane ${euro.format(a.kpis.medianBasketTTC)} TTC`)}${metricCard('Articles / ticket', decimal.format(a.kpis.itemsPerTicket), `${integer.format(a.kpis.items)} unités nettes`)}${metricCard('Marge / ticket', `<strong>${euro.format(a.kpis.marginPerTicketHT)} <small>HT</small></strong>`, `${percent.format(a.kpis.markupRate)} de taux de marque`)}${metricCard('Produits offerts', integer.format(a.kpis.freeUnits), `${moneyPair(a.kpis.discountHT, a.kpis.discountTTC)}`)}</section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Associations</span><h3>Produits les plus souvent achetés ensemble</h3></div></div><div class="association-list">${a.baskets.associations.slice(0, 15).map((p, i) => `<button data-drill="association:${p.a}:${p.b}"><span>${String(i + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(p.nameA)}</strong><i>+</i><strong>${escapeHtml(p.nameB)}</strong><small>${p.count} paniers · ${percent.format(p.support)} des tickets</small></div></button>`).join('') || emptyState('Pas assez de paniers multi-produits.')}</div></article><article class="panel"><div class="panel-head"><div><span>Structure</span><h3>Répartition des paniers</h3></div></div>${donut([{ label: '1 famille', value: a.kpis.ticketsList.filter(t => t.families.size <= 1).length }, { label: '2 familles', value: a.kpis.ticketsList.filter(t => t.families.size === 2).length }, { label: '3+ familles', value: a.kpis.ticketsList.filter(t => t.families.size >= 3).length }], 'paniers')}</article></section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Opportunités</span><h3>Associations à exploiter</h3></div></div>${dataTable(['Produit A','Produit B','Paniers communs','Fréquence','CA TTC','CA HT'], a.baskets.associations.slice(0, 60).map(p => ({ attrs: `data-drill="association:${p.a}:${p.b}"`, cells: [escapeHtml(p.nameA), escapeHtml(p.nameB), integer.format(p.count), percent.format(p.support), euro.format(p.revenueTTC), euro.format(p.revenueHT)] })))}</article></div>`;
}

function sellersView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Performance vendeurs', 'Comparer les résultats observés, le panier HT/TTC, la marge, l’identification client, la part de matériel et les ventes complémentaires.')}
  <section class="seller-cards">${a.sellers.map(s => `<article class="seller-card clickable" data-drill="seller:${escapeHtml(s.seller)}"><div class="seller-top"><div class="seller-avatar">${escapeHtml(s.seller.slice(0, 2))}</div><div><strong>${escapeHtml(s.seller)}</strong><span>Score ${integer.format(s.score)}/100</span></div><b class="${s.revenueDelta >= 0 ? 'up' : 'down'}">${formatDelta(s.revenueDelta)}</b></div><div class="seller-kpis"><div><span>CA</span>${moneyPair(s.revenueHT, s.revenueTTC)}</div><div><span>Marge HT</span><strong>${euro.format(s.marginHT)}</strong></div><div><span>Panier</span>${moneyPair(s.averageBasketHT, s.averageBasketTTC)}</div><div><span>Clients uniques</span><strong>${integer.format(s.uniqueCustomers)}</strong></div><div><span>Tickets identifiés</span><strong>${percent.format(s.identifiedRate)}</strong></div><div><span>Paniers multi-familles</span><strong>${percent.format(s.multiFamilyRate)}</strong></div><div><span>Tickets matériel</span><strong>${percent.format(s.materialTicketRate)}</strong></div></div></article>`).join('')}</section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Comparaison détaillée</span><h3>Indicateurs vendeurs</h3></div></div>${dataTable(['Vendeur','CA TTC','CA HT','Marge HT','Tickets','Panier TTC','Panier HT','Articles/ticket','Identification','Part matériel','Remises TTC'], a.sellers.map(s => ({ attrs: `data-drill="seller:${escapeHtml(s.seller)}"`, cells: [s.seller, euro.format(s.revenueTTC), euro.format(s.revenueHT), euro.format(s.marginHT), integer.format(s.tickets), euro.format(s.averageBasketTTC), euro.format(s.averageBasketHT), decimal.format(s.itemsPerTicket), percent.format(s.identifiedRate), percent.format(s.materialTicketRate), euro.format(s.discountTTC)] })))}</article></div>`;
}

function selectedOrderRows() {
  return state.analysis.reorder.lines.filter(row => state.orderSupplier === 'all' || row.supplier === state.orderSupplier);
}
function orderQty(row) { return Number(state.orderDraft.get(row.code) ?? row.recommendedOrder) || 0; }
function orderTotals(rows = state.analysis.reorder.lines) {
  return rows.reduce((acc, row) => {
    const qty = orderQty(row); acc.units += qty; acc.costHT += qty * row.averageCostHT; acc.retailHT += qty * row.priceHT; acc.retailTTC += qty * row.priceTTC; acc.marginHT += qty * (row.priceHT - row.averageCostHT); if (qty > 0) acc.products += 1; return acc;
  }, { units: 0, costHT: 0, retailHT: 0, retailTTC: 0, marginHT: 0, products: 0 });
}

function ordersView() {
  const a = state.analysis; const rows = selectedOrderRows(); const totals = orderTotals(rows);
  const suppliers = [...new Set(a.reorder.lines.map(x => x.supplier || 'FOURNISSEUR NON RENSEIGNÉ'))].sort();
  return `<div class="view-page">${sectionHeader('Commandes automatiques par fournisseur', `La proposition reproduit votre méthode : ${a.meta.periodDays} jours de ventes comparés au stock restant, puis arrondis aux colisages. Minimum, recommandé et confort restent visibles.`)}
  <section class="order-control-panel panel"><div class="order-settings"><label>Couverture visée<input id="orderTargetDays" type="number" min="1" max="120" value="${a.reorder.targetDays}"><span>jours</span></label><label>Délai minimum<input id="orderLeadDays" type="number" min="0" max="30" value="${a.reorder.leadDays}"><span>jours</span></label><label>Sécurité confort<input id="orderSafety" type="number" min="0" max="100" value="${Math.round(a.reorder.safetyPct * 100)}"><span>%</span></label><label>Fournisseur<select id="orderSupplier"><option value="all">Tous les fournisseurs</option>${suppliers.map(s => `<option value="${escapeHtml(s)}" ${state.orderSupplier === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select></label><button class="btn primary" id="saveOrderSettings">Recalculer</button></div><p class="method-note"><strong>Lecture :</strong> “Recommandé” remet le stock au niveau des ventes de la période sélectionnée. “Confort” ajoute la sécurité et peut anticiper une accélération. Exemple : vendu 10, stock 6, lot 4 → recommandé 4.</p></section>
  <section class="metric-grid compact">${metricCard('Références commandées', integer.format(totals.products), `${integer.format(totals.units)} unités sélectionnées`)}${metricCard('Coût de commande', `<strong>${euro.format(totals.costHT)} <small>HT</small></strong>`, 'Au coût d’achat moyen')}${metricCard('Valeur commerciale', moneyPair(totals.retailHT, totals.retailTTC), 'Après réception et vente')}${metricCard('Marge potentielle', `<strong>${euro.format(totals.marginHT)} <small>HT</small></strong>`, 'Avant remises et retours')}</section>
  <section class="supplier-order-cards">${a.reorder.suppliers.map(s => { const supplierRows = s.lines; const t = orderTotals(supplierRows); return `<button class="supplier-order-card ${state.orderSupplier === s.supplier ? 'active' : ''}" data-order-supplier="${escapeHtml(s.supplier)}"><span>${escapeHtml(s.supplier)}</span><strong>${integer.format(t.products)} références · ${integer.format(t.units)} unités</strong><small>${euro.format(t.costHT)} HT achat · ${euro.format(t.retailTTC)} TTC commercial</small></button>`; }).join('')}</section>
  <article class="panel table-panel"><div class="table-toolbar"><div><span>Préconisation détaillée</span><h3>${integer.format(rows.length)} références analysées</h3></div><div class="toolbar-actions"><button class="btn secondary" id="applyMinimum">Appliquer minimum</button><button class="btn secondary" id="applyRecommended">Appliquer recommandé</button><button class="btn secondary" id="applyComfort">Appliquer confort</button><button class="btn primary" id="exportOrders">Exporter CSV</button></div></div>${dataTable(['Produit','Vendu période','Stock restant','Couverture','Lot','Minimum','Recommandé','Confort','Quantité choisie','Coût HT','Valeur HT / TTC','Pourquoi'], rows.map(row => ({ attrs: `data-drill="product:${escapeHtml(row.code)}"`, cells: [
    `<div class="cell-main"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.supplier || 'Sans fournisseur')} · ${escapeHtml(row.format)} · ${escapeHtml(row.code)}</small></div>`,
    `<strong>${integer.format(row.positiveQty)}</strong><small class="subcell">avant : ${integer.format(row.previousQty)} · ${row.trend >= 0 ? '+' : ''}${percent.format(row.trend)}</small>`,
    integer.format(row.stock),
    row.coverageDays === Infinity ? 'Aucune rotation' : `${decimal.format(row.coverageDays)} j`,
    integer.format(row.packSize),
    integer.format(row.minimumOrder),
    `<strong>${integer.format(row.recommendedOrder)}</strong>`,
    integer.format(row.comfortOrder),
    `<input class="order-qty" data-order-code="${escapeHtml(row.code)}" type="number" min="0" step="${row.packSize}" value="${orderQty(row)}">`,
    euro.format(orderQty(row) * row.averageCostHT),
    moneyPair(orderQty(row) * row.priceHT, orderQty(row) * row.priceTTC),
    `<button class="why-order" data-drill="product:${escapeHtml(row.code)}">${escapeHtml(row.orderReason)}</button>`
  ] })))}</article>
  <article class="panel pack-rules"><div class="panel-head"><div><span>Colisages métier</span><h3>Règles par fournisseur</h3></div></div><p>ANALYSIS applique déjà les règles connues : Openvap / Flavour Power / Auvergne Phyto : lot de 10 en 10 ml et lot de 4 en 50 ml. Vous pouvez les ajuster ci-dessous.</p><div class="rule-grid">${suppliers.filter(s => s !== 'FOURNISSEUR NON RENSEIGNÉ').map(s => `<div class="rule-row"><strong>${escapeHtml(s)}</strong><label>10 ml<input class="pack-rule-input" data-rule-supplier="${escapeHtml(s)}" data-rule-format="10ML" type="number" min="1" value="${getConfiguredPack(s, '10ML')}"></label><label>50 ml<input class="pack-rule-input" data-rule-supplier="${escapeHtml(s)}" data-rule-format="50ML" type="number" min="1" value="${getConfiguredPack(s, '50ML')}"></label></div>`).join('')}</div><button class="btn primary" id="savePackRules">Enregistrer les colisages</button></article></div>`;
}

function getConfiguredPack(supplier, format) {
  const rule = (state.project.settings.orderRules || []).find(r => normalizeText(r.supplierContains) === normalizeText(supplier) && r.format === format);
  if (rule) return rule.pack;
  const n = normalizeText(supplier); if ((n.includes('OPENVAP') || n.includes('AUVERGNE') || n.includes('FLAVOUR')) && format === '10ML') return 10; if ((n.includes('OPENVAP') || n.includes('AUVERGNE') || n.includes('FLAVOUR')) && format === '50ML') return 4; return 1;
}

function suppliersView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Achats & fournisseurs', 'Mesurer le coût HT, les ventes HT/TTC, la marge, le taux de réception et le capital immobilisé pour chaque fournisseur.')}
  <section class="supplier-cards">${a.suppliers.map(s => `<article class="supplier-card clickable" data-drill="supplier:${escapeHtml(s.supplier)}"><div><span>${escapeHtml(s.supplier)}</span><strong>${percent.format(s.serviceRate)}</strong><small>taux de réception</small></div><div class="supplier-metrics"><p><span>Achats HT</span><b>${euro.format(s.purchaseSpendHT)}</b></p><p><span>CA TTC</span><b>${euro.format(s.salesRevenueTTC)}</b></p><p><span>CA HT</span><b>${euro.format(s.salesRevenueHT)}</b></p><p><span>Marge HT</span><b>${euro.format(s.salesMarginHT)}</b></p><p><span>Stock achat HT</span><b>${euro.format(s.stockValueHT)}</b></p><p><span>Commandes</span><b>${integer.format(s.orders)}</b></p></div></article>`).join('')}</section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Performance fournisseur</span><h3>Détail des réceptions et résultats</h3></div></div>${dataTable(['Fournisseur','Commandes','Commandes exactes','Partielles','Surlivrées','Commandé','Reçu','Taux service','Achats HT','CA TTC','CA HT','Marge HT'], a.suppliers.map(s => ({ attrs: `data-drill="supplier:${escapeHtml(s.supplier)}"`, cells: [s.supplier, integer.format(s.orders), integer.format(s.exact), integer.format(s.partial), integer.format(s.over), integer.format(s.ordered), integer.format(s.received), percent.format(s.serviceRate), euro.format(s.purchaseSpendHT), euro.format(s.salesRevenueTTC), euro.format(s.salesRevenueHT), euro.format(s.salesMarginHT)] })))}</article></div>`;
}

function actionsView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Plans d’action', 'Les recommandations sont classées par urgence, impact HT/TTC, confiance et cible. Chaque action ouvre les preuves utilisées.')}
  <section class="action-board">${a.actions.map((x, i) => `<button class="action-card-full" data-drill="action:${x.id}"><div class="action-rank">${String(i + 1).padStart(2, '0')}</div><div class="action-body"><div>${badge(x.priority)}<span class="confidence">Confiance ${percent.format(x.confidence)}</span></div><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.reason)}</p></div><div class="action-impact"><span>Impact potentiel</span><strong>${euro.format(x.impactTTC)} TTC</strong><small>${euro.format(x.impactHT)} HT</small><em>Voir les preuves →</em></div></button>`).join('')}</section></div>`;
}

function explorerView() {
  return `<div class="view-page intelligence-view">${sectionHeader('Analysis Intelligence', 'Interrogez vos données en langage naturel. Les réponses sont calculées, jamais inventées.')}
  <section class="intelligence-shell"><div class="intelligence-hero"><span class="ai-orbit">A</span><h2>Que voulez-vous comprendre ?</h2><p>Exemples : “Pourquoi le chiffre baisse ?”, “Quels clients risquent de ne pas revenir ?”, “Que dois-je commander ?”, “Quel âge ont mes meilleurs clients ?”</p><form id="askForm"><input id="askInput" placeholder="Posez votre question…"><button class="btn primary">Analyser</button></form><div class="question-chips">${['Pourquoi le chiffre monte ou baisse ?','Quels clients risquent de ne pas revenir ?','Quels produits dois-je commander ?','Quels produits immobilisent le plus de stock ?','Quelle est la démographie de mes clients ?','Quel vendeur a le plus de potentiel ?'].map(q => `<button data-question="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}</div></div><div id="answerPanel" class="answer-panel"><div class="answer-placeholder"><span>◈</span><p>La réponse apparaîtra ici avec les chiffres HT/TTC et les preuves.</p></div></div></section></div>`;
}

function importsView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Imports & qualité des données', 'Déposez n’importe quelle période. Tous les exports de ventes sont fusionnés, les doublons réels sont neutralisés et les versions plus riches enrichissent les lignes existantes.')}
  <section class="import-zone" id="dropZone"><div class="import-icon">${icon('import', 28)}</div><h3>Déposez vos exports Excel ici</h3><p>Catalogue, stock, valorisation, clients, ventes, mouvements et réceptions fournisseurs.</p><button class="btn primary" id="browseFiles">Choisir les fichiers</button><input type="file" id="fileInput" multiple accept=".xlsx,.xls,.csv" hidden><small>Ventes(1), Ventes(2) ou tout autre nom sont acceptés : le contenu des colonnes détermine les capacités de l’analyse.</small></section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Fiabilité globale</span><h3>Score qualité ${a.quality.score}/100</h3></div></div><div class="quality-meter large"><i style="width:${a.quality.score}%"></i></div><div class="issue-list">${a.quality.issues.map(i => `<button data-drill="quality:${i.key}"><span class="severity ${i.severity}"></span><div><strong>${escapeHtml(i.label)}</strong><small>${escapeHtml(i.detail)}</small></div><b>${integer.format(i.count)}</b></button>`).join('')}</div></article><article class="panel"><div class="panel-head"><div><span>Couverture</span><h3>Données disponibles</h3></div></div><div class="coverage-grid">${Object.entries(a.quality.counts).map(([k, v]) => `<div><span>${({ products: 'Produits', sales: 'Lignes de ventes', clients: 'Clients', receipts: 'Réceptions', movements: 'Mouvements' })[k]}</span><strong>${integer.format(v)}</strong></div>`).join('')}</div><div class="backup-actions"><button class="btn secondary full" id="exportProject">Exporter la sauvegarde JSON</button><button class="btn secondary full" id="restoreProject">Restaurer une sauvegarde</button><input type="file" id="restoreInput" accept=".json" hidden></div></article></section>
  <article class="panel settings-panel"><div class="panel-head"><div><span>Paramètres métier</span><h3>Règles d’analyse</h3></div></div><div class="settings-grid"><label>Nom du magasin<input id="settingStore" value="${escapeHtml(state.project.settings.storeName || '')}"></label><label>Couverture stock cible (jours)<input id="settingCoverage" type="number" min="1" max="180" value="${state.project.settings.targetCoverageDays || 28}"></label><label>Dormance (jours)<input id="settingDormant" type="number" min="7" max="365" value="${state.project.settings.dormantDays || 45}"></label><label>Dormance critique (jours)<input id="settingCritical" type="number" min="30" max="730" value="${state.project.settings.criticalDormantDays || 90}"></label></div><button class="btn primary" id="saveSettings">Enregistrer les règles</button></article>
  <article class="panel table-panel"><div class="panel-head"><div><span>Traçabilité</span><h3>Historique des imports</h3></div></div>${dataTable(['Fichier','Type','Statut','Lignes','Ajoutées','Doublons','Enrichies','Période','Importé le',''], state.project.imports.slice().reverse().map(i => [escapeHtml(i.name), escapeHtml(i.type), badge(i.status), integer.format(i.rows || 0), integer.format(i.added || 0), integer.format(i.ignored || 0), integer.format(i.enriched || 0), i.periodStart ? `${fmtDate(i.periodStart)} → ${fmtDate(i.periodEnd)}` : 'Snapshot', fmtDate(i.importedAt), `<button class="icon-delete" data-delete-import="${i.id}" title="Supprimer">×</button>`]))}</article>
  <div class="danger-zone"><div><strong>Réinitialisation locale</strong><p>Supprime toutes les données importées dans ce navigateur.</p></div><button class="btn danger" id="resetData">Tout effacer</button></div></div>`;
}

function onboarding() {
  return `<div class="onboarding"><div class="onboarding-brand"><span class="brand-mark big">A</span><strong>ANALYSIS</strong><small>Retail Superintelligence</small></div><div class="onboarding-copy"><p class="eyebrow">PERFORMANCE, EXPLAINED.</p><h1>Le système nerveux de votre commerce.</h1><p>Importez vos exports. ANALYSIS explique les ventes, les clients, le stock, les commandes et les changements de comportement — puis transforme chaque conclusion en action.</p><div class="onboarding-actions"><button class="btn primary large" id="onboardImport">Importer mes fichiers</button><button class="btn secondary large" id="loadDemo">Explorer la démo</button></div><div class="privacy-line"><span>●</span> Calcul 100 % local · aucune donnée client envoyée</div></div><div class="onboarding-visual"><div class="radar-core"><span>A</span><i></i><i></i><i></i></div><div class="float-card f1"><small>CA</small><strong>Expliqué</strong></div><div class="float-card f2"><small>Clients</small><strong>Anticipés</strong></div><div class="float-card f3"><small>Commandes</small><strong>Optimisées</strong></div></div></div>`;
}

function dataTable(headers, rows) {
  if (!rows.length) return emptyState('Aucune donnée disponible.');
  return `<div class="table-scroll"><table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => { const entry = Array.isArray(row) ? { cells: row, attrs: '' } : row; return `<tr ${entry.attrs || ''}>${entry.cells.map(cell => `<td>${cell ?? '—'}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
}

function renderView() {
  if (!dataReady()) { $('#content').innerHTML = onboarding(); bindOnboarding(); return; }
  const views = { dashboard: dashboardView, sales: salesView, stock: stockView, customers: customersView, baskets: basketsView, sellers: sellersView, orders: ordersView, suppliers: suppliersView, actions: actionsView, explorer: explorerView, imports: importsView };
  $('#content').innerHTML = (views[state.view] || dashboardView)(); bindViewEvents();
}

function render() { renderShell(); renderView(); document.body.dataset.view = state.view; }

async function processFiles(files) {
  if (!files.length) return;
  showLoader(`Lecture de ${files.length} fichier(s)…`); let imported = 0, ignored = 0, enriched = 0;
  try {
    for (const file of files) {
      $('#loaderText').textContent = `Analyse de ${file.name}…`;
      try {
        const result = await readWorkbookFile(file); const merge = mergeImport(state.project, result);
        if (merge.status === 'imported') { imported += merge.added; ignored += merge.ignored; enriched += merge.enriched || 0; if (merge.warning) toast(merge.warning, 'warning'); }
        else ignored += merge.ignored;
      } catch (error) { console.error(error); toast(`${file.name} : ${error.message}`, 'error'); }
    }
    await saveProject(state.project); recalculate({ preservePeriod: false }); state.view = 'dashboard'; render();
    toast(`${integer.format(imported)} ligne(s) ajoutée(s), ${integer.format(ignored)} doublon(s) neutralisé(s)${enriched ? `, ${integer.format(enriched)} ligne(s) enrichie(s)` : ''}.`);
  } finally { hideLoader(); }
}

function openImportDialog() { $('#globalFileInput').click(); }

function bindGlobalEvents() {
  $('#menuToggle').onclick = () => document.body.classList.toggle('menu-open');
  $('#globalImport').onclick = openImportDialog; $('#globalFileInput').onchange = e => processFiles([...e.target.files]);
  $('#periodStart').onchange = e => { state.filters.start = e.target.value; recalculate(); render(); };
  $('#periodEnd').onchange = e => { state.filters.end = e.target.value; recalculate(); render(); };
  $('#periodPreset').onchange = e => { const days = Number(e.target.value); const end = latestDataDate(); if (!end || !days) return; const start = new Date(end); start.setDate(start.getDate() - days + 1); state.filters = { start: isoDate(start), end: isoDate(end) }; recalculate(); render(); };
  $('#brandHome').onclick = () => { state.view = 'dashboard'; render(); };
  $('#drawerClose').onclick = closeDrawer;
  $('#drawerOverlay').onclick = e => { if (e.target.id === 'drawerOverlay') closeDrawer(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
}

function bindOnboarding() {
  $('#onboardImport').onclick = openImportDialog;
  $('#loadDemo').onclick = async () => { showLoader('Création de la démonstration…'); state.project = createDemoProject(); await saveProject(state.project); recalculate({ preservePeriod: false }); state.view = 'dashboard'; hideLoader(); render(); toast('Démonstration chargée.'); };
}

function bindViewEvents() {
  $$('[data-go]').forEach(btn => btn.onclick = () => { state.view = btn.dataset.go; state.tablePage = 0; render(); });
  $$('[data-drill]').forEach(el => { el.onclick = event => { event.stopPropagation(); openDrill(el.dataset.drill); }; el.onkeydown = e => { if (e.key === 'Enter') openDrill(el.dataset.drill); }; });
  $('#quickImport')?.addEventListener('click', openImportDialog);
  $('#productStatus')?.addEventListener('change', e => { state.productFilter = e.target.value; state.tablePage = 0; renderView(); });
  $('#productSearch')?.addEventListener('input', e => { state.productSearch = e.target.value; state.tablePage = 0; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(renderView, 220); });
  $('#customerFilter')?.addEventListener('change', e => { state.customerFilter = e.target.value; state.tablePage = 0; renderView(); });
  $('#customerSearch')?.addEventListener('input', e => { state.customerSearch = e.target.value; state.tablePage = 0; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(renderView, 220); });
  $$('[data-filter-customers]').forEach(btn => btn.onclick = () => { state.customerFilter = btn.dataset.filterCustomers; state.tablePage = 0; renderView(); });
  $$('[data-page]').forEach(btn => btn.onclick = () => { state.tablePage = Number(btn.dataset.page); renderView(); });
  const dz = $('#dropZone'); if (dz) { $('#browseFiles').onclick = () => $('#fileInput').click(); $('#fileInput').onchange = e => processFiles([...e.target.files]); ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('dragging'); })); ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('dragging'); })); dz.addEventListener('drop', e => processFiles([...e.dataTransfer.files])); }
  $('#exportProject')?.addEventListener('click', () => downloadBlob(JSON.stringify(state.project, null, 2), `analysis-sauvegarde-${isoDate(new Date())}.json`));
  $('#restoreProject')?.addEventListener('click', () => $('#restoreInput').click());
  $('#restoreInput')?.addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return; try { const restored = JSON.parse(await file.text()); if (!restored?.snapshots || !restored?.events || !restored?.settings) throw new Error('Structure de sauvegarde invalide'); state.project = restored; await saveProject(state.project); recalculate({ preservePeriod: false }); render(); toast('Sauvegarde restaurée.'); } catch (error) { toast(`Restauration impossible : ${error.message}`, 'error'); } });
  $('#saveSettings')?.addEventListener('click', async () => { state.project.settings.storeName = $('#settingStore').value.trim() || 'Mon magasin'; state.project.settings.targetCoverageDays = Number($('#settingCoverage').value) || 28; state.project.settings.dormantDays = Number($('#settingDormant').value) || 45; state.project.settings.criticalDormantDays = Number($('#settingCritical').value) || 90; await saveProject(state.project); recalculate(); render(); toast('Règles d’analyse enregistrées.'); });
  $('#resetData')?.addEventListener('click', async () => { if (!confirm('Supprimer toutes les données locales ANALYSIS ?')) return; await resetProject(); state.project = emptyProject(); recalculate({ preservePeriod: false }); state.view = 'dashboard'; render(); toast('Données supprimées.'); });
  $$('[data-delete-import]').forEach(btn => btn.onclick = async () => { if (!confirm('Supprimer cet import et ses données ?')) return; removeImport(state.project, btn.dataset.deleteImport); await saveProject(state.project); recalculate({ preservePeriod: false }); render(); toast('Import supprimé.'); });
  const ask = question => { const answer = answerQuestion(question, state.analysis); $('#askInput').value = question; $('#answerPanel').innerHTML = `<div class="answer-head"><span>ANALYSIS RESPONSE</span><h3>${escapeHtml(answer.title)}</h3></div>${answer.text ? `<p class="answer-text">${escapeHtml(answer.text)}</p>` : `<div class="answer-results">${answer.rows.map((r, i) => `<div><span>${String(i + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(r.label)}</strong><small>${escapeHtml(r.detail)}</small></div><b>${answer.unit === 'currency' ? euro.format(r.value) : answer.unit === 'percent' ? percent.format(r.value) : decimal.format(r.value)}</b></div>`).join('')}</div>`}<div class="answer-proof">Calculé sur ${integer.format(state.analysis.meta.selectedLines)} lignes · ${fmtDate(state.analysis.meta.start)} → ${fmtDate(state.analysis.meta.end)}</div>`; };
  $('#askForm')?.addEventListener('submit', e => { e.preventDefault(); const q = $('#askInput').value.trim(); if (q) ask(q); });
  $$('[data-question]').forEach(btn => btn.onclick = () => ask(btn.dataset.question));
  bindOrderEvents();
}

function bindOrderEvents() {
  $('#orderSupplier')?.addEventListener('change', e => { state.orderSupplier = e.target.value; renderView(); });
  $$('[data-order-supplier]').forEach(btn => btn.onclick = () => { state.orderSupplier = btn.dataset.orderSupplier; renderView(); });
  $$('.order-qty').forEach(input => input.onchange = e => { const code = e.target.dataset.orderCode; const row = state.analysis.reorder.lines.find(x => x.code === code); let value = Math.max(0, Number(e.target.value) || 0); if (row?.packSize > 1 && value % row.packSize) { value = Math.ceil(value / row.packSize) * row.packSize; toast(`Quantité arrondie au colisage de ${row.packSize}.`, 'warning'); } state.orderDraft.set(code, value); renderView(); });
  const applyMode = mode => { for (const row of selectedOrderRows()) state.orderDraft.set(row.code, row[`${mode}Order`]); renderView(); };
  $('#applyMinimum')?.addEventListener('click', () => applyMode('minimum'));
  $('#applyRecommended')?.addEventListener('click', () => applyMode('recommended'));
  $('#applyComfort')?.addEventListener('click', () => applyMode('comfort'));
  $('#saveOrderSettings')?.addEventListener('click', async () => { state.project.settings.orderTargetDays = Number($('#orderTargetDays').value) || state.analysis.meta.periodDays; state.project.settings.orderLeadDays = Number($('#orderLeadDays').value) || 3; state.project.settings.orderSafetyPct = (Number($('#orderSafety').value) || 0) / 100; await saveProject(state.project); recalculate(); state.orderDraft.clear(); syncOrderDraft(true); render(); toast('Commandes recalculées selon les nouvelles règles.'); });
  $('#savePackRules')?.addEventListener('click', async () => { const rules = []; $$('.pack-rule-input').forEach(input => { rules.push({ supplierContains: input.dataset.ruleSupplier, format: input.dataset.ruleFormat, pack: Math.max(1, Number(input.value) || 1) }); }); state.project.settings.orderRules = rules; await saveProject(state.project); recalculate(); state.orderDraft.clear(); syncOrderDraft(true); render(); toast('Colisages enregistrés.'); });
  $('#exportOrders')?.addEventListener('click', exportOrdersCsv);
}

function exportOrdersCsv() {
  const rows = selectedOrderRows().filter(r => orderQty(r) > 0);
  const headers = ['Fournisseur','Code article','Produit','Format','Vendu période','Stock','Colisage','Minimum','Recommandé','Confort','Quantité choisie','Coût achat HT','Valeur vente HT','Valeur vente TTC','Marge potentielle HT'];
  const csv = [headers, ...rows.map(r => { const q = orderQty(r); return [r.supplier, r.code, r.name, r.format, r.positiveQty, r.stock, r.packSize, r.minimumOrder, r.recommendedOrder, r.comfortOrder, q, (q * r.averageCostHT).toFixed(2), (q * r.priceHT).toFixed(2), (q * r.priceTTC).toFixed(2), (q * (r.priceHT - r.averageCostHT)).toFixed(2)]; })].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  downloadBlob(`\ufeff${csv}`, `ANALYSIS-commandes-${isoDate(new Date())}.csv`, 'text/csv;charset=utf-8');
}

function openDrill(code) {
  const [type, ...parts] = code.split(':'); const target = parts.join(':');
  if (type === 'product') return openProduct(target);
  if (type === 'customer') return openCustomer(target);
  if (type === 'driver') return openDriver(parts[0], parts.slice(1).join(':'));
  if (type === 'products') return openProductList(target);
  if (type === 'customers-risk') return openCustomerList('À surveiller', state.analysis.customers.filter(c => ['À risque', 'Probablement perdu', 'Premier achat sans retour', 'En retard'].includes(c.status)));
  if (type === 'customers-nonreturned') return openCustomerList('Clients non revenus', state.analysis.customerFlow.nonReturned);
  if (type === 'customers-active') return openCustomerList('Acheteurs uniques actifs', state.analysis.customers.filter(c => c.activeInPeriod));
  if (type === 'customers-new') return openCustomerList('Nouveaux acheteurs', state.analysis.customers.filter(c => state.analysis.customerFlow.newNames.includes(normalizeText(c.name))));
  if (type === 'revenue' || type === 'margin' || type === 'tickets' || type === 'baskets' || type === 'discounts' || type === 'stock-value') return openMetric(type);
  if (type === 'tickets-anonymous') return openAnonymousTickets();
  if (type === 'seller') return openSeller(target);
  if (type === 'supplier') return openSupplier(target);
  if (type === 'action') return openAction(target);
  if (type === 'association') return openAssociation(parts[0], parts[1]);
  if (type === 'family' || type === 'segment') return openDriver(type, target);
  if (type === 'age') return openAgeBand(target);
  if (type === 'city') return openCity(target);
  if (type === 'insight') return openInsight(parts[0], parts.slice(1).join(':'));
  if (type === 'quality') return openQuality(target);
}

function showDrawer(title, eyebrow, html) {
  $('#drawerEyebrow').textContent = eyebrow || 'ANALYSIS DETAIL';
  $('#drawerTitle').textContent = title;
  $('#drawerBody').innerHTML = html;
  $('#drawerOverlay').classList.add('show'); document.body.classList.add('drawer-open');
  $$('#drawerBody [data-drill]').forEach(el => el.onclick = e => { e.stopPropagation(); openDrill(el.dataset.drill); });
}
function closeDrawer() { $('#drawerOverlay').classList.remove('show'); document.body.classList.remove('drawer-open'); }

function openProduct(code) {
  const p = state.analysis.products.find(x => x.code === code); if (!p) return;
  const order = state.analysis.reorder.lines.find(x => x.code === code);
  const sales = state.data.sales.filter(x => x.code === code && new Date(x.date) >= state.analysis.meta.start && new Date(x.date) <= state.analysis.meta.end).sort((a, b) => new Date(b.date) - new Date(a.date));
  const customers = [...new Set(sales.filter(x => x.customerName).map(x => x.customerName))];
  showDrawer(p.name, 'FICHE PRODUIT EXPLICABLE', `<div class="drawer-status">${badge(p.status)}<p>${escapeHtml(p.statusReason)}</p></div><div class="drawer-kpis"><div><span>Ventes période</span><strong>${integer.format(p.positiveQty)} unités</strong><small>période précédente : ${integer.format(p.previousQty)}</small></div><div><span>CA produit</span>${moneyPair(p.revenueHT, p.revenueTTC)}</div><div><span>Marge</span><strong>${euro.format(p.marginHT)} HT</strong><small>${percent.format(p.markupRate)} de taux de marque</small></div><div><span>Stock actuel</span><strong>${integer.format(p.stock)} unités</strong><small>${euro.format(p.stockValueHT)} HT au coût d’achat</small></div><div><span>Valeur commerciale stock</span>${moneyPair(p.stockRetailHT, p.stockRetailTTC)}</div><div><span>Couverture</span><strong>${p.coverageDays === Infinity ? 'Aucune rotation' : `${decimal.format(p.coverageDays)} jours`}</strong><small>${escapeHtml(p.regularity)}</small></div></div>
  <section class="drawer-section"><h3>Commande recommandée</h3>${order ? `<div class="order-levels"><div><span>Minimum</span><strong>${order.minimumOrder}</strong></div><div class="recommended"><span>Recommandé</span><strong>${order.recommendedOrder}</strong></div><div><span>Confort</span><strong>${order.comfortOrder}</strong></div></div><p>${escapeHtml(order.orderReason)}</p><small>Colisage : ${order.packSize} · coût recommandé ${euro.format(order.recommendedOrder * order.averageCostHT)} HT · valeur ${euro.format(order.recommendedOrder * order.priceTTC)} TTC.</small>` : '<p>Aucune règle de commande disponible.</p>'}</section>
  <section class="drawer-section"><h3>Âge du stock estimé</h3><p>${p.age.knownQty ? `${integer.format(p.age.knownQty)} unité(s) rattachées à des réceptions connues, âge moyen estimé ${decimal.format(p.age.weightedAge)} jours.` : 'Aucune unité ne peut être datée précisément avec les réceptions disponibles.'}</p>${p.age.unknownQty ? `<p>${integer.format(p.age.unknownQty)} unité(s) sont antérieures à l’historique disponible : âge exact inconnu.</p>` : ''}</section>
  <section class="drawer-section"><h3>Clients et dernières ventes</h3><p>${integer.format(customers.length)} client(s) identifié(s) ont acheté cette référence sur la période.</p>${dataTable(['Date','Client','Vendeur','Quantité','Vente TTC','Vente HT'], sales.slice(0, 30).map(line => { const tax = p.priceTTC && p.priceHT ? p.priceTTC / p.priceHT : 1.2; return [fmtDate(line.date), line.customerName || 'Anonyme', line.seller || 'Non renseigné', integer.format(line.quantity), euro.format(line.saleTTC), euro.format(line.saleTTC / tax)]; }))}</section>`);
}

function openCustomer(name) {
  const c = state.analysis.customers.find(x => normalizeText(x.name) === normalizeText(name)) || state.analysis.customerFlow.nonReturned.find(x => normalizeText(x.name) === normalizeText(name)); if (!c) return;
  const reasons = c.riskReasons || [`Absent sur la période actuelle après ${euro.format(c.previousRevenueTTC || 0)} TTC sur la période précédente.`];
  const visits = c.visitsList || [];
  showDrawer(c.name, 'FICHE CLIENT 360°', `<div class="drawer-status">${badge(c.status || 'Non revenu')}<p>${escapeHtml(reasons[0])}</p></div><div class="profile-strip"><div><span>Âge</span><strong>${Number.isFinite(c.age) ? `${c.age} ans` : 'Inconnu'}</strong></div><div><span>Ville</span><strong>${escapeHtml(c.city || 'Inconnue')}</strong><small>${escapeHtml(c.zip || '')}</small></div><div><span>Consentement</span><strong>${c.consent ? 'Contact autorisé' : 'À vérifier'}</strong></div><div><span>Risque estimé</span><strong>${percent.format(c.riskProbability || 0)}</strong><small>confiance ${percent.format(c.riskConfidence || 0)}</small></div></div><div class="drawer-kpis"><div><span>Visites observées</span><strong>${integer.format(c.visits || 0)}</strong><small>${integer.format(c.selectedVisits || 0)} sur la période</small></div><div><span>CA historique</span>${moneyPair(c.lifetimeRevenueHT || 0, c.lifetimeRevenueTTC || 0)}</div><div><span>Marge historique</span><strong>${euro.format(c.lifetimeMarginHT || 0)} HT</strong></div><div><span>Panier moyen historique</span>${moneyPair(c.lifetimeAverageBasketHT || 0, c.lifetimeAverageBasketTTC || 0)}</div><div><span>Rythme habituel</span><strong>${c.expectedGap ? `${decimal.format(c.expectedGap)} jours` : 'À établir'}</strong><small>retard ${integer.format(Math.max(0, c.lateness || 0))} jours</small></div><div><span>Dernière visite</span><strong>${c.lastVisit ? fmtDate(c.lastVisit) : '—'}</strong><small>${integer.format(c.recency || 0)} jours</small></div></div>
  <section class="drawer-section"><h3>Pourquoi ce statut ?</h3><div class="evidence-list">${reasons.map(r => `<p><span>•</span>${escapeHtml(r)}</p>`).join('')}</div></section>
  <section class="drawer-section"><h3>Changements de consommation détectés</h3>${c.behavior?.changes?.length ? `<div class="change-list">${c.behavior.changes.map(ch => `<div class="${ch.direction}"><span>${ch.direction === 'up' ? '↗' : '↘'}</span><strong>${escapeHtml(ch.label)}</strong></div>`).join('')}</div><div class="comparison-mini"><div><span>Panier ancien</span><strong>${euro.format(c.behavior.priorBasketTTC || 0)} TTC</strong><small>${euro.format(c.behavior.priorBasketHT || 0)} HT</small></div><div><span>Panier récent</span><strong>${euro.format(c.behavior.recentBasketTTC || 0)} TTC</strong><small>${euro.format(c.behavior.recentBasketHT || 0)} HT</small></div><div><span>Part matériel ancienne</span><strong>${percent.format(c.behavior.materialShareBefore || 0)}</strong></div><div><span>Part matériel récente</span><strong>${percent.format(c.behavior.materialShareNow || 0)}</strong></div></div>` : '<p>Aucun changement statistiquement significatif ou historique insuffisant.</p>'}</section>
  <section class="drawer-section"><h3>Habitudes et besoins récurrents</h3>${c.behavior?.recurringNeeds?.length ? dataTable(['Produit','Rythme moyen','Quantité moyenne','Dernier achat'], c.behavior.recurringNeeds.map(r => [escapeHtml(r.name), `${integer.format(r.expectedDays)} jours`, decimal.format(r.averageQuantity), fmtDate(r.lastPurchase)])) : '<p>Pas assez de répétitions pour prévoir un renouvellement produit.</p>'}</section>
  <section class="drawer-section"><h3>Historique des tickets</h3>${visits.length ? dataTable(['Date','Vendeur','CA TTC','CA HT','Marge HT','Articles','Familles'], [...visits].reverse().slice(0, 40).map(v => [fmtDate(v.date), v.seller, euro.format(v.revenueTTC), euro.format(v.revenueHT), euro.format(v.marginHT), decimal.format(v.items), [...v.families].join(', ')])) : '<p>Historique détaillé indisponible pour ce client non revenu.</p>'}</section>`);
}

function openProductList(status) {
  const match = status === 'Dormant' ? state.analysis.products.filter(p => ['Dormant', 'Stock immobilisé'].includes(p.status)) : state.analysis.products.filter(p => p.status === status);
  showDrawer(status || 'Produits', 'LISTE CLIQUABLE', dataTable(['Produit','Statut','Vendu','Stock','Valeur achat HT','CA TTC','CA HT','Commande'], match.map(p => ({ attrs: `data-drill="product:${p.code}"`, cells: [p.name, badge(p.status), integer.format(p.positiveQty), integer.format(p.stock), euro.format(p.stockValueHT), euro.format(p.revenueTTC), euro.format(p.revenueHT), integer.format(state.analysis.reorder.lines.find(x => x.code === p.code)?.recommendedOrder || 0)] }))));
}
function openCustomerList(title, rows) { showDrawer(title, 'LISTE CLIENTS EXPLIQUÉE', dataTable(['Client','Âge','Ville','Statut','Raison','CA TTC historique','CA HT historique'], rows.map(c => ({ attrs: `data-drill="customer:${escapeHtml(c.name)}"`, cells: [c.name, Number.isFinite(c.age) ? `${c.age} ans` : 'Inconnu', c.city || 'Inconnue', badge(c.status || 'Non revenu'), c.riskReasons?.[0] || 'Absent sur la période actuelle', euro.format(c.lifetimeRevenueTTC || c.previousRevenueTTC || 0), euro.format(c.lifetimeRevenueHT || c.previousRevenueHT || 0)] })))); }

function openDriver(type, target = '') {
  const a = state.analysis;
  if (type === 'tickets') return showDrawer('Effet nombre de tickets', 'CAUSE DU CHIFFRE', `<div class="cause-total ${a.drivers.ticketEffectTTC >= 0 ? 'up' : 'down'}"><strong>${a.drivers.ticketEffectTTC >= 0 ? '+' : ''}${euro.format(a.drivers.ticketEffectTTC)} TTC</strong><span>${a.drivers.ticketEffectHT >= 0 ? '+' : ''}${euro.format(a.drivers.ticketEffectHT)} HT</span></div><p>La période compte ${a.kpis.tickets} tickets uniques contre ${a.previousKpis.tickets}. L’effet isole ce que ce changement de volume aurait produit avec l’ancien panier moyen.</p>`);
  if (type === 'basket') return showDrawer('Effet panier moyen', 'CAUSE DU CHIFFRE', `<div class="cause-total ${a.drivers.basketEffectTTC >= 0 ? 'up' : 'down'}"><strong>${a.drivers.basketEffectTTC >= 0 ? '+' : ''}${euro.format(a.drivers.basketEffectTTC)} TTC</strong><span>${a.drivers.basketEffectHT >= 0 ? '+' : ''}${euro.format(a.drivers.basketEffectHT)} HT</span></div><p>Le panier moyen est passé de ${euro.format(a.previousKpis.averageBasketTTC)} TTC (${euro.format(a.previousKpis.averageBasketHT)} HT) à ${euro.format(a.kpis.averageBasketTTC)} TTC (${euro.format(a.kpis.averageBasketHT)} HT).</p>`);
  if (type === 'customers') return openCustomerList('Clients non revenus', a.customerFlow.nonReturned);
  if (type === 'mix') return showDrawer('Changement de mix matériel', 'COMPORTEMENT DE CONSOMMATION', `<div class="drawer-kpis"><div><span>Part matériel actuelle</span><strong>${percent.format(a.drivers.materialShareCurrent)}</strong></div><div><span>Part précédente</span><strong>${percent.format(a.drivers.materialSharePrevious)}</strong></div><div><span>Évolution</span><strong>${pctPoints(a.drivers.materialShareDelta)}</strong></div></div>${dataTable(['Segment','CA TTC actuel','CA TTC précédent','Écart TTC','Écart HT'], a.drivers.segments.map(x => [x.key, euro.format(x.revenueTTC), euro.format(x.previousRevenueTTC), `${x.impactTTC >= 0 ? '+' : ''}${euro.format(x.impactTTC)}`, `${x.impactHT >= 0 ? '+' : ''}${euro.format(x.impactHT)}`]))}`);
  const source = type === 'family' ? a.drivers.families : type === 'segment' ? a.drivers.segments : a.drivers.products;
  const rows = target ? source.filter(x => x.key === target || x.key.includes(`|||${target}`)) : source.slice(0, 30);
  showDrawer(target || 'Contributions', 'CAUSES DÉTAILLÉES', dataTable(['Élément','CA TTC actuel','CA TTC précédent','Impact TTC','Impact HT','Marge actuelle HT'], rows.map(x => [x.key.includes('|||') ? x.key.split('|||')[1] : x.key, euro.format(x.revenueTTC), euro.format(x.previousRevenueTTC), `${x.impactTTC >= 0 ? '+' : ''}${euro.format(x.impactTTC)}`, `${x.impactHT >= 0 ? '+' : ''}${euro.format(x.impactHT)}`, euro.format(x.marginHT)])));
}

function openMetric(type) {
  const a = state.analysis;
  if (type === 'revenue') return openDriver('family');
  if (type === 'margin') return showDrawer('Marge commerciale', 'RENTABILITÉ', `${moneyPair(a.kpis.revenueHT, a.kpis.revenueTTC)}<div class="drawer-kpis"><div><span>Coût d’achat des ventes</span><strong>${euro.format(a.kpis.costHT)} HT</strong></div><div><span>Marge</span><strong>${euro.format(a.kpis.marginHT)} HT</strong></div><div><span>Taux de marque</span><strong>${percent.format(a.kpis.markupRate)}</strong></div></div>${dataTable(['Produit','CA TTC','CA HT','Marge HT','Taux de marque'], [...a.products].sort((x, y) => y.marginHT - x.marginHT).slice(0, 40).map(p => ({ attrs: `data-drill="product:${p.code}"`, cells: [p.name, euro.format(p.revenueTTC), euro.format(p.revenueHT), euro.format(p.marginHT), percent.format(p.markupRate)] })) )}`);
  if (type === 'tickets') return openDriver('tickets');
  if (type === 'baskets') return openDriver('basket');
  if (type === 'discounts') return showDrawer('Remises et produits offerts', 'IMPACT COMMERCIAL', `<div class="drawer-kpis"><div><span>Remises TTC</span><strong>${euro.format(a.kpis.discountTTC)}</strong></div><div><span>Remises HT</span><strong>${euro.format(a.kpis.discountHT)}</strong></div><div><span>Unités offertes</span><strong>${integer.format(a.kpis.freeUnits)}</strong></div></div>`);
  if (type === 'stock-value') return showDrawer('Valeur du stock', 'CAPITAL IMMOBILISÉ', `<div class="drawer-kpis"><div><span>Coût d’achat</span><strong>${euro.format(a.stockSummary.purchaseValueHT)} HT</strong></div><div><span>Valeur commerciale</span>${moneyPair(a.stockSummary.marketValueHT, a.stockSummary.marketValueTTC)}</div><div><span>Marge théorique</span><strong>${euro.format(a.stockSummary.potentialMarginHT)} HT</strong></div><div><span>Capital dormant</span><strong>${euro.format(a.stockSummary.dormantValueHT)} HT</strong></div></div>`);
}

function openAnonymousTickets() { const tickets = state.analysis.kpis.ticketsList.filter(t => !normalizeText(t.customer)); showDrawer('Tickets non identifiés', 'LIMITE DE LA REVISITE', `<p>Ces tickets sont inclus dans le CA et la marge, mais aucun acheteur unique ni retour client ne peut être calculé.</p>${dataTable(['Date','Ticket','Vendeur','CA TTC','CA HT','Marge HT'], tickets.map(t => [fmtDate(t.date), t.key, t.seller, euro.format(t.revenueTTC), euro.format(t.revenueHT), euro.format(t.marginHT)]))}`); }
function openSeller(name) { const s = state.analysis.sellers.find(x => x.seller === name); if (!s) return; showDrawer(name, 'PERFORMANCE VENDEUR', `<div class="drawer-kpis"><div><span>CA</span>${moneyPair(s.revenueHT, s.revenueTTC)}</div><div><span>Marge</span><strong>${euro.format(s.marginHT)} HT</strong></div><div><span>Panier moyen</span>${moneyPair(s.averageBasketHT, s.averageBasketTTC)}</div><div><span>Tickets</span><strong>${integer.format(s.tickets)}</strong></div><div><span>Clients uniques</span><strong>${integer.format(s.uniqueCustomers)}</strong></div><div><span>Part matériel</span><strong>${percent.format(s.materialTicketRate)}</strong></div><div><span>Multi-familles</span><strong>${percent.format(s.multiFamilyRate)}</strong></div><div><span>Remises</span>${moneyPair(s.discountHT, s.discountTTC)}</div></div><p>Le potentiel de vente complémentaire estimé est de ${euro.format(s.potentialTTC)} TTC si ce vendeur rejoint la moyenne de l’équipe sur les paniers multi-familles.</p>`); }
function openSupplier(name) { const s = state.analysis.suppliers.find(x => x.supplier === name); if (!s) return; const orders = state.analysis.reorder.lines.filter(x => x.supplier === name && x.recommendedOrder > 0); showDrawer(name, 'FOURNISSEUR & COMMANDE', `<div class="drawer-kpis"><div><span>Achats</span><strong>${euro.format(s.purchaseSpendHT)} HT</strong></div><div><span>CA produits</span>${moneyPair(s.salesRevenueHT, s.salesRevenueTTC)}</div><div><span>Marge</span><strong>${euro.format(s.salesMarginHT)} HT</strong></div><div><span>Taux de réception</span><strong>${percent.format(s.serviceRate)}</strong></div><div><span>Commandes exactes</span><strong>${s.exact}/${s.orders}</strong></div><div><span>Stock</span><strong>${euro.format(s.stockValueHT)} HT achat</strong></div></div><section class="drawer-section"><h3>Commande recommandée maintenant</h3>${dataTable(['Produit','Vendu','Stock','Lot','Recommandé','Coût HT'], orders.map(p => ({ attrs: `data-drill="product:${p.code}"`, cells: [p.name, integer.format(p.positiveQty), integer.format(p.stock), integer.format(p.packSize), integer.format(p.recommendedOrder), euro.format(p.recommendedOrder * p.averageCostHT)] })))}</section>`); }
function openAction(id) { const x = state.analysis.actions.find(a => a.id === id); if (!x) return; showDrawer(x.title, 'ACTION PRIORITAIRE', `<div class="drawer-status">${badge(x.priority)}<p>${escapeHtml(x.reason)}</p></div><div class="drawer-kpis"><div><span>Impact potentiel TTC</span><strong>${euro.format(x.impactTTC)}</strong></div><div><span>Impact potentiel HT</span><strong>${euro.format(x.impactHT)}</strong></div><div><span>Confiance</span><strong>${percent.format(x.confidence)}</strong></div></div><button class="btn primary" data-drill="${x.type === 'customer' ? `customer:${escapeHtml(x.target)}` : x.type === 'product' ? `product:${escapeHtml(x.target)}` : x.type === 'supplier' ? `supplier:${escapeHtml(x.target)}` : x.type === 'seller' ? `seller:${escapeHtml(x.target)}` : 'quality:negative-stock'}">Ouvrir les preuves</button>`); }
function openAssociation(aCode, bCode) { const x = state.analysis.baskets.associations.find(p => p.a === aCode && p.b === bCode); if (!x) return; showDrawer(`${x.nameA} + ${x.nameB}`, 'ASSOCIATION DE PANIER', `<div class="drawer-kpis"><div><span>Paniers communs</span><strong>${integer.format(x.count)}</strong></div><div><span>Fréquence</span><strong>${percent.format(x.support)}</strong></div><div><span>CA des paniers</span>${moneyPair(x.revenueHT, x.revenueTTC)}</div></div><p>Cette association apparaît dans ${percent.format(x.support)} des tickets analysés. Elle peut servir à construire une suggestion vendeur ou une mise en avant croisée.</p>`); }
function openAgeBand(label) { const band = state.analysis.demographics.ageBands.find(x => x.label === label); if (!band) return; const ranges = { 'Moins de 25 ans': [0, 24], '25–34 ans': [25, 34], '35–44 ans': [35, 44], '45–54 ans': [45, 54], '55–64 ans': [55, 64], '65 ans et plus': [65, 200] }; const r = ranges[label]; const customers = label === 'Âge inconnu' ? state.analysis.customers.filter(c => !Number.isFinite(c.age)) : state.analysis.customers.filter(c => Number.isFinite(c.age) && c.age >= r[0] && c.age <= r[1]); showDrawer(label, 'SEGMENT DÉMOGRAPHIQUE', `<div class="drawer-kpis"><div><span>Clients</span><strong>${band.customers}</strong></div><div><span>Actifs période</span><strong>${band.activeCustomers}</strong></div><div><span>CA</span>${moneyPair(band.revenueHT, band.revenueTTC)}</div><div><span>Panier moyen TTC</span><strong>${euro.format(band.averageBasketTTC)}</strong></div></div>${dataTable(['Client','Ville','Statut','CA TTC historique'], customers.slice(0, 100).map(c => ({ attrs: `data-drill="customer:${escapeHtml(c.name)}"`, cells: [c.name, c.city || 'Inconnue', badge(c.status), euro.format(c.lifetimeRevenueTTC)] })))}`); }
function openCity(city) { const customers = state.analysis.customers.filter(c => c.city === city); showDrawer(city, 'ZONE DE CHALANDISE', dataTable(['Client','Âge','Statut','Visites','CA TTC historique','CA HT historique'], customers.map(c => ({ attrs: `data-drill="customer:${escapeHtml(c.name)}"`, cells: [c.name, Number.isFinite(c.age) ? c.age : 'Inconnu', badge(c.status), c.visits, euro.format(c.lifetimeRevenueTTC), euro.format(c.lifetimeRevenueHT)] })))); }
function openInsight(type, target) { if (type === 'products') return openProductList(target); if (type === 'customers') return target === 'non-returned' ? openCustomerList('Clients non revenus', state.analysis.customerFlow.nonReturned) : openCustomerList('Clients à surveiller', state.analysis.customers.filter(c => ['À risque', 'Probablement perdu', 'Premier achat sans retour', 'En retard'].includes(c.status))); if (type === 'driver') return openDriver(target === 'revenue' ? 'family' : 'basket'); if (type === 'suppliers') return showDrawer('Fournisseurs sous 95 %', 'RISQUE FOURNISSEUR', dataTable(['Fournisseur','Taux de réception','Commandes','Partielles'], state.analysis.suppliers.filter(s => s.orders >= 3 && s.serviceRate < .95).map(s => ({ attrs: `data-drill="supplier:${escapeHtml(s.supplier)}"`, cells: [s.supplier, percent.format(s.serviceRate), s.orders, s.partial] })))); }
function openQuality(key) { const issue = state.analysis.quality.issues.find(i => i.key === key); showDrawer(issue?.label || 'Qualité des données', 'CONTRÔLE DES DONNÉES', `<div class="drawer-status">${badge(issue?.severity || 'Information')}<p>${escapeHtml(issue?.detail || '')}</p></div><p>${integer.format(issue?.count || 0)} élément(s) concerné(s). Les analyses dépendantes affichent un niveau de confiance adapté.</p>`); }

async function init() {
  showLoader('Initialisation de ANALYSIS…'); state.project = await loadProject();
  if (new URLSearchParams(location.search).get('demo') === '1' && !(state.project.events?.sales?.length)) { state.project = createDemoProject(); await saveProject(state.project); }
  recalculate({ preservePeriod: false }); bindGlobalEvents(); render(); hideLoader();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(console.warn);
}

init().catch(error => { console.error(error); hideLoader(); $('#content').innerHTML = `<div class="fatal"><h1>ANALYSIS n’a pas pu démarrer</h1><p>${escapeHtml(error.message)}</p></div>`; });
