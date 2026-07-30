import { activeData, mergeImport, readWorkbookFile, removeImport } from './core/importer.js';
import { buildAnalysis, answerQuestion } from './core/analytics.js';
import { createDemoProject } from './core/demo.js';
import { emptyProject, loadProject, resetProject, saveProject } from './core/storage.js';
import { clamp, colorForStatus, dateFmt, decimal, downloadBlob, escapeHtml, euro, formatDelta, integer, isoDate, normalizeText, percent, safeDiv, sum } from './core/utils.js';

const state = { project: null, data: null, analysis: null, view: 'dashboard', filters: { start: '', end: '' }, productFilter: 'all', search: '', tablePage: 0 };
const $ = selector => document.querySelector(selector); const $$ = selector => [...document.querySelectorAll(selector)];

function icon(name, size = 18) {
  const paths = {
    dashboard: '<path d="M4 4h6v6H4zM14 4h6v10h-6zM4 14h6v6H4zM14 18h6v2h-6z"/>',
    sales: '<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>', stock: '<path d="M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/>',
    customers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    baskets: '<path d="M3 9h18l-2 10H5zM8 9l4-6 4 6M8 13v2m4-2v2m4-2v2"/>', sellers: '<path d="M3 21v-4a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>',
    suppliers: '<path d="M3 6h12v12H3zM15 10h4l2 3v5h-6zM7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    actions: '<path d="M12 3a6 6 0 0 0-3 11.2V17h6v-2.8A6 6 0 0 0 12 3zM9 21h6M9 17h6"/>', explorer: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6m-3-3h6"/>',
    import: '<path d="M12 3v12m0-12-4 4m4-4 4 4M4 15v5h16v-5"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>'
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.dashboard}</svg>`;
}

function latestDataDate() { return state.analysis?.meta?.salesExtent?.max || null; }
function dataReady() { return state.data?.sales?.length > 0; }
function toast(message, type = 'success') { const el = $('#toast'); el.textContent = message; el.className = `toast show ${type}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3500); }
function showLoader(label = 'Analyse des données…') { $('#loaderText').textContent = label; $('#loader').classList.add('show'); }
function hideLoader() { $('#loader').classList.remove('show'); }

function defaultPeriod() {
  const extent = state.analysis?.meta?.salesExtent;
  if (!extent?.max) return;
  const end = new Date(extent.max); const start = new Date(end); start.setDate(start.getDate() - 89);
  state.filters.start = isoDate(start); state.filters.end = isoDate(end);
}

function recalculate({ preservePeriod = true } = {}) {
  state.data = activeData(state.project);
  const provisional = buildAnalysis(state.data, {}, state.project.settings);
  if ((!preservePeriod || !state.filters.end) && provisional.meta.salesExtent.max) {
    const end = provisional.meta.salesExtent.max; const start = new Date(end); start.setDate(start.getDate() - 89);
    state.filters = { start: isoDate(start), end: isoDate(end) };
  }
  state.analysis = buildAnalysis(state.data, state.filters, state.project.settings);
}

function renderShell() {
  const menu = [
    ['dashboard', 'Cockpit', 'dashboard'], ['sales', 'Ventes & saisonnalité', 'sales'], ['stock', 'Stock & produits', 'stock'], ['customers', 'Clients & revisite', 'customers'],
    ['baskets', 'Paniers & associations', 'baskets'], ['sellers', 'Vendeurs', 'sellers'], ['suppliers', 'Achats & fournisseurs', 'suppliers'], ['actions', 'Plans d’action', 'actions'],
    ['explorer', 'Analysis Intelligence', 'explorer'], ['imports', 'Imports & qualité', 'import']
  ];
  $('#nav').innerHTML = menu.map(([id, label, ico]) => `<button class="nav-item ${state.view === id ? 'active' : ''}" data-view="${id}">${icon(ico)}<span>${label}</span>${id === 'actions' && state.analysis?.actions?.length ? `<em>${state.analysis.actions.length}</em>` : ''}</button>`).join('');
  $$('.nav-item').forEach(btn => btn.onclick = () => { state.view = btn.dataset.view; state.tablePage = 0; render(); if (window.innerWidth < 900) document.body.classList.remove('menu-open'); });
  $('#storeName').textContent = state.project.settings.storeName || 'Mon magasin';
  $('#syncStatus').textContent = dataReady() ? `${integer.format(state.data.sales.length)} lignes analysées` : 'Aucune donnée importée';
  $('#periodStart').value = state.filters.start; $('#periodEnd').value = state.filters.end;
}

function score() {
  if (!state.analysis) return 0; const a = state.analysis; const stockRisk = safeDiv(a.stockSummary.dormantValue, a.stockSummary.value || 1); const trend = (a.comparison?.revenueDelta || 0) * 20 + (a.comparison?.marginDelta || 0) * 25;
  return clamp(Math.round(55 + a.quality.score * .32 + trend - stockRisk * 22 - a.stockSummary.stockoutCount * .8), 0, 100);
}

function metricCard(label, value, note, delta = null, tone = '') {
  return `<article class="metric-card ${tone}"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${value}</div><div class="metric-foot">${delta == null ? '' : `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${formatDelta(delta)}</span>`}<span>${escapeHtml(note || '')}</span></div></article>`;
}

