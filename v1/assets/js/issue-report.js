// public/assets/js/issue-report.js
'use strict';

// ─── 1. Init ───────────────────────────────────────────────────────────────────
function initIssueReportForm() {
  const form = document.querySelector('[data-issue-form]');
  if (!form) return;

  prefillPageUrl(form);
  prefillFrom404(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // ── Honeypot: invisible field must be empty ───────────────────────────
    const honeypot = form.querySelector('[name="website"]');
    if (honeypot?.value !== '') {
      // Silent no-op - bots get no feedback, nothing is submitted.
      return;
    }

    const { valid, errors } = validate(form);

    clearErrors(form);

    if (!valid) {
      displayErrors(form, errors);
      return;
    }

    await submitForm(form);
  });
}

// ─── 2. Prefill ───────────────────────────────────────────────────────────────
function prefillPageUrl(form) {
  const field = form.querySelector('[name="page_url"]');
  if (!field) return;

  const params = new URLSearchParams(window.location.search);
  field.value = params.get('url') || document.referrer || '';
}

function prefillFrom404(form) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('from') !== '404') return;

  const category = form.querySelector('[name="category"]');
  if (category) category.value = 'missing_page';

  const blocking = form.querySelector('[name="severity"][value="blocking"]');
  if (blocking) blocking.checked = true;
}

// ─── 3. Validate (mirrors server-side rules - server remains authoritative) ────
function validate(form) {
  const data   = new FormData(form);
  const errors = {};

  const category = (data.get('category') ?? '').trim();
  const validCategories = ['broken_link', 'missing_content', 'wrong_info', 'missing_page', 'display_bug', 'accessibility', 'other'];
  if (!validCategories.includes(category)) errors.category = 'Please choose what kind of problem this is.';

  const title = (data.get('title') ?? '').trim();
  if (!title)                    errors.title = 'Please enter a title.';
  else if (title.length < 5)     errors.title = 'Title must be at least 5 characters.';
  else if (title.length > 200)   errors.title = 'Title must be 200 characters or fewer.';

  const body = (data.get('body') ?? '').trim();
  if (!body)                   errors.body = 'Please describe what happened.';
  else if (body.length < 20)   errors.body = 'Description must be at least 20 characters.';
  else if (body.length > 2000) errors.body = 'Description must be 2,000 characters or fewer.';

  const email = (data.get('reporter_email') ?? '').trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRe.test(email)) errors.reporter_email = 'Please enter a valid email address, or leave it blank.';

  const name = (data.get('reporter_name') ?? '').trim();
  if (name && (name.length < 2 || name.length > 100)) errors.reporter_name = 'Name must be between 2 and 100 characters.';

  return { valid: Object.keys(errors).length === 0, errors };
}

// ─── 4. Submit ────────────────────────────────────────────────────────────────
async function submitForm(form) {
  const submit = form.querySelector('[type="submit"]');
  const data   = new FormData(form);

  const payload = {
    csrf_token:     data.get('csrf_token') ?? '',
    website:        data.get('website') ?? '',
    category:       data.get('category') ?? '',
    severity:       data.get('severity') ?? 'degraded',
    page_url:       data.get('page_url') ?? '',
    title:          data.get('title') ?? '',
    body:           data.get('body') ?? '',
    reporter_role:  data.get('reporter_role') ?? '',
    reporter_name:  data.get('reporter_name') ?? '',
    reporter_email: data.get('reporter_email') ?? '',
  };

  const httpStatusParam = new URLSearchParams(window.location.search).get('from') === '404' ? 404 : '';
  if (httpStatusParam) payload.http_status = httpStatusParam;

  try {
    if (submit) { submit.disabled = true; submit.textContent = 'Submitting…'; }

    const res = await fetch(form.action, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-CSRF-Token':  payload.csrf_token,
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json().catch(() => ({}));

    if (res.ok && result.success) {
      showSuccess(form, result.reference ?? '');
    } else if (res.status >= 400 && res.status < 500 && result.errors) {
      displayErrors(form, result.errors);
    } else {
      showFormError(form, result.message ?? 'Something went wrong. Please try again.');
    }
  } catch (err) {
    console.error('[issue-report] Submit failed:', err);
    showFormError(form, 'Network error. Please check your connection and try again.');
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = 'Submit Report'; }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clearErrors(form) {
  form.querySelectorAll('[data-field-error]').forEach((el) => {
    el.textContent = '';
    el.hidden = true;
  });
  form.querySelectorAll('.form-input.error').forEach((el) => {
    el.classList.remove('error');
  });
}

function displayErrors(form, errors) {
  let firstField = null;

  Object.entries(errors).forEach(([field, message]) => {
    const errorEl = form.querySelector(`[data-field-error="${field}"]`);
    const inputEl = form.querySelector(`[name="${field}"]`);

    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden      = false;
    }
    inputEl?.classList.add('error');
    inputEl?.setAttribute('aria-invalid', 'true');

    if (!firstField) firstField = inputEl;
  });

  firstField?.focus();
}

function showSuccess(form, reference) {
  const successBlock = document.getElementById('issueSuccess');
  const refEl         = document.getElementById('issueSuccessRef');
  const errorDiv       = document.getElementById('issueError');

  if (refEl) refEl.textContent = reference;
  if (successBlock) {
    successBlock.hidden = false;
    successBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (errorDiv) errorDiv.hidden = true;

  form.hidden = true;
}

function showFormError(form, message) {
  const errorDiv = document.getElementById('issueError');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.hidden = false;
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initIssueReportForm);
