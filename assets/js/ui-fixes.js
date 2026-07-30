(() => {
  'use strict';

  const numberFormat = new Intl.NumberFormat('fr-FR');
  let refreshQueued = false;
  let observer = null;

  function ensureDrawer() {
    if (document.getElementById('drawerOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'drawerOverlay';
    overlay.className = 'drawer-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
        <header class="drawer-head">
          <p id="drawerEyebrow">ANALYSIS DETAIL</p>
          <h2 id="drawerTitle">Détail</h2>
          <button type="button" class="drawer-close" id="drawerClose" aria-label="Fermer">×</button>
        </header>
        <div id="drawerBody" class="drawer-body"></div>
      </aside>`;
    document.body.appendChild(overlay);
  }

  function numericValue(value) {
    const normalized = String(value ?? '').replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function referenceCount(card) {
    const text = card.querySelector('strong')?.textContent || '';
    const match = text.match(/([\d\s\u202f]+)\s+r[ée]f/i);
    return match ? numericValue(match[1]) : 0;
  }

  function updateOrderView() {
    const inputs = [...document.querySelectorAll('.order-qty')];
    if (!inputs.length) return;

    let visibleCount = 0;
    let tablePanel = null;

    for (const input of inputs) {
      const row = input.closest('tr');
      if (!row) continue;
      tablePanel ||= input.closest('.table-panel');
      const visible = numericValue(input.value) > 0;
      row.hidden = !visible;
      row.classList.toggle('order-row-zero', !visible);
      if (visible) visibleCount += 1;
    }

    const title = tablePanel?.querySelector('.table-toolbar h3');
    if (title) {
      title.textContent = visibleCount
        ? `${numberFormat.format(visibleCount)} référence${visibleCount > 1 ? 's' : ''} à commander`
        : 'Aucune référence à commander';
    }

    const tableScroll = inputs[0].closest('.table-scroll');
    let emptyState = tablePanel?.querySelector('.orders-empty-state');
    if (!visibleCount && tablePanel) {
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'orders-empty-state';
        emptyState.innerHTML = '<strong>La commande est vide</strong><span>Aucune quantité supérieure à zéro avec les règles et le fournisseur sélectionnés.</span>';
        tableScroll?.insertAdjacentElement('afterend', emptyState);
      }
      if (tableScroll) tableScroll.hidden = true;
    } else {
      emptyState?.remove();
      if (tableScroll) tableScroll.hidden = false;
    }

    const supplierCards = [...document.querySelectorAll('[data-order-supplier]')];
    const activeSuppliers = new Set();
    for (const card of supplierCards) {
      const active = referenceCount(card) > 0;
      card.hidden = !active;
      if (active) activeSuppliers.add(card.dataset.orderSupplier);
    }

    const supplierSelect = document.getElementById('orderSupplier');
    if (supplierSelect) {
      for (const option of supplierSelect.options) {
        if (option.value === 'all') continue;
        option.hidden = !activeSuppliers.has(option.value);
      }
      if (supplierSelect.value !== 'all' && !activeSuppliers.has(supplierSelect.value)) {
        supplierSelect.value = 'all';
        supplierSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const cardsContainer = supplierCards[0]?.closest('.supplier-order-cards');
    if (cardsContainer) cardsContainer.hidden = supplierCards.length > 0 && activeSuppliers.size === 0;
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      updateOrderView();
    });
  }

  function start() {
    ensureDrawer();
    const content = document.getElementById('content');
    if (!content) return;

    observer = new MutationObserver(queueRefresh);
    observer.observe(content, { childList: true, subtree: true });
    content.addEventListener('change', event => {
      if (event.target instanceof Element && event.target.matches('.order-qty, #orderSupplier')) queueRefresh();
    });
    queueRefresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
