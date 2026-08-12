// public/assets/js/admin.js
'use strict';

// Base path prefix for API calls ('' in prod, '/nau' on XAMPP local dev).
const APP_BASE = document.querySelector('meta[name="app-base"]')?.content ?? '';

function apiUrl(path) {
  return APP_BASE + path;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ─── 1. Admin sidebar active link ────────────────────────────────────────────
function initAdminNav() {
  const currentPath = window.location.pathname;

  document.querySelectorAll('.admin-nav-link').forEach((link) => {
    // Use the link's pathname for comparison, not full href
    try {
      const linkPath = new URL(link.href, window.location.origin).pathname;
      if (linkPath === currentPath) link.classList.add('active');
    } catch {
      // Not a standard URL - skip
    }
  });
}

// ─── 2. File upload dropzone ──────────────────────────────────────────────────
function initDropzone() {
  // Optional: a media grid on the same page that newly-uploaded files should
  // appear in live (see createUploadPlaceholder/attemptUpload below). Only
  // app/admin/main/media.php currently marks its grid with data-media-grid.
  const grid = document.querySelector('.media-grid[data-media-grid]');

  document.querySelectorAll('[data-dropzone]').forEach((zone) => {
    const fileInput  = zone.querySelector('input[type="file"]');
    const progress   = zone.querySelector('.upload-progress');
    const progressBar = zone.querySelector('.upload-progress-fill');
    const statusEl   = zone.querySelector('.upload-status');
    const uploadType = zone.dataset.uploadType ?? 'images';
    const uploadSrc  = zone.dataset.uploadSource ?? 'main';

    // ── Drag events ────────────────────────────────────────────────────────
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files?.length) handleFiles(files, zone, uploadType, uploadSrc, progress, progressBar, statusEl, grid);
    });

    // ── Click to open file picker ──────────────────────────────────────────
    zone.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a')) return;
      fileInput?.click();
    });

    // ── File input change ──────────────────────────────────────────────────
    fileInput?.addEventListener('change', () => {
      if (fileInput.files?.length) {
        handleFiles(fileInput.files, zone, uploadType, uploadSrc, progress, progressBar, statusEl, grid);
        fileInput.value = ''; // Reset so the same file can be re-uploaded if needed
      }
    });
  });
}

const ALLOWED_CLIENT_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  pdf:    ['application/pdf'],
  videos: ['video/mp4', 'video/webm', 'video/ogg'],
  audios: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4'],
  docs:   [
    'application/msword',
    'application/vnd.openxmlformats-officedocument',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'text/csv',
  ],
};

const TYPE_ICONS_BY_UPLOAD_TYPE = { pdf: '📄', videos: '🎬', audios: '🎵', docs: '📝' };

function clientMimeOk(file, type) {
  const allowed = ALLOWED_CLIENT_TYPES[type] ?? [];
  return allowed.some((m) => file.type === m || file.type.startsWith(m));
}

// Mirrors media_human_size() in app/admin/main/media.php so freshly-uploaded
// placeholder/real cards match the formatting of server-rendered ones.
function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = bytes / 1024;
  for (const unit of units) {
    if (val < 1024 || unit === 'GB') return `${val.toFixed(val < 10 ? 1 : 0)} ${unit}`;
    val /= 1024;
  }
  return `${val.toFixed(1)} GB`;
}

// Mirrors media_extension_label() in app/admin/main/media.php (MIME-first,
// since a single image upload produces multiple variant rows - webp + jpg,
// several sizes - that all share one original filename).
const MIME_TO_EXT_LABEL = {
  'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/gif': 'GIF', 'image/svg+xml': 'SVG',
  'application/pdf': 'PDF',
  'video/mp4': 'MP4', 'video/webm': 'WEBM', 'video/ogg': 'OGV',
  'audio/mpeg': 'MP3', 'audio/ogg': 'OGG', 'audio/wav': 'WAV', 'audio/mp4': 'M4A',
  'application/msword': 'DOC', 'application/vnd.ms-excel': 'XLS', 'application/vnd.ms-powerpoint': 'PPT',
  'text/plain': 'TXT', 'text/csv': 'CSV',
};

