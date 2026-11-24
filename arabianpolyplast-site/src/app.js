/* Arabian Polyplast — tiny progressive enhancement (nav + lead form) */
(function () {
  'use strict';

  var API = 'https://whatanagent.duckdns.org/api/lead';

  /* mobile nav */
  var nav = document.getElementById('siteNav');
  var toggle = document.getElementById('navToggle');
  if (nav && toggle) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'A') nav.classList.remove('open');
    });
  }

  /* lead forms — post to the WhatAnAgent lead API (CORS allow-list on the server) */
  var forms = document.querySelectorAll('form.lead-form');
  Array.prototype.forEach.call(forms, function (form) {
    var status = form.querySelector('.form-status');
    var btn = form.querySelector('button[type="submit"]');

    /* ?material=PET%20Flakes prefills the product select */
    try {
      var wanted = new URLSearchParams(window.location.search).get('material');
      var select = form.querySelector('select[name="material"]');
      if (wanted && select) {
        Array.prototype.forEach.call(select.options, function (o) {
          if (o.value.toLowerCase() === wanted.toLowerCase()) select.value = o.value;
        });
      }
    } catch (e) { /* older browsers: skip prefill */ }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = {};
      Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (field) {
        if (!field.name) return;
        data[field.name] = field.value;
      });

      if (!String(data.name || '').trim() || (!String(data.phone || '').trim() && !String(data.email || '').trim())) {
        if (status) { status.className = 'form-status err'; status.textContent = 'Please enter your name and a phone number or email.'; }
        return;
      }

      data.source = form.dataset.source || 'arabianpolyplast.com';
      data.page = window.location.pathname;

      if (btn) btn.disabled = true;
      if (status) { status.className = 'form-status'; status.textContent = 'Sending…'; }

      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j || {} }; }); })
        .then(function (res) {
          if (!res.ok || res.j.ok === false) throw new Error(res.j.error || 'Could not send the enquiry');
          if (status) {
            status.className = 'form-status ok';
            status.textContent = 'Thank you — your enquiry reached our team. We reply within one working day.';
          }
          form.reset();
        })
        .catch(function (err) {
          if (status) {
            status.className = 'form-status err';
            status.textContent = (err && err.message ? err.message : 'Could not send') +
              ' — please try again, or email info@arabianpolyplast.com.';
          }
        })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  });
})();
