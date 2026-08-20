// public/assets/js/image-fallback.js

// ─── Shared onerror → initials swap for hotlinked external photos ────────────
// Built for CampusEdge dean/HOD photos (app/services/DeanHodResolver.php,
// image_url is a live cirs.unizik.edu.ng hotlink - audit I3 measured a real,
// live broken URL, a 302 redirect to CIRS's own /404 page) and retrofitted
// onto public/assets/js/cirs-staff.js's staff-directory cards, which already
// hotlink the same host (audit I2) with no failure handling at all until now
// (audit I5).
//
// Contract: an <img data-image-fallback> must be immediately followed, in the
// DOM, by ONE sibling element carrying the `hidden` attribute - that sibling
// is whatever initials markup the call site already uses
// (.dean-photo-initials / .hod-initials / .officer-initials /
// .cirs-staff-initials - see each template for its own class). This script
// never creates, styles, or fills in that element's content - it is already
// server- or client-rendered with the correct initials text by the caller
// (DeanHodResolver::initials() for the PHP templates, cirs-staff.js's own
// getInitials() for the staff-directory widget - see each call site). This
// script's only job is: on the <img>'s error event, un-hide that sibling and
// remove the <img>.
//
// ONE delegated listener for the whole page, capture phase (the 'error' event
// does not bubble, so a plain document-level listener without { capture:
// true } would never see it) - matches this codebase's existing single-
// delegated-listener pattern (cirs-staff.js's own document-level 'click'
// listener for profile-view buttons, cirs-staff.js:97-102). No inline
// onerror="" attributes anywhere. Because this listens on `document` rather
// than a specific container, it needs no wiring per template and no load-
// order dependency on cirs-staff.js - it catches failures from server-
// rendered <img> tags present at page load AND from <img> tags cirs-staff.js
// creates later (after its fetch() resolves) identically, as long as both
// mark their <img> with data-image-fallback and follow it with a hidden
// initials sibling.

document.addEventListener('error', handleImageFallback, true);

function handleImageFallback(e) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-image-fallback')) {
    return;
  }

  const fallback = img.nextElementSibling;
  if (fallback) {
    fallback.hidden = false;
  }

  img.remove();
}
