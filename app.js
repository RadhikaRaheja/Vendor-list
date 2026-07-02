// ==========================================================
// VENDOR LEDGER — app logic
// Vanilla JS, no build step, no framework. Renders into #view-root.
// ==========================================================

// ---------- tiny utilities ----------

function pad(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthLabel(year, month) {
  const dt = new Date(year, month - 1, 1);
  return dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function displayName(v) {
  return v.name && v.name.trim() ? escapeHtml(v.name) : '<span class="unnamed">Unnamed vendor</span>';
}

// ---------- state ----------

const state = {
  view: 'today',           // 'today' | 'vendors' | 'vendorDetail'
  vendors: [],
  dashboard: [],
  selectedVendorId: null,
  calendarYear: currentYearMonth().year,
  calendarMonth: currentYearMonth().month,
  calendarPostings: [],
  todaySearch: '',
  vendorsSearch: '',
  modalOpen: false,
  loaded: { today: false, vendors: false },
};

// ---------- DOM refs ----------

const viewRoot = document.getElementById('view-root');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');
const refreshBtn = document.getElementById('refresh-btn');
const tabButtons = document.querySelectorAll('.tab-btn');

// ---------- toast ----------

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  if (err.message === 'NOT_CONFIGURED') return 'The app is not connected to a Google Sheet yet.';
  if (err.message === 'NETWORK_ERROR') return 'Could not reach the server. Check your connection and try again.';
  return err.message || 'Something went wrong. Please try again.';
}

// ---------- modal ----------

function openModal(innerHtml, opts = {}) {
  state.modalOpen = true;
  modalRoot.innerHTML = `
    <div class="modal-overlay" data-action="close-modal">
      <div class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        ${innerHtml}
      </div>
    </div>`;
  const firstInput = modalRoot.querySelector('input, textarea');
  if (firstInput && !opts.noFocus) setTimeout(() => firstInput.focus(), 50);
}

function closeModal() {
  state.modalOpen = false;
  modalRoot.innerHTML = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.modalOpen) closeModal();
});

// ---------- setup notice (shown when config.js hasn't been edited) ----------

function renderSetupNotice() {
  document.querySelector('.tab-nav').style.display = 'none';
  viewRoot.innerHTML = `
    <div class="setup-notice">
      <div class="setup-badge">SETUP NEEDED</div>
      <h1>Connect your Google Sheet</h1>
      <p>This app stores everything in a Google Sheet through a small Apps Script backend.
      Follow <strong>README.md</strong> in the project files to:</p>
      <ol>
        <li>Create a Google Sheet</li>
        <li>Paste in <code>backend/Code.gs</code> and deploy it as a Web App</li>
        <li>Paste the resulting URL into <code>js/config.js</code></li>
      </ol>
      <p class="setup-hint">Once <code>API_URL</code> in <code>js/config.js</code> is set, reload this page.</p>
    </div>`;
}

// ---------- app shell / routing ----------

function setActiveTab(view) {
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
}

function switchView(view) {
  state.view = view;
  setActiveTab(view);
  if (view === 'today') renderTodayView();
  else if (view === 'vendors') renderVendorsView();
}

// ---------- TODAY view ----------

