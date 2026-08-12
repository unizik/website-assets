// public/assets/js/media-picker.js
'use strict';

/**
 * Reusable "Media Picker" component.
 *
 * Pairs with the render_media_picker() PHP partial (app/includes/media-picker.php),
 * which renders a trigger/preview widget per field. This file builds a single
 * shared modal (lazily, on first use) with two tabs:
 *   - Browse Library: GET /api/admin/media-picker, click a result to select it.
 *   - Upload New:     POST /api/admin/media-upload (via the same uploadFileXHR()
 *                      helper the main dropzone uses), auto-selects on success.
 *
 * Depends on public/assets/js/admin.js being loaded on the same page for
 * apiUrl(), escapeHtml(), clientMimeOk(), uploadFileXHR(), and
 * TYPE_ICONS_BY_UPLOAD_TYPE - load admin.js first (or alongside; both are
 * deferred classic scripts, so document order controls execution order).
 */
const MediaPicker = (() => {
  let modalEl     = null;
  let activeField = null;
  let currentTab  = 'browse';
  let browseState = { type: '', source: '', year: 0, month: 0, page: 1 };
  let uploadInProgress = false;

  // ── Modal construction (built once, reused for every field on the page) ────

  function ensureModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.className = 'media-preview-backdrop';
    modalEl.hidden = true;
    modalEl.innerHTML = `
      <div class="media-preview-dialog media-picker-dialog" role="dialog" aria-modal="true" aria-label="Media picker">
        <button type="button" class="media-preview-close" data-mp-close aria-label="Close">&times;</button>

        <div class="media-picker-tabs">
          <button type="button" class="media-picker-tab" data-mp-tab="browse">Browse Library</button>
          <button type="button" class="media-picker-tab" data-mp-tab="upload">Upload New</button>
        </div>

        <div class="media-picker-panel" data-mp-panel="browse">
          <form class="media-picker-filters" data-mp-filter-form>
            <select class="form-select" data-mp-filter-type>
              <option value="">All Types</option>
              <option value="images">Images</option>
              <option value="pdf">PDF</option>
              <option value="videos">Videos</option>
              <option value="audios">Audio</option>
              <option value="docs">Documents</option>
            </select>
            <select class="form-select" data-mp-filter-source hidden></select>
            <input type="number" class="form-input" placeholder="Year" data-mp-filter-year min="2020" max="2040" style="width:90px">
            <input type="number" class="form-input" placeholder="Month" data-mp-filter-month min="1" max="12" style="width:80px">
            <button type="submit" class="btn-admin btn-admin-secondary">Filter</button>
          </form>

          <div class="media-picker-grid media-grid" data-mp-grid></div>
          <p class="media-picker-empty-state" data-mp-empty hidden>No files found for these filters.</p>
          <button type="button" class="btn-admin btn-admin-secondary" data-mp-load-more hidden>Load more</button>
        </div>

        <div class="media-picker-panel" data-mp-panel="upload" hidden>
          <div class="form-group" style="max-width:220px">
            <label class="form-label">Upload Type</label>
            <select class="form-select" data-mp-upload-type>
              <option value="images">Images</option>
              <option value="pdf">PDF</option>
              <option value="videos">Videos</option>
              <option value="audios">Audio</option>
              <option value="docs">Documents</option>
            </select>
          </div>
          <div class="dropzone" data-mp-dropzone>
            <div class="dropzone-icon">📁</div>
            <p class="dropzone-title">Drop a file here or click to upload</p>
            <p class="dropzone-hint">The uploaded file is selected automatically when it finishes.</p>
            <input type="file" data-mp-upload-input>
            <div class="upload-progress" style="display:none;margin-top:10px">
              <div style="height:4px;background:#E5E7EB;border-radius:2px">
                <div class="upload-progress-fill" data-mp-upload-progress-fill style="height:4px;background:var(--blue);border-radius:2px;width:0%;transition:width .2s"></div>
              </div>
            </div>
            <div class="upload-status" hidden data-mp-upload-status></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);
    wireModal();
    return modalEl;
  }

  function wireModal() {
    modalEl.querySelector('[data-mp-close]')?.addEventListener('click', close);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl && !modalEl.hidden) close();
    });

    modalEl.querySelectorAll('[data-mp-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.mpTab));
    });

    modalEl.querySelector('[data-mp-filter-form]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      browseState.type   = modalEl.querySelector('[data-mp-filter-type]').value;
      browseState.source = modalEl.querySelector('[data-mp-filter-source]').value;
      browseState.year   = Number(modalEl.querySelector('[data-mp-filter-year]').value) || 0;
      browseState.month  = Number(modalEl.querySelector('[data-mp-filter-month]').value) || 0;
      browseState.page   = 1;
      loadBrowseResults({ append: false });
    });

    modalEl.querySelector('[data-mp-load-more]')?.addEventListener('click', () => {
      browseState.page += 1;
      loadBrowseResults({ append: true });
    });

    wireUploadTab();
  }

  function setTab(tab) {
    currentTab = tab;
    modalEl.querySelectorAll('[data-mp-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mpTab === tab);
    });
    modalEl.querySelectorAll('[data-mp-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.mpPanel !== tab;
    });
  }

  // ── Browse tab ───────────────────────────────────────────────────────────

  async function loadBrowseResults({ append }) {
    const grid  = modalEl.querySelector('[data-mp-grid]');
    const empty = modalEl.querySelector('[data-mp-empty]');
    const loadMoreBtn = modalEl.querySelector('[data-mp-load-more]');

    if (!append) grid.innerHTML = '';
    loadMoreBtn.hidden = true;
    loadMoreBtn.textContent = 'Load more';

    const params = new URLSearchParams();
    if (browseState.type)   params.set('type', browseState.type);
    if (browseState.source) params.set('source', browseState.source);
    if (browseState.year)   params.set('year', String(browseState.year));
    if (browseState.month)  params.set('month', String(browseState.month));
    params.set('page', String(browseState.page));

    try {
      const res  = await fetch(apiUrl(`/api/admin/media-picker?${params.toString()}`), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        empty.hidden = false;
        empty.textContent = data.error ?? 'Could not load the media library.';
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];

      // Populate the source dropdown once, only when the API says the
      // current user may browse multiple sources (super_admin).
      const sourceSelect = modalEl.querySelector('[data-mp-filter-source]');
      if (Array.isArray(data.faculties) && data.faculties.length && !sourceSelect.dataset.populated) {
        sourceSelect.innerHTML = '<option value="">All Sources</option><option value="main">Main</option>'
          + data.faculties.map((f) => `<option value="${escapeHtml(f.slug)}">${escapeHtml(f.label)}</option>`).join('');
        sourceSelect.hidden = false;
        sourceSelect.dataset.populated = '1';
      }

      if (!append && items.length === 0) {
        empty.hidden = false;
        empty.textContent = 'No files found for these filters.';
      } else {
        empty.hidden = true;
      }

      items.forEach((item) => grid.appendChild(buildResultCard(item)));

      if (data.hasMore) {
        loadMoreBtn.hidden = false;
      }
    } catch (err) {
      console.error('[media-picker] Browse failed:', err);
      empty.hidden = false;
      empty.textContent = 'Network error while loading the media library.';
    }
  }

  function buildResultCard(item) {
    const card = document.createElement('div');
    card.className = 'media-card media-picker-result';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Select ${item.filename}`);

    const isImg = item.type === 'images';
    const shortName = item.filename.length > 28 ? `${item.filename.slice(0, 28)}…` : item.filename;

    card.innerHTML = `
      <div class="media-card-thumb">
        <span class="media-card-ext-badge" title="${escapeHtml(item.mime || item.ext)}">${escapeHtml(item.ext)}</span>
        ${isImg
          ? `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.filename)}" loading="lazy">`
          : `<span class="media-card-thumb-icon">${TYPE_ICONS_BY_UPLOAD_TYPE[item.type] ?? '📎'}</span>`
        }
      </div>
      <div class="media-card-body">
        <p class="media-card-name" title="${escapeHtml(item.filename)}">${escapeHtml(shortName)}</p>
        <p class="media-card-meta">
          <span class="badge" style="background:rgba(28,100,214,.08);color:var(--blue);font-size:9px">${escapeHtml(item.type)}</span>
          · ${escapeHtml(item.sizeLabel)}
        </p>
      </div>
    `;

    const pick = () => selectItem(item);
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });

    return card;
  }

  // ── Upload tab ───────────────────────────────────────────────────────────

  function wireUploadTab() {
    const zone       = modalEl.querySelector('[data-mp-dropzone]');
    const fileInput  = zone.querySelector('[data-mp-upload-input]');
    const progress   = zone.querySelector('.upload-progress');
    const progressBar = zone.querySelector('[data-mp-upload-progress-fill]');
    const statusEl   = zone.querySelector('[data-mp-upload-status]');

    const startUpload = (file) => {
      if (uploadInProgress) return;

      const type = modalEl.querySelector('[data-mp-upload-type]').value;
      const source = activeField?.dataset.pickerSource ?? 'main';
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';

      if (!clientMimeOk(file, type)) {
        setStatus(statusEl, `"${file.name}" is not an allowed file type for "${type}".`, 'error');
        return;
      }

      setUploadZoneLocked(true);
      progress.style.display = 'block';
      progressBar.style.width = '0%';
      setStatus(statusEl, 'Uploading…', '');

      uploadFileXHR(file, type, source, csrfToken, (pct) => {
        progressBar.style.width = `${pct}%`;
      }).then((result) => {
        if (result.success) {
          setStatus(statusEl, `${file.name} uploaded.`, 'success');
          document.dispatchEvent(new CustomEvent('unizik:mediaUploaded', { detail: result }));
          selectItem({
            url:       result.url,
            key:       result.key,
            filename:  file.name,
            type,
            mime:      file.type,
            ext:       extensionLabel(file.name, file.type),
            sizeLabel: humanFileSize(file.size),
            source,
          });
        } else {
          setStatus(statusEl, result.error ?? result.message ?? 'Upload failed.', 'error');
        }
      }).catch((err) => {
        console.error('[media-picker] Upload failed:', err);
        setStatus(statusEl, 'Upload failed. Please try again.', 'error');
      }).finally(() => {
        setUploadZoneLocked(false);
        setTimeout(() => { progress.style.display = 'none'; }, 2000);
      });
    };

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (uploadInProgress) return;
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (uploadInProgress) return;
      const file = e.dataTransfer?.files?.[0];
      if (file) startUpload(file);
    });
    zone.addEventListener('click', (e) => {
      if (uploadInProgress) return;
      if (e.target.closest('select, button')) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) startUpload(file);
      fileInput.value = '';
    });
  }

  function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'upload-status' + (type ? ` upload-status--${type}` : '');
    el.hidden = !msg;
  }

  // This tab uploads one file at a time (unlike the main Media Library's batch
  // dropzone) - locking it while a request is in flight is what stops a second
  // drop/click from firing a concurrent uploadFileXHR() that shares the same
  // progress bar/status element as the first, and can otherwise leave an
  // orphaned file uploaded with no UI feedback if the first upload's
  // selectItem() already closed the modal.
  function setUploadZoneLocked(locked) {
    uploadInProgress = locked;
    if (!modalEl) return;

    const zone       = modalEl.querySelector('[data-mp-dropzone]');
    const fileInput  = zone?.querySelector('[data-mp-upload-input]');
    const typeSelect = modalEl.querySelector('[data-mp-upload-type]');

    zone?.classList.toggle('dropzone--uploading', locked);
    if (fileInput)  fileInput.disabled  = locked;
    if (typeSelect) typeSelect.disabled = locked;
  }

  // ── Field <-> modal wiring ───────────────────────────────────────────────

  function open(field) {
    activeField = field;
    ensureModal();

    browseState = {
      type:   field.dataset.pickerType   ?? '',
      source: field.dataset.pickerSource ?? '',
      year: 0,
      month: 0,
      page: 1,
    };
    modalEl.querySelector('[data-mp-filter-type]').value = browseState.type;
    modalEl.querySelector('[data-mp-filter-year]').value = '';
    modalEl.querySelector('[data-mp-filter-month]').value = '';
    modalEl.querySelector('[data-mp-upload-type]').value = field.dataset.pickerType || 'images';

    setTab('browse');
    loadBrowseResults({ append: false });

    modalEl.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!modalEl) return;
    modalEl.hidden = true;
    document.body.style.overflow = '';
    activeField = null;
    // Don't leave the Upload tab locked out for the next field this shared
    // modal is opened for - see setUploadZoneLocked()'s comment. Any upload
    // still in flight keeps running server-side; it just won't be able to
    // auto-select into a field anymore (selectItem()'s activeField guard).
    setUploadZoneLocked(false);
  }

  function selectItem(item) {
    if (!activeField) return;

    const valueInput = activeField.querySelector('[data-media-picker-value]');
    if (valueInput) valueInput.value = item.url;

    updatePreview(activeField, item);
    activeField.dispatchEvent(new CustomEvent('media-picker:change', { detail: item, bubbles: true }));

    close();
  }

  function updatePreview(field, item) {
    const preview = field.querySelector('[data-media-picker-preview]');
    const chooseBtn = field.querySelector('[data-media-picker-choose]');
    const removeBtn = field.querySelector('[data-media-picker-remove]');

    if (preview) {
      preview.innerHTML = item.type === 'images'
        ? `<img src="${escapeHtml(item.url)}" alt="" data-media-picker-preview-img>`
        : `<span class="media-picker-file-icon">${TYPE_ICONS_BY_UPLOAD_TYPE[item.type] ?? '📎'}</span><span class="media-picker-file-name">${escapeHtml(item.filename ?? item.url)}</span>`;
    }
    if (chooseBtn) chooseBtn.textContent = 'Change';
    if (removeBtn) removeBtn.hidden = false;
  }

  function clearField(field) {
    const valueInput = field.querySelector('[data-media-picker-value]');
    if (valueInput) valueInput.value = '';

    const preview = field.querySelector('[data-media-picker-preview]');
    if (preview) preview.innerHTML = '<span class="media-picker-empty-label" data-media-picker-empty-label>No file selected</span>';

    const chooseBtn = field.querySelector('[data-media-picker-choose]');
    const removeBtn = field.querySelector('[data-media-picker-remove]');
    if (chooseBtn) chooseBtn.textContent = chooseBtn.dataset.originalLabel || 'Choose Image';
    if (removeBtn) removeBtn.hidden = true;

    field.dispatchEvent(new CustomEvent('media-picker:change', { detail: null, bubbles: true }));
  }

  function init() {
    document.querySelectorAll('[data-media-picker]').forEach((field) => {
      const chooseBtn = field.querySelector('[data-media-picker-choose]');
      const removeBtn = field.querySelector('[data-media-picker-remove]');

      if (chooseBtn && !chooseBtn.dataset.originalLabel) {
        chooseBtn.dataset.originalLabel = chooseBtn.textContent.trim();
      }

      chooseBtn?.addEventListener('click', () => open(field));
      removeBtn?.addEventListener('click', () => clearField(field));
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { open, init };
})();