function extensionLabel(filename, mime) {
  if (mime) {
    if (MIME_TO_EXT_LABEL[mime]) return MIME_TO_EXT_LABEL[mime];
    if (mime.includes('wordprocessingml')) return 'DOCX';
    if (mime.includes('spreadsheetml')) return 'XLSX';
    if (mime.includes('presentationml')) return 'PPTX';
  }
  const match = /\.([a-z0-9]+)$/i.exec(filename ?? '');
  if (match) return match[1].toUpperCase();
  const subtype = (mime ?? '').split('/')[1];
  return subtype ? subtype.toUpperCase() : 'FILE';
}

// Reusable single-file XHR upload, shared by the initial batch loop and retry.
function uploadFileXHR(file, type, source, csrfToken, onProgress) {
  const formData = new FormData();
  formData.append('file',   file);
  formData.append('type',   type);
  formData.append('source', source);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/admin/media-upload'));
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)); }
      catch { reject(new Error('Invalid server response')); }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

// ── Media grid card construction ────────────────────────────────────────────

function revealMediaGrid(grid) {
  if (!grid) return;
  grid.hidden = false;
  document.querySelector('[data-media-empty-message]')?.setAttribute('hidden', '');
  const countEl = document.querySelector('[data-media-count]');
  if (countEl) {
    const n = grid.querySelectorAll('.media-card:not(.media-card-pending)').length;
    countEl.textContent = `${n} item${n === 1 ? '' : 's'} shown`;
  }
}

// Builds the same markup as the server-rendered .media-card in
// app/admin/main/media.php, so preview/bulk-select/copy/delete all work on
// it immediately without a page reload.
function createMediaCardElement(data) {
  const card = document.createElement('div');
  card.className = 'media-card';
  card.dataset.url      = data.url;
  card.dataset.key      = data.key;
  card.dataset.filename = data.filename;
  card.dataset.type     = data.type;
  card.dataset.mime     = data.mime;
  card.dataset.ext      = data.ext;
  card.dataset.size     = data.sizeLabel;
  card.dataset.uploaded = data.uploadedLabel;
  card.dataset.source   = data.source;
  card.dataset.uploader = data.uploader ?? '';

  const isImg = data.type === 'images';
  const shortName = data.filename.length > 28 ? `${data.filename.slice(0, 28)}…` : data.filename;

  card.innerHTML = `
    <label class="media-card-select" data-bulk-checkbox-wrap>
      <input type="checkbox" class="media-card-checkbox" data-bulk-checkbox aria-label="Select ${escapeHtml(data.filename)}">
    </label>
    <div class="media-card-thumb" data-media-preview-trigger>
      <span class="media-card-ext-badge" title="${escapeHtml(data.mime || data.ext)}">${escapeHtml(data.ext)}</span>
      ${isImg
        ? `<img src="${escapeHtml(data.url)}" alt="${escapeHtml(data.filename)}" loading="lazy">`
        : `<span class="media-card-thumb-icon">${TYPE_ICONS_BY_UPLOAD_TYPE[data.type] ?? '📎'}</span>`
      }
    </div>
    <div class="media-card-body">
      <p class="media-card-name" title="${escapeHtml(data.filename)}">${escapeHtml(shortName)}</p>
      <p class="media-card-meta">
        <span class="badge" style="background:rgba(28,100,214,.08);color:var(--blue);font-size:9px">${escapeHtml(data.type)}</span>
        · ${escapeHtml(data.sizeLabel)}
      </p>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="admin-action-btn media-copy-btn" data-url="${escapeHtml(data.url)}" title="Copy the public URL for &quot;${escapeHtml(data.filename)}&quot;">Copy URL</button>
        <button class="admin-action-btn danger media-delete-btn" data-url="${escapeHtml(data.url)}" data-key="${escapeHtml(data.key)}" data-csrf="${escapeHtml(data.csrfToken)}">Delete</button>
      </div>
    </div>
  `;

  return card;
}

// ── In-flight upload placeholder card ───────────────────────────────────────

function createUploadPlaceholder(file, type) {
  const card = document.createElement('div');
  card.className = 'media-card media-card-pending';

  const objectUrl = type === 'images' && file.type.startsWith('image/')
    ? URL.createObjectURL(file)
    : null;
  const ext = extensionLabel(file.name, file.type);
  const shortName = file.name.length > 28 ? `${file.name.slice(0, 28)}…` : file.name;

  card.innerHTML = `
    <div class="media-card-thumb">
      <span class="media-card-ext-badge">${escapeHtml(ext)}</span>
      ${objectUrl
        ? `<img src="${objectUrl}" alt="${escapeHtml(file.name)}">`
        : `<span class="media-card-pending-icon">${TYPE_ICONS_BY_UPLOAD_TYPE[type] ?? '📎'}</span>`
      }
    </div>
    <div class="media-card-body">
      <p class="media-card-name" title="${escapeHtml(file.name)}">${escapeHtml(shortName)}</p>
      <p class="media-card-meta">${escapeHtml(humanFileSize(file.size))}</p>
      <div class="media-card-pending-progress"><div class="media-card-pending-progress-fill"></div></div>
      <p class="media-card-pending-status">Waiting…</p>
    </div>
  `;

  if (objectUrl) card.dataset.objectUrl = objectUrl;
  return card;
}