async function renderTodayView(forceReload = false) {
  viewRoot.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div>
          <h1 class="view-title">Today's Postings</h1>
          <p class="view-subtitle">${formatDateLabel(todayStr())}</p>
        </div>
      </div>
      <div id="today-tally" class="tally"></div>
      <input id="today-search" class="search-input" type="search" placeholder="Search vendors…" value="${escapeHtml(state.todaySearch)}" />
      <div id="today-list" class="card-list"></div>
    </div>`;

  document.getElementById('today-search').addEventListener('input', debounce((e) => {
    state.todaySearch = e.target.value;
    renderTodayList();
  }, 150));

  if (!state.loaded.today || forceReload) {
    renderTodayList(true); // loading state
    try {
      state.dashboard = await Api.get('getDashboard', { date: todayStr() });
      state.loaded.today = true;
      renderTodayList();
    } catch (err) {
      renderTodayList(false, err);
    }
  } else {
    renderTodayList();
  }
}

function renderTodayList(loading = false, error = null) {
  const listEl = document.getElementById('today-list');
  const tallyEl = document.getElementById('today-tally');
  if (!listEl) return;

  if (loading) {
    tallyEl.innerHTML = '';
    listEl.innerHTML = `<div class="loading-state"><div class="spinner"></div>Loading ledger…</div>`;
    return;
  }
  if (error) {
    tallyEl.innerHTML = '';
    listEl.innerHTML = `
      <div class="error-banner">
        <p>${escapeHtml(friendlyError(error))}</p>
        <button class="btn btn-secondary" data-action="retry-today">Try again</button>
      </div>`;
    return;
  }

  const q = state.todaySearch.trim().toLowerCase();
  const filtered = state.dashboard.filter(v =>
    !q || `${v.name} ${v.website} ${v.mobile}`.toLowerCase().includes(q));

  const doneCount = state.dashboard.filter(v => v.posting && v.posting.done).length;
  const total = state.dashboard.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  tallyEl.innerHTML = total ? `
      <div class="tally-row">
        <span>${doneCount} of ${total} posted today</span>
        <span class="tally-pct">${pct}%</span>
      </div>
      <div class="tally-bar"><div class="tally-fill" style="width:${pct}%"></div></div>` : '';

  if (!state.dashboard.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">▤</div>
        <p>Your ledger is empty.</p>
        <p class="empty-state-sub">Add a vendor from the Vendors tab to start tracking daily postings.</p>
      </div>`;
    return;
  }
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state"><p>No vendors match “${escapeHtml(state.todaySearch)}”.</p></div>`;
    return;
  }

  const sorted = filtered.slice().sort((a, b) => {
    const aDone = a.posting && a.posting.done ? 1 : 0;
    const bDone = b.posting && b.posting.done ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone; // not-done first
    return (a.name || '').localeCompare(b.name || '');
  });

  listEl.innerHTML = sorted.map(v => {
    const done = !!(v.posting && v.posting.done);
    const time = done ? formatTime(v.posting.doneAt) : '';
    const sub = [v.website, v.mobile].filter(Boolean).join(' · ');
    return `
      <div class="vendor-card">
        <div class="vendor-card-info" data-action="open-vendor" data-id="${v.id}">
          <div class="vendor-card-name">${displayName(v)}</div>
          ${sub ? `<div class="vendor-card-sub">${escapeHtml(sub)}</div>` : ''}
          ${done ? `<div class="vendor-card-time">Stamped at ${time}</div>` : `<div class="vendor-card-time pending">Not posted yet</div>`}
        </div>
        <button class="stamp-btn ${done ? 'done' : ''}" data-action="toggle-stamp" data-id="${v.id}" aria-label="${done ? 'Mark as not posted' : 'Mark as posted'}">
          <span class="stamp-ring">${done ? '✓' : ''}</span>
        </button>
      </div>`;
  }).join('');
}

async function toggleStamp(vendorId) {
  const entry = state.dashboard.find(v => v.id === vendorId);
  if (!entry) return;
  const wasDone = !!(entry.posting && entry.posting.done);
  const nowDone = !wasDone;

  // optimistic update
  entry.posting = { ...(entry.posting || {}), done: nowDone, doneAt: nowDone ? new Date().toISOString() : null };
  renderTodayList();

  try {
    const result = await Api.post('markPosting', { vendorId, date: todayStr(), done: nowDone });
    entry.posting.id = result.id;
  } catch (err) {
    // revert on failure
    entry.posting = { ...(entry.posting || {}), done: wasDone };
    renderTodayList();
    showToast(friendlyError(err), 'error');
  }
}

// ---------- VENDORS view ----------

