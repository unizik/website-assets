// public/assets/js/contact.js
'use strict';

// ─── 1. Init ───────────────────────────────────────────────────────────────────
function initContactForm() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // ── Honeypot: invisible field must be empty ───────────────────────────
    const honeypot = form.querySelector('[name="website"]');
    if (honeypot?.value !== '') {
      // Silent reject - bots get no feedback
      showSuccess(form);
      return;
    }

    const { valid, errors } = validate(form);

    clearErrors(form);

    if (!valid) {
      displayErrors(form, errors);
      // Move focus to the first errored field
      const firstError = form.querySelector('[data-field-error]:not(:empty)');
      firstError?.previousElementSibling?.focus();
      return;
    }

    await submitForm(form);
  });
}

// ─── 2. Validate ──────────────────────────────────────────────────────────────
function validate(form) {
  const data   = new FormData(form);
  const errors = {};

  // name
  const name = (data.get('name') ?? '').trim();
  if (!name)              errors.name = 'Please enter your name.';
  else if (name.length < 2)  errors.name = 'Name must be at least 2 characters.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';

  // email
  const email = (data.get('email') ?? '').trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email)             errors.email = 'Please enter your email address.';
  else if (!emailRe.test(email)) errors.email = 'Please enter a valid email address.';

  // message
  const message = (data.get('message') ?? '').trim();
  if (!message)                   errors.message = 'Please enter a message.';
  else if (message.length < 10)   errors.message = 'Message must be at least 10 characters.';
  else if (message.length > 2000) errors.message = 'Message must be 2000 characters or fewer.';

  // Optional subject - no constraint beyond length
  const subject = (data.get('subject') ?? '').trim();
  if (subject.length > 300) errors.subject = 'Subject must be 300 characters or fewer.';

  return { valid: Object.keys(errors).length === 0, errors };
}

// ─── 3. Submit ────────────────────────────────────────────────────────────────
async function submitForm(form) {
  const submit = form.querySelector('[type="submit"]');

  try {
    if (submit) { submit.disabled = true; submit.textContent = 'Sending…'; }

    const res = await fetch(form.action, {
      method:  'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body:    new URLSearchParams(new FormData(form)),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success !== false) {
      showSuccess(form);
      form.reset();
    } else {
      const msg = data.message ?? 'Something went wrong. Please try again.';
      showFormError(form, msg);
      // Turnstile tokens are single-use - reset the widget so a retry gets a fresh one.
      window.turnstile?.reset();
    }
  } catch (err) {
    console.error('[contact] Submit failed:', err);
    showFormError(form, 'Network error. Please check your connection and try again.');
    window.turnstile?.reset();
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = 'Send Message'; }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clearErrors(form) {
  form.querySelectorAll('[data-field-error]').forEach((el) => {
    el.textContent = '';
    el.hidden = true;
  });
  form.querySelectorAll('.form-input--error, .form-textarea--error').forEach((el) => {
    el.classList.remove('form-input--error', 'form-textarea--error');
  });
}

function displayErrors(form, errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const errorEl = form.querySelector(`[data-field-error="${field}"]`);
    const inputEl = form.querySelector(`[name="${field}"]`);

    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden      = false;
    }
    inputEl?.classList.add('form-input--error');
    inputEl?.setAttribute('aria-invalid', 'true');
  });
}

function showSuccess(form) {
  const successDiv = form.querySelector('.form-success')
    ?? form.closest('[data-contact-section]')?.querySelector('.form-success');
  const errorDiv   = form.querySelector('.form-error')
    ?? form.closest('[data-contact-section]')?.querySelector('.form-error');

  if (successDiv) { successDiv.hidden = false; successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  if (errorDiv)   errorDiv.hidden = true;
  form.hidden = true;
}

function showFormError(form, message) {
  const errorDiv = form.querySelector('.form-error')
    ?? form.closest('[data-contact-section]')?.querySelector('.form-error');

  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.hidden = false;
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initContactForm);
