// public/assets/js/cirs-staff.js

// ─── FIELD VERIFICATION (verified 2026-06-26 against live API) ───────────────
// Run: fetch('https://cirs.unizik.edu.ng/api/v1/users?type=json&division=faculty&faculty=F002')
// Actual field for full name:        'full_name'
// Actual field for rank/cadre:       'cadre_name'
// Actual field for image URL:        'image'
// Actual field for profile page URL: 'profile_url'
// Actual top-level response key:     'data'  (shape: { status, count, data: [...] })
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initCirsStaff);

function initCirsStaff() {
  const containers = document.querySelectorAll('[data-cirs-staff]');
  containers.forEach(container => {
    const mode = container.dataset.cirsStaff; // 'faculty' or 'department'
    const code = container.dataset.code;
    if (!code) return;
    loadStaff(container, mode, code);
  });
}

function loadStaff(container, mode, code) {
  container.innerHTML = '<div class="cirs-loading"><span></span></div>';
  const division = mode === 'faculty' ? 'faculty' : 'department';
  fetch(`/api/cirs-proxy.php?action=staff&division=${division}&code=${encodeURIComponent(code)}`)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      const allStaff = Array.isArray(data) ? data : (data.data ?? data.users ?? data.staff ?? []);
      if (mode === 'faculty') renderFacultyStaff(container, allStaff);
      else renderDepartmentStaff(container, allStaff);
    })
    .catch(() => {
      container.innerHTML = '<div class="cirs-error">Staff data temporarily unavailable.</div>';
    });
}

function renderFacultyStaff(container, allStaff) {
  const shuffled = shuffleArray([...allStaff]);
  const initial = shuffled.slice(0, 10);
  const remaining = shuffled.slice(10);

  const grid = document.createElement('div');
  grid.className = 'cirs-staff-grid';
  initial.forEach(s => grid.appendChild(buildCard(s)));

  container.innerHTML = '';
  container.appendChild(grid);

  if (remaining.length > 0) {
    const btn = document.createElement('button');
    btn.className = 'cirs-view-all-btn';
    btn.textContent = `View All Staff (${allStaff.length} members)`;
    btn.addEventListener('click', () => {
      remaining.forEach(s => grid.appendChild(buildCard(s)));
      btn.remove();
    });
    container.appendChild(btn);
  }
}

function renderDepartmentStaff(container, allStaff) {
  const grid = document.createElement('div');
  grid.className = 'cirs-staff-grid';
  allStaff.forEach(s => grid.appendChild(buildCard(s)));
  container.innerHTML = '';
  container.appendChild(grid);
}

function buildCard(staff) {
  const name       = staff['full_name']   ?? 'Unknown';
  const rank       = staff['cadre_name']  ?? '';
  const imageUrl   = staff['image']       ?? '';
  const profileUrl = staff['profile_url'] ?? '';

  const card = document.createElement('div');
  card.className = 'cirs-staff-card';
  card.dataset.profileUrl = profileUrl;

  // data-image-fallback + a hidden sibling with the SAME .cirs-staff-initials markup the
  // no-photo branch already uses - public/assets/js/image-fallback.js's single delegated
  // listener reveals this sibling and removes the <img> on a failed load (audit I5: this
  // widget hotlinks cirs.unizik.edu.ng with no failure handling at all, before this change).
  // getInitials() below is untouched - same function, same logic, only the failure path is
  // new.
  const photoHtml = hasPhoto(imageUrl)
    ? `<img src="${escAttr(imageUrl)}" alt="${escAttr(name)}" loading="lazy" data-image-fallback>`
    + `<div class="cirs-staff-initials" aria-hidden="true" hidden>${escHtml(getInitials(name))}</div>`
    : `<div class="cirs-staff-initials" aria-hidden="true">${escHtml(getInitials(name))}</div>`;

  card.innerHTML = `
    <div class="cirs-staff-photo">${photoHtml}</div>
    <div class="cirs-staff-body">
      <p class="cirs-staff-name">${escHtml(name)}</p>
      <p class="cirs-staff-rank">${escHtml(rank)}</p>
      ${profileUrl ? `<button class="cirs-view-btn btn-secondary" data-profile-url="${escAttr(profileUrl)}">View Profile</button>` : ''}
    </div>`;

  return card;
}

// Click delegation — opens profile modal via cirs-profile.js
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-profile-url]');
  if (!btn) return;
  const url = btn.dataset.profileUrl;
  if (url && typeof openProfileModal === 'function') openProfileModal(url);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasPhoto(imageUrl) {
  return imageUrl && !imageUrl.includes('no-photo.jpg') && imageUrl.trim() !== '';
}

function getInitials(name) {
  return name.trim().split(/\s+/)
    .filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('');
}

function shuffleArray(arr) {
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;').replace(/</g, '&lt;');
}