async function renderVendorsView(forceReload = false) {
  viewRoot.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div>
          <h1 class="view-title">Vendors</h1>
          <p class="view-subtitle">Names, contacts &amp; notes</p>
        </div>
      </div>
      <input id="vendors-search" class="search-input" type="search" placeholder="Search vendors…" value="${escapeHtml(state.vendorsSearch)}" />
      <div id="vendors-list" class="card-list"></div>
    </div>
    <button class="fab" data-action="open-add-modal" aria-label="Add vendor">+</button>`;

  document.getElementById('vendors-search').addEventListener('input', debounce((e) => {
    state.vendorsSearch = e.target.value;
    renderVendorsList();
  }, 150));

  if (!state.loaded.vendors || forceReload) {
    renderVendorsList(true);
    try {
      state.vendors = await Api.get('getVendors');
      state.loaded.vendors = true;
      renderVendorsList();
    } catch (err) {
      renderVendorsList(false, err);
    }
  } else {
    renderVendorsList();
  }
}

function renderVendorsList(loading = false, error = null) {
  const listEl = document.getElementById('vendors-list');
  if (!listEl) return;

  if (loading) {
    listEl.innerHTML = `<div class="loading-state"><div class="spinner"></div>Loading vendors…</div>`;
    return;
  }
  if (error) {
    listEl.innerHTML = `
      <div class="error-banner">
        <p>${escapeHtml(friendlyError(error))}</p>
        <button class="btn btn-secondary" data-action="retry-vendors">Try again</button>
      </div>`;
    return;
  }
  if (!state.vendors.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">▤</div>
        <p>No vendors yet.</p>
        <p class="empty-state-sub">Tap the + button to add your first vendor.</p>
      </div>`;
    return;
  }

  const q = state.vendorsSearch.trim().toLowerCase();
  const filtered = state.vendors.filter(v =>
    !q || `${v.name} ${v.website} ${v.mobile}`.toLowerCase().includes(q));

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state"><p>No vendors match “${escapeHtml(state.vendorsSearch)}”.</p></div>`;
    return;
  }

  const sorted = filtered.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  listEl.innerHTML = sorted.map(v => {
    const sub = [v.website, v.mobile].filter(Boolean).join(' · ');
    return `
      <div class="rolodex-card" data-action="open-vendor" data-id="${v.id}">
        <div>
          <div class="vendor-card-name">${displayName(v)}</div>
          ${sub ? `<div class="vendor-card-sub">${escapeHtml(sub)}</div>` : '<div class="vendor-card-sub muted">No contact info yet</div>'}
        </div>
        <span class="chevron">›</span>
      </div>`;
  }).join('');
}

// ---------- ADD VENDOR modal ----------

function openAddVendorModal() {
  openModal(`
    <div class="modal-header">
      <h2>Add vendor</h2>
      <button class="icon-btn" data-action="close-modal" aria-label="Close">×</button>
    </div>
    <form id="add-vendor-form" data-action="submit-add-vendor">
      <div class="form-group">
        <label class="form-label" for="f-name">Name</label>
        <input class="form-input" id="f-name" name="name" type="text" placeholder="e.g. Sunrise Printers" />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-website">Website</label>
        <input class="form-input" id="f-website" name="website" type="text" placeholder="e.g. sunriseprinters.com" />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-mobile">Mobile number</label>
        <input class="form-input" id="f-mobile" name="mobile" type="tel" placeholder="e.g. 98765 43210" />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-extra">Extra info</label>
        <textarea class="form-textarea" id="f-extra" name="extraInfo" rows="3" placeholder="Anything else worth noting"></textarea>
      </div>
      <p class="form-hint">Nothing here is required — fill in what you know now, add the rest later.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save vendor</button>
      </div>
    </form>
  `);
  document.getElementById('add-vendor-form').addEventListener('submit', handleAddVendorSubmit);
}

async function handleAddVendorSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const data = {
    name: form.name.value.trim(),
    website: form.website.value.trim(),
    mobile: form.mobile.value.trim(),
    extraInfo: form.extraInfo.value.trim(),
  };
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';
  try {
    await Api.post('addVendor', data);
    closeModal();
    showToast('Vendor added');
    await Promise.all([
      renderVendorsView(true),
      state.view === 'today' ? renderTodayView(true) : Promise.resolve(),
    ]);
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save vendor';
    showToast(friendlyError(err), 'error');
  }
}

// ---------- VENDOR DETAIL view (edit + calendar) ----------