function lineChart(points, valueKey = 'revenue', height = 260) {
  if (!points?.length) return emptyState('Pas de données sur cette période.');
  const width = 900, padX = 34, padY = 24; const values = points.map(p => p[valueKey]); const min = Math.min(0, ...values), max = Math.max(...values, 1); const x = i => padX + i * ((width - padX * 2) / Math.max(1, points.length - 1)); const y = v => height - padY - ((v - min) / Math.max(1, max - min)) * (height - padY * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[valueKey]).toFixed(1)}`).join(' '); const area = `${path} L${x(points.length - 1)},${height - padY} L${x(0)},${height - padY} Z`;
  const ticks = [0, .25, .5, .75, 1].map(r => min + (max - min) * r);
  return `<div class="svg-chart"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Évolution"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cyan)" stop-opacity=".28"/><stop offset="1" stop-color="var(--cyan)" stop-opacity="0"/></linearGradient></defs>${ticks.map(v => `<line x1="${padX}" y1="${y(v)}" x2="${width - padX}" y2="${y(v)}" class="grid-line"/><text x="${padX}" y="${y(v)-5}" class="axis-label">${Math.round(v / 1000)}k</text>`).join('')}<path d="${area}" fill="url(#areaGradient)"/><path d="${path}" class="line-path"/>${points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0 || i === points.length - 1).map((p, i, arr) => { const originalIndex = points.indexOf(p); return `<circle cx="${x(originalIndex)}" cy="${y(p[valueKey])}" r="4" class="chart-point"><title>${p.date} : ${euro.format(p[valueKey])}</title></circle><text x="${x(originalIndex)}" y="${height - 5}" text-anchor="middle" class="axis-label">${p.date.slice(5)}</text>`; }).join('')}</svg></div>`;
}

function barList(rows, valueKey, formatter = euro.format, limit = 8) {
  const selected = rows.slice(0, limit); const max = Math.max(...selected.map(r => Math.abs(r[valueKey])), 1);
  return `<div class="bar-list">${selected.map((row, i) => `<div class="bar-row"><div class="bar-rank">${String(i + 1).padStart(2, '0')}</div><div class="bar-main"><div class="bar-copy"><strong>${escapeHtml(row.name || row.label || row.seller || row.supplier || row.reason)}</strong><span>${formatter(row[valueKey])}</span></div><div class="bar-track"><i style="width:${Math.max(2, Math.abs(row[valueKey]) / max * 100)}%"></i></div></div></div>`).join('')}</div>`;
}

function donut(segments, totalLabel) {
  const total = sum(segments.map(s => Math.max(0, s.value))) || 1; let offset = 0;
  const circles = segments.map((s, i) => { const pct = s.value / total; const dash = `${pct * 100} ${100 - pct * 100}`; const html = `<circle cx="60" cy="60" r="45" pathLength="100" stroke="var(--chart-${i + 1})" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"/>`; offset += pct * 100; return html; }).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 120 120" class="donut"><circle cx="60" cy="60" r="45" class="donut-bg"/>${circles}</svg><div class="donut-center"><strong>${integer.format(total)}</strong><span>${escapeHtml(totalLabel)}</span></div><div class="donut-legend">${segments.map((s, i) => `<span><i style="background:var(--chart-${i + 1})"></i>${escapeHtml(s.label)} <b>${integer.format(s.value)}</b></span>`).join('')}</div></div>`;
}

function emptyState(text) { return `<div class="empty-state"><span>◌</span><p>${escapeHtml(text)}</p></div>`; }
function sectionHeader(title, subtitle, action = '') { return `<div class="section-header"><div><p class="eyebrow">ANALYSIS ENGINE</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>${action}</div>`; }
function badge(label) { return `<span class="badge ${colorForStatus(label)}">${escapeHtml(label)}</span>`; }

function dashboardView() {
  const a = state.analysis, s = score(); const delta = a.comparison || {};
  return `<div class="view-page dashboard-view">
    <section class="hero-command"><div class="hero-copy"><p class="eyebrow">RETAIL PERFORMANCE INTELLIGENCE</p><h1>Votre commerce, compris à <span>360°.</span></h1><p>ANALYSIS croise les ventes, les paniers, les clients, le stock et les achats pour transformer chaque donnée en décision exploitable.</p><div class="hero-actions"><button class="btn primary" data-go="actions">Voir les priorités</button><button class="btn secondary" id="quickImport">Importer des données</button></div></div><div class="performance-core"><div class="score-ring" style="--score:${s}"><div><strong>${s}</strong><span>/100</span></div></div><p>Indice de maîtrise</p><small>${s >= 80 ? 'Performance forte, optimisations ciblées' : s >= 60 ? 'Base solide, leviers importants détectés' : 'Plusieurs risques prioritaires à traiter'}</small></div></section>
    <section class="metric-grid">${metricCard('Chiffre d’affaires', euro.format(a.kpis.revenueTTC), `${integer.format(a.kpis.tickets)} ventes`, delta.revenueDelta)}${metricCard('Marge HT', euro.format(a.kpis.marginHT), `${percent.format(a.kpis.markupRate)} de taux de marque`, delta.marginDelta)}${metricCard('Panier moyen', euro.format(a.kpis.averageBasket), `${decimal.format(a.kpis.itemsPerTicket)} articles / vente`, delta.basketDelta)}${metricCard('Valeur du stock', euro.format(a.stockSummary.value), `${euro.format(a.stockSummary.dormantValue)} dormant`, null, a.stockSummary.dormantValue > a.stockSummary.value * .2 ? 'warn' : '')}</section>
    <section class="command-grid"><article class="panel trend-panel"><div class="panel-head"><div><span>Trajectoire</span><h3>Chiffre d’affaires quotidien</h3></div><span class="confidence">${a.meta.periodDays} jours</span></div>${lineChart(a.daily)}</article>
    <article class="panel insight-panel"><div class="panel-head"><div><span>Lecture automatique</span><h3>Ce qu’il faut retenir</h3></div></div><div class="insight-stack"><div class="insight positive"><i>↗</i><div><strong>Points forts</strong>${a.insights.positives.map(x => `<p>${escapeHtml(x)}</p>`).join('')}</div></div><div class="insight risk"><i>!</i><div><strong>Points de vigilance</strong>${a.insights.risks.map(x => `<p>${escapeHtml(x)}</p>`).join('')}</div></div></div></article></section>
    <section class="dashboard-lower"><article class="panel"><div class="panel-head"><div><span>Contribution</span><h3>Rayons moteurs</h3></div><button class="link-btn" data-go="sales">Tout analyser →</button></div>${barList(a.departments, 'revenue')}</article>
    <article class="panel"><div class="panel-head"><div><span>Décisions</span><h3>Actions prioritaires</h3></div><button class="link-btn" data-go="actions">Plan complet →</button></div><div class="action-mini-list">${a.actions.slice(0, 5).map((x, i) => `<button class="action-mini"><span>${String(i + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.reason)}</small></div>${badge(x.priority)}</button>`).join('') || emptyState('Aucune action prioritaire.')}</div></article>
    <article class="panel quality-panel"><div class="panel-head"><div><span>Fiabilité</span><h3>Qualité des données</h3></div><strong class="quality-score">${a.quality.score}/100</strong></div><div class="quality-meter"><i style="width:${a.quality.score}%"></i></div>${a.quality.issues.filter(i => i.count).slice(0, 4).map(i => `<div class="quality-line"><span>${escapeHtml(i.label)}</span><b>${integer.format(i.count)}</b></div>`).join('')}</article></section>
  </div>`;
}

function salesView() {
  const a = state.analysis; const maxHour = Math.max(...a.baskets.hours.map(x => x.revenue), 1); const maxDay = Math.max(...a.baskets.weekdays.map(x => x.revenue), 1);
  return `<div class="view-page">${sectionHeader('Ventes & saisonnalité', 'Comprendre précisément ce qui fait évoluer le chiffre d’affaires, la marge, les tickets et le panier.')}
  <section class="metric-grid compact">${metricCard('CA TTC', euro.format(a.kpis.revenueTTC), 'Période sélectionnée', a.comparison?.revenueDelta)}${metricCard('Marge HT', euro.format(a.kpis.marginHT), `${percent.format(a.kpis.markupRate)} du CA HT`, a.comparison?.marginDelta)}${metricCard('Tickets', integer.format(a.kpis.tickets), `${integer.format(a.kpis.customers)} clients identifiés`, a.comparison?.ticketDelta)}${metricCard('Remises estimées', euro.format(a.kpis.discountValue), `${integer.format(a.kpis.freeUnits)} unités offertes`)}</section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Évolution</span><h3>CA et tendance</h3></div></div>${lineChart(a.daily)}</article><article class="panel"><div class="panel-head"><div><span>Rythme magasin</span><h3>Performance horaire</h3></div></div><div class="hour-bars">${a.baskets.hours.map(h => `<div><span>${h.hour}h</span><i style="height:${Math.max(3, h.revenue / maxHour * 100)}%"><b>${integer.format(h.tickets)}</b></i></div>`).join('')}</div></article></section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Saisonnalité hebdomadaire</span><h3>Contribution par jour</h3></div></div><div class="weekday-grid">${a.baskets.weekdays.map(d => `<div style="--power:${Math.max(.08, d.revenue / maxDay)}"><strong>${d.day.slice(0, 3)}</strong><span>${euro.format(d.revenue)}</span><small>${d.tickets} tickets</small></div>`).join('')}</div></article><article class="panel"><div class="panel-head"><div><span>Mix commercial</span><h3>Familles principales</h3></div></div>${barList(a.families, 'margin', euro.format, 7)}</article></section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Lecture détaillée</span><h3>Performance par rayon</h3></div></div>${dataTable(['Rayon','CA TTC','Marge HT','Taux de marque','Quantité','Tickets'], a.departments.map(r => [r.name, euro.format(r.revenue), euro.format(r.margin), percent.format(r.markupRate), integer.format(r.quantity), integer.format(r.tickets)]))}</article></div>`;
}

function filteredProducts() {
  let rows = state.analysis.products;
  if (state.productFilter !== 'all') rows = rows.filter(p => normalizeText(p.status).includes(normalizeText(state.productFilter)));
  if (state.search) rows = rows.filter(p => normalizeText(`${p.name} ${p.code} ${p.family} ${p.supplier}`).includes(normalizeText(state.search)));
  return rows;
}

function stockView() {
  const a = state.analysis; const rows = filteredProducts();
  const statuses = [{ label: 'Sains / stars', value: a.products.filter(p => ['Sain','Star','Produit trafic','Marge à exploiter'].includes(p.status)).length }, { label: 'Dormants', value: a.products.filter(p => /Dormant|Stock mort/.test(p.status)).length }, { label: 'Ruptures', value: a.products.filter(p => /Rupture|Réassort/.test(p.status)).length }, { label: 'Surstocks', value: a.products.filter(p => p.status === 'Surstock').length }];
  return `<div class="view-page">${sectionHeader('Stock & intelligence produit', 'Rotation, marge, couverture, dormance, âge estimé, classification ABC/XYZ et capital immobilisé.')}
  <section class="metric-grid compact">${metricCard('Valeur achat', euro.format(a.stockSummary.value), `${integer.format(a.stockSummary.units)} unités`)}${metricCard('Valeur commerciale TTC', euro.format(a.stockSummary.marketValueTTC), `${euro.format(a.stockSummary.potentialMarginHT)} marge théorique HT`)}${metricCard('Stock dormant', euro.format(a.stockSummary.dormantValue), `${percent.format(safeDiv(a.stockSummary.dormantValue, a.stockSummary.value))} du capital`, null, 'warn')}${metricCard('Ruptures actives', integer.format(a.stockSummary.stockoutCount), `${a.stockSummary.negative} stock(s) négatif(s)`, null, a.stockSummary.stockoutCount ? 'danger' : '')}</section>
  <section class="two-col stock-overview"><article class="panel">${donut(statuses, 'références')}</article><article class="panel"><div class="panel-head"><div><span>Capital à libérer</span><h3>Stocks dormants prioritaires</h3></div></div>${barList(a.products.filter(p => /Dormant|Stock mort/.test(p.status)).sort((x,y)=>y.stockValue-x.stockValue), 'stockValue', euro.format, 7)}</article></section>
  <article class="panel table-panel"><div class="table-toolbar"><div><span>Catalogue analytique</span><h3>${integer.format(rows.length)} références</h3></div><div class="toolbar-actions"><select id="productStatus"><option value="all">Tous les statuts</option>${['Star','Rupture','Réassort','Dormant','Stock mort','Surstock','Marge à exploiter','Stock négatif'].map(x => `<option ${state.productFilter===x?'selected':''}>${x}</option>`).join('')}</select><input id="productSearch" value="${escapeHtml(state.search)}" placeholder="Produit, code, famille…"></div></div>${productTable(rows)}</article></div>`;
}

function productTable(rows) {
  const pageSize = 25, start = state.tablePage * pageSize, page = rows.slice(start, start + pageSize);
  return `${dataTable(['Produit','Statut','ABC/XYZ','Stock','Valeur','Ventes','Marge','Couverture','Dernière vente'], page.map(p => [`<div class="cell-main"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.code)} · ${escapeHtml(p.family || p.department)}</small></div>`, badge(p.status), `<b>${p.abc}${p.xyz}</b>`, integer.format(p.stock), euro.format(p.stockValue), `${integer.format(p.positiveQty)} u.`, euro.format(p.margin), p.coverageDays === Infinity ? '∞' : `${decimal.format(p.coverageDays)} j`, p.lastSale ? dateFmt.format(p.lastSale) : 'Jamais observée']))}<div class="pagination"><button data-page="${Math.max(0,state.tablePage-1)}" ${state.tablePage===0?'disabled':''}>← Précédent</button><span>Page ${state.tablePage+1} / ${Math.max(1,Math.ceil(rows.length/pageSize))}</span><button data-page="${state.tablePage+1}" ${start+pageSize>=rows.length?'disabled':''}>Suivant →</button></div>`;
}

function customersView() {
  const a = state.analysis; const atRisk = a.customers.filter(c => ['À risque','Perdu','En retard'].includes(c.status));
  return `<div class="view-page">${sectionHeader('Clients & revisite', 'Mesurer la fidélisation réelle, comprendre les habitudes et détecter chaque client en retard avant de le perdre.')}
  <section class="metric-grid compact">${metricCard('Clients observés', integer.format(a.customers.length), `${integer.format(a.kpis.customers)} actifs sur la période`)}${metricCard('Tickets identifiés', percent.format(a.kpis.identifiedRate), 'Fiabilité des analyses clients')}${metricCard('Clients à risque', integer.format(atRisk.length), `${euro.format(sum(atRisk.map(c=>c.lifetimeRevenue)))} de valeur observée`, null, 'warn')}${metricCard('Panier client moyen', euro.format(meanValue(a.customers,'averageBasket')), 'Clients identifiés')}</section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Fidélisation</span><h3>Taux de revisite par horizon</h3></div></div><div class="revisit-bars">${a.revisit.map(r => `<div><div><strong>${r.days} jours</strong><span>${r.eligible} clients éligibles</span></div><div class="progress"><i style="width:${r.rate*100}%"></i><b>${percent.format(r.rate)}</b></div></div>`).join('')}</div></article><article class="panel"><div class="panel-head"><div><span>Risque commercial</span><h3>Clients prioritaires à réactiver</h3></div></div>${barList(atRisk.sort((x,y)=>y.lifetimeRevenue-x.lifetimeRevenue).map(c=>({name:c.name,value:c.lifetimeRevenue})), 'value', euro.format, 7)}</article></section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Portefeuille client</span><h3>Lecture individuelle</h3></div></div>${dataTable(['Client','Statut','Visites','CA observé','Panier','Rythme','Dernière visite','Produit favori'], a.customers.slice().sort((x,y)=>y.lifetimeRevenue-x.lifetimeRevenue).slice(0,100).map(c => [`<div class="cell-main"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.city || 'Ville inconnue')} · RFM ${c.rfm}</small></div>`, badge(c.status), integer.format(c.visits), euro.format(c.lifetimeRevenue), euro.format(c.averageBasket), c.avgGap ? `${decimal.format(c.avgGap)} j` : 'À établir', `${integer.format(c.recency)} j`, escapeHtml(c.favoriteProduct)]))}</article>
  <article class="panel table-panel"><div class="panel-head"><div><span>Cohortes</span><h3>Fidélisation des nouveaux clients</h3></div></div>${dataTable(['Mois de 1re visite','Clients','CA cumulé','Marge','Retour 30 j','Retour 60 j','Retour 90 j'], a.cohorts.map(c=>[c.cohort,integer.format(c.customers),euro.format(c.revenue),euro.format(c.margin),c.eligible30?percent.format(c.rate30):'Non éligible',c.eligible60?percent.format(c.rate60):'Non éligible',c.eligible90?percent.format(c.rate90):'Non éligible']))}</article></div>`;
}

function basketsView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Paniers & associations', 'Identifier ce qui est acheté ensemble, les compléments naturels et les ventes additionnelles manquées.')}
  <section class="metric-grid compact">${metricCard('Panier moyen', euro.format(a.kpis.averageBasket), `Médiane ${euro.format(a.kpis.medianBasket)}`)}${metricCard('Articles / ticket', decimal.format(a.kpis.itemsPerTicket), `${integer.format(a.kpis.items)} unités nettes`)}${metricCard('Marge / ticket', euro.format(a.kpis.marginPerTicket), `${percent.format(a.kpis.markupRate)} de taux de marque`)}${metricCard('Produits offerts', integer.format(a.kpis.freeUnits), `${euro.format(a.kpis.discountValue)} de remises estimées`)}</section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Market basket</span><h3>Associations les plus fréquentes</h3></div></div><div class="association-list">${a.baskets.associations.slice(0,12).map((p,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><div><strong>${escapeHtml(p.nameA)}</strong><i>+</i><strong>${escapeHtml(p.nameB)}</strong><small>${p.count} paniers · support ${percent.format(p.support)}</small></div></div>`).join('') || emptyState('Pas assez de paniers multi-produits.')}</div></article><article class="panel"><div class="panel-head"><div><span>Structure</span><h3>Répartition des paniers</h3></div></div>${donut([{label:'1 famille',value:a.kpis.ticketsList.filter(t=>t.families.size<=1).length},{label:'2 familles',value:a.kpis.ticketsList.filter(t=>t.families.size===2).length},{label:'3+ familles',value:a.kpis.ticketsList.filter(t=>t.families.size>=3).length}], 'paniers')}</article></section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Opportunités</span><h3>Associations à exploiter</h3></div></div>${dataTable(['Produit A','Produit B','Paniers communs','Fréquence','CA des paniers'], a.baskets.associations.slice(0,50).map(p=>[escapeHtml(p.nameA),escapeHtml(p.nameB),integer.format(p.count),percent.format(p.support),euro.format(p.revenue)]))}</article></div>`;
}

function sellersView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Performance vendeurs', 'Comparer équitablement les résultats observés, le panier, la marge, l’identification client et les ventes complémentaires.')}
  <section class="seller-cards">${a.sellers.map(s=>`<article class="seller-card"><div class="seller-top"><div class="seller-avatar">${escapeHtml(s.seller.slice(0,2))}</div><div><strong>${escapeHtml(s.seller)}</strong><span>Score ${Math.round(s.score)}/100</span></div></div><div class="seller-value">${euro.format(s.margin)}<span>marge HT</span></div><div class="seller-stats"><div><b>${euro.format(s.averageBasket)}</b><span>Panier</span></div><div><b>${decimal.format(s.itemsPerTicket)}</b><span>Articles</span></div><div><b>${percent.format(s.multiFamilyRate)}</b><span>Multi-familles</span></div><div><b>${percent.format(s.identifiedRate)}</b><span>Identifiés</span></div></div>${s.potential>20?`<div class="seller-opportunity">Potentiel vente complémentaire détecté</div>`:''}</article>`).join('') || emptyState('Aucun vendeur détecté.')}</section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Comparaison</span><h3>Scorecard de l’équipe</h3></div></div>${dataTable(['Vendeur','CA TTC','Marge HT','Tickets','Panier','Articles/ticket','Multi-familles','Remises estimées','Retours'], a.sellers.map(s=>[escapeHtml(s.seller),euro.format(s.revenue),euro.format(s.margin),integer.format(s.tickets),euro.format(s.averageBasket),decimal.format(s.itemsPerTicket),percent.format(s.multiFamilyRate),euro.format(s.discountValue),integer.format(s.returns)]))}</article>
  <div class="method-note"><strong>Lecture responsable</strong><p>Sans import de planning, ANALYSIS compare les ventes observées mais ne prétend pas calculer le CA par heure travaillée. L’ajout d’un planning permettra de neutraliser les différences de présence et de créneau.</p></div></div>`;
}