function setPlaceholderProgress(card, pct, statusText) {
  const fill = card.querySelector('.media-card-pending-progress-fill');
  const status = card.querySelector('.media-card-pending-status');
  if (fill) fill.style.width = `${pct}%`;
  if (status) status.textContent = statusText;
}

// Restores a placeholder to its pre-upload "Waiting…" state, rebuilding the
// progress bar/status elements if a previous failed attempt removed them.
// Called at the start of every attemptUpload() - a no-op on the first try,
// undoes markPlaceholderFailed()'s DOM changes on a retry.
function resetPlaceholderUI(card, type) {
  card.classList.remove('media-card-pending--failed');
  card.querySelector('.media-card-pending-error')?.remove();
  card.querySelector('.media-card-pending-actions')?.remove();

  const thumb = card.querySelector('.media-card-thumb');
  if (thumb) {
    // Unconditionally rebuild: a prior failed attempt may have left the
    // warning icon (⚠️) in place, which also carries the -pending-icon class.
    thumb.querySelectorAll('img, .media-card-pending-icon').forEach((el) => el.remove());
    const inner = card.dataset.objectUrl
      ? `<img src="${card.dataset.objectUrl}" alt="">`
      : `<span class="media-card-pending-icon">${TYPE_ICONS_BY_UPLOAD_TYPE[type] ?? '📎'}</span>`;
    thumb.insertAdjacentHTML('beforeend', inner);
  }

  const body = card.querySelector('.media-card-body');
  if (body && !card.querySelector('.media-card-pending-progress')) {
    body.insertAdjacentHTML('beforeend', '<div class="media-card-pending-progress"><div class="media-card-pending-progress-fill"></div></div>');
  }
  if (body && !card.querySelector('.media-card-pending-status')) {
    body.insertAdjacentHTML('beforeend', '<p class="media-card-pending-status">Waiting…</p>');
  }
}

function markPlaceholderFailed(card, message, onRetry) {
  card.classList.add('media-card-pending--failed');

  // Swap the thumbnail (image preview or type icon) for a warning icon,
  // keeping the extension badge.
  const thumb = card.querySelector('.media-card-thumb');
  if (thumb) {
    thumb.querySelectorAll('img, .media-card-pending-icon').forEach((el) => el.remove());
    thumb.insertAdjacentHTML('beforeend', '<span class="media-card-pending-icon">⚠️</span>');
  }

  card.querySelector('.media-card-pending-progress')?.remove();
  card.querySelector('.media-card-pending-status')?.remove();

  const body = card.querySelector('.media-card-body');
  if (!body) return;

  const errorEl = document.createElement('p');
  errorEl.className = 'media-card-pending-error';
  errorEl.textContent = message;
  body.appendChild(errorEl);

  const actions = document.createElement('div');
  actions.className = 'media-card-pending-actions';

  if (onRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'admin-action-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => onRetry());
    actions.appendChild(retryBtn);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'admin-action-btn';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => {
    if (card.dataset.objectUrl) URL.revokeObjectURL(card.dataset.objectUrl);
    card.remove();
  });
  actions.appendChild(dismissBtn);

  body.appendChild(actions);
}

function replacePlaceholderWithCard(placeholder, cardData) {
  if (placeholder.dataset.objectUrl) URL.revokeObjectURL(placeholder.dataset.objectUrl);
  const realCard = createMediaCardElement(cardData);
  placeholder.replaceWith(realCard);
  return realCard;
}

