/* shops.js — お店・キャンペーン一覧（#/shops）と詳細（#/shop/:id） */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.screens = Neo.screens || {};

  function chip(genreId) {
    return '<span class="genre-chip" style="--c: ' + Neo.genreColorVar(genreId) + '">' +
      Neo.esc(Neo.data.genres[genreId] || '') + '</span>';
  }

  /* ---------- 一覧（お店・キャンペーン） ---------- */
  var ICON_PIN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';

  var FILTERS = [
    { id: 'all', label: 'すべて', href: '#/shops' },
    { id: 'live', label: 'キャンペーン中', href: '#/shops?f=live' },
    { id: 'soon', label: 'もうすぐ開始', href: '#/shops?f=soon' }
  ];
  var LINES = {
    all: '掲載中のお店: ',
    live: '開催中のキャンペーンがあるお店: ',
    soon: 'もうすぐキャンペーンが始まるお店: '
  };

  // 店ごとの、表示してよいキャンペーン（開催中→もうすぐ開始の順。非掲載の店・終了分は含まれない）
  function campaignsByShop(F, d) {
    var map = {};
    F.visibleCampaigns(d, Neo.state).forEach(function (c) { (map[c.shopId] = map[c.shopId] || []).push(c); });
    return map;
  }

  function hasStatus(list, st) { return (list || []).some(function (c) { return c.status === st; }); }

  // 並べ替えの基準（開催中は終了日、もうすぐ開始は開始日の一番早いもの）
  function soonest(list, st) {
    var t = Infinity;
    (list || []).forEach(function (c) {
      if (c.status !== st) return;
      var v = (st === 'active' ? c.endDate : c.startDate).getTime();
      if (v < t) t = v;
    });
    return t;
  }

  function shopCard(s, f, camps, today) {
    var F = Neo.filters, E = Neo.esc;
    var tags = (s.tags || []).slice(0, 3).map(function (t) {
      return '<span class="tag">' + E(t) + '</span>';
    }).join('');
    // f=live は開催中だけ、f=soon はもうすぐ開始だけ
    var shown = (camps || []).filter(function (c) {
      return f === 'live' ? c.status === 'active' : f === 'soon' ? c.status === 'upcoming' : true;
    });
    var campBlock = shown.length ? '<ul class="shop-camps" aria-label="キャンペーン">' + shown.map(function (c) {
      return '<li>' + (c.status === 'active' ? '<span class="badge-live">開催中</span>' : '<span class="badge-soon">もうすぐ開始</span>') +
        '<span class="sc-title">' + E(c.title) + '</span>' +
        '<span class="sc-count muted small">' + E(F.campaignCountdown(c, today)) + '</span></li>';
    }).join('') + '</ul>' : '';
    var id = encodeURIComponent(s.id);
    // 店名リンクをカード全体に広げる（stretched link）。「詳しく見る」はその上に出す
    return '<article class="card shop-card" style="--c: ' + Neo.genreColorVar(s.genre) + '">' +
      chip(s.genre) +
      '<h2><a class="stretch-link" href="#/?shop=' + id + '">' + E(s.name) +
        '<span class="map-hint">' + ICON_PIN + '地図で見る</span></a></h2>' +
      '<p class="desc">' + E(s.description) + '</p>' +
      '<p class="info-line muted small">' + E(Neo.placeLabel(s)) + ' ／ 営業 ' + E(s.hours) + ' ／ 定休 ' + E(s.closed) + '</p>' +
      (tags ? '<div class="tag-row">' + tags + '</div>' : '') +
      campBlock +
      '<p class="card-foot"><a class="detail-link" href="#/shop/' + id + '">詳しく見る</a></p>' +
      '</article>';
  }

  Neo.screens.shops = function (params) {
    var F = Neo.filters, d = Neo.data;
    var q = params && params.query;
    var f = q ? q.get('f') : null;
    if (f !== 'live' && f !== 'soon') f = 'all';
    var order = Object.keys(d.genres);
    var today = F.today();
    var vis = F.visibleShops(d, Neo.state).slice().sort(function (a, b) {
      var g = order.indexOf(a.genre) - order.indexOf(b.genre);
      return g !== 0 ? g : a.name.localeCompare(b.name, 'ja');
    });
    var by = campaignsByShop(F, d);
    var liveShops = vis.filter(function (s) { return hasStatus(by[s.id], 'active'); });
    var soonShops = vis.filter(function (s) { return hasStatus(by[s.id], 'upcoming'); });
    var counts = { all: vis.length, live: liveShops.length, soon: soonShops.length };

    var list = vis;
    if (f === 'live') {
      list = liveShops.slice().sort(function (a, b) { return soonest(by[a.id], 'active') - soonest(by[b.id], 'active'); });
    } else if (f === 'soon') {
      list = soonShops.slice().sort(function (a, b) { return soonest(by[a.id], 'upcoming') - soonest(by[b.id], 'upcoming'); });
    }

    var seg = '<nav class="seg" aria-label="表示の絞り込み">' + FILTERS.map(function (x) {
      return '<a class="seg-link' + (x.id === f ? ' is-current' : '') + '" href="' + x.href + '"' +
        (x.id === f ? ' aria-current="true"' : '') + '>' + x.label +
        '<span class="seg-count">' + counts[x.id] + '</span></a>';
    }).join('') + '</nav>';

    var body = list.length
      ? '<div class="grid">' + list.map(function (s) { return shopCard(s, f, by[s.id], today); }).join('') + '</div>'
      : '<p class="muted">いまはありません</p>';

    return '<h1>お店・キャンペーン</h1>' + seg +
      '<p class="muted">' + LINES[f] + list.length + '軒</p>' + body;
  };

  /* ---------- 詳細 ---------- */
  function notFound() {
    // 未登録・非掲載のどちらでも同じ画面（存在や理由を見せない）
    return '<h1>お店が見つかりませんでした</h1>' +
      '<p>お店・キャンペーンの一覧から探してください。</p>' +
      '<p><a class="btn btn-ghost" href="#/shops">お店・キャンペーンへ</a></p>';
  }

  Neo.screens.shop = function (params) {
    var F = Neo.filters, E = Neo.esc, d = Neo.data;
    var shop = null;
    F.visibleShops(d, Neo.state).forEach(function (s) { if (s.id === params.id) shop = s; });
    if (!shop) return notFound();

    var street = '';
    d.town.streets.forEach(function (st) { if (st.id === shop.street) street = st.name; });
    var open = F.isOpenOnDay(shop, new Date().getDay());

    var camps = F.campaignsForShop(shop.id, d, Neo.state).map(function (c) {
      var active = c.status === 'active';
      var when = active
        ? F.formatDate(c.startDate) + '〜' + F.formatDate(c.endDate)
        : F.formatDate(c.startDate) + 'から';
      return '<div class="card">' +
        (active ? '<span class="badge-live">開催中</span>' : '<span class="badge-soon">もうすぐ開始</span>') +
        '<h3>' + E(c.title) + '</h3>' +
        '<p>' + E(c.description) + '</p>' +
        '<p class="muted small">' + E(when) + '</p></div>';
    }).join('');

    return '<p><a class="back-link" href="#/shops">← お店・キャンペーンへ</a></p>' +
      chip(shop.genre) +
      '<h1>' + E(shop.name) + '</h1>' +
      '<p>' + E(shop.description) + '</p>' +
      '<section class="card">' +
        '<dl class="info-list">' +
          '<dt>場所</dt><dd>' + E(Neo.placeLabel(shop)) + '</dd>' +
          '<dt>営業時間</dt><dd>' + E(shop.hours) + '</dd>' +
          '<dt>定休日</dt><dd>' + E(shop.closed) + '</dd>' +
          '<dt>今日</dt><dd>' + (open ? '営業日' : '定休日') + '</dd>' +
          '<dt>通り</dt><dd>' + E(street) + '</dd>' +
        '</dl>' +
        '<div class="tag-row">' + (shop.tags || []).map(function (t) {
          return '<span class="tag">' + E(t) + '</span>';
        }).join('') + '</div>' +
      '</section>' +
      '<h2 class="slash-heading">キャンペーン</h2>' +
      (camps ? '<div class="camp-list">' + camps + '</div>' : '<p class="muted">現在のキャンペーンはありません</p>') +
      '<p class="muted small">' + E(F.updatedLabel(shop.lastUpdatedDaysAgo)) + '</p>' +
      '<p class="btn-row">' +
        '<a class="btn btn-primary" href="#/?shop=' + encodeURIComponent(shop.id) + '">マップで見る</a>' +
        '<a class="btn btn-ghost" href="#/shops">お店・キャンペーンへ</a></p>';
  };
})();
