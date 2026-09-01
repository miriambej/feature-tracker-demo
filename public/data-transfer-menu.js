(() => {
  const MENU_ID = 'feature-tracker-data-transfer-menu';

  function buttonByText(container, label) {
    return Array.from(container?.querySelectorAll('button') || []).find(
      (button) => button.textContent.trim() === label,
    );
  }

  function ensureStyles() {
    if (document.getElementById('feature-tracker-data-transfer-styles')) return;
    const style = document.createElement('style');
    style.id = 'feature-tracker-data-transfer-styles';
    style.textContent = `
      #full-backup-button{display:none!important}
      #${MENU_ID}{position:relative;display:inline-block}
      #${MENU_ID}>summary{list-style:none;cursor:pointer;border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:7px 11px;font:inherit;font-weight:700;background:transparent;color:inherit;white-space:nowrap}
      #${MENU_ID}>summary::-webkit-details-marker{display:none}
      #${MENU_ID}>summary::after{content:' ▾';font-size:.8em;opacity:.75}
      #${MENU_ID}[open]>summary::after{content:' ▴'}
      #${MENU_ID} .data-transfer-popover{position:absolute;top:calc(100% + 7px);left:0;z-index:9990;min-width:230px;padding:7px;background:#172033;color:#f8fafc;border:1px solid rgba(127,127,127,.28);border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.28)}
      #${MENU_ID} .data-transfer-popover button{display:block;width:100%;text-align:left;margin:0;padding:9px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}
      #${MENU_ID} .data-transfer-popover button:hover{background:rgba(127,127,127,.14)}
      #${MENU_ID} .data-transfer-divider{height:1px;margin:5px 4px;background:rgba(127,127,127,.22)}
      #${MENU_ID} .data-transfer-help{display:block;padding:4px 10px 7px;font-size:11px;line-height:1.35;opacity:.78;color:inherit}
      .app.light #${MENU_ID}>summary{background:#fff;color:#252423;border-color:#d2d0ce}
      .app.light #${MENU_ID} .data-transfer-popover{background:#fff;color:#252423;border-color:#d8d6d4;box-shadow:0 14px 36px rgba(0,0,0,.16)}
      .app.light #${MENU_ID} .data-transfer-popover button{color:#252423}
      .app.light #${MENU_ID} .data-transfer-popover button:hover{background:#f3f2f1}
      .app.light #${MENU_ID} .data-transfer-divider{background:#d8d6d4}
      .app.light #${MENU_ID} .data-transfer-help{color:#605e5c;opacity:1}
    `;
    document.head.appendChild(style);
  }

  function installMenu() {
    ensureStyles();
    if (document.getElementById(MENU_ID)) return true;

    const toolbar = document.querySelector('.toolbar .toolbar-left');
    const importButton = buttonByText(toolbar, 'Import');
    const exportButton = buttonByText(toolbar, 'Export');
    const backupButton = document.getElementById('full-backup-button');
    if (!toolbar || !importButton || !exportButton || !backupButton) return false;

    const menu = document.createElement('details');
    menu.id = MENU_ID;
    menu.innerHTML = `
      <summary>Import / Export</summary>
      <div class="data-transfer-popover">
        <button type="button" data-action="import-features">Import Features CSV</button>
        <button type="button" data-action="export-features">Export Features CSV</button>
        <div class="data-transfer-divider"></div>
        <button type="button" data-action="full-backup">Full Backup / Restore</button>
        <span class="data-transfer-help">Full Backup preserves the complete browser state when moving the app between computers.</span>
      </div>`;

    importButton.hidden = true;
    exportButton.hidden = true;
    toolbar.insertBefore(menu, importButton);

    menu.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'import-features') importButton.click();
      if (action === 'export-features') exportButton.click();
      if (action === 'full-backup') backupButton.click();
      menu.open = false;
    });

    document.addEventListener('click', (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    return true;
  }

  function start() {
    if (installMenu()) return;
    const observer = new MutationObserver(() => {
      if (installMenu()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
