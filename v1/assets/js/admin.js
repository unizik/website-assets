// public/assets/js/admin.js
'use strict';

// Base path prefix for API calls ('' in prod, '/nau' on XAMPP local dev).
const APP_BASE = document.querySelector('meta[name="app-base"]')?.content ?? '';

function apiUrl(path) {
  return APP_BASE + path;
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
//
// Two modes, chosen per-dropzone via the [data-dropzone-ajax] attribute:
//
//  - Default (form-field mode): the dropzone wraps a named <input type="file">
//    that is part of a surrounding <form> (news/events/staff/documents/etc. -
//    the PHP controller reads $_FILES on that form's normal POST). Here the
//    dropzone must NOT upload anything itself - it only has to get the chosen
//    file(s) into that <input> (via a DataTransfer on drop; the browser does
//    it natively on click) and show a preview, so the real form submission
//    carries the file to the server exactly once.
//
//  - [data-dropzone-ajax] (media-library pages): there is no surrounding
//    <form>/named field to submit - the dropzone itself is the only upload
//    mechanism, so it uploads immediately via XHR to /api/admin/media-upload.
function initDropzone() {
  document.querySelectorAll('[data-dropzone]').forEach((zone) => {
    const fileInput  = zone.querySelector('input[type="file"]');
    const progress   = zone.querySelector('.upload-progress');
    const progressBar = zone.querySelector('.upload-progress-fill');
    const statusEl   = zone.querySelector('.upload-status');
    const uploadType = zone.dataset.uploadType ?? 'images';
    const uploadSrc  = zone.dataset.uploadSource ?? 'main';
    const ajaxMode   = zone.hasAttribute('data-dropzone-ajax');

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
      if (!files?.length) return;

      if (ajaxMode) {
        handleFiles(files, zone, uploadType, uploadSrc, progress, progressBar, statusEl);
        return;
      }

      // Form-field mode: move the dropped file(s) into the real <input>
      // so they ride along with the surrounding form's normal submission.
      if (fileInput) {
        const dt = new DataTransfer();
        Array.from(files).forEach((f) => dt.items.add(f));
        fileInput.files = dt.files;
      }
      showDropzonePreview(zone, files[0]);
    });

    // ── Click to open file picker ──────────────────────────────────────────
    zone.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a')) return;
      fileInput?.click();
    });

    // ── File input change ──────────────────────────────────────────────────
    fileInput?.addEventListener('change', () => {
      if (!fileInput.files?.length) return;

      if (ajaxMode) {
        handleFiles(fileInput.files, zone, uploadType, uploadSrc, progress, progressBar, statusEl);
        fileInput.value = ''; // Reset so the same file can be re-uploaded if needed
        return;
      }

      // Form-field mode: leave the file on the input - the surrounding form
      // submits it normally. Just show a preview.
      showDropzonePreview(zone, fileInput.files[0]);
    });
  });
}

// Local (no-upload) preview for form-field-mode dropzones: swaps in an
// image preview for image files, and always surfaces the chosen filename.
function showDropzonePreview(zone, file) {
  if (!file) return;

  if (file.type?.startsWith('image/')) {
    let preview = zone.querySelector('.dropzone-preview');
    if (!preview) {
      preview = document.createElement('img');
      preview.className = 'dropzone-preview';
      zone.insertBefore(preview, zone.firstChild);
    }
    preview.src = URL.createObjectURL(file);
  }

  let nameEl = zone.querySelector('.upload-status') || zone.querySelector('.dropzone-filename');
  if (!nameEl) {
    nameEl = document.createElement('p');
    nameEl.className = 'form-hint dropzone-filename';
    zone.appendChild(nameEl);
  }
  nameEl.textContent = `Selected: ${file.name}`;
  nameEl.hidden = false;
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

function clientMimeOk(file, type) {
  const allowed = ALLOWED_CLIENT_TYPES[type] ?? [];
  return allowed.some((m) => file.type === m || file.type.startsWith(m));
}

async function handleFiles(files, zone, type, source, progress, progressBar, statusEl) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';

  for (const file of Array.from(files)) {
    // Belt-and-suspenders client-side MIME check (server re-validates with finfo)
    if (!clientMimeOk(file, type)) {
      setStatus(statusEl, `"${file.name}" is not an allowed file type.`, 'error');
      continue;
    }

    const formData = new FormData();
    formData.append('file',   file);
    formData.append('type',   type);
    formData.append('source', source);

    if (progress)    progress.style.display    = 'block';
    if (progressBar) progressBar.style.width   = '0%';
    setStatus(statusEl, 'Uploading…', '');

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl('/api/admin/media-upload'));
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && progressBar) {
          progressBar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
        }
      });

      const result = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('Invalid server response')); }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });

      if (progressBar) progressBar.style.width = '100%';

      if (result.success) {
        setStatus(statusEl, `${file.name} uploaded.`, 'success');
        // Notify the media library to refresh if on the same page
        document.dispatchEvent(new CustomEvent('unizik:mediaUploaded', { detail: result }));
      } else {
        setStatus(statusEl, result.message ?? 'Upload failed.', 'error');
      }
    } catch (err) {
      console.error('[dropzone] Upload error:', err);
      setStatus(statusEl, 'Upload failed. Please try again.', 'error');
    } finally {
      setTimeout(() => { if (progress) progress.style.display = 'none'; }, 2000);
    }
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

// ─── 5b. Slug auto-generation from title ───────────────────────────────────────
// Mirrors News::generateSlug()'s cleaning rules (lowercase, non-alnum -> '-',
// collapse/trim hyphens) so the preview the admin sees matches what the
// server will actually save.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function initSlugAutoGen() {
  document.querySelectorAll('input[name="slug"]').forEach((slugInput) => {
    const titleInput = slugInput.closest('form')?.querySelector('input[name="title"]');
    if (!titleInput) return;

    // Stop auto-filling as soon as the admin edits the slug themselves,
    // so their manual choice is never clobbered by further title edits.
    let slugEdited = slugInput.value.trim() !== '';
    slugInput.addEventListener('input', () => { slugEdited = true; });

    titleInput.addEventListener('input', () => {
      if (slugEdited) return;
      slugInput.value = slugify(titleInput.value);
    });
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

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAdminNav();
  initDropzone();
  initStaticImageDropzone();
  initMediaLibrary();
  initDataTables();
  initTinyMCE();
  initSlugAutoGen();
  initFormConfirm();
  initStatusToggle();
});