// Uploads one file, wiring progress/success/failure into its placeholder card
// (when present) as well as the shared dropzone-widget progress bar/status.
// Used both for the initial batch loop and for a placeholder's Retry button.
async function attemptUpload(file, type, source, csrfToken, placeholder, widget) {
  const { progress, progressBar, statusEl } = widget;

  if (!clientMimeOk(file, type)) {
    const msg = `"${file.name}" is not an allowed file type.`;
    setStatus(statusEl, msg, 'error');
    if (placeholder) markPlaceholderFailed(placeholder, msg, null);
    return;
  }

  if (progress)    progress.style.display  = 'block';
  if (progressBar) progressBar.style.width = '0%';
  setStatus(statusEl, 'Uploading…', '');
  if (placeholder) {
    resetPlaceholderUI(placeholder, type);
    setPlaceholderProgress(placeholder, 0, 'Uploading… 0%');
  }

  try {
    const result = await uploadFileXHR(file, type, source, csrfToken, (pct) => {
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (placeholder) setPlaceholderProgress(placeholder, pct, `Uploading… ${pct}%`);
    });

    if (progressBar) progressBar.style.width = '100%';

    if (result.success) {
      setStatus(statusEl, `${file.name} uploaded.`, 'success');
      document.dispatchEvent(new CustomEvent('unizik:mediaUploaded', { detail: result }));

      if (placeholder) {
        const grid = placeholder.closest('.media-grid');
        const csrfMeta = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
        replacePlaceholderWithCard(placeholder, {
          url: result.url,
          key: result.key,
          filename: file.name,
          type,
          mime: file.type,
          ext: extensionLabel(file.name, file.type),
          sizeLabel: humanFileSize(file.size),
          uploadedLabel: 'just now',
          source,
          uploader: '',
          csrfToken: csrfMeta,
        });
        revealMediaGrid(grid);
      }
    } else {
      const msg = result.error ?? result.message ?? 'Upload failed.';
      setStatus(statusEl, msg, 'error');
      if (placeholder) {
        markPlaceholderFailed(placeholder, msg, () => attemptUpload(file, type, source, csrfToken, placeholder, widget));
      }
    }
  } catch (err) {
    console.error('[dropzone] Upload error:', err);
    const msg = 'Upload failed. Please try again.';
    setStatus(statusEl, msg, 'error');
    if (placeholder) {
      markPlaceholderFailed(placeholder, msg, () => attemptUpload(file, type, source, csrfToken, placeholder, widget));
    }
  } finally {
    setTimeout(() => { if (progress) progress.style.display = 'none'; }, 2000);
  }
}

async function handleFiles(files, zone, type, source, progress, progressBar, statusEl, grid) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
  const fileList  = Array.from(files);
  const widget    = { progress, progressBar, statusEl };

  // Create every placeholder up front so a multi-file batch is fully visible
  // immediately, even though uploads below still run one at a time. Inserted
  // as a single fragment so the batch keeps its selection order at the top
  // of the grid (grid.prepend() per-file would reverse it).
  const placeholders = grid ? fileList.map((file) => createUploadPlaceholder(file, type)) : [];
  if (grid && placeholders.length) {
    const fragment = document.createDocumentFragment();
    placeholders.forEach((p) => fragment.appendChild(p));
    grid.prepend(fragment);
    revealMediaGrid(grid);
  }

  for (let i = 0; i < fileList.length; i++) {
    await attemptUpload(fileList[i], type, source, csrfToken, placeholders[i] ?? null, widget);
  }
}

function setStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'upload-status' + (type ? ` upload-status--${type}` : '');
  el.hidden    = !msg;
}

// ─── 2b. Static image dropzone (faculty/department hero photos, homepage
//         section images) - separate from initDropzone()/handleFiles(), which
//         is hardcoded to the S3 media-upload endpoint. Posts to
//         /api/admin/static-image-upload and swaps the preview <img> in place. ─
function initStaticImageDropzone() {
  document.querySelectorAll('[data-static-image]').forEach((zone) => {
    const fileInput = zone.querySelector('input[type="file"]');
    const preview   = zone.querySelector('.dropzone-preview');
    const statusEl  = zone.querySelector('.upload-status');
    const category  = zone.dataset.category ?? '';
    const key       = zone.dataset.key ?? '';

    const upload = (files) => {
      const file = files?.[0];
      if (!file) return;
      if (!clientMimeOk(file, 'images')) {
        setStatus(statusEl, `"${file.name}" is not an allowed image type.`, 'error');
        return;
      }
      uploadStaticImage(file, category, key, zone, preview, statusEl);
    };

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      upload(e.dataTransfer?.files);
    });

    zone.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a')) return;
      fileInput?.click();
    });

    fileInput?.addEventListener('change', () => {
      upload(fileInput.files);
      fileInput.value = '';
    });
  });
}