async function openVendorDetail(vendorId) {
  state.selectedVendorId = vendorId;
  state.calendarYear = currentYearMonth().year;
  state.calendarMonth = currentYearMonth().month;
  state.view = 'vendorDetail';
  tabButtons.forEach(btn => btn.classList.remove('active'));

  let vendor = state.vendors.find(v => v.id === vendorId) ||
    (state.dashboard.find(v => v.id === vendorId));

  viewRoot.innerHTML = `<div class="view"><div class="loading-state"><div class="spinner"></div>Loading vendor…</div></div>`;

  if (!state.vendors.length) {
    try { state.vendors = await Api.get('getVendors'); } catch (err) { /* fall through with cached vendor */ }
    vendor = state.vendors.find(v => v.id === vendorId) || vendor;
  }
  if (!vendor) {
    viewRoot.innerHTML = `<div class="view"><div class="error-banner"><p>Vendor not found.</p><button class="btn btn-secondary" data-action="back-to-vendors">Back to vendors</button></div></div>`;
    return;
  }
  renderVendorDetail(vendor);
  loadCalendar();
}

function renderVendorDetail(vendor) {
  viewRoot.innerHTML = `
    <div class="view">
      <div class="detail-header">
        <button class="icon-btn" data-action="back" aria-label="Back">←</button>
        <h1 class="view-title">${vendor.name && vendor.name.trim() ? escapeHtml(vendor.name) : 'Unnamed vendor'}</h1>
      </div>

      <form id="edit-vendor-form" class="detail-card">
        <div class="form-group">
          <label class="form-label" for="e-name">Name</label>
          <input class="form-input" id="e-name" name="name" type="text" value="${escapeHtml(vendor.name)}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="e-website">Website</label>
          <input class="form-input" id="e-website" name="website" type="text" value="${escapeHtml(vendor.website)}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="e-mobile">Mobile number</label>
          <input class="form-input" id="e-mobile" name="mobile" type="tel" value="${escapeHtml(vendor.mobile)}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="e-extra">Extra info</label>
          <textarea class="form-textarea" id="e-extra" name="extraInfo" rows="3">${escapeHtml(vendor.extraInfo)}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-danger" data-action="delete-vendor" data-id="${vendor.id}">Delete</button>
          <button type="submit" class="btn btn-primary">Save changes</button>
        </div>
        ${vendor.createdAt ? `<p class="added-caption">Added ${formatShortDate(vendor.createdAt)}</p>` : ''}
      </form>

      <div class="calendar-card">
        <div class="calendar-header">
          <button class="icon-btn" data-action="cal-prev" aria-label="Previous month">‹</button>
          <span id="cal-month-label" class="calendar-month-label"></span>
          <button class="icon-btn" data-action="cal-next" aria-label="Next month">›</button>
        </div>
        <div id="calendar-grid" class="calendar-grid"></div>
        <p class="calendar-hint">Tap a day to mark or unmark that posting.</p>
      </div>
    </div>`;

  document.getElementById('edit-vendor-form').addEventListener('submit', (e) => handleUpdateVendor(e, vendor.id));
}

