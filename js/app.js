/* app.js — データ読み込み・状態・ルーター・メニュー（ドロワー）・共通ヘルパー */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});

  /* ---------- 状態（メモリのみ。リロードで初期化） ---------- */
  Neo.state = { permissionOverrides: {} };
  Neo.data = null;
  Neo.screens = Neo.screens || {};         // 画面レジストリ {名前: renderFn(params)}
  Neo.afterRender = Neo.afterRender || {}; // 描画後フック {画面名: fn(params)}
  Neo.screenUpdaters = Neo.screenUpdaters || {}; // 再描画時に作り直さず更新する画面 {画面名: fn(params) → 更新できたら true}
  Neo.screenLeave = Neo.screenLeave || {};       // 画面を離れるときの後始末 {画面名: fn()}
  Neo.mounted = null;                            // いま表示中の画面名
  Neo.mapState = Neo.mapState || { selectedBuilding: null }; // 地図の選択（次の手順で使う）

  /* ---------- 小さなヘルパー ---------- */

  // HTMLエスケープ（データ由来の文字は必ずこれを通す）
  Neo.esc = function (str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  // ジャンル色のCSS変数（例: var(--g-maid_cafe)）
  Neo.genreColorVar = function (genreId) { return 'var(--g-' + genreId + ')'; };

  // 階の表記 1 → "1F"、-1 → "B1F"
  Neo.floorLabel = function (n) { return n < 0 ? 'B' + (-n) + 'F' : n + 'F'; };

  // 店が入っているビル
  Neo.buildingOf = function (shop) {
    var found = null;
    ((Neo.data && Neo.data.buildings) || []).forEach(function (b) { if (b.id === shop.building) found = b; });
    return found;
  };

  // 場所の表記「カード会館 3F」
  Neo.placeLabel = function (shop) {
    var b = Neo.buildingOf(shop);
    return (b ? b.name + ' ' : '') + Neo.floorLabel(shop.floor);
  };

  // ジャンル → 分類ID（飲食体験 など）
  Neo.categoryOfGenre = function (genreId) {
    var found = null, cats = (Neo.data && Neo.data.categories) || {};
    Object.keys(cats).forEach(function (k) { if (cats[k].genres.indexOf(genreId) >= 0) found = k; });
    return found;
  };

  /* ---------- ルーター ---------- */

  // クエリ（?以降）を分けてからルートを判定し、params.query に URLSearchParams を渡す
  function parseRoute() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var qi = raw.indexOf('?');
    var r = parsePath(qi >= 0 ? raw.slice(0, qi) : raw);
    r.params = r.params || {};
    r.params.query = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
    return r;
  }

  function parsePath(hash) {
    var parts = hash.split('/').filter(Boolean);
    var seg = parts[0] || '';
    var id = parts[1] ? decodeURIComponent(parts[1]) : null;
    switch (seg) {
      case '': return { name: 'top', params: {} };
      case 'map': return { name: 'map', params: {} };
      case 'shops': return { name: 'shops', params: {} };
      case 'shop': return id ? { name: 'shop', params: { id: id } } : { name: 'shops', params: {} };
      case 'campaigns': return { name: 'shops', params: {}, redirect: '#/shops?f=live' }; // キャンペーン一覧はお店一覧に統合
      case 'tours': return { name: 'tours', params: {} };
      case 'tour': return id ? { name: 'tour', params: { id: id } } : { name: 'tours', params: {} };
      case 'arrange': return { name: 'arrange', params: {} };
      case 'booking': return { name: 'booking', params: {} };
      case 'admin': return { name: 'admin', params: {} };
      default: return { name: 'top', params: {}, unknown: true };
    }
  }

  // メニューの現在地表示。詳細画面は親メニューを強調（地図系はどちらも「マップ」）
  var NAV_PARENT = { shop: 'shops', tour: 'tours', map: 'top' };

  // お店・キャンペーン画面は ?f=live のときだけメニューの「キャンペーン」を強調する
  function updateNav(name, params) {
    var current = NAV_PARENT[name] || name;
    if (name === 'shops' && params && params.query && params.query.get('f') === 'live') current = 'campaigns';
    var links = document.querySelectorAll('[data-route]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-route') === current) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
  }

  function placeholder() {
    return '<section class="card"><h1>この画面は準備中です</h1>' +
      '<p>もうしばらくお待ちください。</p>' +
      '<p><a class="btn btn-ghost" href="#/">トップへ戻る</a></p></section>';
  }

  var appEl = null;

  function render(moveFocus) {
    var route = parseRoute();
    // 同じ画面の再描画で、更新だけで済む画面はそちらを使う（拡大位置や入力中の文字を守る）
    if (!moveFocus && Neo.mounted === route.name && Neo.screenUpdaters[route.name] &&
        Neo.screenUpdaters[route.name](route.params)) {
      updateNav(route.name, route.params);
      return;
    }
    if (Neo.mounted && Neo.screenLeave[Neo.mounted]) Neo.screenLeave[Neo.mounted]();
    // ホームは全画面（ヘッダー・フッターを隠す）
    document.body.classList.toggle('is-map', route.name === 'top' || route.name === 'map');
    var fn = Neo.screens[route.name];
    appEl.innerHTML = fn ? fn(route.params) : placeholder();
    Neo.mounted = route.name;
    updateNav(route.name, route.params);
    var hook = Neo.afterRender[route.name];
    if (hook) hook(route.params);
    if (moveFocus) {
      window.scrollTo(0, 0);
      var h = appEl.querySelector('h1') || appEl;
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
    }
  }

  function onRouteChange() {
    if (!Neo.data) return;
    var r = parseRoute();
    if (r.unknown) { location.replace('#/'); return; }
    if (r.redirect) { location.replace(r.redirect); return; }
    render(true);
  }

  // 現在の画面を再描画（管理画面の切替用。スクロール・フォーカスは動かさない）
  Neo.rerender = function () {
    if (!Neo.data) return;
    render(false);
  };

  /* ---------- メニュー（ドロワー） ---------- */

  var drawer, overlay, closeBtn, lastBtn = null;

  // メニューボタンは複数ある（通常ヘッダー／ホームの浮きボタン）。見えている方を使う
  function menuButtons() { return document.querySelectorAll('[data-menu-btn]'); }
  function setExpanded(v) {
    var bs = menuButtons();
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-expanded', v ? 'true' : 'false');
  }
  function visibleMenuBtn() {
    var bs = menuButtons();
    for (var i = 0; i < bs.length; i++) if (bs[i].getClientRects().length) return bs[i];
    return null;
  }

  function drawerOpen() { return drawer.classList.contains('is-open'); }

  function openDrawer(btn) {
    lastBtn = btn || visibleMenuBtn();
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    setExpanded(true);
    closeBtn.focus();
  }

  function closeDrawer(restoreFocus) {
    if (!drawerOpen()) return;
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    setExpanded(false);
    if (restoreFocus) {
      var b = lastBtn && document.contains(lastBtn) && lastBtn.getClientRects().length ? lastBtn : visibleMenuBtn();
      if (b) b.focus();
    }
  }

  function setupDrawer() {
    drawer = document.getElementById('drawer');
    overlay = document.getElementById('drawer-overlay');
    closeBtn = document.getElementById('drawer-close');
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-menu-btn]') : null;
      if (!b) return;
      if (drawerOpen()) closeDrawer(true); else openDrawer(b);
    });
    closeBtn.addEventListener('click', function () { closeDrawer(true); });
    overlay.addEventListener('click', function () { closeDrawer(true); });
    drawer.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (a) closeDrawer(false); // リンクを押したら閉じる（画面の見出しへフォーカスが移る）
    });
    document.addEventListener('keydown', function (e) {
      if (!drawerOpen()) return;
      if (e.key === 'Escape') { closeDrawer(true); return; }
      if (e.key === 'Tab') { // フォーカスをドロワー内に留める
        var f = drawer.querySelectorAll('a, button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- 起動 ---------- */

  function loadJson(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  function showLoadError() {
    appEl.innerHTML = '<section class="card notice"><h1>データを読み込めませんでした</h1>' +
      '<p>データを読み込めませんでした。フォルダで <code>python -m http.server 8000</code> を実行し、' +
      '<code>http://localhost:8000</code> を開いてください。</p></section>';
  }

  function start() {
    appEl = document.getElementById('app');
    setupDrawer();
    Promise.all([
      loadJson('data/shops.json'),
      loadJson('data/campaigns.json'),
      loadJson('data/tours.json')
    ]).then(function (res) {
      var shops = res[0].shops, buildings = res[0].buildings || [];
      // ビルの位置と通りを店に写す（メモリ上のみ。距離計算・ツアー計算がそのまま使える）
      shops.forEach(function (s) {
        buildings.forEach(function (b) {
          if (b.id === s.building) { s.x = b.x; s.y = b.y; s.street = b.street; }
        });
      });
      Neo.data = {
        town: res[0].town,
        genres: res[0].genres,
        categories: res[0].categories || {},
        buildings: buildings,
        permissionStatuses: res[0].permissionStatuses,
        shops: shops,
        campaigns: res[1].campaigns,
        tours: res[2]
      };
      window.addEventListener('hashchange', function () { closeDrawer(false); onRouteChange(); });
      onRouteChange();
    }).catch(showLoadError);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