async function uploadStaticImage(file, category, key, zone, preview, statusEl) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  formData.append('key', key);

  setStatus(statusEl, 'Uploading…', '');

  try {
    const res = await fetch(apiUrl('/api/admin/static-image-upload'), {
      method:  'POST',
      headers: { 'X-CSRF-Token': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
      body:    formData,
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      // Cache-bust so the preview reflects the just-replaced file immediately.
      if (preview) preview.src = `${data.url}?t=${Date.now()}`;
      setStatus(statusEl, 'Photo updated.', 'success');
    } else {
      setStatus(statusEl, data.error ?? 'Upload failed.', 'error');
    }
  } catch (err) {
    console.error('[static-image] Upload error:', err);
    setStatus(statusEl, 'Network error. Please try again.', 'error');
  }
}

// ─── 3. Media library ─────────────────────────────────────────────────────────
function initMediaLibrary() {
  // Copy URL to clipboard
  document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.media-copy-btn');
    if (!copyBtn) return;

    const url = copyBtn.dataset.url ?? copyBtn.closest('[data-url]')?.dataset.url ?? '';
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
    } catch (err) {
      console.error('[media] Clipboard write failed:', err);
    }
  });

  // Delete media object
  document.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.media-delete-btn');
    if (!deleteBtn) return;

    const card = deleteBtn.closest('.media-card');
    const url  = deleteBtn.dataset.url ?? card?.dataset.url ?? '';
    const key  = deleteBtn.dataset.key ?? card?.dataset.key ?? '';

    if (!confirm('Delete this media file? This cannot be undone.')) return;

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';

    try {
      const res = await fetch(apiUrl('/api/admin/media-delete'), {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ url, key }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success !== false) {
        card?.remove();
      } else {
        alert(data.message ?? 'Delete failed. The file may still be in use.');
      }
    } catch (err) {
      console.error('[media] Delete failed:', err);
      alert('Network error. Please try again.');
    }
  });
}

// ─── 3b. Media preview modal ──────────────────────────────────────────────────
function initMediaPreview() {
  const modal   = document.querySelector('[data-media-preview-modal]');
  if (!modal) return;

  const bodyEl    = modal.querySelector('[data-media-preview-body]');
  const nameEl    = modal.querySelector('[data-media-preview-name]');
  const detailsEl = modal.querySelector('[data-media-preview-details]');
  const copyBtn   = modal.querySelector('[data-media-preview-copy]');
  const openLink  = modal.querySelector('[data-media-preview-open]');

  const TYPE_LABELS = { images: 'Image', pdf: 'PDF', videos: 'Video', audios: 'Audio', docs: 'Document' };
  const TYPE_ICONS  = { pdf: '📄', videos: '🎬', audios: '🎵', docs: '📝' };

  function renderBody(d) {
    bodyEl.innerHTML = '';

    if (d.type === 'images') {
      const img = document.createElement('img');
      img.src = d.url;
      img.alt = d.filename;
      bodyEl.appendChild(img);
      return;
    }

    if (d.type === 'videos') {
      const video = document.createElement('video');
      video.src = d.url;
      video.controls = true;
      video.autoplay = false;
      bodyEl.appendChild(video);
      return;
    }

    if (d.type === 'audios') {
      const audio = document.createElement('audio');
      audio.src = d.url;
      audio.controls = true;
      bodyEl.appendChild(audio);
      return;
    }

    if (d.type === 'pdf') {
      const iframe = document.createElement('iframe');
      iframe.src   = d.url;
      iframe.title = d.filename;
      bodyEl.appendChild(iframe);
      return;
    }

    // Other file types: generic info panel, no fake preview.
    const wrap = document.createElement('div');
    wrap.className = 'media-preview-fileinfo';
    wrap.innerHTML = `
      <span class="media-preview-fileinfo-icon">${TYPE_ICONS[d.type] ?? '📎'}</span>
      <span>Preview isn't available for this file type. Use "Open in new tab" to view or download it.</span>
    `;
    bodyEl.appendChild(wrap);
  }

  function open(card) {
    const d = {
      url:      card.dataset.url ?? '',
      filename: card.dataset.filename ?? 'untitled',
      type:     card.dataset.type ?? '',
      ext:      card.dataset.ext ?? '',
      size:     card.dataset.size ?? '',
      uploaded: card.dataset.uploaded ?? '',
      source:   card.dataset.source ?? '',
      uploader: card.dataset.uploader ?? '',
    };

    renderBody(d);

    nameEl.textContent = d.filename;
    detailsEl.textContent = [
      TYPE_LABELS[d.type] ?? d.type,
      d.ext,
      d.size,
      d.uploaded ? `Uploaded ${d.uploaded}${d.uploader ? ` by ${d.uploader}` : ''}` : null,
      d.source ? `Source: ${d.source}` : null,
    ].filter(Boolean).join(' · ');

    if (copyBtn) copyBtn.dataset.url = d.url;
    if (openLink) openLink.href = d.url;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    modal.hidden = true;
    document.body.style.overflow = '';
    bodyEl.innerHTML = ''; // stop any playing video/audio
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-media-preview-trigger]');
    if (!trigger) return;
    const card = trigger.closest('.media-card');
    if (card) open(card);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close(); // backdrop click
  });

  modal.querySelector('[data-media-preview-close]')?.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
}

