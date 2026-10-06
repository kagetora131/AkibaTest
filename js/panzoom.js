/* panzoom.js — 地図ビュー共通の部品
   ・Neo.townLayout：街の「同じ屋根の並び」を固定シードで作る（真上・斜めで同じ街になる）
   ・Neo.pinHtml：しずく形のピン（画面上で一定の大きさ）
   ・Neo.createPanZoom：ドラッグ／ホイール／ピンチのパン・ズーム */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});

  // 乱数は固定シードのもののみ（毎回同じ街になる）
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Neo.mulberry32 = mulberry32;

  // 矩形 r が、帯（中心の x 範囲・y 範囲を m だけ広げたもの）に重なるか
  function hitBox(r, x0, y0, x1, y1, m) {
    return r.x < x1 + m && r.x + r.w > x0 - m && r.y < y1 + m && r.y + r.h > y0 - m;
  }

  // 矩形が、通り・高架線・駅・広場・川・ビル・現在地に重なるか
  function blocked(r, town, buildings) {
    var i, s, m;
    for (i = 0; i < town.streets.length; i++) {
      s = town.streets[i];
      m = s.width / 2 + (s.id === 'main' ? 7 : 4); // 中央通りは歩道ぶん広め。小路はほぼ接する
      if (s.x1 === s.x2) { if (r.x < s.x1 + m && r.x + r.w > s.x1 - m && r.y < s.y2 && r.y + r.h > s.y1) return true; }
      else if (r.y < s.y1 + m && r.y + r.h > s.y1 - m && r.x < s.x2 && r.x + r.w > s.x1) return true;
    }
    for (i = 0; i < town.rails.length; i++) {
      var rl = town.rails[i], hw = rl.width / 2;
      if (hitBox(r, Math.min(rl.x1, rl.x2) - hw, Math.min(rl.y1, rl.y2) - hw, Math.max(rl.x1, rl.x2) + hw, Math.max(rl.y1, rl.y2) + hw, 8)) return true;
    }
    var st = town.station;
    if (hitBox(r, st.x - st.w / 2, st.y - st.h / 2, st.x + st.w / 2, st.y + st.h / 2, 12)) return true;
    var pl = town.plaza;
    if (hitBox(r, pl.x - pl.w / 2, pl.y - pl.h / 2, pl.x + pl.w / 2, pl.y + pl.h / 2, 4)) return true;
    if (r.y + r.h > town.river.y1 - 4 && r.y < town.river.y2 + 4) return true;
    for (i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (hitBox(r, b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2, 6)) return true;
    }
    var h = town.here;
    var nx = Math.max(r.x, Math.min(h.x, r.x + r.w)), ny = Math.max(r.y, Math.min(h.y, r.y + r.h));
    return Math.hypot(h.x - nx, h.y - ny) < 30;
  }

  function f1(n) { return Math.round(n * 10) / 10; }

  var SIGNS = ['カード', 'ゲーム', 'PC', 'アニメ', '買取', 'メイド', '模型', '中古', '激安', 'フィギュア', 'ジャンク', '家電'];
  var SIGN_COLORS = ['#e03131', '#f59f00', '#1971c2', '#e64980', '#2f9e44', '#ffffff', '#ffd43b', '#7048e8'];

  // 屋根の並び（rects）と緑地（trees）。毎回まったく同じ結果になる
  // rects の各要素：x, y, w, h, n, det（屋根の小物）, floors（階数）, sign（看板の文字 or null）, signColor,
  //   screen（大型ビジョン）, avenue（中央通り沿いか）, face（いちばん近い通りの向き n/s/e/w）
  var layoutCache = null;
  Neo.townLayout = function (town, buildings) {
    if (layoutCache && layoutCache.town === town) return layoutCache.out;
    var rng = mulberry32(20261006);
    var mw = town.mapSize.width, mh = town.mapSize.height;
    var rects = [], trees = [], i, n = 0;
    var main = null;
    town.streets.forEach(function (s) { if (s.id === 'main') main = s; });
    var y = 2;
    while (y < mh) {
      var rowH = 14 + Math.floor(rng() * 27); // 奥行 14〜40
      var x = 2;
      while (x < mw) {
        var w = 12 + Math.floor(rng() * 19);  // 間口 12〜30
        var r = null;
        // 先に当たる物があれば、間口を細くして隙間に詰める（ペンシルビル）
        for (var ww = Math.min(w, mw - 2 - x); ww >= 12; ww -= 2) {
          var cand = { x: x, y: y, w: ww, h: Math.min(rowH, mh - 2 - y), n: n, det: [] };
          if (cand.h >= 12 && !blocked(cand, town, buildings)) { r = cand; break; }
        }
        if (r) {
          if (rng() < 0.3) {
            var k = 1 + Math.floor(rng() * 3);
            for (var q = 0; q < k; q++) {
              var sz = 3 + Math.floor(rng() * 3);
              if (r.w > sz + 6 && r.h > sz + 6) {
                r.det.push({ x: f1(r.x + 3 + rng() * (r.w - sz - 6)), y: f1(r.y + 3 + rng() * (r.h - sz - 6)), s: sz });
              }
            }
          }
          rects.push(r);
          n++;
          // 中央通り沿いはほぼ隙間なし（2）、ほかは 2〜4
          var nearAve = main && Math.abs(r.x + r.w / 2 - main.x1) - main.width / 2 <= 70;
          x += r.w + (nearAve ? 2 : 2 + Math.floor(rng() * 3));
        } else {
          x += 2;
        }
      }
      y += rowH + 2 + Math.floor(rng() * 3);
    }

    // 階数・看板・大型ビジョン・向き（すべて固定シード）
    var avenue = [];
    rects.forEach(function (r) {
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      r.avenue = !!main && Math.abs(cx - main.x1) - main.width / 2 <= 70;
      var inAlley = cx >= 138 && cx <= 274 && cy >= 392 && cy <= 683;
      r.floors = r.avenue ? 4 + Math.floor(rng() * 6) : inAlley ? 1 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 4);
      r.sign = rng() < (r.avenue ? 0.6 : 0.35) ? SIGNS[Math.floor(rng() * SIGNS.length)] : null;
      r.signColor = SIGN_COLORS[Math.floor(rng() * SIGN_COLORS.length)];
      r.screen = false;
      if (r.avenue && r.floors >= 7) avenue.push(r);
      var best = Infinity;
      town.streets.forEach(function (s) {
        var vert = s.x1 === s.x2, d = (vert ? Math.abs(cx - s.x1) : Math.abs(cy - s.y1)) - s.width / 2;
        if (d < best) { best = d; r.face = vert ? (s.x1 < cx ? 'w' : 'e') : (s.y1 < cy ? 'n' : 's'); }
      });
    });
    // 大型ビジョンは高い通り沿いビルから 8 棟（シード順に選ぶ）
    for (i = avenue.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = avenue[i]; avenue[i] = avenue[j]; avenue[j] = t;
    }
    avenue.slice(0, 8).forEach(function (r) { r.screen = true; });

    var want = 3 + Math.floor(rng() * 3), tries = 0;
    while (want > 0 && tries++ < 400) {
      var rad = 7 + Math.floor(rng() * 4);
      var tx = rad + rng() * (mw - 2 * rad), ty = rad + rng() * (mh - 2 * rad);
      var box = { x: tx - rad, y: ty - rad, w: rad * 2, h: rad * 2 };
      if (blocked(box, town, buildings)) continue;
      var hit = false;
      for (i = 0; i < rects.length; i++) {
        var p = rects[i];
        if (box.x < p.x + p.w + 2 && box.x + box.w > p.x - 2 && box.y < p.y + p.h + 2 && box.y + box.h > p.y - 2) { hit = true; break; }
      }
      if (hit) continue;
      trees.push({ x: tx, y: ty, r: rad, alt: want % 2 });
      want--;
    }
    // 駅前広場の木（広場の四隅。現在地とルートの通り道は空ける）
    var pl = town.plaza;
    [[-37, -37], [37, -37], [-37, 37], [37, 37]].forEach(function (o, q) {
      trees.push({ x: pl.x + o[0], y: pl.y + o[1], r: 7, alt: q % 2 });
    });
    var out = { rects: rects, trees: trees };
    layoutCache = { town: town, out: out };
    return out;
  };

  /* ---------- 看板（斜め・3Dで共通の決まり） ---------- */
  Neo.GENRE_HEX = {
    tcg: '#1098ad', maid_cafe: '#d6336c', plamo: '#2b8a3e', buyback: '#e67700', pc_parts: '#1971c2',
    cafe: '#8d6e63', retro_arcade: '#c92a2a', crane_arcade: '#f59f00', anime_goods: '#7048e8', quick_food: '#e8590c'
  };
  var GENRE_WORD = { tcg: 'カード', maid_cafe: 'メイド', plamo: '模型', buyback: '買取', pc_parts: 'PC', cafe: '喫茶', retro_arcade: 'ゲーム', crane_arcade: 'UFO', anime_goods: 'アニメ' };
  var FOOD_WORD = { donut: 'ドーナツ', burger: 'バーガー', soba: 'そば', gyudon: '牛めし' };

  // 看板の文字色：明るい地は濃い色、それ以外は白
  Neo.signInk = function (hex) {
    return hex === '#ffffff' || hex === '#ffd43b' || hex === '#f59f00' ? '#2a2622' : '#ffffff';
  };

  // 掲載中のお店（配列）の主なジャンルから、縦看板の {word, color}。お店が無ければ null
  Neo.buildingSign = function (shops) {
    if (!shops || !shops.length) return null;
    var count = {}, best = null, bn = 0;
    shops.forEach(function (s) { count[s.genre] = (count[s.genre] || 0) + 1; });
    shops.forEach(function (s) { if (count[s.genre] > bn) { bn = count[s.genre]; best = s; } });
    var word = best.genre === 'quick_food' ? FOOD_WORD[best.foodType] : GENRE_WORD[best.genre];
    return word ? { word: word, color: Neo.GENRE_HEX[best.genre] || '#e8732c' } : null;
  };

  // データのビルが通りに面している向き（n/s/e/w）
  Neo.streetFace = function (b, town) {
    var face = 'w';
    town.streets.forEach(function (s) {
      if (s.id !== b.street) return;
      face = s.x1 === s.x2 ? (s.x1 < b.x ? 'w' : 'e') : (s.y1 < b.y ? 'n' : 's');
    });
    return face;
  };

  // 縦看板の寸法：P=出っ張り（板の幅）, th=厚み, z0=下端の高さ, hb=板の高さ（建物の高さの約7割、最低2階ぶん）
  Neo.bladeSpec = function (floors, fh, avenue) {
    var H = floors * fh, z0 = floors >= 3 ? fh : H * 0.25;
    var hb = Math.min(Math.max(H * 0.7, 2 * fh), H - z0 + fh * 0.3);
    return { P: avenue ? 9 : 6, th: 1.6, z0: z0, hb: hb };
  };

  // しずく形のピン。x,y は置く位置（data-ctr で一定サイズに）、dy は画面上の微調整
  Neo.pinHtml = function (o) {
    var s = o.selected ? 1.25 : 1;
    return '<g class="vt-pin' + (o.selected ? ' is-selected' : '') + '" data-pin="' + Neo.esc(o.id) + '" data-ctr data-s="' + s +
      '" data-x="' + f1(o.x) + '" data-y="' + f1(o.y) + '" tabindex="0" role="button" aria-label="' + Neo.esc(o.name) + '">' +
      '<g transform="translate(0 ' + (o.dy || 0) + ')">' +
      '<rect class="pin-hit" x="-22" y="-44" width="44" height="44" fill="transparent"/>' +
      '<path d="M0 0 C-4 -10 -15 -18 -15 -27 A15 15 0 1 1 15 -27 C15 -18 4 -10 0 0Z" fill="' +
      (o.selected ? 'var(--accent-strong)' : 'var(--accent)') + '" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="0" cy="-27" r="9.5" fill="#fff"/>' +
      '<text x="0" y="-22.5" text-anchor="middle" font-size="13" font-weight="800" fill="#b34812">' + o.count + '</text></g></g>';
  };

  // ルートの停留所マーカー（番号つきの丸。複数番号なら横長に）。画面上で一定の大きさ
  // o = {id（ビルid）, name, numbers: [1,2], x, y, active}。ピンと同じ data-pin を持つので、選択・フォーカスの処理を共有できる
  Neo.routeMarkerHtml = function (o) {
    var label = o.numbers.join('・');
    var w = 34 + (label.length - 1) * 9, hw = w / 2;
    var ord = o.numbers.join('・') + '番目 ' + o.name;
    return '<g class="vt-pin rt-stop' + (o.active ? ' is-active' : '') + '" data-pin="' + Neo.esc(o.id) + '" data-ctr data-s="' + (o.active ? 1.2 : 1) +
      '" data-x="' + f1(o.x) + '" data-y="' + f1(o.y) + '" tabindex="0" role="button" aria-label="' + Neo.esc(ord) + '">' +
      '<rect class="pin-hit" x="' + -Math.max(22, hw + 3) + '" y="-22" width="' + Math.max(44, w + 6) + '" height="44" rx="22" fill="transparent"/>' +
      (o.active ? '<rect x="' + (-hw - 6) + '" y="-23" width="' + (w + 12) + '" height="46" rx="23" fill="#ffd43b"/>' : '') +
      '<rect x="' + (-hw - 3) + '" y="-20" width="' + (w + 6) + '" height="40" rx="20" fill="#fff"/>' +
      '<rect x="' + -hw + '" y="-17" width="' + w + '" height="34" rx="17" fill="var(--accent-strong)"/>' +
      '<text x="0" y="5.5" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" pointer-events="none">' + Neo.esc(label) + '</text></g>';
  };

  // ルートの線（白い縁取りの上に橙の線）。pts は [[x, y], …] の画面平面の点。太さは画面上で一定
  Neo.routeLineHtml = function (pts) {
    if (!pts || pts.length < 2) return '';
    var p = pts.map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join(' ');
    var common = ' points="' + p + '" fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
    return '<polyline' + common + ' stroke="#fff" stroke-width="8"/><polyline' + common + ' stroke="var(--accent-strong)" stroke-width="5"/>';
  };

  // 「スタート」の小さな札（最初の停留所の上）
  Neo.routeStartHtml = function (x, y) {
    return '<g data-ctr data-x="' + f1(x) + '" data-y="' + f1(y) + '"><text class="vt-label vt-small" y="-30" text-anchor="middle">スタート</text></g>';
  };

  /* ---------- パン・ズーム ----------
     container: 表示枠（大きさを測る）／ svg: ポインタを受ける要素／ world: 動かす <g>
     o = { w, h（中身の大きさ）, store, key（カメラの保存先）, initial: {x, y}, onApply() }
     [data-ctr] を持つ要素は、画面上で一定の大きさになるよう逆拡大する（data-x, data-y, data-s） */
  Neo.createPanZoom = function (container, svg, world, o) {
    var mw = o.w, mh = o.h;
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var W = 1, H = 1, k0 = 1, k = 1, tx = 0, ty = 0, anim = 0;
    var last = null, dragging = false, suppress = false, start = null, pointers = {}, lastDist = 0, lastMid = null;

    function measure() {
      W = container.clientWidth || 1; H = container.clientHeight || 1;
      k0 = Math.max(W / mw, H / mh);
    }
    function clampPos() {
      var vw = mw * k, vh = mh * k;
      tx = vw >= W ? Math.min(0, Math.max(W - vw, tx)) : (W - vw) / 2;
      ty = vh >= H ? Math.min(0, Math.max(H - vh, ty)) : (H - vh) / 2;
    }
    function ctr(el) {
      var s = parseFloat(el.getAttribute('data-s') || '1');
      el.setAttribute('transform', 'translate(' + el.getAttribute('data-x') + ' ' + el.getAttribute('data-y') + ') scale(' + Math.round(s / k * 1000) / 1000 + ')');
    }
    function refreshCtr() {
      var els = svg.querySelectorAll('[data-ctr]');
      for (var i = 0; i < els.length; i++) ctr(els[i]);
    }
    function apply() {
      k = Math.max(0.8 * k0, Math.min(4 * k0, k));
      clampPos();
      world.setAttribute('transform', 'translate(' + f1(tx) + ' ' + f1(ty) + ') scale(' + k + ')');
      refreshCtr();
      o.store[o.key] = { z: k / k0, cx: (W / 2 - tx) / k, cy: (H / 2 - ty) / k };
      if (o.onApply) o.onApply();
    }
    function setCam(z, cx, cy) { k = z * k0; tx = W / 2 - cx * k; ty = H / 2 - cy * k; apply(); }
    function zoomAt(factor, px, py) {
      var wx = (px - tx) / k, wy = (py - ty) / k;
      k = Math.max(0.8 * k0, Math.min(4 * k0, k * factor));
      tx = px - wx * k; ty = py - wy * k; apply();
    }

    measure();
    var cam = o.store[o.key];
    if (cam) setCam(cam.z, cam.cx, cam.cy); else setCam(1, o.initial.x, o.initial.y);

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () {
        var c = o.store[o.key] || { z: 1, cx: o.initial.x, cy: o.initial.y };
        measure(); setCam(c.z, c.cx, c.cy);
      });
      ro.observe(container);
    }

    function rel(e) { var r = container.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    svg.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = rel(e);
      var ids = Object.keys(pointers);
      if (ids.length === 1) { start = rel(e); last = start; dragging = false; }
      else if (ids.length === 2) {
        dragging = true;
        var a = pointers[ids[0]], b = pointers[ids[1]];
        lastDist = Math.hypot(a.x - b.x, a.y - b.y); lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    });
    svg.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = rel(e);
      var ids = Object.keys(pointers);
      if (ids.length >= 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (lastMid) { tx += mid.x - lastMid.x; ty += mid.y - lastMid.y; }
        if (lastDist > 0 && dist > 0) zoomAt(dist / lastDist, mid.x, mid.y); else apply();
        lastDist = dist; lastMid = mid;
        return;
      }
      var p = pointers[e.pointerId];
      if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) > 5) {
        dragging = true;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
        last = start;
      }
      if (dragging) { tx += p.x - last.x; ty += p.y - last.y; last = p; apply(); }
    });
    function endPointer(e) {
      delete pointers[e.pointerId];
      var ids = Object.keys(pointers);
      if (ids.length < 2) { lastDist = 0; lastMid = null; }
      if (ids.length === 0) {
        if (dragging) { suppress = true; setTimeout(function () { suppress = false; }, 60); }
        dragging = false;
      } else if (ids.length === 1) { last = pointers[ids[0]]; start = last; }
    }
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', endPointer);
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = rel(e);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });

    function animateTo(cx, cy) {
      cancelAnimationFrame(anim);
      var c = o.store[o.key], sx = c.cx, sy = c.cy, t0 = performance.now(), z = c.z;
      (function step(now) {
        var t = Math.min(1, (now - t0) / 300), e = 1 - Math.pow(1 - t, 3);
        setCam(z, sx + (cx - sx) * e, sy + (cy - sy) * e);
        if (t < 1) anim = requestAnimationFrame(step);
      })(t0);
    }

    return {
      apply: apply,
      ctr: ctr,
      refreshCtr: refreshCtr,
      scale: function () { return k; },
      suppressed: function () { return suppress; },
      // target があれば、その点が画面のその位置（枠内の px）に来るようにする
      centerOn: function (x, y, instant, target) {
        var cx = x, cy = y;
        if (target) { cx = x + (W / 2 - target.x) / k; cy = y + (H / 2 - target.y) / k; }
        if (reduce || instant) { cancelAnimationFrame(anim); setCam(o.store[o.key].z, cx, cy); }
        else animateTo(cx, cy);
      },
      // 長方形（中身の座標）が「空いている範囲」（area: {top, bottom} 枠内の px）にちょうど収まるようにする。動きはつけない
      fitRect: function (x0, y0, x1, y1, area) {
        var a = area || { top: 0, bottom: H };
        var availW = Math.max(60, W - 24), availH = Math.max(80, a.bottom - a.top - 24);
        var kk = Math.min(availW / Math.max(1, x1 - x0), availH / Math.max(1, y1 - y0));
        cancelAnimationFrame(anim);
        k = Math.max(0.8 * k0, Math.min(4 * k0, kk));
        tx = W / 2 - (x0 + x1) / 2 * k;
        ty = (a.top + a.bottom) / 2 - (y0 + y1) / 2 * k;
        apply();
      },
      toScreen: function (x, y) { return [x * k + tx, y * k + ty]; },
      size: function () { return { W: W, H: H }; },
      zoomBy: function (factor) { zoomAt(factor, W / 2, H / 2); },
      destroy: function () { cancelAnimationFrame(anim); if (ro) ro.disconnect(); }
    };
  };
})();
