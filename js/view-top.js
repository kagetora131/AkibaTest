/* view-top.js — 「真上」ビュー（空撮風の自作SVGイラスト）＋パン／ズーム。Neo.mapViews.top を登録する */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.mapViews = Neo.mapViews || {};
  Neo.mapState = Neo.mapState || {};

  var NS = 'http://www.w3.org/2000/svg';
  var ROOF = ['#cfc8bb', '#a9a39a', '#d8d2c6', '#9c968c', '#c2b9a8', '#b7aea0'];
  var SHADOW = 'rgba(0,0,0,.32)';

  function f(n) { return Math.round(n * 10) / 10; }

  // 2本の通り（線分）の交点（縦×横だけ。交わらなければ null）
  function cross(a, b) {
    var v = a.x1 === a.x2 ? a : b, h = a.x1 === a.x2 ? b : a;
    if (v.x1 === v.x2 && h.y1 === h.y2 && v.x1 >= h.x1 && v.x1 <= h.x2 && h.y1 >= v.y1 && h.y1 <= v.y2) return { x: v.x1, y: h.y1, v: v, h: h };
    return null;
  }

  function rectD(x, y, w, h) { return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + -w + 'z'; }

  // 高架線 1 本ぶんの絵（影・床・枕木・レール）を { shadow, deck, ties, rails } で返す
  function railParts(rl) {
    var dx = rl.x2 - rl.x1, dy = rl.y2 - rl.y1, len = Math.hypot(dx, dy);
    var ux = dx / len, uy = dy / len, nx = -uy, ny = ux, d, ties = '', rails = '';
    var ln = function (o, ex) {
      return ' x1="' + f(rl.x1 + nx * o + ex[0]) + '" y1="' + f(rl.y1 + ny * o + ex[1]) + '" x2="' + f(rl.x2 + nx * o + ex[0]) + '" y2="' + f(rl.y2 + ny * o + ex[1]) + '"';
    };
    for (d = 4; d < len; d += 8) {
      var sx = rl.x1 + ux * d, sy = rl.y1 + uy * d;
      ties += 'M' + f(sx - nx * 13) + ' ' + f(sy - ny * 13) + 'L' + f(sx + nx * 13) + ' ' + f(sy + ny * 13);
    }
    // 複線：上り・下りの2組（それぞれレール2本）
    [-6, 6].forEach(function (off) {
      [-0.9, 0.9].forEach(function (o2) { rails += '<line' + ln(off + o2, [0, 0]) + ' stroke="#a39e95" stroke-width="1"/>'; });
    });
    return {
      shadow: '<line' + ln(0, [6, 8]) + ' stroke="rgba(0,0,0,.25)" stroke-width="' + rl.width + '"/>',
      deck: '<line' + ln(0, [0, 0]) + ' stroke="#4a4744" stroke-width="' + rl.width + '"/>',
      ties: ties, rails: rails
    };
  }

  // 動かない背景（地面・川・屋根・広場・通り・線路・駅）を文字列で作る
  function buildStatic(town, buildings) {
    var mw = town.mapSize.width, mh = town.mapSize.height;
    var i, o;
    var lay = Neo.townLayout(town, buildings);
    var rng = Neo.mulberry32(4242); // 川のさざ波・小路の小物用（固定シード）
    var main = null, alleys = [], roads = [];
    town.streets.forEach(function (t) {
      if (t.id === 'main') main = t;
      if (/^roji/.test(t.id)) alleys.push(t); else roads.push(t);
    });
    var rv = town.river, pl = town.plaza, st = town.station;

    // 川：水面・さざ波・護岸（橋になる部分は、あとで通りと線路が上から重なる）
    var ripple = '';
    for (i = 0; i < 46; i++) {
      var rx = f(rng() * (mw - 30)), ry = f(rv.y1 + 8 + rng() * (rv.y2 - rv.y1 - 14));
      ripple += 'M' + rx + ' ' + ry + 'h' + (8 + Math.floor(rng() * 18));
    }
    var river = '<rect x="0" y="' + rv.y1 + '" width="' + mw + '" height="' + (rv.y2 - rv.y1) + '" fill="#6f9fb8"/>' +
      '<path d="' + ripple + '" stroke="#8fb7cc" stroke-width="1.4" stroke-linecap="round" fill="none"/>' +
      '<line x1="0" y1="' + (rv.y1 + 2) + '" x2="' + mw + '" y2="' + (rv.y1 + 2) + '" stroke="#8a857c" stroke-width="5"/>' +
      '<line x1="0" y1="' + (rv.y2 - 2) + '" x2="' + mw + '" y2="' + (rv.y2 - 2) + '" stroke="#8a857c" stroke-width="4"/>';
    if (main) { // 橋の影（水面に落ちる）
      river += '<rect x="' + (main.x1 - main.width / 2) + '" y="' + (rv.y1 + 6) + '" width="' + (main.width + 12) + '" height="' + (rv.y2 - rv.y1 - 6) + '" fill="rgba(0,0,0,.2)"/>';
    }

    // 屋根のフィラー（真上・斜めで共通の並び）。影は1本、屋根は色ごとに1本のパスにまとめる（要素数を抑える）
    var shadowD = '', roofD = ROOF.map(function () { return ''; }), detD = '', signD = {}, screens = '';
    lay.rects.forEach(function (r) {
      shadowD += rectD(r.x + 4, r.y + 5, r.w, r.h);
      roofD[r.n % ROOF.length] += rectD(r.x, r.y, r.w, r.h);
      r.det.forEach(function (t) { detD += rectD(t.x, t.y, t.s, t.s); });
      // 屋上の看板：いちばん近い通りの側の縁に、細い板を置く
      if (r.sign || r.screen) {
        var depth = r.screen ? 5 : 3 + (r.n % 3), sx, sy, sw, sh;
        if (r.face === 'w' || r.face === 'e') {
          sh = Math.min(r.h - 4, r.screen ? 24 : 12 + (r.n % 3) * 4); sw = depth;
          sx = r.face === 'w' ? r.x : r.x + r.w - depth; sy = r.y + (r.h - sh) / 2;
        } else {
          sw = Math.min(r.w - 3, r.screen ? 24 : 10 + (r.n % 3) * 4); sh = depth;
          sx = r.x + (r.w - sw) / 2; sy = r.face === 'n' ? r.y : r.y + r.h - depth;
        }
        if (r.screen) {
          screens += '<rect x="' + f(sx) + '" y="' + f(sy) + '" width="' + f(sw) + '" height="' + f(sh) + '" fill="#1c1b22" stroke="' + r.signColor + '" stroke-width="1"/>';
        } else {
          signD[r.signColor] = (signD[r.signColor] || '') + rectD(f(sx), f(sy), f(sw), f(sh));
        }
      }
    });
    var roofs = '<path d="' + shadowD + '" fill="' + SHADOW + '"/>';
    roofD.forEach(function (d, k) { roofs += '<path d="' + d + '" fill="' + ROOF[k] + '"/>'; });
    roofs += '<path d="' + detD + '" fill="#7d776e"/>';
    Object.keys(signD).forEach(function (c) { roofs += '<path d="' + signD[c] + '" fill="' + c + '"/>'; });
    roofs += screens;

    // 緑地（広場の木もここに入っている）
    var trees = '';
    lay.trees.forEach(function (t) {
      trees += '<circle cx="' + f(t.x + 2) + '" cy="' + f(t.y + 3) + '" r="' + t.r + '" fill="' + SHADOW + '"/>' +
        '<circle cx="' + f(t.x) + '" cy="' + f(t.y) + '" r="' + t.r + '" fill="' + (t.alt ? '#6f8f5a' : '#7fa06a') + '"/>';
    });

    // 駅前広場：舗装とタイルの目地
    var tile = '';
    for (o = 10; o < pl.w; o += 10) tile += 'M' + (pl.x - pl.w / 2 + o) + ' ' + (pl.y - pl.h / 2) + 'v' + pl.h;
    for (o = 10; o < pl.h; o += 10) tile += 'M' + (pl.x - pl.w / 2) + ' ' + (pl.y - pl.h / 2 + o) + 'h' + pl.w;
    var plaza = '<rect x="' + (pl.x - pl.w / 2) + '" y="' + (pl.y - pl.h / 2) + '" width="' + pl.w + '" height="' + pl.h + '" fill="#cfc8bb"/>' +
      '<path d="' + tile + '" stroke="#bdb6a9" stroke-width=".8" fill="none"/>';

    // 小路（ジャンク小路）：細い灰色の道。中央線なし、小物（ごちゃごちゃ）を散らす
    var lanes = '', clutter = '';
    alleys.forEach(function (t) {
      var vert = t.x1 === t.x2, len = vert ? t.y2 - t.y1 : t.x2 - t.x1;
      lanes += '<line x1="' + t.x1 + '" y1="' + t.y1 + '" x2="' + t.x2 + '" y2="' + t.y2 + '" stroke="#a49d92" stroke-width="' + t.width + '"/>';
      for (var d = 8; d < len - 6; d += 9 + Math.floor(rng() * 8)) {
        var off = (rng() - 0.5) * (t.width - 3);
        clutter += rectD(f(vert ? t.x1 + off : t.x1 + d), f(vert ? t.y1 + d : t.y1 + off), 2, 2);
      }
    });
    lanes += '<path d="' + clutter + '" fill="#7d776e"/>';

    // 通りの歩道・路面。路面は中央通り → 横丁・裏通りの順に重ねる（交差点は横丁が上）
    var walks = '', asphaltMain = '', asphaltSide = '', marks = '', sideMarks = '';
    roads.forEach(function (t) {
      var ln = ' x1="' + t.x1 + '" y1="' + t.y1 + '" x2="' + t.x2 + '" y2="' + t.y2 + '"';
      var isMain = t === main;
      walks += '<line' + ln + ' stroke="#b9b2a6" stroke-width="' + (t.width + (isMain ? 12 : 8)) + '"/>';
      var line = '<line' + ln + ' stroke="' + (isMain ? '#3f3c38' : '#5c5852') + '" stroke-width="' + t.width + '"/>';
      if (isMain) asphaltMain += line; else asphaltSide += line;
    });

    // 車線の線。交わる通りの幅のぶんは切る
    function segments(t) {
      var vert = t.x1 === t.x2, a0 = vert ? t.y1 : t.x1, a1 = vert ? t.y2 : t.x2, cuts = [];
      roads.forEach(function (u) {
        var c = u !== t && cross(t, u);
        if (c) { var m = vert ? c.y : c.x, hw = u.width / 2 + 4; cuts.push([m - hw, m + hw]); }
      });
      cuts.sort(function (p, q) { return p[0] - q[0]; });
      var segs = [], cur = a0;
      cuts.forEach(function (c) { if (c[0] > cur) segs.push([cur, c[0]]); cur = Math.max(cur, c[1]); });
      if (cur < a1) segs.push([cur, a1]);
      return segs.map(function (g) { return vert ? [t.x1, g[0], t.x1, g[1]] : [g[0], t.y1, g[1], t.y1]; });
    }
    function mark(t, off, attrs) {
      var out = '', v = t.x1 === t.x2;
      segments(t).forEach(function (g) {
        out += '<line x1="' + (g[0] + (v ? off : 0)) + '" y1="' + (g[1] + (v ? 0 : off)) + '" x2="' + (g[2] + (v ? off : 0)) + '" y2="' + (g[3] + (v ? 0 : off)) + '" ' + attrs + '/>';
      });
      return out;
    }
    var DASH = 'stroke="#e9e4da" stroke-width="1.6" stroke-dasharray="12 10"';
    if (main) { // 車線の破線2本＋中央の二重線
      marks = mark(main, -13, DASH) + mark(main, 13, DASH) +
        mark(main, -1.3, 'stroke="#e0b83a" stroke-width="1.2"') + mark(main, 1.3, 'stroke="#e0b83a" stroke-width="1.2"');
    }
    roads.forEach(function (t) { if (t.id === 'denno') sideMarks += mark(t, 0, 'stroke="#e9e4da" stroke-width="1.6" stroke-dasharray="9 9"'); });

    // 歩行者天国：路面に白い文字を2回（90度回す）
    var mall = '';
    if (main && town.pedestrianMall) {
      [240, 800].forEach(function (yy) {
        mall += '<text transform="translate(' + (main.x1 + 5) + ' ' + yy + ') rotate(90)" text-anchor="middle" font-size="14" font-weight="700" letter-spacing="2" fill="#fff" fill-opacity=".5">' +
          Neo.esc(town.pedestrianMall.label) + '</text>';
      });
    }

    // 橋の欄干（川の上の中央通り：両側の細い白線）
    var bridge = '';
    if (main) {
      [-1, 1].forEach(function (sg) {
        var bx = main.x1 + sg * (main.width / 2 + 5);
        bridge += '<line x1="' + bx + '" y1="' + rv.y1 + '" x2="' + bx + '" y2="' + rv.y2 + '" stroke="#fff" stroke-width="1.2"/>';
      });
    }

    // 横断歩道：交差点ごとに、通りを渡る縞（幅広）。小路どうしの交わりは除く
    var zebra = '';
    function zebraAcross(t, cx, cy) { // 通り t を渡る縞（中心 cx, cy）
      var vert = t.x1 === t.x2, k;
      for (k = -t.width / 2 + 3; k < t.width / 2 - 2; k += 7) {
        zebra += vert ? rectD(f(cx + k - 2), f(cy - 5), 4, 10) : rectD(f(cx - 5), f(cy + k - 2), 10, 4);
      }
    }
    function zebraAt(c, sg) {
      var yy = c.y + sg * (c.h.width / 2 + 9), xx = c.x + sg * (c.v.width / 2 + 9);
      if (yy >= c.v.y1 && yy <= c.v.y2) zebraAcross(c.v, c.x, yy);
      if (xx >= c.h.x1 && xx <= c.h.x2) zebraAcross(c.h, xx, c.y);
    }
    for (i = 0; i < town.streets.length; i++) {
      for (var j = i + 1; j < town.streets.length; j++) {
        var c = cross(town.streets[i], town.streets[j]);
        if (!c || (alleys.indexOf(c.v) >= 0 && alleys.indexOf(c.h) >= 0)) continue;
        zebraAt(c, -1); zebraAt(c, 1);
      }
    }
    zebra = '<path d="' + zebra + '" fill="#f1ede4"/>';

    // 高架線 2 本：影 → 床 → 枕木 → レール（交差部の上に駅の屋根が乗る）
    var rp = town.rails.map(railParts), rail = '';
    rp.forEach(function (q) { rail += q.shadow; });
    rp.forEach(function (q) { rail += q.deck; });
    rp.forEach(function (q) { rail += '<path d="' + q.ties + '" stroke="#6d6964" stroke-width="2" fill="none"/>'; });
    rp.forEach(function (q) { rail += q.rails; });

    // 駅：大きな屋根。縦・横のホームの線と、線路が交わる部分の濃い十字
    var sx0 = st.x - st.w / 2, sy0 = st.y - st.h / 2;
    var station = '<rect x="' + (sx0 + 6) + '" y="' + (sy0 + 8) + '" width="' + st.w + '" height="' + st.h + '" fill="rgba(0,0,0,.25)"/>' +
      '<rect x="' + sx0 + '" y="' + sy0 + '" width="' + st.w + '" height="' + st.h + '" fill="#d9d4ca" stroke="#b5ad9f" stroke-width="2"/>' +
      '<rect x="' + (st.x - 17) + '" y="' + sy0 + '" width="34" height="' + st.h + '" fill="#a9a396" fill-opacity=".55"/>' +
      '<rect x="' + sx0 + '" y="' + (st.y - 17) + '" width="' + st.w + '" height="34" fill="#a9a396" fill-opacity=".55"/>';
    [-24, -12, 12, 24].forEach(function (k) {
      station += '<line x1="' + (st.x + k) + '" y1="' + (sy0 + 6) + '" x2="' + (st.x + k) + '" y2="' + (sy0 + st.h - 6) + '" stroke="#b0aa9f" stroke-width="2"/>' +
        '<line x1="' + (sx0 + 6) + '" y1="' + (st.y + k) + '" x2="' + (sx0 + st.w - 6) + '" y2="' + (st.y + k) + '" stroke="#b0aa9f" stroke-width="2"/>';
    });

    // データのビル（実在の建物らしい屋根）
    var bl = '';
    buildings.forEach(function (b) {
      bl += '<rect x="' + (b.x - b.w / 2 + 6) + '" y="' + (b.y - b.h / 2 + 8) + '" width="' + b.w + '" height="' + b.h + '" fill="' + SHADOW + '"/>' +
        '<rect x="' + (b.x - b.w / 2) + '" y="' + (b.y - b.h / 2) + '" width="' + b.w + '" height="' + b.h + '" fill="#e0d9cc"/>' +
        '<rect x="' + (b.x - b.w / 2 + 1.5) + '" y="' + (b.y - b.h / 2 + 1.5) + '" width="' + (b.w - 3) + '" height="' + (b.h - 3) + '" fill="none" stroke="#b5ad9f" stroke-width="3"/>' +
        '<rect x="' + (b.x - 8) + '" y="' + (b.y - 6) + '" width="16" height="12" fill="#c9c1b3"/>';
    });

    // 文字（画面上で一定の大きさにするため data-ctr で逆拡大）
    function label(text, x, y) {
      return '<g data-ctr data-x="' + x + '" data-y="' + y + '"><text class="vt-label" text-anchor="middle">' + Neo.esc(text) + '</text></g>';
    }
    var labels = '';
    town.streets.forEach(function (t) {
      if (t.id === 'main') labels += label(t.name, t.x1, 110);
      else if (t.id === 'denno') labels += label(t.name, 390, t.y1 + 4);
      else if (t.id === 'hobby') labels += label(t.name, t.x1, 160);
      else if (t.id === 'roji1') labels += label(t.name, 215, t.y1 - 6); // ジャンク小路は1回だけ
    });
    labels += label(rv.name, 150, (rv.y1 + rv.y2) / 2 + 4);
    labels += label(pl.name, pl.x, pl.y - pl.h / 2 + 8);
    labels += label(st.name, st.x, st.y + st.h / 2 + 18);

    // 現在地
    var h = town.here;
    var here = '<g data-ctr data-x="' + h.x + '" data-y="' + h.y + '">' +
      '<circle class="vt-halo" r="16" fill="rgba(25,113,194,.28)"/>' +
      '<circle r="9" fill="#1971c2" stroke="#fff" stroke-width="3"/>' +
      '<text class="vt-label vt-small" y="26" text-anchor="middle">現在地</text></g>';

    return '<rect x="0" y="0" width="' + mw + '" height="' + mh + '" fill="#8f8a80"/>' + river +
      '<g>' + roofs + '</g>' + plaza + lanes + walks + asphaltMain + marks + asphaltSide + sideMarks + mall + zebra + bridge + rail + station +
      bl + '<g>' + trees + '</g>' + '<g class="vt-sel"></g>' + labels + here;
  }

  var view = {
    mount: function (container, api) {
      var town = Neo.data.town, buildings = Neo.data.buildings;
      var mw = town.mapSize.width, mh = town.mapSize.height;

      container.innerHTML = '<svg class="vt-svg" width="100%" height="100%" role="group" aria-label="ネオ電気街の地図（真上から）">' +
        '<g class="vt-world">' + buildStatic(town, buildings) + '<g class="vt-route" pointer-events="none"></g><g class="vt-pins"></g></g></svg>';
      var svg = container.firstChild;
      var world = svg.querySelector('.vt-world');
      var pinsLayer = svg.querySelector('.vt-pins');
      var selLayer = svg.querySelector('.vt-sel');
      var routeLayer = svg.querySelector('.vt-route');

      var pz = Neo.createPanZoom(container, svg, world, {
        w: mw, h: mh, store: Neo.mapState, key: 'cam', initial: { x: api.here.x, y: api.here.y }
      });

      // 点（ピン）の選択（ドラッグ直後のクリックは無視）
      function pick(el) { if (el && !pz.suppressed()) api.onSelectBuilding(el.getAttribute('data-pin')); }
      svg.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('[data-pin]') : null;
        if (el) pick(el);
      });
      svg.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        var el = e.target.closest ? e.target.closest('[data-pin]') : null;
        if (!el) return;
        e.preventDefault();
        pick(el);
      });

      this._api = {
        update: function (vs) {
          var byId = {};
          vs.buildings.forEach(function (b) { byId[b.id] = b; });
          var html = '', sel = '';
          // 選択中のピンを最後に描いて手前に出す
          var ordered = vs.pins.slice().sort(function (a, b) { return (a.selected ? 1 : 0) - (b.selected ? 1 : 0); });
          ordered.forEach(function (p) {
            var b = byId[p.building];
            if (!b) return;
            html += Neo.pinHtml({ id: b.id, name: b.name + '（お店' + p.count + '軒）', count: p.count, selected: p.selected, x: b.x, y: b.y });
          });
          // ルート表示中：線と番号つきの停留所（ふつうのピンは出さない。選択中の停留所を最後に描いて手前に出す）
          var rt = vs.route, rhtml = '';
          if (rt) {
            rhtml = Neo.routeLineHtml(rt.path.map(function (p) { return [p.x, p.y]; }));
            if (!rt.startAtHere && rt.stops[0]) rhtml += Neo.routeStartHtml(rt.stops[0].x, rt.stops[0].y);
            rt.stops.slice().sort(function (a, b) {
              return (a.building === rt.activeBuilding ? 1 : 0) - (b.building === rt.activeBuilding ? 1 : 0);
            }).forEach(function (st) {
              html += Neo.routeMarkerHtml({ id: st.building, name: st.name, numbers: st.numbers, x: st.x, y: st.y, active: st.building === rt.activeBuilding });
            });
          }
          routeLayer.innerHTML = rhtml;
          var sb = vs.selectedBuilding && byId[vs.selectedBuilding];
          if (sb) {
            sel = '<rect x="' + (sb.x - sb.w / 2 - 2) + '" y="' + (sb.y - sb.h / 2 - 2) + '" width="' + (sb.w + 4) + '" height="' + (sb.h + 4) +
              '" fill="none" stroke="var(--accent)" stroke-width="3"/>';
          }
          selLayer.innerHTML = sel;
          var focusId = document.activeElement && document.activeElement.getAttribute && pinsLayer.contains(document.activeElement)
            ? document.activeElement.getAttribute('data-pin') : null;
          pinsLayer.innerHTML = html;
          var els = pinsLayer.querySelectorAll('[data-ctr]');
          pz.refreshCtr();
          for (var i = 0; i < els.length; i++) {
            pz.ctr(els[i]);
            if (focusId && els[i].getAttribute('data-pin') === focusId) els[i].focus({ preventScroll: true });
          }
        },
        centerOn: function (x, y, instant, target) { pz.centerOn(x, y, instant, target); },
        zoomBy: function (factor) { pz.zoomBy(factor); },
        fitBounds: function (x0, y0, x1, y1) { pz.fitRect(x0, y0, x1, y1, api.freeArea ? api.freeArea() : null); },
        unmount: function () { pz.destroy(); container.innerHTML = ''; }
      };
    },
    update: function (vs) { if (this._api) this._api.update(vs); },
    centerOn: function (x, y, instant, target) { if (this._api) this._api.centerOn(x, y, instant, target); },
    zoomBy: function (factor) { if (this._api) this._api.zoomBy(factor); },
    fitBounds: function (x0, y0, x1, y1) { if (this._api) this._api.fitBounds(x0, y0, x1, y1); },
    unmount: function () { if (this._api) { this._api.unmount(); this._api = null; } }
  };

  Neo.mapViews.top = view;
})();