// ─── 3c. Media library: multi-select + bulk delete ───────────────────────────
function initMediaBulkSelect() {
  const grid = document.querySelector('.media-grid[data-bulk-select]');
  if (!grid) return;

  const toggleBtn   = document.querySelector('[data-bulk-select-toggle]');
  const bar         = document.querySelector('[data-bulk-actions-bar]');
  const selectAllCb = document.querySelector('[data-bulk-select-all]');
  const countEl     = document.querySelector('[data-bulk-selected-count]');
  const deleteBtn   = document.querySelector('[data-bulk-delete-btn]');
  const cancelBtn   = document.querySelector('[data-bulk-select-cancel]');
  const summaryEl   = document.querySelector('[data-bulk-result-summary]');

  const checkboxes = () => Array.from(grid.querySelectorAll('[data-bulk-checkbox]'));
  const checked    = () => checkboxes().filter((cb) => cb.checked);

  function updateCount() {
    const n = checked().length;
    if (countEl)   countEl.textContent = `${n} selected`;
    if (deleteBtn) deleteBtn.disabled  = n === 0;
    if (selectAllCb) {
      const total = checkboxes().length;
      selectAllCb.checked       = total > 0 && n === total;
      selectAllCb.indeterminate = n > 0 && n < total;
    }
  }

  function setMode(on, { keepSummary = false } = {}) {
    grid.classList.toggle('bulk-select-mode', on);
    if (bar) bar.hidden = !on;
    if (!on) {
      checkboxes().forEach((cb) => {
        cb.checked = false;
        cb.closest('.media-card')?.classList.remove('selected');
      });
      if (summaryEl && !keepSummary) summaryEl.hidden = true;
      updateCount();
    }
  }

  toggleBtn?.addEventListener('click', () => {
    if (summaryEl) summaryEl.hidden = true;
    setMode(!grid.classList.contains('bulk-select-mode'));
  });
  cancelBtn?.addEventListener('click', () => setMode(false));

  grid.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-bulk-checkbox]');
    if (!cb) return;
    cb.closest('.media-card')?.classList.toggle('selected', cb.checked);
    updateCount();
  });

  selectAllCb?.addEventListener('change', () => {
    checkboxes().forEach((cb) => {
      cb.checked = selectAllCb.checked;
      cb.closest('.media-card')?.classList.toggle('selected', cb.checked);
    });
    updateCount();
  });

  deleteBtn?.addEventListener('click', async () => {
    const selected = checked();
    if (!selected.length) return;

    if (!confirm(`Delete ${selected.length} selected file${selected.length === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }

    const cardsByKey = new Map();
    const items = selected.map((cb) => {
      const card = cb.closest('.media-card');
      const item = { key: card?.dataset.key ?? '', url: card?.dataset.url ?? '' };
      cardsByKey.set(item.key || item.url, card);
      return item;
    });

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting…';

    try {
      const res = await fetch(apiUrl('/api/admin/media-delete'), {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ items }),
      });

      const data = await res.json().catch(() => ({}));
      const results = Array.isArray(data.results) ? data.results : [];

      const skippedReasons = [];
      results.forEach((r) => {
        const card = cardsByKey.get(r.key || r.url);
        if (r.success) {
          card?.remove();
        } else {
          card?.classList.remove('selected');
          const label = card?.dataset.filename ?? (r.key || r.url);
          skippedReasons.push(`"${escapeHtml(label)}" — ${escapeHtml(r.error ?? 'delete failed')}`);
        }
      });

      const deleted = data.deleted ?? results.filter((r) => r.success).length;
      const skipped = data.skipped ?? results.filter((r) => !r.success).length;

      if (summaryEl) {
        let html = `<strong>${deleted} deleted</strong>`;
        if (skipped > 0) {
          html += `, ${skipped} skipped`;
          if (skippedReasons.length) {
            html += `<ul>${skippedReasons.map((r) => `<li>${r}</li>`).join('')}</ul>`;
          }
        }
        summaryEl.innerHTML = html;
        summaryEl.hidden = false;
      }
    } catch (err) {
      console.error('[media] Bulk delete failed:', err);
      alert('Network error. Please try again.');
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete selected';
      setMode(false, { keepSummary: true });
    }
  });

  updateCount();
}

// ─── 4. Data table: sort + filter ────────────────────────────────────────────
function initDataTables() {
  // Sortable columns
  document.querySelectorAll('.admin-table [data-sortable]').forEach((th) => {
    th.style.cursor = 'pointer';
    th.setAttribute('tabindex', '0');

    const sort = () => {
      const table  = th.closest('.admin-table');
      const tbody  = table?.querySelector('tbody');
      if (!tbody) return;

      const colIndex = Array.from(th.parentElement.children).indexOf(th);
      const asc = th.dataset.sortDir !== 'asc';
      th.dataset.sortDir = asc ? 'asc' : 'desc';

      // Reset other headers
      table.querySelectorAll('[data-sortable]').forEach((h) => {
        if (h !== th) delete h.dataset.sortDir;
      });

      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const aText = a.cells[colIndex]?.textContent.trim() ?? '';
        const bText = b.cells[colIndex]?.textContent.trim() ?? '';
        // Attempt numeric sort
        const aNum = parseFloat(aText.replace(/[^0-9.-]/g, ''));
        const bNum = parseFloat(bText.replace(/[^0-9.-]/g, ''));
        if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
        return asc ? aText.localeCompare(bText) : bText.localeCompare(aText);
      });

      rows.forEach((row) => tbody.appendChild(row));
    };

    th.addEventListener('click', sort);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter') sort(); });
  });

  // Filter input
  document.querySelectorAll('[data-filter-input]').forEach((input) => {
    const tableId = input.dataset.filterInput;
    const table   = tableId
      ? document.getElementById(tableId)
      : input.closest('.admin-card')?.querySelector('.admin-table');

    if (!table) return;

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      table.querySelectorAll('tbody tr').forEach((row) => {
        const match = row.textContent.toLowerCase().includes(q);
        row.style.display = match ? '' : 'none';
      });
    });
  });
}

// ─── 5. TinyMCE init ─────────────────────────────────────────────────────────
function initTinyMCE() {
  if (typeof tinymce === 'undefined') return;

  const mediaBase = document.documentElement.dataset.mediaBase ?? '';

  tinymce.init({
    selector: '[data-editor]',
    plugins: ['link', 'image', 'lists', 'table', 'code'],
    toolbar:
      'undo redo | formatselect | bold italic | link image | bullist numlist | code',
    menubar: false,
    content_css:  apiUrl('/assets/css/global.css'),
    body_class:   'article-prose',
    images_upload_url: apiUrl('/api/admin/media-upload'),

    // Promise-based handler (TinyMCE 6)
    images_upload_handler: (blobInfo) => {
      return new Promise((resolve, reject) => {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
        const formData  = new FormData();
        formData.append('file',   blobInfo.blob(), blobInfo.filename());
        formData.append('type',   'images');
        formData.append('source', document.querySelector('meta[name="tenant-slug"]')?.content ?? 'main');

        fetch(apiUrl('/api/admin/media-upload'), {
          method:  'POST',
          headers: { 'X-CSRF-Token': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
          body:    formData,
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.url) {
              resolve(data.url);
            } else {
              reject({ message: data.message ?? 'Upload failed', remove: true });
            }
          })
          .catch((err) => {
            console.error('[tinymce] Upload error:', err);
            reject({ message: 'Network error', remove: true });
          });
      });
    },

    // Strip any <img src> that doesn't start with MEDIA_BASE_URL before saving
    setup(editor) {
      editor.on('BeforeSetContent', () => {
        if (!mediaBase) return;
        editor.getBody()?.querySelectorAll('img')?.forEach((img) => {
          if (!img.src.startsWith(mediaBase)) img.remove();
        });
      });
    },
  });
}

// ─── 6. Confirm dialogs ───────────────────────────────────────────────────────
function initFormConfirm() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-confirm]');
    if (!btn) return;
    const message = btn.dataset.confirm || 'Are you sure?';
    if (!confirm(message)) e.preventDefault();
  });
}

// ─── 7. Status toggle (publish/unpublish etc.) ────────────────────────────────
function initStatusToggle() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-toggle-status]');
    if (!btn) return;

    const id      = btn.dataset.id    ?? btn.closest('[data-id]')?.dataset.id;
    const table   = btn.dataset.table ?? btn.closest('[data-table]')?.dataset.table ?? '';
    const field   = btn.dataset.field ?? 'is_published';
    const value   = btn.dataset.value;       // '0' or '1'
    const newVal  = value === '1' ? '0' : '1';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';

    btn.disabled = true;

    try {
      const body = new URLSearchParams({ id, table, field, value: newVal });
      const res = await fetch(apiUrl('/api/admin/toggle-status'), {
        method:  'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-Token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success !== false) {
        // Update the data-value attribute for next toggle
        btn.dataset.value = newVal;

        // Update the badge in the same table row / card
        const row   = btn.closest('tr') ?? btn.closest('.admin-card');
        const badge = row?.querySelector('.badge');
        if (badge) {
          if (field === 'is_published') {
            badge.className = `badge ${newVal === '1' ? 'badge-published' : 'badge-draft'}`;
            badge.textContent = newVal === '1' ? 'Published' : 'Draft';
          } else {
            badge.textContent = newVal === '1' ? 'Active' : 'Inactive';
          }
        }

        // Update button label if it has one
        if (btn.dataset.labelOn && btn.dataset.labelOff) {
          btn.textContent = newVal === '1' ? btn.dataset.labelOff : btn.dataset.labelOn;
        }
      } else {
        alert(data.message ?? 'Failed to update status.');
      }
    } catch (err) {
      console.error('[status-toggle] Error:', err);
      alert('Network error. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });
}

// ─── 8. SEO field live preview + character counter ───────────────────────────
// Pairs with [data-seo-field] inputs (News create/edit forms): shows what
// value will actually be saved when the field is left blank - the live
// content of the field(s) named in data-seo-sources (a comma-separated list
// of CSS selectors, checked in order) - and a running character count
// against data-seo-max. The server (News::resolveSeoFields()) is the
// authoritative source of truth; this is a preview only.
function initSeoFieldHints() {
  document.querySelectorAll('[data-seo-field]').forEach((input) => {
    const wrap      = input.closest('.form-group');
    const previewEl = wrap?.querySelector('[data-seo-preview]');
    const counterEl = wrap?.querySelector('[data-seo-counter]');
    const max       = Number(input.dataset.seoMax || 160);
    const sources   = (input.dataset.seoSources || '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    function fallbackText() {
      for (const sel of sources) {
        const el = document.querySelector(sel);
        const raw = (el?.value ?? '').replace(/\s+/g, ' ').trim();
        if (raw) return raw;
      }
      return '';
    }

    function update() {
      const val = input.value.trim();
      const usingFallback = val === '';
      const fallback = usingFallback ? fallbackText() : '';
      const len = usingFallback ? fallback.length : val.length;

      if (previewEl) {
        if (!usingFallback) {
          previewEl.textContent = '';
        } else if (fallback) {
          const shown = fallback.length > max ? `${fallback.slice(0, max)}…` : fallback;
          previewEl.textContent = `Will use: "${shown}"`;
        } else {
          previewEl.textContent = input.dataset.seoEmptyHint || 'Will be left blank.';
        }
      }

      if (counterEl) {
        counterEl.textContent = `${len} / ${max}`;
        counterEl.classList.toggle('seo-counter-over', len > max);
      }
    }

    input.addEventListener('input', update);
    sources.forEach((sel) => document.querySelector(sel)?.addEventListener('input', update));
    update();
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAdminNav();
  initDropzone();
  initStaticImageDropzone();
  initMediaLibrary();
  initMediaPreview();
  initMediaBulkSelect();
  initDataTables();
  initTinyMCE();
  initFormConfirm();
  initStatusToggle();
  initSeoFieldHints();
});