function suppliersView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Achats & fournisseurs', 'Mesurer le taux de service, la valeur achetée, les commandes partielles et la rentabilité générée.')}
  <section class="metric-grid compact">${metricCard('Achats reçus', euro.format(sum(a.suppliers.map(s=>s.purchaseSpend))), `${integer.format(sum(a.suppliers.map(s=>s.orders)))} commandes`)}${metricCard('Taux de réception', percent.format(safeDiv(sum(a.suppliers.map(s=>s.received)),sum(a.suppliers.map(s=>s.ordered)))), 'Quantités reçues / commandées')}${metricCard('Commandes partielles', integer.format(sum(a.suppliers.map(s=>s.partial))), 'À sécuriser')}${metricCard('Impact mouvements', euro.format(sum(a.movements.map(m=>m.impact))), `${integer.format(a.movements.length)} motifs analysés`)}</section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Fiabilité</span><h3>Taux de service fournisseur</h3></div></div><div class="supplier-service">${a.suppliers.map(s=>`<div><div><strong>${escapeHtml(s.supplier)}</strong><span>${s.orders} commandes</span></div><div class="progress"><i style="width:${Math.min(100,s.serviceRate*100)}%"></i><b>${percent.format(s.serviceRate)}</b></div></div>`).join('')}</div></article><article class="panel"><div class="panel-head"><div><span>Mouvements</span><h3>Pertes, ajustements et consommations</h3></div></div>${barList(a.movements.map(m=>({...m,name:m.reason,value:Math.abs(m.impact)})), 'value', euro.format, 8)}</article></section>
  <article class="panel table-panel"><div class="panel-head"><div><span>Scorecard fournisseur</span><h3>Commandes et rentabilité</h3></div></div>${dataTable(['Fournisseur','Commandes','Acheté','Commandé','Reçu','Service','Partielles','Délai validation','Marge générée','Stock associé'], a.suppliers.map(s=>[escapeHtml(s.supplier),integer.format(s.orders),euro.format(s.purchaseSpend),integer.format(s.ordered),integer.format(s.received),badge(percent.format(s.serviceRate)),integer.format(s.partial),`${decimal.format(s.avgValidationDays)} j`,euro.format(s.salesMargin),euro.format(s.stockValue)]))}</article></div>`;
}

function actionsView() {
  const a = state.analysis; const totalImpact = sum(a.actions.map(x=>x.impact));
  return `<div class="view-page">${sectionHeader('Plans d’action', 'Les décisions sont classées par urgence, impact économique estimé, facilité et niveau de confiance.')}
  <section class="action-hero"><div><p>Potentiel détecté</p><strong>${euro.format(totalImpact)}</strong><span>Impact indicatif cumulé des actions proposées</span></div><div><p>Actions prioritaires</p><strong>${a.actions.length}</strong><span>${a.actions.filter(x=>x.priority==='Critique').length} critique(s)</span></div><div><p>Confiance moyenne</p><strong>${percent.format(meanValue(a.actions,'confidence'))}</strong><span>Basée sur la complétude des données</span></div></section>
  <section class="action-board">${a.actions.map((x,i)=>`<article class="action-card"><div class="action-index">${String(i+1).padStart(2,'0')}</div><div class="action-body"><div class="action-heading"><div>${badge(x.priority)}<span class="action-type">${escapeHtml(x.type)}</span></div><strong>${x.impact?euro.format(x.impact):'Qualité'}</strong></div><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.reason)}</p><div class="action-meta"><span>Confiance ${percent.format(x.confidence)}</span><button class="btn micro">Marquer comme traitée</button></div></div></article>`).join('') || emptyState('Aucune action détectée.')}</section></div>`;
}

function explorerView() {
  return `<div class="view-page intelligence-page">${sectionHeader('Analysis Intelligence', 'Posez une question métier. Le moteur répond à partir des calculs vérifiables, sans inventer de chiffres.')}
  <section class="ask-panel"><div class="ai-orb"><span>A</span></div><div class="ask-copy"><p>Interrogez votre commerce</p><h2>Que voulez-vous comprendre ?</h2><form id="askForm"><input id="askInput" placeholder="Ex. Quels produits à forte marge dorment en stock ?"><button class="btn primary">Analyser</button></form><div class="question-chips">${['Quels produits génèrent le plus de marge ?','Quels clients risquent de ne plus revenir ?','Que dois-je recommander ?','Quel vendeur a le plus de potentiel ?','Quels fournisseurs sont les moins fiables ?'].map(q=>`<button data-question="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}</div></div></section>
  <section id="answerPanel" class="answer-panel"><div class="answer-placeholder"><span>ANALYSIS</span><p>Les réponses apparaîtront ici avec les données justificatives.</p></div></section>
  <section class="explorer-grid"><article class="panel"><div class="panel-head"><div><span>Requêtes prêtes</span><h3>Décisions fréquentes</h3></div></div><button class="query-card" data-question="Quels produits dorment et immobilisent le plus d'argent ?"><strong>Capital immobilisé</strong><span>Trouver les produits dormants qui coûtent le plus cher.</span></button><button class="query-card" data-question="Quels clients risquent de ne plus revenir ?"><strong>Attrition client</strong><span>Prioriser les clients à réactiver selon leur valeur.</span></button><button class="query-card" data-question="Quels produits dois-je recommander ?"><strong>Réassort</strong><span>Identifier ruptures et couvertures critiques.</span></button></article><article class="panel"><div class="panel-head"><div><span>Transparence</span><h3>Calculs explicables</h3></div></div><div class="explain-list"><p><b>Chiffres déterministes</b> Les montants viennent des exports importés.</p><p><b>Estimations signalées</b> L’âge FIFO, les ventes perdues et les potentiels sont indiqués comme estimations.</p><p><b>Niveau de confiance</b> Chaque recommandation tient compte de la qualité et de la profondeur historique.</p><p><b>Aucune donnée envoyée</b> Les analyses sont calculées dans le navigateur.</p></div></article></section></div>`;
}

function importsView() {
  const a = state.analysis;
  return `<div class="view-page">${sectionHeader('Imports & qualité des données', 'Déposez n’importe quelle période. ANALYSIS détecte le format, les chevauchements, les doublons et conserve la traçabilité.')}
  <section class="import-zone" id="dropZone"><div class="import-icon">${icon('import',28)}</div><h3>Déposez vos exports Excel ici</h3><p>Catalogue, stock, valorisation, clients, Ventes(2), mouvements et réceptions fournisseurs.</p><button class="btn primary" id="browseFiles">Choisir les fichiers</button><input type="file" id="fileInput" multiple accept=".xlsx,.xls,.csv" hidden><small>Ventes(1) est automatiquement rejeté au profit de Ventes(2).</small></section>
  <section class="two-col"><article class="panel"><div class="panel-head"><div><span>Fiabilité globale</span><h3>Score qualité ${a.quality.score}/100</h3></div></div><div class="quality-meter large"><i style="width:${a.quality.score}%"></i></div><div class="issue-list">${a.quality.issues.map(i=>`<div><span class="severity ${i.severity}"></span><div><strong>${escapeHtml(i.label)}</strong><small>${escapeHtml(i.detail)}</small></div><b>${integer.format(i.count)}</b></div>`).join('')}</div></article><article class="panel"><div class="panel-head"><div><span>Couverture</span><h3>Données disponibles</h3></div></div><div class="coverage-grid">${Object.entries(a.quality.counts).map(([k,v])=>`<div><span>${({products:'Produits',sales:'Lignes de ventes',clients:'Clients',receipts:'Réceptions',movements:'Mouvements'})[k]}</span><strong>${integer.format(v)}</strong></div>`).join('')}</div><div class="backup-actions"><button class="btn secondary full" id="exportProject">Exporter la sauvegarde JSON</button><button class="btn secondary full" id="restoreProject">Restaurer une sauvegarde</button><input type="file" id="restoreInput" accept=".json" hidden></div></article></section>
  <article class="panel settings-panel"><div class="panel-head"><div><span>Paramètres métier</span><h3>Règles d'analyse</h3></div></div><div class="settings-grid"><label>Nom du magasin<input id="settingStore" value="${escapeHtml(state.project.settings.storeName || '')}"></label><label>Couverture cible (jours)<input id="settingCoverage" type="number" min="1" max="180" value="${state.project.settings.targetCoverageDays || 28}"></label><label>Dormance (jours)<input id="settingDormant" type="number" min="7" max="365" value="${state.project.settings.dormantDays || 45}"></label><label>Dormance critique (jours)<input id="settingCritical" type="number" min="30" max="730" value="${state.project.settings.criticalDormantDays || 90}"></label></div><button class="btn primary" id="saveSettings">Enregistrer les règles</button></article>
  <article class="panel table-panel"><div class="panel-head"><div><span>Traçabilité</span><h3>Historique des imports</h3></div></div>${dataTable(['Fichier','Type','Statut','Lignes','Ajoutées','Ignorées','Période','Importé le',''], state.project.imports.slice().reverse().map(i=>[escapeHtml(i.name),escapeHtml(i.type),badge(i.status),integer.format(i.rows||0),integer.format(i.added||0),integer.format(i.ignored||0),i.periodStart?`${dateFmt.format(new Date(i.periodStart))} → ${dateFmt.format(new Date(i.periodEnd))}`:'Snapshot',dateFmt.format(new Date(i.importedAt)),`<button class="icon-delete" data-delete-import="${i.id}" title="Supprimer">×</button>`]))}</article>
  <div class="danger-zone"><div><strong>Réinitialisation locale</strong><p>Supprime toutes les données importées dans ce navigateur.</p></div><button class="btn danger" id="resetData">Tout effacer</button></div></div>`;
}

function onboarding() {
  return `<div class="onboarding"><div class="onboarding-brand"><span class="brand-mark big">A</span><strong>ANALYSIS</strong><small>Retail Intelligence Engine</small></div><div class="onboarding-copy"><p class="eyebrow">PERFORMANCE, EXPLAINED.</p><h1>Le système nerveux de votre commerce.</h1><p>Importez vos exports existants. ANALYSIS les croise pour comprendre les ventes, le stock, les clients, les vendeurs et les fournisseurs — puis transforme les résultats en décisions.</p><div class="onboarding-actions"><button class="btn primary large" id="onboardImport">Importer mes fichiers</button><button class="btn secondary large" id="loadDemo">Explorer la démo</button></div><div class="privacy-line"><span>●</span> Calcul 100 % local · aucune donnée client envoyée</div></div><div class="onboarding-visual"><div class="radar-core"><span>A</span><i></i><i></i><i></i></div><div class="float-card f1"><small>Stock dormant</small><strong>Détecté</strong></div><div class="float-card f2"><small>Clients à risque</small><strong>Priorisés</strong></div><div class="float-card f3"><small>Marge</small><strong>Expliquée</strong></div></div></div>`;
}

function dataTable(headers, rows) {
  if (!rows.length) return emptyState('Aucune donnée disponible.');
  return `<div class="table-scroll"><table><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function meanValue(rows, key) { return rows.length ? sum(rows.map(r=>Number(r[key])||0))/rows.length : 0; }

function renderView() {
  if (!dataReady()) { $('#content').innerHTML = onboarding(); bindOnboarding(); return; }
  const views = { dashboard: dashboardView, sales: salesView, stock: stockView, customers: customersView, baskets: basketsView, sellers: sellersView, suppliers: suppliersView, actions: actionsView, explorer: explorerView, imports: importsView };
  $('#content').innerHTML = (views[state.view] || dashboardView)(); bindViewEvents();
}

function render() { renderShell(); renderView(); document.body.dataset.view = state.view; }

async function processFiles(files) {
  if (!files.length) return; showLoader(`Lecture de ${files.length} fichier(s)…`); let imported = 0, ignored = 0, rejected = 0;
  try {
    for (const file of files) {
      $('#loaderText').textContent = `Analyse de ${file.name}…`;
      try { const result = await readWorkbookFile(file); const merge = mergeImport(state.project, result); if (merge.status === 'imported') { imported += merge.added; ignored += merge.ignored; } else if (merge.status === 'rejected') { rejected += 1; toast(merge.warning, 'warning'); } else ignored += merge.ignored; }
      catch (error) { console.error(error); toast(`${file.name} : ${error.message}`, 'error'); }
    }
    await saveProject(state.project); recalculate({ preservePeriod: false }); state.view = 'dashboard'; render(); toast(`${integer.format(imported)} ligne(s) intégrée(s), ${integer.format(ignored)} doublon(s) ignoré(s)${rejected ? `, ${rejected} fichier(s) rejeté(s)` : ''}.`);
  } finally { hideLoader(); }
}

function openImportDialog() { $('#globalFileInput').click(); }

function bindGlobalEvents() {
  $('#menuToggle').onclick = () => document.body.classList.toggle('menu-open');
  $('#globalImport').onclick = openImportDialog; $('#globalFileInput').onchange = e => processFiles([...e.target.files]);
  $('#periodStart').onchange = e => { state.filters.start = e.target.value; recalculate(); render(); };
  $('#periodEnd').onchange = e => { state.filters.end = e.target.value; recalculate(); render(); };
  $('#periodPreset').onchange = e => {
    const days = Number(e.target.value); const end = latestDataDate(); if (!end || !days) return; const start = new Date(end); start.setDate(start.getDate() - days + 1); state.filters = { start: isoDate(start), end: isoDate(end) }; recalculate(); render();
  };
  $('#brandHome').onclick = () => { state.view = 'dashboard'; render(); };
}

function bindOnboarding() {
  $('#onboardImport').onclick = openImportDialog; $('#loadDemo').onclick = async () => { showLoader('Création de la démonstration…'); state.project = createDemoProject(); await saveProject(state.project); recalculate({ preservePeriod: false }); state.view = 'dashboard'; hideLoader(); render(); toast('Démonstration chargée.'); };
}

function bindViewEvents() {
  $$('[data-go]').forEach(btn => btn.onclick = () => { state.view = btn.dataset.go; render(); });
  $('#quickImport')?.addEventListener('click', openImportDialog);
  $('#productStatus')?.addEventListener('change', e => { state.productFilter = e.target.value; state.tablePage = 0; renderView(); });
  const productSearch = $('#productSearch');
  const applyProductSearch = () => {
    state.search = productSearch?.value || '';
    state.tablePage = 0;
    renderView();
  };
  productSearch?.addEventListener('change', applyProductSearch);
  productSearch?.addEventListener('keydown', event => {
    if (event.key === 'Enter') applyProductSearch();
  });
  $$('[data-page]').forEach(btn => btn.onclick = () => { state.tablePage = Number(btn.dataset.page); renderView(); });
  const dz = $('#dropZone'); if (dz) { $('#browseFiles').onclick = () => $('#fileInput').click(); $('#fileInput').onchange = e => processFiles([...e.target.files]); ['dragenter','dragover'].forEach(evt=>dz.addEventListener(evt,e=>{e.preventDefault();dz.classList.add('dragging');})); ['dragleave','drop'].forEach(evt=>dz.addEventListener(evt,e=>{e.preventDefault();dz.classList.remove('dragging');})); dz.addEventListener('drop', e=>processFiles([...e.dataTransfer.files])); }
  $('#exportProject')?.addEventListener('click', () => downloadBlob(JSON.stringify(state.project, null, 2), `analysis-sauvegarde-${isoDate(new Date())}.json`));
  $('#restoreProject')?.addEventListener('click', () => $('#restoreInput').click());
  $('#restoreInput')?.addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try { const restored = JSON.parse(await file.text()); if (!restored?.snapshots || !restored?.events || !restored?.settings) throw new Error('Structure de sauvegarde invalide'); state.project = restored; await saveProject(state.project); recalculate({ preservePeriod: false }); render(); toast('Sauvegarde restaurée.'); } catch (error) { toast(`Restauration impossible : ${error.message}`, 'error'); }
  });
  $('#saveSettings')?.addEventListener('click', async () => { state.project.settings.storeName = $('#settingStore').value.trim() || 'Mon magasin'; state.project.settings.targetCoverageDays = Number($('#settingCoverage').value) || 28; state.project.settings.dormantDays = Number($('#settingDormant').value) || 45; state.project.settings.criticalDormantDays = Number($('#settingCritical').value) || 90; await saveProject(state.project); recalculate(); render(); toast('Règles d’analyse enregistrées.'); });
  $('#resetData')?.addEventListener('click', async () => { if (!confirm('Supprimer toutes les données locales ANALYSIS ?')) return; await resetProject(); state.project = emptyProject(); recalculate({ preservePeriod: false }); state.view = 'dashboard'; render(); toast('Données supprimées.'); });
  $$('[data-delete-import]').forEach(btn => btn.onclick = async () => { if (!confirm('Supprimer cet import et ses données ?')) return; removeImport(state.project, btn.dataset.deleteImport); await saveProject(state.project); recalculate({ preservePeriod: false }); render(); toast('Import supprimé.'); });
  const ask = question => { const answer = answerQuestion(question, state.analysis); $('#askInput').value = question; $('#answerPanel').innerHTML = `<div class="answer-head"><span>ANALYSIS RESPONSE</span><h3>${escapeHtml(answer.title)}</h3></div>${answer.text ? `<p class="answer-text">${escapeHtml(answer.text)}</p>` : `<div class="answer-results">${answer.rows.map((r,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><div><strong>${escapeHtml(r.label)}</strong><small>${escapeHtml(r.detail)}</small></div><b>${answer.unit==='currency'?euro.format(r.value):answer.unit==='percent'?percent.format(r.value):decimal.format(r.value)}</b></div>`).join('')}</div>`}<div class="answer-proof">Calculé sur ${integer.format(state.analysis.meta.selectedLines)} lignes de ventes · période ${dateFmt.format(state.analysis.meta.start)} → ${dateFmt.format(state.analysis.meta.end)}</div>`; };
  $('#askForm')?.addEventListener('submit', e => { e.preventDefault(); const q = $('#askInput').value.trim(); if (q) ask(q); });
  $$('[data-question]').forEach(btn => btn.onclick = () => ask(btn.dataset.question));
}

async function init() {
  showLoader('Initialisation de ANALYSIS…'); state.project = await loadProject();
  if (new URLSearchParams(location.search).get('demo') === '1' && !(state.project.events?.sales?.length)) { state.project = createDemoProject(); await saveProject(state.project); }
  recalculate({ preservePeriod: false }); bindGlobalEvents(); render(); hideLoader();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(console.warn);
}

init().catch(error => { console.error(error); hideLoader(); $('#content').innerHTML = `<div class="fatal"><h1>ANALYSIS n’a pas pu démarrer</h1><p>${escapeHtml(error.message)}</p></div>`; });
