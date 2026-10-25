/* =========================================================================
   scamover9 fluid.js
   Shared by labscamover9.com and sammycampos.com. No dependencies.
   - Springs use Apple's two parameters: response (seconds) and damping ratio.
   - Every animation starts from what is on screen and carries velocity, so it
     can be grabbed and reversed mid-flight.
   - Damping 1.0 everywhere by default. Bounce (0.8) only after a flick.
   ========================================================================= */
(function () {
  'use strict';

  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mq.matches;
  if (mq.addEventListener) mq.addEventListener('change', function (e) { reduced = e.matches; });

  // iOS only applies :active on touch when a touch listener exists
  document.addEventListener('touchstart', function () {}, { passive: true });

  /* ---------------- Spring ---------------- */
  function Spring(value, onUpdate) {
    this.value = value; this.velocity = 0; this.target = value;
    this.onUpdate = onUpdate; this.raf = 0; this.onRest = null;
    if (onUpdate) onUpdate(value);
  }
  Spring.prototype.solve = function (t) {
    var x0 = this.x0, v0 = this.v0, w = this.w, z = this.z;
    if (z >= 1) {
      var e = Math.exp(-w * t), B = v0 + w * x0;
      return [(x0 + B * t) * e, B * e - w * (x0 + B * t) * e];
    }
    var wd = w * Math.sqrt(1 - z * z), ez = Math.exp(-z * w * t);
    var C = x0, D = (v0 + z * w * x0) / wd, c = Math.cos(wd * t), s = Math.sin(wd * t);
    var x = ez * (C * c + D * s);
    return [x, -z * w * x + ez * (-C * wd * s + D * wd * c)];
  };
  Spring.prototype.sample = function () {
    if (!this.raf) return;
    var r = this.solve((performance.now() - this.t0) / 1000);
    this.value = this.target + r[0]; this.velocity = r[1];
  };
  Spring.prototype.stop = function () {
    if (this.raf) { this.sample(); cancelAnimationFrame(this.raf); this.raf = 0; }
  };
  Spring.prototype.set = function (v) {
    this.stop(); this.value = this.target = v; this.velocity = 0;
    if (this.onUpdate) this.onUpdate(v);
  };
  Spring.prototype.to = function (target, o) {
    o = o || {};
    var self = this;
    this.sample();                                   // presentation value, not the old target
    if (o.velocity !== undefined) this.velocity = o.velocity;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.target = target; this.onRest = o.onRest || null;
    this.x0 = this.value - target; this.v0 = this.velocity;
    this.w = (2 * Math.PI) / (o.response || 0.4); this.z = o.damping === undefined ? 1 : o.damping;
    var precision = o.precision || 0.01;
    this.t0 = performance.now();
    var tick = function () {
      var r = self.solve((performance.now() - self.t0) / 1000);
      self.value = target + r[0]; self.velocity = r[1];
      if (Math.abs(r[0]) < precision && Math.abs(r[1]) < precision * 10) {
        self.value = target; self.velocity = 0; self.raf = 0;
        if (self.onUpdate) self.onUpdate(target);
        var cb = self.onRest; self.onRest = null; if (cb) cb();
        return;
      }
      if (self.onUpdate) self.onUpdate(self.value);
      self.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };

  /* Velocity from the last ~100ms of pointer samples */
  function Tracker() { this.s = []; }
  Tracker.prototype.reset = function () { this.s = []; };
  Tracker.prototype.add = function (p) {
    var t = performance.now(); this.s.push({ t: t, p: p });
    while (this.s.length > 2 && t - this.s[0].t > 100) this.s.shift();
  };
  Tracker.prototype.velocity = function () {
    if (this.s.length < 2) return 0;
    var a = this.s[0], b = this.s[this.s.length - 1], dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.p - a.p) / dt : 0;
  };

  // Apple's momentum projection (Designing Fluid Interfaces)
  function project(v, d) { d = d || 0.998; return (v / 1000) * d / (1 - d); }
  // Progressive resistance past a boundary
  function rubber(over, dim, c) { c = c || 0.55; return Math.sign(over) * (Math.abs(over) * dim * c) / (dim + c * Math.abs(over)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ---------------- Theme ---------------- */
  function initTheme(key) {
    var root = document.documentElement, btn = document.getElementById('theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    function paint() {
      var dark = root.dataset.theme === 'dark';
      if (meta) meta.setAttribute('content', dark ? '#080c12' : '#f3f5fa');
      if (!btn) return;
      var sun = btn.querySelector('.sun'), moon = btn.querySelector('.moon'), label = btn.querySelector('.tlabel');
      if (sun) sun.style.display = dark ? '' : 'none';
      if (moon) moon.style.display = dark ? 'none' : '';
      if (label) label.textContent = dark ? 'Light' : 'Dark';
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }
    paint();
    if (btn) btn.addEventListener('click', function () {
      if (!reduced) root.classList.add('theme-anim');
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, root.dataset.theme); } catch (e) {}
      paint();
      setTimeout(function () { root.classList.remove('theme-anim'); }, 400);
    });
  }

  /* ---------------- Top bar scroll edge ---------------- */
  function initBar() {
    var bar = document.querySelector('.bar'); if (!bar) return;
    var on = function () { bar.classList.toggle('scrolled', window.scrollY > 4); };
    window.addEventListener('scroll', on, { passive: true }); on();
  }

  /* ---------------- Segmented control ----------------
     Tap a segment, or grab the selected one and drag/flick it.
     opts.onSelect(index, previous) */
  function segmented(seg, opts) {
    opts = opts || {};
    var PAD = 3;
    var thumb = seg.querySelector('.seg-thumb');
    var tabs = Array.prototype.slice.call(seg.querySelectorAll('.seg-btn'));
    var idx = Math.max(0, tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; }));
    var segW = 0, scale = 1, pos = 0;
    var paint = function () { thumb.style.transform = 'translateX(' + pos + 'px) scale(' + scale + ')'; };
    var X = new Spring(0, function (v) { pos = v; paint(); });
    var S = new Spring(1, function (v) { scale = v; paint(); });

    function measure() {
      segW = (seg.clientWidth - PAD * 2) / tabs.length;
      thumb.style.width = segW + 'px';
      X.set(idx * segW);
    }
    if (window.ResizeObserver) new ResizeObserver(measure).observe(seg); else window.addEventListener('resize', measure);
    measure();

    function select(i, o) {
      o = o || {};
      i = clamp(i, 0, tabs.length - 1);
      var prev = idx; idx = i;
      tabs.forEach(function (t, k) { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      if (o.focus) tabs[i].focus();
      if (reduced) X.set(i * segW);
      else X.to(i * segW, { velocity: o.velocity, response: 0.35, damping: o.momentum ? 0.8 : 1, precision: 0.1 });
      if (i !== prev && opts.onSelect) opts.onSelect(i, prev);
    }

    var tr = new Tracker(), mode = null, grab = 0, pending = -1, left = 0;
    seg.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.seg-btn'); if (!b || e.button > 0) return;
      var i = tabs.indexOf(b);
      left = seg.getBoundingClientRect().left + 1 + PAD;
      seg.setPointerCapture(e.pointerId);
      if (i === idx) {
        mode = 'drag'; X.stop();
        grab = e.clientX - left - X.value;                   // keep the grab offset
        tr.reset(); tr.add(e.clientX);
        if (!reduced) S.to(0.95, { response: 0.25, precision: 0.001 });
        seg.classList.add('dragging');
      } else {
        mode = 'tap'; pending = i; b.classList.add('down');  // feedback on press
      }
    });
    seg.addEventListener('pointermove', function (e) {
      if (mode === 'drag') {
        var max = (tabs.length - 1) * segW, x = e.clientX - left - grab;
        if (x < 0) x = rubber(x, segW); else if (x > max) x = max + rubber(x - max, segW);
        X.set(x); tr.add(e.clientX);
      } else if (mode === 'tap') {
        var r = tabs[pending].getBoundingClientRect(), h = 10;
        var inside = e.clientX > r.left - h && e.clientX < r.right + h && e.clientY > r.top - h && e.clientY < r.bottom + h;
        tabs[pending].classList.toggle('down', inside);
      }
    });
    function end(cancelled) {
      if (mode === 'drag') {
        var v = tr.velocity();
        var landing = X.value + project(v);
        if (!reduced) S.to(1, { response: 0.3, precision: 0.001 });
        select(Math.round(clamp(landing, 0, (tabs.length - 1) * segW) / segW), { velocity: v, momentum: Math.abs(v) > 200 });
        seg.classList.remove('dragging');
      } else if (mode === 'tap') {
        var b = tabs[pending], fire = b.classList.contains('down') && !cancelled;
        b.classList.remove('down');
        if (fire) select(pending);
      }
      mode = null; pending = -1;
    }
    seg.addEventListener('pointerup', function () { end(false); });
    seg.addEventListener('pointercancel', function () { end(true); });
    seg.addEventListener('keydown', function (e) {
      var map = { ArrowRight: idx + 1, ArrowLeft: idx - 1, Home: 0, End: tabs.length - 1 };
      if (e.key in map) { e.preventDefault(); select(map[e.key], { focus: true }); }
    });
    tabs.forEach(function (t, i) { t.addEventListener('click', function (e) { if (e.detail === 0) select(i); }); });
    return { select: select, get index() { return idx; } };
  }

  /* ---------------- Sheet / drawer ----------------
     edge 'bottom': rises from the bottom, dismisses down.
     edge 'top': drops from the top bar, dismisses up.
     Both enter and leave along the same path. */
  var openCount = 0;
  function createSheet(sheet, opts) {
    opts = opts || {};
    var dir = opts.edge === 'top' ? -1 : 1;
    var scrim = opts.scrim, grabEl = opts.grab || sheet;
    var H = 0, isOpen = false, opener = null, inerted = [];

    var Y = new Spring(0, function (y) {
      sheet.style.transform = 'translateY(' + y + 'px)';
      if (scrim) scrim.style.opacity = H ? String(clamp(1 - Math.abs(y) / H, 0, 1)) : '0';
    });

    function lock(on) {
      if (on) {
        document.documentElement.style.overflow = 'hidden';
        inerted = Array.prototype.filter.call(document.body.children, function (el) {
          return el !== sheet && el !== scrim && el.tagName !== 'SCRIPT' && !el.inert;
        });
        inerted.forEach(function (el) { el.inert = true; });
      } else {
        document.documentElement.style.overflow = '';
        inerted.forEach(function (el) { el.inert = false; }); inerted = [];
      }
    }

    function open(from) {
      opener = from || document.activeElement;
      var wasHidden = sheet.hidden;
      sheet.hidden = false; if (scrim) scrim.classList.add('live');
      H = sheet.offsetHeight + 24;
      if (wasHidden) Y.set(H * dir);
      if (!isOpen) { isOpen = true; lock(true); }
      if (opts.onOpen) opts.onOpen();
      if (reduced) {
        sheet.classList.add('fade'); sheet.style.opacity = '0'; Y.set(0);
        requestAnimationFrame(function () { sheet.style.opacity = '1'; });
      } else {
        Y.to(0, { response: 0.4, precision: 0.5 });
      }
      var f = sheet.querySelector('[data-autofocus]') || sheet.querySelector('button, a[href]');
      if (f) f.focus({ preventScroll: true });
    }

    function close(o) {
      o = o || {};
      if (!isOpen) return;
      isOpen = false; lock(false);
      if (scrim) scrim.classList.remove('live');
      if (opts.onClose) opts.onClose();
      var done = function () {
        if (isOpen) return;
        sheet.hidden = true;
        if (opener && o.restoreFocus !== false) opener.focus({ preventScroll: true });
      };
      if (reduced) {
        sheet.style.opacity = '0'; if (scrim) scrim.style.opacity = '0';
        setTimeout(function () { Y.set(H * dir); sheet.style.opacity = ''; done(); }, 200);
      } else {
        Y.to(H * dir, { velocity: o.velocity, response: 0.35, precision: 0.5, onRest: done });
      }
    }

    function settle(v) {
      var landing = Y.value + project(v, 0.99);
      var away = v * dir, far = landing * dir;
      if (away > 400 || (away > -400 && far > H * 0.45)) close({ velocity: v });
      else if (reduced) Y.set(0);
      else Y.to(0, { velocity: v, response: 0.3, damping: Math.abs(v) > 400 ? 0.8 : 1, precision: 0.5 });
    }

    // Drag 1:1 from the grab area. Grabbing mid-close reverses it.
    var tr = new Tracker(), dragging = false, moved = false, startY = 0, startVal = 0;
    grabEl.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button, a') || e.button > 0) return;
      grabEl.setPointerCapture(e.pointerId);
      Y.stop();
      if (!isOpen) { isOpen = true; lock(true); if (scrim) scrim.classList.add('live'); }
      dragging = true; moved = false; startY = e.clientY; startVal = Y.value;
      tr.reset(); tr.add(e.clientY); sheet.classList.add('dragging');
    });
    grabEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 4) return;
      moved = true;
      var y = startVal + dy;
      if (y * dir < 0) y = rubber(y, H);                      // past fully open: resist
      Y.set(y); tr.add(e.clientY);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false; sheet.classList.remove('dragging');
      settle(moved ? tr.velocity() : 0);
    }
    grabEl.addEventListener('pointerup', endDrag);
    grabEl.addEventListener('pointercancel', endDrag);

    if (scrim) scrim.addEventListener('click', function () { if (isOpen) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(); });
    sheet.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = Array.prototype.slice.call(sheet.querySelectorAll('a[href], button:not([disabled])'));
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return { open: open, close: close, get isOpen() { return isOpen; } };
  }

  /* ---------------- Mobile menu (top drawer) ---------------- */
  function initMenu() {
    var btn = document.getElementById('menu-btn'), menu = document.getElementById('menu'), scrim = document.getElementById('menu-scrim');
    if (!btn || !menu) return;
    var d = createSheet(menu, {
      edge: 'top', scrim: scrim, grab: menu,
      onOpen: function () { btn.setAttribute('aria-expanded', 'true'); },
      onClose: function () { btn.setAttribute('aria-expanded', 'false'); }
    });
    btn.addEventListener('click', function () { d.isOpen ? d.close() : d.open(btn); });
    menu.querySelectorAll('[data-close-menu]').forEach(function (b) {
      b.addEventListener('click', function () { d.close(); });
    });
    menu.querySelectorAll('a[href]').forEach(function (a) {
      a.addEventListener('click', function () { d.close({ restoreFocus: false }); });
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 820 && d.isOpen) d.close({ restoreFocus: false }); });
  }

  /* ---------------- Section spy (one-page sites) ---------------- */
  function initSectionSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('[data-spy] a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.setAttribute('aria-current', a.hash === '#' + en.target.id ? 'true' : 'false'); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('section[id]').forEach(function (s) { io.observe(s); });
  }

  window.Fluid = {
    Spring: Spring, Tracker: Tracker, project: project, rubber: rubber, clamp: clamp,
    get reduced() { return reduced; },
    segmented: segmented, createSheet: createSheet,
    boot: function (themeKey) { initTheme(themeKey); initBar(); initMenu(); initSectionSpy(); }
  };
})();
