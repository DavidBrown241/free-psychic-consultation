/* AI Consultation: аркуш прийому -> потокова відповідь Worker -> структурований brief. Тільки textContent (без innerHTML). */
(function () {
  'use strict';
  var root = document.getElementById('fc-app');
  if (!root) return;
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };

  var LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var ENDPOINT = LOCAL ? 'http://127.0.0.1:8809/api/ai-consult/' : ((window.FPC_AI && window.FPC_AI.endpoint) || '/api/ai-consult/');
  var SUGGEST = { love: 'elena-marsh', grief: 'ruth-callahan', decision: 'nova-bennett', timing: 'priya-shah', change: 'dr-sarah-wells', career: 'michael-torres', purpose: 'diane-chen', family: 'robert-james' };
  var WEIGHT = ['Light', 'Noticeable', 'Heavy', 'Very heavy', 'Overwhelming'];
  var STARTERS = [
    'I keep going back and forth about a choice and cannot tell what I actually want.',
    'Something changed recently and I am not sure how to move forward from here.',
    'I have a conversation I keep avoiding, and it is starting to weigh on me.'
  ];
  var SECTIONS = ['what i am hearing', 'patterns worth noticing', 'questions to sit with', 'one step this week'];
  var LIVE_URL = root.getAttribute('data-live-url') || '/book-free-session/';

  var ta = $('#fc-situation'), count = $('#fc-count'), msg = $('#fc-msg'), go = $('#fc-go');
  var range = $('#fc-weight'), out = $('#fc-weight-out');
  var brief = $('#fc-brief'), body = $('#fc-b-body'), who = {};
  $$('.fc-who').forEach(function (l) { var i = $('input', l); who[i.value] = { label: l, input: i, name: i.getAttribute('data-name'), first: i.getAttribute('data-first'), role: i.getAttribute('data-role'), img: i.getAttribute('data-img') }; });
  var userPicked = false, ctrl = null, lastReq = null;

  function selected(name) { var i = $('input[name="' + name + '"]:checked'); return i ? i.value : ''; }
  function setWho(slug, manual) {
    if (!who[slug]) return;
    who[slug].input.checked = true;
    if (manual) userPicked = true;
    renderHead();
  }
  function markSuggested() {
    var s = SUGGEST[selected('fc-topic')];
    Object.keys(who).forEach(function (k) { who[k].label.classList.toggle('is-sug', k === s); });
    if (s && !userPicked) setWho(s, false);
  }
  function updateCount() {
    var n = ta.value.trim().length;
    count.textContent = n + ' / 600';
    count.classList.toggle('bad', n > 600);
  }
  function renderHead() {
    var w = who[selected('fc-who')] || who['robert-james'];
    $('#fc-b-img').src = w.img; $('#fc-b-img').alt = w.name;
    $('#fc-b-name').textContent = w.name;
    $('#fc-b-role').textContent = w.role;
  }

  STARTERS.forEach(function (t) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = t.length > 44 ? t.slice(0, 41) + '...' : t; b.title = t;
    b.addEventListener('click', function () { ta.value = t + ' '; ta.focus(); updateCount(); });
    $('#fc-starters').appendChild(b);
  });
  ta.addEventListener('input', updateCount);
  range.addEventListener('input', function () { out.textContent = WEIGHT[range.value - 1]; });
  $$('input[name="fc-topic"]').forEach(function (i) { i.addEventListener('change', markSuggested); });
  $$('input[name="fc-who"]').forEach(function (i) { i.addEventListener('change', function () { userPicked = true; renderHead(); }); });

  // Початкові значення з ?consultant=
  var q = new URLSearchParams(location.search).get('consultant');
  if (q && who[q]) { setWho(q, true); } else { setWho('robert-james', false); }
  range.value = 3; out.textContent = WEIGHT[2]; updateCount();

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function renderSteps(active, done) {
    var ul = $('#fc-steps');
    ul.textContent = '';
    ['Hearing', 'Patterns', 'Questions', 'Next step'].forEach(function (t, i) {
      var li = el('li', i < done ? 'done' : (i === active ? 'on' : ''), t); ul.appendChild(li);
    });
  }

  // Розбір потоку: заголовки "## ..." відкривають нову секцію.
  function renderBrief(text, streaming) {
    var wrap = $('#fc-b-out');
    wrap.textContent = '';
    var parts = text.replace(/\r/g, '').split(/^##\s+/m);
    var idx = 0;
    parts.forEach(function (chunk, n) {
      if (!chunk.trim()) return;
      if (n === 0 && !/^##/m.test(text)) { var p0 = el('div', 'fc-sec'); p0.appendChild(el('p', '', chunk.trim())); wrap.appendChild(p0); return; }
      var nl = chunk.indexOf('\n');
      var title = (nl < 0 ? chunk : chunk.slice(0, nl)).trim().replace(/[:*]+$/, '');
      var content = nl < 0 ? '' : chunk.slice(nl + 1).trim();
      var sec = el('div', 'fc-sec' + (/one step/i.test(title) ? ' step' : ''));
      sec.appendChild(el('h3', '', title));
      var lines = content.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var bullets = lines.filter(function (l) { return /^[-*\d]+[.)]?\s+/.test(l); });
      if (bullets.length && /question/i.test(title)) {
        var ol = el('ol');
        bullets.forEach(function (l) { ol.appendChild(el('li', '', l.replace(/^[-*\d]+[.)]?\s+/, '').replace(/\*\*/g, ''))); });
        sec.appendChild(ol);
      } else {
        lines.forEach(function (l) { sec.appendChild(el('p', '', l.replace(/\*\*/g, ''))); });
      }
      wrap.appendChild(sec);
      idx = SECTIONS.findIndex(function (s) { return title.toLowerCase().indexOf(s) === 0; });
    });
    var secs = $$('.fc-sec', wrap);
    if (streaming && secs.length) { secs[secs.length - 1].classList.add('fc-caret'); }
    renderSteps(streaming ? Math.max(idx, 0) : 4, streaming ? Math.max(idx, 0) : 4);
  }

  function showError(text) {
    var wrap = $('#fc-b-out'); wrap.textContent = '';
    var d = el('div', 'fc-err'); d.appendChild(el('div', '', text));
    var b = el('button', '', 'Try again'); b.type = 'button'; b.addEventListener('click', start); d.appendChild(b);
    wrap.appendChild(d); renderSteps(-1, 0);
  }

  function summary() {
    var s = $('#fc-b-sum'); s.textContent = '';
    var t = $('input[name="fc-topic"]:checked + span'), g = $('input[name="fc-goal"]:checked + span b');
    [t && t.textContent, g && g.textContent, 'Feels: ' + WEIGHT[range.value - 1].toLowerCase()].forEach(function (x) { if (x) s.appendChild(el('span', '', x)); });
  }

  function finish(text, cut) {
    renderBrief(text, false);
    var wrap = $('#fc-b-out');
    var w = who[selected('fc-who')];
    var after = el('div', 'fc-after');
    if (cut) after.appendChild(el('div', 'fc-note-live', 'This brief was cut short. You can run it again for a fuller version.'));
    var a = el('a', 'btn btn-light', 'Talk to ' + w.first + ' live: first 5 min free');
    a.href = LIVE_URL; after.appendChild(a);
    var alt = el('div', 'fc-alt'); alt.appendChild(el('span', '', 'Same situation, another voice:'));
    Object.keys(who).filter(function (k) { return k !== selected('fc-who'); }).slice(0, 4).forEach(function (k) {
      var b = el('button'); b.type = 'button'; var im = document.createElement('img'); im.src = who[k].img; im.alt = ''; b.appendChild(im); b.appendChild(document.createTextNode(who[k].first));
      b.addEventListener('click', function () { setWho(k, true); start(); }); alt.appendChild(b);
    });
    after.appendChild(alt);
    var tools = el('div', 'fc-tools');
    var cp = el('button', '', 'Copy brief'); cp.type = 'button';
    cp.addEventListener('click', function () { try { navigator.clipboard.writeText(wrap.innerText.replace(/\n{3,}/g, '\n\n')); cp.textContent = 'Copied'; } catch (e) { cp.textContent = 'Copy not available'; } });
    var nw = el('button', '', 'Start over'); nw.type = 'button';
    nw.addEventListener('click', function () { ta.value = ''; updateCount(); body.querySelector('.fc-b-empty').hidden = false; $('#fc-b-run').hidden = true; ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); ta.focus(); });
    tools.appendChild(cp); tools.appendChild(nw); after.appendChild(tools);
    after.appendChild(el('p', 'fc-note-live', 'AI-written reflection in the style of ' + w.name + '. Not a live session, not advice, and not a prediction.'));
    wrap.appendChild(after);
  }

  function validate() {
    var n = ta.value.trim().length;
    if (!selected('fc-topic')) return 'Choose the area this is about.';
    if (n < 20) return 'Tell us a little more (at least 20 characters).';
    if (n > 600) return 'Please keep it to 600 characters.';
    if (!selected('fc-goal')) return 'Choose what would help most.';
    return '';
  }

  async function start() {
    var err = validate();
    msg.textContent = err;
    if (err) return;
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    var payload = { consultant: selected('fc-who'), topic: selected('fc-topic'), goal: selected('fc-goal'), weight: Number(range.value), situation: ta.value.trim() };
    lastReq = payload;
    go.disabled = true; go.textContent = 'Building your brief...';
    renderHead(); summary();
    body.querySelector('.fc-b-empty').hidden = true; $('#fc-b-run').hidden = false;
    $('#fc-b-out').textContent = ''; renderSteps(0, 0);
    if (window.matchMedia('(max-width:1000px)').matches) brief.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var text = '', cut = false;
    try {
      var r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
      if (!r.ok) {
        var j = {}; try { j = await r.json(); } catch (e) { /* ignore */ }
        throw new Error(j.error || 'Something went wrong. Please try again.');
      }
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
      for (;;) {
        var c = await rd.read(); if (c.done) break;
        buf += dec.decode(c.value, { stream: true });
        var i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          var line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (line.indexOf('data:') !== 0) continue;
          var d = line.slice(5).trim(); if (d === '[DONE]') continue;
          try { var o = JSON.parse(d); if (o.t) { text += o.t; renderBrief(text, true); } if (o.cut) cut = true; } catch (e) { /* ignore */ }
        }
      }
      if (!text.trim()) throw new Error('The consultation is unavailable right now. Please try again in a moment.');
      finish(text, cut);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (text.trim()) finish(text, true); else showError(e.message || 'Something went wrong. Please try again.');
    } finally {
      go.disabled = false; go.textContent = 'Build my brief';
    }
  }
  go.addEventListener('click', start);
  renderHead();
})();