async function handleUpdateVendor(e, vendorId) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const data = {
    id: vendorId,
    name: form.name.value.trim(),
    website: form.website.value.trim(),
    mobile: form.mobile.value.trim(),
    extraInfo: form.extraInfo.value.trim(),
  };
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = 'Saving…';
  try {
    await Api.post('updateVendor', data);
    state.loaded.vendors = false;
    state.loaded.today = false;
    showToast('Vendor updated');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

function confirmDeleteVendor(vendorId) {
  const vendor = state.vendors.find(v => v.id === vendorId);
  const name = vendor && vendor.name ? vendor.name : 'this vendor';
  openModal(`
    <div class="modal-header"><h2>Delete vendor?</h2></div>
    <p class="confirm-text">This removes <strong>${escapeHtml(name)}</strong> and its entire posting history. This can't be undone.</p>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="button" class="btn btn-danger" data-action="confirm-delete-vendor" data-id="${vendorId}">Delete</button>
    </div>
  `);
}

async function handleDeleteVendor(vendorId) {
  closeModal();
  try {
    await Api.post('deleteVendor', { id: vendorId });
    state.loaded.vendors = false;
    state.loaded.today = false;
    showToast('Vendor deleted');
    switchView('vendors');
    await renderVendorsView(true);
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

// ---------- calendar ----------

async function loadCalendar() {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('cal-month-label');
  if (!grid || !label) return;
  label.textContent = monthLabel(state.calendarYear, state.calendarMonth);
  grid.innerHTML = `<div class="loading-state small"><div class="spinner"></div></div>`;
  try {
    const monthStr = `${state.calendarYear}-${pad(state.calendarMonth)}`;
    state.calendarPostings = await Api.get('getPostings', { vendorId: state.selectedVendorId, month: monthStr });
    renderCalendarGrid();
  } catch (err) {
    grid.innerHTML = `<div class="error-banner small"><p>${escapeHtml(friendlyError(err))}</p></div>`;
  }
}

function renderCalendarGrid() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  const { calendarYear: year, calendarMonth: month } = state;
  const postingsByDate = {};
  state.calendarPostings.forEach(p => postingsByDate[p.date] = p);

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = todayStr();

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="calendar-daylabel">${d}</div>`).join('');

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push('<div class="calendar-day empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    const posting = postingsByDate[dateStr];
    const done = !!(posting && posting.done);
    const isFuture = dateStr > today;
    const isToday = dateStr === today;
    const title = done && posting.doneAt ? `Stamped ${formatTime(posting.doneAt)}` : (isFuture ? 'Upcoming' : 'Not posted');
    cells.push(`
      <button class="calendar-day ${done ? 'done' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}"
        ${isFuture ? 'disabled' : `data-action="toggle-calendar-day" data-date="${dateStr}"`}
        title="${escapeHtml(title)}">
        ${d}
      </button>`);
  }

  grid.innerHTML = dayLabels + cells.join('');
}

async function toggleCalendarDay(dateStr) {
  const existing = state.calendarPostings.find(p => p.date === dateStr);
  const wasDone = !!(existing && existing.done);
  const nowDone = !wasDone;

  if (existing) existing.done = nowDone;
  else state.calendarPostings.push({ date: dateStr, done: nowDone, vendorId: state.selectedVendorId });
  renderCalendarGrid();

  try {
    await Api.post('markPosting', { vendorId: state.selectedVendorId, date: dateStr, done: nowDone });
    if (dateStr === todayStr()) state.loaded.today = false; // refresh Today next time it's shown
  } catch (err) {
    const rec = state.calendarPostings.find(p => p.date === dateStr);
    if (rec) rec.done = wasDone;
    renderCalendarGrid();
    showToast(friendlyError(err), 'error');
  }
}

// ---------- event delegation ----------

const handlers = {
  'open-vendor': (el) => openVendorDetail(el.dataset.id),
  'toggle-stamp': (el) => toggleStamp(el.dataset.id),
  'open-add-modal': () => openAddVendorModal(),
  'close-modal': () => closeModal(),
  'back': () => switchView('today'),
  'back-to-vendors': () => switchView('vendors'),
  'delete-vendor': (el) => confirmDeleteVendor(el.dataset.id),
  'confirm-delete-vendor': (el) => handleDeleteVendor(el.dataset.id),
  'retry-today': () => renderTodayView(true),
  'retry-vendors': () => renderVendorsView(true),
  'cal-prev': () => { shiftCalendarMonth(-1); },
  'cal-next': () => { shiftCalendarMonth(1); },
  'toggle-calendar-day': (el) => toggleCalendarDay(el.dataset.date),
};

function shiftCalendarMonth(delta) {
  let { calendarYear: y, calendarMonth: m } = state;
  m += delta;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  state.calendarYear = y;
  state.calendarMonth = m;
  loadCalendar();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const handler = handlers[el.dataset.action];
  if (handler) handler(el, e);
});

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

refreshBtn.addEventListener('click', () => {
  if (state.view === 'today') renderTodayView(true);
  else if (state.view === 'vendors') renderVendorsView(true);
  else if (state.view === 'vendorDetail' && state.selectedVendorId) loadCalendar();
});

// ---------- background refresh ----------

async function silentRefresh() {
  if (state.modalOpen) return;
  try {
    if (state.view === 'today') {
      state.dashboard = await Api.get('getDashboard', { date: todayStr() });
      renderTodayList();
    } else if (state.view === 'vendors') {
      state.vendors = await Api.get('getVendors');
      renderVendorsList();
    }
  } catch (err) {
    // Silent refreshes fail quietly; the user can still pull-to-refresh.
  }
}
setInterval(silentRefresh, 25000);

// ---------- init ----------

function init() {
  if (!Api.isConfigured()) {
    renderSetupNotice();
    return;
  }
  switchView('today');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

init();
