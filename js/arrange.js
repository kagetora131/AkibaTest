/* arrange.js — AIアレンジ（簡易）。APIは使わず、filters.js の planArrange で毎回計算する */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.screens = Neo.screens || {};
  Neo.afterRender = Neo.afterRender || {};

  Neo.arrangeState = { themes: new Set(), duration: 120, rest: true, generated: false,
    foodOn: false, foodKinds: new Set(['donut', 'burger', 'soba', 'gyudon']) };

  // 食事・おやつの種類（shops.json の foodType と同じ値）
  var FOOD_KINDS = [
    { v: 'donut', label: 'ドーナツ' }, { v: 'burger', label: 'ハンバーガー' },
    { v: 'soba', label: 'そば' }, { v: 'gyudon', label: '牛めし' }
  ];

  var DURATIONS = [
    { v: 60, label: '1時間' }, { v: 90, label: '1時間30分' }, { v: 120, label: '2時間' },
    { v: 180, label: '3時間' }, { v: 240, label: '4時間' }
  ];

  // 描画後の一時フラグ（フォーカス復帰・スクロール）
  var pending = { focusKey: null, scrollResult: false, scrollForm: false };

  function themeButtons() {
    var E = Neo.esc, st = Neo.arrangeState;
    return Neo.data.tours.themes.filter(function (t) { return t.id !== 'rest'; }).map(function (t) {
      return '<button type="button" class="chip-btn" data-key="theme:' + E(t.id) + '" data-theme="' + E(t.id) +
        '" aria-pressed="' + st.themes.has(t.id) + '">' + E(t.label) + '</button>';
    }).join('');
  }

  function radio(attr, value, label, checked) {
    return '<button type="button" class="chip-btn" role="radio" data-key="' + attr + ':' + value + '" data-' +
      attr + '="' + value + '" aria-checked="' + checked + '" aria-pressed="' + checked + '">' + label + '</button>';
  }

  function resultHtml() {
    var F = Neo.filters, E = Neo.esc, st = Neo.arrangeState;
    if (!st.generated) return '';
    if (st.themes.size === 0) return '<p class="muted">テーマを1つ以上選んでください。</p>';
    var plan = F.planArrange({ themes: Array.from(st.themes), duration: st.duration, rest: st.rest,
      food: st.foodOn ? Array.from(st.foodKinds) : null },
      Neo.data, Neo.state, new Date());
    if (plan.items.length === 0) {
      return '<p>条件に合うプランが作れませんでした。テーマや時間を変えてみてください。</p>';
    }
    return '<h2 class="slash-heading">あなたへのおすすめプラン</h2>' +
      '<p class="notice card"><strong>これはAI提案プランです。営業時間は店舗にご確認ください。</strong></p>' +
      '<section class="card"><dl class="info-list">' +
        '<dt>出発</dt><dd>' + F.formatClock(plan.startMinutes) + '（想定）</dd>' +
        '<dt>所要時間</dt><dd>' + E(F.formatDuration(plan.totalMinutes)) + '</dd>' +
        '<dt>お店</dt><dd>' + plan.items.length + '軒</dd>' +
        '<dt>歩く時間</dt><dd>' + E(F.formatDuration(plan.walkMinutes)) + '</dd>' +
      '</dl></section>' +
      (plan.excludedClosedCount > 0
        ? '<p class="muted small">今日は' + E(plan.weekdayLabel) + 'なので、定休日のお店は外しています。</p>' : '') +
      Neo.renderTimeline(plan.items, { times: plan.times }) +
      '<p class="btn-row"><a class="btn btn-primary" href="#/?plan=ai">地図でルートを見る</a>' +
      '<a class="btn btn-primary" href="#/booking?plan=ai">このプランで申し込む（デモ）</a>' +
      '<button type="button" class="btn btn-ghost" data-action="arrange-top">条件を変える</button></p>';
  }

  Neo.screens.arrange = function () {
    var st = Neo.arrangeState;
    return '<h1>AIアレンジ</h1>' +
      '<p class="muted">テーマと時間を選ぶと、おすすめの回り方を自動で作ります。</p>' +
      '<div id="arrange-form" class="arrange-form">' +
        '<fieldset class="fs"><legend>テーマ（いくつでも）</legend>' +
          '<div class="chip-row chip-wrap">' + themeButtons() + '</div></fieldset>' +
        '<fieldset class="fs"><legend>所要時間</legend>' +
          '<div class="chip-row chip-wrap" role="radiogroup" aria-label="所要時間">' +
            DURATIONS.map(function (d) { return radio('duration', d.v, d.label, st.duration === d.v); }).join('') +
          '</div></fieldset>' +
        '<fieldset class="fs"><legend>休憩</legend>' +
          '<div class="chip-row chip-wrap" role="radiogroup" aria-label="休憩">' +
            radio('rest', 'on', 'カフェ休憩を入れる', st.rest) +
            radio('rest', 'off', '入れない', !st.rest) +
          '</div></fieldset>' +
        '<fieldset class="fs"><legend>食事・おやつ</legend>' +
          '<div class="chip-row chip-wrap" role="radiogroup" aria-label="食事・おやつ">' +
            radio('food', 'off', '入れない', !st.foodOn) +
            radio('food', 'on', '入れる', st.foodOn) +
          '</div>' + (st.foodOn
            ? '<div class="chip-row chip-wrap" role="group" aria-label="食事の種類（いくつでも）">' + FOOD_KINDS.map(function (k) {
              return '<button type="button" class="chip-btn" data-key="foodkind:' + k.v + '" data-foodkind="' + k.v +
                '" aria-pressed="' + st.foodKinds.has(k.v) + '">' + k.label + '</button>';
            }).join('') + '</div>' : '') +
        '</fieldset>' +
        '<p><button type="button" class="btn btn-primary" data-action="arrange-make">プランを作る</button></p>' +
      '</div>' +
      '<div id="arrange-result" class="arrange-result" aria-live="polite">' + resultHtml() + '</div>';
  };

  Neo.afterRender.arrange = function () {
    var app = document.getElementById('app');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var behavior = reduce ? 'auto' : 'smooth';
    if (pending.focusKey) {
      var els = app.querySelectorAll('[data-key]');
      for (var i = 0; i < els.length; i++) {
        if (els[i].getAttribute('data-key') === pending.focusKey) {
          try { els[i].focus({ preventScroll: true }); } catch (e) { /* 無視 */ }
        }
      }
      pending.focusKey = null;
    }
    if (pending.scrollResult) {
      pending.scrollResult = false;
      var r = document.getElementById('arrange-result');
      if (r && r.firstChild) r.scrollIntoView({ behavior: behavior, block: 'start' });
    }
    if (pending.scrollForm) {
      pending.scrollForm = false;
      var f = document.getElementById('arrange-form');
      if (f) f.scrollIntoView({ behavior: behavior, block: 'start' });
    }
  };

  function onArrange() { return (location.hash.replace(/^#/, '').split(/[/?]/)[1] || '') === 'arrange'; }

  // 委任イベント（一度だけ登録）
  document.addEventListener('click', function (e) {
    if (!onArrange() || !Neo.data) return;
    var t = e.target.closest ? e.target : e.target.parentElement;
    if (!t) return;
    var st = Neo.arrangeState, el;
    if ((el = t.closest('[data-theme]'))) {
      var id = el.getAttribute('data-theme');
      if (st.themes.has(id)) st.themes.delete(id); else st.themes.add(id);
      pending.focusKey = el.getAttribute('data-key');
      Neo.rerender();
    } else if ((el = t.closest('[data-duration]'))) {
      st.duration = parseInt(el.getAttribute('data-duration'), 10);
      pending.focusKey = el.getAttribute('data-key');
      Neo.rerender();
    } else if ((el = t.closest('[data-rest]'))) {
      st.rest = el.getAttribute('data-rest') === 'on';
      pending.focusKey = el.getAttribute('data-key');
      Neo.rerender();
    } else if ((el = t.closest('[data-food]'))) {
      st.foodOn = el.getAttribute('data-food') === 'on';
      pending.focusKey = el.getAttribute('data-key');
      Neo.rerender();
    } else if ((el = t.closest('[data-foodkind]'))) {
      var kind = el.getAttribute('data-foodkind');
      if (!st.foodKinds.has(kind)) st.foodKinds.add(kind);
      else if (st.foodKinds.size > 1) st.foodKinds.delete(kind); // 入れるときは、最低1つは選んだまま
      pending.focusKey = el.getAttribute('data-key');
      Neo.rerender();
    } else if (t.closest('[data-action="arrange-make"]')) {
      st.generated = true;
      pending.scrollResult = true;
      Neo.rerender();
    } else if (t.closest('[data-action="arrange-top"]')) {
      pending.scrollForm = true;
      Neo.rerender();
    }
  });
})();
