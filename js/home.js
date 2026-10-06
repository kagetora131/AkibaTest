/* home.js — 全画面マップのホーム（#/ と #/map）。検索・タブ・表示切替・現在地・下パネル */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.screens = Neo.screens || {};
  Neo.afterRender = Neo.afterRender || {};
  Neo.screenUpdaters = Neo.screenUpdaters || {};
  Neo.screenLeave = Neo.screenLeave || {};
  Neo.mapViews = Neo.mapViews || {};

  // 画面を離れても残す状態
  var MS = (Neo.mapState = Neo.mapState || {});
  function initState() {
    if (MS.category === undefined) MS.category = 'all';
    if (MS.query === undefined) MS.query = '';
    if (MS.view === undefined) MS.view = 'top';
    if (MS.selectedBuilding === undefined) MS.selectedBuilding = null;
    if (MS.selectedShop === undefined) MS.selectedShop = null;
    if (MS.sheetMode === undefined) MS.sheetMode = 'list';
    if (MS.sheetSize === undefined) MS.sheetSize = 'peek';
    if (MS.route === undefined) MS.route = null;           // ルート表示中: { kind: 'tour', id } | { kind: 'ai' }
    if (MS.routeActive === undefined) MS.routeActive = null; // ルートの中で強調している停留所のビルid
  }
  initState();

  var root = null, mapEl = null, viewObj = null, viewName = null;
  var debounceTimer = 0, focusAfter = false, lastKey = '', suppressToggle = false, drag = null;
  var curRoute = null; // いまのルート（毎回データから作り直す）

  var E = function (s) { return Neo.esc(s); };

  /* ---------- 小さな部品 ---------- */
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
  var ICON_LOCATE = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';

  var ICON_COMPASS = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>';

  var VIEWS = [{ id: 'top', label: '真上' }, { id: 'oblique', label: '斜め' }, { id: '3d', label: '3D' }];

  /* ---------- データの絞り込み ---------- */
  function ctx() {
    var F = Neo.filters, d = Neo.data;
    var vis = F.visibleShops(d, Neo.state);
    var active = {};
    var camps = F.visibleCampaigns(d, Neo.state).filter(function (c) { return c.status === 'active'; });
    camps.forEach(function (c) { (active[c.shopId] = active[c.shopId] || []).push(c); });
    return { F: F, d: d, vis: vis, active: active, activeCount: camps.length, here: d.town.here };
  }

  function matches(shop, c) {
    var d = c.d;
    if (MS.category !== 'all') {
      var cat = d.categories[MS.category];
      if (!cat || cat.genres.indexOf(shop.genre) < 0) return false;
    }
    var q = (MS.query || '').trim().toLowerCase();
    if (!q) return true;
    var b = Neo.buildingOf(shop);
    var hay = [shop.name, (shop.tags || []).join(' '), d.genres[shop.genre] || '', b ? b.name : ''].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function shopById(c, id) {
    var f = null;
    c.vis.forEach(function (s) { if (s.id === id) f = s; });
    return f;
  }

  // 選択が掲載できなくなっていないか確認し、必要なら一段戻す
  function validate(c) {
    if (MS.selectedShop) {
      var sh = shopById(c, MS.selectedShop);
      if (!sh) { MS.selectedShop = null; if (MS.sheetMode === 'shop') MS.sheetMode = 'building'; }
      else MS.selectedBuilding = sh.building;
    }
    if (MS.selectedBuilding) {
      var has = c.vis.some(function (s) { return s.building === MS.selectedBuilding; });
      if (!has) { MS.selectedBuilding = null; MS.selectedShop = null; MS.sheetMode = 'list'; }
    }
    if (MS.sheetMode === 'shop' && !MS.selectedShop) MS.sheetMode = MS.selectedBuilding ? 'building' : 'list';
    if (MS.sheetMode === 'building' && !MS.selectedBuilding) MS.sheetMode = 'list';
    if (MS.sheetMode === 'list') { MS.selectedBuilding = null; MS.selectedShop = null; }
  }

  /* ---------- 画面の骨組み ---------- */
  function homeHtml() {
    var d = Neo.data;
    var tabs = '<button type="button" role="tab" class="cat-tab" data-cat="all">すべて</button>' +
      Object.keys(d.categories).map(function (k) {
        return '<button type="button" role="tab" class="cat-tab" data-cat="' + E(k) + '">' + E(d.categories[k].label) + '</button>';
      }).join('');
    var views = VIEWS.map(function (v) {
      return '<button type="button" class="vs-btn" data-view="' + v.id + '" aria-pressed="false" aria-disabled="false">' +
        '<span>' + v.label + '</span><small class="vs-soon">準備中</small></button>';
    }).join('');
    return '<div class="home" data-home>' +
      '<h1 class="sr-only">マップ</h1>' +
      '<div class="home-map" id="home-map"></div>' +
      '<div class="home-top">' +
        '<div class="home-row">' +
          '<div class="searchbox">' + ICON_SEARCH +
            '<input type="text" class="search-input" id="search-input" autocomplete="off" enterkeyhint="search" ' +
              'aria-label="検索（店名・ジャンル・ビル名）" placeholder="SEARCH　店名・ジャンル・ビル名" value="' + E(MS.query) + '">' +
            '<button type="button" class="search-clear" data-clear aria-label="入力を消す" hidden>×</button>' +
          '</div>' +
          '<button type="button" class="hamburger" data-menu-btn aria-label="メニュー" aria-expanded="false" aria-controls="drawer">' +
            '<span class="bar"></span><span class="bar"></span><span class="bar"></span></button>' +
        '</div>' +
        '<div class="cat-tabs" role="tablist" aria-label="分類">' + tabs + '</div>' +
      '</div>' +
      '<div class="home-tools"><div class="view-switch" role="group" aria-label="地図の表示">' + views + '</div></div>' +
      '<div class="home-zoom">' +
        '<button type="button" class="round-btn" data-zoom="in" aria-label="拡大">＋</button>' +
        '<button type="button" class="round-btn" data-zoom="out" aria-label="縮小">－</button>' +
        '<button type="button" class="round-btn" data-locate aria-label="現在地に戻る">' + ICON_LOCATE + '</button>' +
        '<button type="button" class="round-btn" data-reset-view aria-label="向きを戻す" title="向きを戻す" hidden>' + ICON_COMPASS + '</button>' +
      '</div>' +
      '<section class="sheet" aria-label="周辺情報">' +
        '<div class="sheet-grab"><button type="button" class="sheet-handle" aria-label="パネルの高さを切り替える"><span class="sheet-bar"></span></button>' +
        '<div class="sheet-head"></div></div>' +
        '<div class="sheet-body" aria-live="polite"></div>' +
      '</section>' +
      '</div>';
  }

  /* ---------- 下パネルの描画 ---------- */
  function badge(c, shop) { return c.active[shop.id] ? '<span class="badge-live">開催中</span>' : ''; }

  function renderList(c) {
    var here = c.here;
    var rows = c.vis.filter(function (s) { return matches(s, c); }).map(function (s) {
      return { s: s, w: c.F.walkMinutes(here, s) };
    }).sort(function (a, b) { return a.w - b.w || a.s.floor - b.s.floor; });
    var head = '<h2 class="sheet-title slash-heading" tabindex="-1">現在地からの周辺情報</h2>' +
      '<p class="sheet-line small"><a href="#/shops?f=live">開催中キャンペーン ' + c.activeCount + '件</a> ・ 掲載中のお店 ' + c.vis.length + '軒</p>';
    var list = rows.length ? rows.map(function (r) {
      return '<button type="button" class="shop-row" data-shop="' + E(r.s.id) + '">' +
        '<span class="dot" style="--c: ' + Neo.genreColorVar(r.s.genre) + '" aria-hidden="true"></span>' +
        '<span class="row-main"><strong>' + E(r.s.name) + '</strong><span class="muted small">' + E(Neo.placeLabel(r.s)) + '</span></span>' +
        '<span class="row-side"><span class="small">徒歩 約' + r.w + '分</span>' + badge(c, r.s) + '</span></button>';
    }).join('') : '<p class="muted">見つかりませんでした。ことばやタブを変えてみてください。</p>';
    var body = '<div class="card intro-card"><p>ネオ電気街は、大通りと細い路地に、カードゲーム・メイドカフェ・プラモ・PCパーツなどが集まる架空の電気街です。</p></div>' +
      '<p class="list-count">' + E(here.name) + 'から近い順 ・ ' + rows.length + '軒</p>' + list;
    return { head: head, body: body };
  }

  function shopBtn(c, s) {
    var dim = !matches(s, c);
    return '<button type="button" class="floor-shop' + (dim ? ' is-dim' : '') + '" data-shop="' + E(s.id) + '">' +
      '<span class="dot" style="--c: ' + Neo.genreColorVar(s.genre) + '" aria-hidden="true"></span>' +
      '<span>' + E(s.name) + '</span>' + badge(c, s) + '</button>';
  }

  function renderBuilding(c) {
    var b = null;
    Neo.data.buildings.forEach(function (x) { if (x.id === MS.selectedBuilding) b = x; });
    var shops = c.vis.filter(function (s) { return s.building === b.id; });
    var floors = [], i;
    for (i = b.floors; i >= 1; i--) floors.push(i);
    var basements = [];
    shops.forEach(function (s) { if (s.floor < 0 && basements.indexOf(s.floor) < 0) basements.push(s.floor); });
    basements.sort(function (a, z) { return z - a; });
    floors = floors.concat(basements);
    var rows = floors.map(function (fl) {
      var here = shops.filter(function (s) { return s.floor === fl; });
      return '<tr><th scope="row" class="floor-label">' + Neo.floorLabel(fl) + '</th><td>' +
        (here.length ? here.map(function (s) { return shopBtn(c, s); }).join('') : '<span class="muted">—</span>') + '</td></tr>';
    }).join('');
    var head = '<button type="button" class="sheet-back" data-back="list">← 一覧へ</button>';
    var body = '<h2>' + E(b.name) + '</h2>' +
      '<p class="muted">現在地から徒歩 約' + c.F.walkMinutes(c.here, b) + '分</p>' +
      '<table class="floor-table"><caption class="sr-only">階ごとのお店</caption><tbody>' + rows + '</tbody></table>';
    return { head: head, body: body };
  }

  function renderShop(c) {
    var F = c.F, s = shopById(c, MS.selectedShop);
    var b = Neo.buildingOf(s);
    var camps = c.active[s.id] || [];
    var open = F.isOpenOnDay(s, new Date().getDay());
    var head = '<button type="button" class="sheet-back" data-back="building">← ' + E(b ? b.name : '戻る') + '</button>';
    var body = '<span class="genre-chip" style="--c: ' + Neo.genreColorVar(s.genre) + '">' + E(c.d.genres[s.genre] || '') + '</span>' +
      '<h2>' + E(s.name) + '</h2>' +
      '<p class="muted">' + E(Neo.placeLabel(s)) + '</p>' +
      '<dl class="info-list"><dt>営業時間</dt><dd>' + E(s.hours) + '</dd><dt>定休日</dt><dd>' + E(s.closed) +
      '</dd><dt>今日</dt><dd>' + (open ? '営業日' : '定休日') + '</dd></dl>' +
      '<h3 class="sub-h">開催中のキャンペーン</h3>' +
      (camps.length ? '<ul class="plain-list">' + camps.map(function (x) {
        return '<li><strong>' + E(x.title) + '</strong><br><span class="muted small">〜' + E(F.formatDate(x.endDate)) + 'まで</span></li>';
      }).join('') + '</ul>' : '<p class="muted">現在開催中のキャンペーンはありません</p>') +
      '<p class="muted small">' + E(F.updatedLabel(s.lastUpdatedDaysAgo)) + '</p>' +
      '<p><a class="btn btn-primary" href="#/shop/' + encodeURIComponent(s.id) + '">詳しく見る</a></p>';
    return { head: head, body: body };
  }

  /* ---------- ルート（ツアー／AIプラン） ---------- */
  // 現在のデータ・状態からルートを作る。表示できる停留所が1つも無ければ null
  function buildRouteCtx(route) {
    if (!route) return null;
    var F = Neo.filters, d = Neo.data, o;
    if (route.kind === 'tour') {
      var tour = null;
      ((d.tours && d.tours.tours) || []).forEach(function (t) { if (t.id === route.id) tour = t; });
      if (!tour) return null;
      var r = F.buildRoute(tour.stops, d, Neo.state);
      o = { items: r.items, times: null, total: r.totalMinutes, walk: r.walkMinutes, title: tour.title, startAtHere: false,
        detail: '#/tour/' + encodeURIComponent(tour.id), book: '#/booking?tour=' + encodeURIComponent(tour.id), ai: false };
    } else if (route.kind === 'ai') {
      var st = Neo.arrangeState;
      if (!st) return null;
      var plan = F.planArrange({ themes: Array.from(st.themes), duration: st.duration, rest: st.rest,
        food: st.foodOn ? Array.from(st.foodKinds) : null }, d, Neo.state, new Date());
      o = { items: plan.items, times: plan.times, total: plan.totalMinutes, walk: plan.walkMinutes, title: 'AIアレンジのプラン', startAtHere: true,
        detail: '#/arrange', book: '#/booking?plan=ai', ai: true };
    } else return null;
    if (!o.items.length) return null;
    o.geo = F.routeGeometry(o.items, o.startAtHere, d);
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    o.geo.path.concat(o.geo.stops).forEach(function (p) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    });
    o.bounds = { x0: x0, y0: y0, x1: x1, y1: y1 };
    return o;
  }

  function exitRoute() {
    MS.route = null; MS.routeActive = null;
    if (MS.sheetMode === 'route') MS.sheetMode = 'list';
  }

  function renderRoute() {
    var rc = curRoute, F = Neo.filters, last = rc.items.length - 1;
    var rows = rc.items.map(function (it, i) {
      var sh = it.shop, on = sh.building === MS.routeActive;
      var when = rc.times && rc.times[i] ? F.formatClock(rc.times[i].arrive) + '〜' + F.formatClock(rc.times[i].leave) : '滞在 ' + it.stayMinutes + '分';
      var conn = i < last
        ? '<div class="rt-walk muted small" aria-hidden="true">' + (rc.items[i + 1].shop.building === sh.building ? '同じビルの別の階へ 約' : '徒歩 約') +
          rc.items[i + 1].walkFromPrev + '分</div>' : '';
      return '<li><button type="button" class="route-stop' + (on ? ' is-active' : '') + '" data-stop="' + E(sh.building) + '"' + (on ? ' aria-current="true"' : '') + '>' +
        '<span class="rt-num" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="row-main"><strong>' + E(sh.name) + '</strong><span class="muted small">' + E(Neo.placeLabel(sh)) + '</span></span>' +
        '<span class="rt-when small">' + E(when) + '</span></button>' + conn + '</li>';
    }).join('');
    // 狭い画面の peek（低い状態）でも、戻るボタン・タイトル・まとめの行が見えるよう、まとめはヘッダーに入れる
    var head = '<div class="route-head"><button type="button" class="sheet-back" data-back="route">← もどる</button>' +
      '<h2 class="sheet-title slash-heading" tabindex="-1">' + E(rc.title) + '</h2></div>' +
      '<p class="sheet-line small">' + E(F.formatDuration(rc.total)) + ' ・ ' + rc.items.length + '軒 ・ 歩く時間 ' + E(F.formatDuration(rc.walk)) + '</p>';
    var body = (rc.ai ? '<p class="notice card"><strong>これはAI提案プランです。営業時間は店舗にご確認ください。</strong></p>' : '') +
      '<ol class="route-list">' + rows + '</ol>' +
      '<p class="btn-row"><a class="btn btn-ghost" href="' + rc.detail + '">行程のくわしいページ</a>' +
      '<a class="btn btn-primary" href="' + rc.book + '">このプランを申し込む（デモ）</a></p>';
    return { head: head, body: body };
  }

  function renderSheet(c) {
    var out = MS.sheetMode === 'route' && curRoute ? renderRoute() : MS.sheetMode === 'shop' ? renderShop(c) : MS.sheetMode === 'building' ? renderBuilding(c) : renderList(c);
    var headEl = root.querySelector('.sheet-head'), bodyEl = root.querySelector('.sheet-body');
    var key = MS.sheetMode + '|' + MS.selectedBuilding + '|' + MS.selectedShop + '|' + (MS.route ? MS.route.kind + (MS.route.id || '') : '');
    var top = key === lastKey ? bodyEl.scrollTop : 0;
    headEl.innerHTML = out.head;
    bodyEl.innerHTML = out.body;
    bodyEl.scrollTop = top;
    lastKey = key;
    if (focusAfter) {
      focusAfter = false;
      var t = headEl.querySelector('.sheet-back') || headEl.querySelector('.sheet-title');
      if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }
  }

  /* ---------- シートの高さ ---------- */
  function sheetPx(size) {
    var h = window.innerHeight;
    return size === 'full' ? Math.round(h * 0.88) : size === 'half' ? Math.round(h * 0.55) : 132;
  }
  function applySheet() {
    if (!root) return;
    root.style.setProperty('--sheet-h', sheetPx(MS.sheetSize) + 'px');
    root.setAttribute('data-size', MS.sheetSize);
    var hb = root.querySelector('.sheet-handle');
    if (hb) hb.setAttribute('aria-expanded', MS.sheetSize === 'peek' ? 'false' : 'true');
  }
  function ensureHalf() { if (MS.sheetSize === 'peek') MS.sheetSize = 'half'; }
  function toggleSheet() {
    MS.sheetSize = MS.sheetSize === 'peek' ? 'half' : MS.sheetSize === 'half' ? 'peek' : 'half';
    applySheet();
    if (MS.route) fitRoute(); // パネルの高さが変わったら、空いた範囲にルートを収め直す
  }

  /* ---------- 更新 ---------- */
  function refresh() {
    if (!root) return;
    var c = ctx();
    // ルート表示は毎回作り直す。停留所が全部なくなったら（管理画面での切替など）ふつうの表示に戻る
    curRoute = MS.route ? buildRouteCtx(MS.route) : null;
    if (MS.route && !curRoute) exitRoute();
    if (MS.sheetMode === 'route' && !MS.route) MS.sheetMode = 'list';
    if (curRoute) {
      MS.selectedBuilding = null; MS.selectedShop = null;
      if (MS.routeActive && !curRoute.geo.stops.some(function (st) { return st.building === MS.routeActive; })) MS.routeActive = null;
    }
    validate(c);

    // タブ・検索欄・表示切替
    var tabs = root.querySelectorAll('.cat-tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-cat') === MS.category;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
    }
    root.querySelector('.search-clear').hidden = !MS.query;
    root.querySelector('[data-reset-view]').hidden = MS.view !== '3d'; // 向きを戻すボタンは3Dのときだけ
    var vbs = root.querySelectorAll('.vs-btn');
    for (var j = 0; j < vbs.length; j++) {
      var id = vbs[j].getAttribute('data-view');
      vbs[j].setAttribute('aria-pressed', id === MS.view ? 'true' : 'false');
      vbs[j].setAttribute('aria-disabled', Neo.mapViews[id] ? 'false' : 'true');
    }

    // ピン（分類と検索の両方に合うお店があるビル）
    if (viewObj) {
      var counts = {};
      c.vis.forEach(function (s) { if (matches(s, c)) counts[s.building] = (counts[s.building] || 0) + 1; });
      var pins = Neo.data.buildings.filter(function (b) { return counts[b.id]; }).map(function (b) {
        return { building: b.id, count: counts[b.id], selected: b.id === MS.selectedBuilding };
      });
      viewObj.update({
        shops: c.vis.map(function (s) {
          return { id: s.id, name: s.name, building: s.building, floor: s.floor, genre: s.genre, match: matches(s, c) };
        }),
        pins: curRoute ? [] : pins, selectedBuilding: curRoute ? null : MS.selectedBuilding,
        route: curRoute ? { path: curRoute.geo.path, stops: curRoute.geo.stops, activeBuilding: MS.routeActive, startAtHere: curRoute.startAtHere } : null,
        here: c.here, town: Neo.data.town, buildings: Neo.data.buildings
      });
    }
    renderSheet(c);
    applySheet();
  }

  /* ---------- 操作 ---------- */
  // 地図の「空いている範囲」（上の部品〜下のパネルの間）の中心。選んだビルをそこへ寄せる
  // 返り値は地図枠の中の上端 top・下端 bottom（px）
  function freeRect() {
    var mr = mapEl.getBoundingClientRect();
    if (window.innerWidth >= 900) return { top: 0, bottom: mr.height };
    var top = 0;
    ['.home-tools', '.home-top'].forEach(function (sel) {
      var el = root.querySelector(sel);
      if (el) top = Math.max(top, el.getBoundingClientRect().bottom - mr.top);
    });
    top += 8;
    var bottom = mr.height - sheetPx(MS.sheetSize) - 8;
    if (bottom - top < 80) bottom = top + 80;
    return { top: top, bottom: bottom };
  }
  function freeTarget() {
    if (!mapEl) return null;
    var r = freeRect();
    return { x: mapEl.getBoundingClientRect().width / 2, y: (r.top + r.bottom) / 2 };
  }
  function centerSelected(instant) {
    if (!viewObj || !MS.selectedBuilding) return;
    var b = null;
    Neo.data.buildings.forEach(function (x) { if (x.id === MS.selectedBuilding) b = x; });
    if (b) viewObj.centerOn(b.x, b.y, !!instant, freeTarget());
  }

  // ルート全体が収まる構図にする（余白40）
  function fitRoute() {
    if (!viewObj || !curRoute || !viewObj.fitBounds) return;
    var b = curRoute.bounds;
    viewObj.fitBounds(b.x0 - 40, b.y0 - 40, b.x1 + 40, b.y1 + 40);
  }

  // ルート表示中に停留所を選ぶ（パネルはそのまま。強調だけ変える）
  function activateStop(id, rowIdx, centre) {
    MS.routeActive = id;
    refresh();
    var rows = root.querySelectorAll('.route-stop');
    if (rowIdx >= 0 && rows[rowIdx]) { try { rows[rowIdx].focus({ preventScroll: true }); } catch (e) { rows[rowIdx].focus(); } }
    else {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-stop') === id) { rows[i].scrollIntoView({ block: 'nearest' }); break; }
      }
    }
    if (centre) {
      var b = null;
      Neo.data.buildings.forEach(function (x) { if (x.id === id) b = x; });
      if (b && viewObj) viewObj.centerOn(b.x, b.y, false, freeTarget());
    }
  }

  function selectBuilding(id) {
    if (MS.route) { // ルート表示中は停留所のビルだけ反応する
      if (curRoute && curRoute.geo.stops.some(function (st) { return st.building === id; })) activateStop(id, -1, false);
      return;
    }
    MS.selectedBuilding = id; MS.selectedShop = null; MS.sheetMode = 'building';
    ensureHalf(); focusAfter = true; refresh();
    centerSelected(false);
  }
  function selectShop(id) {
    var c = ctx(), s = shopById(c, id);
    if (!s) return;
    var changed = MS.selectedBuilding !== s.building;
    MS.selectedShop = id; MS.selectedBuilding = s.building; MS.sheetMode = 'shop';
    ensureHalf(); focusAfter = true; refresh();
    if (changed) centerSelected(false);
  }
  function goBack(to) {
    if (to === 'route') { exitRoute(); focusAfter = true; refresh(); return; }
    if (to === 'building' && MS.selectedBuilding) { MS.selectedShop = null; MS.sheetMode = 'building'; }
    else { MS.selectedBuilding = null; MS.selectedShop = null; MS.sheetMode = 'list'; }
    focusAfter = true; refresh();
  }

  function switchView(name) {
    if (!Neo.mapViews[name]) name = 'top';
    if (viewObj) viewObj.unmount();
    MS.view = name;
    viewName = name;
    viewObj = Neo.mapViews[name];
    viewObj.mount(mapEl, { onSelectBuilding: selectBuilding, here: Neo.data.town.here, freeArea: freeRect });
  }

  // 表示（真上／斜め／3D）の切り替え。選択中のビルがあればそこへ、なければ現在地へ
  function doViewSwitch(v) {
    if (!root || !Neo.mapViews[v] || v === MS.view) return;
    switchView(v); refresh();
    if (MS.route) fitRoute();
    else if (MS.selectedBuilding) centerSelected(true);
    else if (v !== '3d' && viewObj) viewObj.centerOn(Neo.data.town.here.x, Neo.data.town.here.y, true); // 3Dは前回の向きか、全体が見える初期の構図のまま
  }
  Neo.switchMapView = doViewSwitch;

  function onResize() { applySheet(); }

  function teardown() {
    clearTimeout(debounceTimer);
    if (viewObj) { viewObj.unmount(); viewObj = null; }
    window.removeEventListener('resize', onResize);
    root = null; mapEl = null; lastKey = '';
  }

  function wire() {
    var input = root.querySelector('#search-input');
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { MS.query = input.value; exitRoute(); refresh(); }, 150);
      root.querySelector('.search-clear').hidden = !input.value;
    });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      clearTimeout(debounceTimer);
      MS.query = input.value;
      exitRoute();
      MS.selectedBuilding = null; MS.selectedShop = null; MS.sheetMode = 'list';
      MS.sheetSize = MS.sheetSize === 'peek' ? 'half' : MS.sheetSize;
      input.blur();
      refresh();
    });

    root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : e.target.parentElement;
      if (!t) return;
      var el;
      if ((el = t.closest('[data-cat]'))) { MS.category = el.getAttribute('data-cat'); exitRoute(); refresh(); return; }
      if ((el = t.closest('[data-stop]'))) {
        var rowList = Array.prototype.slice.call(root.querySelectorAll('.route-stop'));
        activateStop(el.getAttribute('data-stop'), rowList.indexOf(el), true);
        return;
      }
      if ((el = t.closest('[data-shop]'))) { selectShop(el.getAttribute('data-shop')); return; }
      if ((el = t.closest('[data-back]'))) { goBack(el.getAttribute('data-back')); return; }
      if (t.closest('[data-clear]')) { MS.query = ''; input.value = ''; exitRoute(); refresh(); input.focus(); return; }
      if ((el = t.closest('[data-zoom]'))) { if (viewObj) viewObj.zoomBy(el.getAttribute('data-zoom') === 'in' ? 1.4 : 1 / 1.4); return; }
      if (t.closest('[data-locate]')) { if (viewObj) viewObj.centerOn(Neo.data.town.here.x, Neo.data.town.here.y); return; }
      if ((el = t.closest('[data-view]'))) {
        doViewSwitch(el.getAttribute('data-view'));
        return;
      }
      if (t.closest('[data-reset-view]')) { if (viewObj && viewObj.resetView) viewObj.resetView(); return; }
    });

    // タブの矢印キー操作
    root.querySelector('.cat-tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(root.querySelectorAll('.cat-tab'));
      var idx = tabs.indexOf(document.activeElement);
      if (idx < 0) return;
      var next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      e.preventDefault();
      MS.category = next.getAttribute('data-cat');
      exitRoute();
      refresh();
      var again = root.querySelector('.cat-tab[data-cat="' + MS.category + '"]');
      if (again) again.focus();
    });

    // シートのドラッグ／タップ（つまみ・見出し部分）。5px未満の動きはタップとして高さを切り替える
    var grab = root.querySelector('.sheet-grab');
    var tapHandled = false;
    function startTarget(e) { return e.target.closest && e.target.closest('.sheet-handle, .sheet-title'); }
    grab.addEventListener('pointerdown', function (e) {
      if (!startTarget(e)) return;
      drag = { y: e.clientY, h: sheetPx(MS.sheetSize), moved: false, id: e.pointerId };
    });
    grab.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dy) > 5) {
        drag.moved = true;
        root.classList.add('sheet-dragging');
        try { grab.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      }
      if (drag.moved) {
        drag.cur = Math.max(90, Math.min(sheetPx('full'), drag.h - dy));
        root.style.setProperty('--sheet-h', drag.cur + 'px');
      }
    });
    function endDrag(e) {
      if (!drag) return;
      var wasTap = !drag.moved && e && e.type === 'pointerup';
      if (drag.moved) {
        var best = 'peek', bd = Infinity;
        ['peek', 'half', 'full'].forEach(function (sz) {
          var dd = Math.abs(sheetPx(sz) - drag.cur);
          if (dd < bd) { bd = dd; best = sz; }
        });
        MS.sheetSize = best;
      }
      drag = null;
      root.classList.remove('sheet-dragging');
      if (wasTap) toggleSheet();
      else { applySheet(); if (MS.route) fitRoute(); }
      // この後に来る click で二重に切り替わらないようにする
      tapHandled = true;
      setTimeout(function () { tapHandled = false; }, 400);
    }
    grab.addEventListener('pointerup', endDrag);
    grab.addEventListener('pointercancel', endDrag);
    // キーボード（Enter/Space は click として届く）。ポインタ操作の click は上で処理済みなので無視
    grab.addEventListener('click', function (e) {
      if (!(e.target.closest && e.target.closest('.sheet-handle'))) return;
      if (tapHandled) return;
      toggleSheet();
    });

    window.addEventListener('resize', onResize);
  }

  /* ---------- 画面の登録 ---------- */
  Neo.screens.home = function () {
    teardown();
    initState();
    return homeHtml();
  };
  Neo.screens.top = Neo.screens.home;
  Neo.screens.map = Neo.screens.home;

  // ディープリンク（#/?shop=ID ・ #/?building=ID ・ #/?tour=ID ・ #/?plan=ai）。該当があれば選択状態にして true を返す
  // 見つからない（未登録・非掲載・停留所なし）ときは何もしない。どちらの場合もURLからクエリを外し、再描画で再適用されないようにする
  function applyDeepLink(params) {
    var q = params && params.query;
    if (!q) return false;
    var sid = q.get('shop'), bid = q.get('building'), tid = q.get('tour'), plan = q.get('plan');
    if (!sid && !bid && !tid && !plan) return false;
    var c = ctx(), done = false;
    var s = sid ? shopById(c, sid) : null;
    var b = null, route = null;
    if (!s && bid) Neo.data.buildings.forEach(function (x) {
      if (x.id === bid && c.vis.some(function (v) { return v.building === bid; })) b = x;
    });
    if (!s && !b) {
      if (tid && buildRouteCtx({ kind: 'tour', id: tid })) route = { kind: 'tour', id: tid };
      else if (plan === 'ai' && buildRouteCtx({ kind: 'ai' })) route = { kind: 'ai' };
    }
    if (s || b || route) {
      MS.category = 'all'; MS.query = '';
      var input = root && root.querySelector('#search-input');
      if (input) input.value = '';
      MS.route = route; MS.routeActive = null;
      if (route) {
        MS.selectedBuilding = null; MS.selectedShop = null; MS.sheetMode = 'route';
      } else {
        MS.selectedBuilding = s ? s.building : b.id;
        MS.selectedShop = s ? s.id : null;
        MS.sheetMode = s ? 'shop' : 'building';
      }
      if (route) { if (window.innerWidth < 900) MS.sheetSize = 'peek'; } // 狭い画面ではルート全体が見えるよう、パネルは低いまま
      else ensureHalf();
      done = true;
    }
    try { history.replaceState(null, '', location.pathname + location.search + '#/'); } catch (e) { /* 無視 */ }
    return done;
  }

  function mountHome(params) {
    root = document.querySelector('[data-home]');
    if (!root) return;
    mapEl = root.querySelector('#home-map');
    wire();
    applyDeepLink(params); // 一覧の「地図で見る」・詳細の「マップで見る」から来たとき
    // 選んだビルがあるとき：そのビルの案内を開く
    var centerTo = null;
    if (MS.selectedBuilding && MS.selectedShop) {
      var cur = shopById(ctx(), MS.selectedShop);
      if (!cur || cur.building !== MS.selectedBuilding) { MS.selectedShop = null; MS.sheetMode = 'building'; }
    }
    if (MS.selectedBuilding && MS.sheetMode === 'list') {
      MS.sheetMode = 'building'; MS.selectedShop = null; ensureHalf();
    }
    if (MS.selectedBuilding) {
      Neo.data.buildings.forEach(function (b) { if (b.id === MS.selectedBuilding) centerTo = b; });
    }
    switchView(MS.view);
    refresh();
    if (MS.route) fitRoute();
    else if (centerTo) centerSelected(true);
  }
  Neo.afterRender.top = mountHome;
  Neo.afterRender.map = mountHome;

  // 再描画のときは作り直さず、中身だけ更新（拡大位置・入力中の文字を守る）
  Neo.screenUpdaters.top = Neo.screenUpdaters.map = function (params) {
    if (!root || !document.contains(root)) return false;
    var linked = applyDeepLink(params);
    refresh();
    if (linked) { if (MS.route) fitRoute(); else centerSelected(true); }
    return true;
  };
  Neo.screenLeave.top = Neo.screenLeave.map = teardown;

  // Esc で一段戻る（検索欄の中では何もしない）
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !root || !document.contains(root)) return;
    var dr = document.getElementById('drawer');
    if (dr && dr.classList.contains('is-open')) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (MS.route) goBack('route');
    else if (MS.sheetMode === 'shop') goBack('building');
    else if (MS.sheetMode === 'building') goBack('list');
  });
})();
