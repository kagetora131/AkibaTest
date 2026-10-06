/* tours.js — ツアー一覧（#/tours）と詳細（#/tour/:id） */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.screens = Neo.screens || {};

  // 自作の小さなアイコン（emoji は使わない）
  var ICON_CLOCK = '<svg class="ico" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.4 1.6"/></svg>';
  var ICON_PIN = '<svg class="ico" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 14.5s4.5-4.3 4.5-8A4.5 4.5 0 0 0 3.5 6.5c0 3.7 4.5 8 4.5 8z"/><circle cx="8" cy="6.5" r="1.6"/></svg>';
  var ICON_WALK = '<svg class="ico" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 2.5v11M4.5 10 8 13.5 11.5 10"/></svg>';

  function tourList() { return (Neo.data.tours && Neo.data.tours.tours) || []; }

  function themeTags(tour) {
    var themes = (Neo.data.tours && Neo.data.tours.themes) || [];
    return (tour.themes || []).map(function (id) {
      var label = null;
      themes.forEach(function (t) { if (t.id === id) label = t.label; });
      return label ? '<span class="tag">' + Neo.esc(label) + '</span>' : '';
    }).join('');
  }

  function route(tour) {
    return Neo.filters.buildRoute(tour.stops, Neo.data, Neo.state);
  }

  /* ---------- 一覧 ---------- */
  Neo.screens.tours = function () {
    var F = Neo.filters, E = Neo.esc;
    var cards = tourList().map(function (t) {
      var r = route(t);
      if (r.items.length === 0) return ''; // 表示できる店が無いツアーは出さない
      var id = encodeURIComponent(t.id);
      // タイトルのリンクをカード全体に広げる（詳細へ）。「地図で見る」はその上に出す
      return '<article class="card tour-card">' +
        '<div class="tag-row">' + themeTags(t) + '</div>' +
        '<h2><a class="stretch-link" href="#/tour/' + id + '">' + E(t.title) + '</a></h2>' +
        '<p class="desc">' + E(t.summary) + '</p>' +
        '<div class="meta-row">' +
          '<span class="meta">' + ICON_CLOCK + '所要 ' + E(F.formatDuration(r.totalMinutes)) + '</span>' +
          '<span class="meta">' + ICON_PIN + r.items.length + '軒</span>' +
        '</div>' +
        '<p class="card-foot"><a class="detail-link" href="#/?tour=' + id + '">' + ICON_PIN + '地図で見る</a></p>' +
        '</article>';
    }).join('');
    return '<h1>ツアー</h1>' +
      '<p class="muted">運営が用意したおすすめコースです。</p>' +
      '<div class="grid">' + cards + '</div>';
  };

  // 行程の縦タイムライン。opts.times があれば到着〜出発時刻も表示する（AIアレンジ用）
  Neo.renderTimeline = function (items, opts) {
    var F = Neo.filters, E = Neo.esc, d = Neo.data;
    var times = opts && opts.times;
    items = items || [];
    var last = items.length - 1;
    var steps = items.map(function (it, i) {
      var s = it.shop;
      var walk = i < last
        ? '<div class="walk-row muted small">' + ICON_WALK + (items[i + 1].shop.building && items[i + 1].shop.building === s.building
            ? '同じビルの別の階へ 約' : '徒歩 約') + items[i + 1].walkFromPrev + '分</div>'
        : '<div class="goal-row"><span class="tag">ゴール</span></div>';
      return '<li class="tl-item" data-genre="' + E(s.genre) + '" style="--c: ' + Neo.genreColorVar(s.genre) + '">' +
        '<span class="tl-num" aria-hidden="true">' + (i + 1) + '</span>' +
        '<div class="tl-body">' +
          '<a class="tl-shop" href="#/shop/' + encodeURIComponent(s.id) + '">' + E(s.name) + '</a>' +
          '<div class="tl-meta"><span class="genre-chip small" style="--c: ' + Neo.genreColorVar(s.genre) + '">' +
            E(d.genres[s.genre] || '') + '</span>' +
            '<span class="muted small">' + (times && times[i] ? F.formatClock(times[i].arrive) + '〜' + F.formatClock(times[i].leave) + '　' : '') + '滞在 ' + it.stayMinutes + '分</span></div>' +
          (it.comment ? '<p class="muted tl-comment">' + E(it.comment) + '</p>' : '') +
          walk +
        '</div></li>';
    }).join('');
    return '<ol class="timeline">' + steps + '</ol>';
  };

  /* ---------- 詳細 ---------- */
  function notFound() {
    return '<h1>ツアーが見つかりませんでした</h1>' +
      '<p><a class="btn btn-ghost" href="#/tours">ツアー一覧へ</a></p>';
  }

  Neo.screens.tour = function (params) {
    var F = Neo.filters, E = Neo.esc, d = Neo.data;
    var tour = null;
    tourList().forEach(function (t) { if (t.id === params.id) tour = t; });
    if (!tour) return notFound();
    var r = route(tour);
    if (r.items.length === 0) return notFound();

    return '<p><a class="back-link" href="#/tours">← ツアー一覧へ</a></p>' +
      '<div class="tag-row">' + themeTags(tour) + '</div>' +
      '<h1>' + E(tour.title) + '</h1>' +
      '<p>' + E(tour.summary) + '</p>' +
      '<section class="card">' +
        '<dl class="info-list">' +
          '<dt>所要時間</dt><dd>' + E(F.formatDuration(r.totalMinutes)) + '</dd>' +
          '<dt>お店</dt><dd>' + r.items.length + '軒</dd>' +
          '<dt>歩く時間</dt><dd>' + E(F.formatDuration(r.walkMinutes)) + '</dd>' +
          '<dt>料金</dt><dd>' + E(tour.priceNote || '') + '</dd>' +
        '</dl>' +
      '</section>' +
      '<h2 class="slash-heading">行程</h2>' +
      Neo.renderTimeline(r.items) +
      '<p class="btn-row">' +
        '<a class="btn btn-primary" href="#/?tour=' + encodeURIComponent(tour.id) + '">地図でルートを見る</a>' +
        '<a class="btn btn-primary" href="#/booking?tour=' + encodeURIComponent(tour.id) + '">このツアーを申し込む（デモ）</a>' +
        '<a class="btn btn-ghost" href="#/tours">ツアー一覧へ</a></p>' +
      '<p class="notice card">営業時間・定休日は変わることがあります。お出かけ前にお店にご確認ください。</p>';
  };
})();
