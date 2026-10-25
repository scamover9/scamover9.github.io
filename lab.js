/* labscamover9 live status. Reads Uptime Kuma through the Cloudflare worker. */
(function () {
  'use strict';
  var INSTANCES = [
    { name: 'CasaOS Primary',
      statusUrl: 'https://uptime.labscamover9.com/status/lab',
      api: 'https://uptime.4042150scr.workers.dev/api/status-page/lab',
      heartbeat: 'https://uptime.4042150scr.workers.dev/api/status-page/heartbeat/lab' },
    { name: 'CasaOS Secondary',
      statusUrl: 'https://uptime2.labscamover9.com/status/homelab',
      api: 'https://uptime.4042150scr.workers.dev/api/status-page/homelab',
      heartbeat: 'https://uptime.4042150scr.workers.dev/api/status-page/heartbeat/homelab' }
  ];
  var $ = function (id) { return document.getElementById(id); };
  var grid = $('statusGrid'), skel = $('statusSkeleton'), err = $('statusError');
  var dot = $('overallDot'), text = $('overallText'), updated = $('statusUpdated');
  if (!grid) return;

  var active = 0, timer = null, request = 0;
  var STATE = { 1: ['up', 'Up'], 2: ['partial', 'Degraded'], 0: ['down', 'Down'] };

  // Cross-fade between skeleton, grid and error. Nothing jumps.
  function show(el) { [grid, skel, err].forEach(function (x) { x.classList.toggle('is-hidden', x !== el); x.setAttribute('aria-hidden', String(x !== el)); }); }

  function card(m, hb) {
    var last = hb[hb.length - 1] || {};
    var st = STATE[last.status] || ['loading', 'Unknown'];
    var el = document.createElement('div'); el.className = 'card svc';
    var d = document.createElement('span'); d.className = 'dot ' + st[0];
    var info = document.createElement('div'); info.className = 'svc-info';
    var n = document.createElement('div'); n.className = 'svc-name'; n.textContent = m.name;     // text, never HTML
    var meta = document.createElement('div'); meta.className = 'svc-meta'; meta.textContent = st[1];
    var ping = document.createElement('span'); ping.className = 'svc-ping';
    ping.textContent = last.status === 1 && last.ping ? last.ping + 'ms' : '';
    info.append(n, meta); el.append(d, info, ping);
    return { el: el, status: last.status };
  }

  function render(monitors, beats) {
    var allUp = true, anyDown = false, frag = document.createDocumentFragment();
    monitors.forEach(function (m) {
      var c = card(m, beats[m.id] || []);
      if (c.status !== 1) allUp = false;
      if (c.status === 0) anyDown = true;
      frag.appendChild(c.el);
    });
    grid.replaceChildren(frag);
    show(grid);
    dot.className = 'dot ' + (allUp ? 'up' : anyDown ? 'down' : 'partial');
    text.textContent = allUp ? 'All systems operational' : anyDown ? 'Some services are down' : 'Some services degraded';
    updated.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fail() {
    show(err);
    dot.className = 'dot down'; text.textContent = 'Status unavailable'; updated.textContent = '';
  }

  function fetchStatus() {
    var id = ++request, inst = INSTANCES[active];
    Promise.all([fetch(inst.api).then(function (r) { return r.json(); }), fetch(inst.heartbeat).then(function (r) { return r.json(); })])
      .then(function (res) {
        if (id !== request) return;                    // a newer request won
        var monitors = [];
        (res[0].publicGroupList || []).forEach(function (g) { (g.monitorList || []).forEach(function (m) { monitors.push(m); }); });
        if (!monitors.length) return fail();
        render(monitors, res[1].heartbeatList || {});
      })
      .catch(function () { if (id === request) fail(); });
  }

  function schedule() { clearInterval(timer); timer = setInterval(function () { if (!document.hidden) fetchStatus(); }, 60000); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) fetchStatus(); });

  Fluid.segmented(document.querySelector('#status .seg'), {
    onSelect: function (i) {
      active = i;
      $('statusPageLink').href = INSTANCES[i].statusUrl; $('statusErrorLink').href = INSTANCES[i].statusUrl;
      show(skel); dot.className = 'dot loading'; text.textContent = 'Checking ' + INSTANCES[i].name; updated.textContent = '';
      fetchStatus(); schedule();
    }
  });

  fetchStatus(); schedule();
})();
