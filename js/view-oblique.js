/* view-oblique.js — 「斜め」ビュー（斜め見下ろしの自作イラスト）。ビルは箱で、お店のある階が壁に見える */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.mapViews = Neo.mapViews || {};
  Neo.mapState = Neo.mapState || {};

  var FH = 14;             // 1階あたりの高さ
  var NEUTRAL = '#cfc6b6'; // 分類・検索に合わない階の色
  var ROOFS = ['#eceae5', '#e5e2dc', '#dedad2']; // まわりの建物は涼しい薄い色（データのビルを目立たせる）

  function f(n) { return Math.round(n * 10) / 10; }

  // 投影：世界の (x, y, z) → 画面の (sx, sy)。余白を足して左上を (0,0) 付近にそろえる
  function makeGeo(town, buildings) {
    var mw = town.mapSize.width, mh = town.mapSize.height;
    var tallest = 34 + 10;
    buildings.forEach(function (b) { tallest = Math.max(tallest, b.floors * FH); });
    Neo.townLayout(town, buildings).rects.forEach(function (r) { tallest = Math.max(tallest, r.floors * FH); }); // まわりのビルの最高階
    tallest = Math.max(tallest, 6 * FH);
    function raw(x, y, z) { return [x - 0.28 * y + 280, 0.62 * y - z]; }
    var xs = [raw(0, 0, 0)[0], raw(mw, 0, 0)[0], raw(0, mh, 0)[0], raw(mw, mh, 0)[0]];
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = -tallest, maxY = raw(0, mh, 0)[1];
    var ox = 40 - minX, oy = 40 - minY;
    return {
      W: maxX - minX + 80, H: maxY - minY + 80,
      P: function (x, y, z) { var p = raw(x, y, z || 0); return [p[0] + ox, p[1] + oy]; }
    };
  }

  function pts(arr) { return arr.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' '); }

  // 箱（南の面・東の面・屋根）
  function box(G, x, y, w, h, H, c) {
    var x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2, P = G.P;
    return '<polygon points="' + pts([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, H), P(x0, y1, H)]) + '" fill="' + c.south + '"/>' +
      '<polygon points="' + pts([P(x1, y1, 0), P(x1, y0, 0), P(x1, y0, H), P(x1, y1, H)]) + '" fill="' + c.east + '"/>' +
      '<polygon points="' + pts([P(x0, y0, H), P(x1, y0, H), P(x1, y1, H), P(x0, y1, H)]) + '" fill="' + c.roof + '"/>';
  }

  var SCREEN_COLORS = ['#2de2e6', '#ff4fae', '#ffd43b', '#7048e8'];
  var AWN = ['#e03131', '#f59f00', '#1971c2', '#e64980', '#2f9e44', '#7048e8', '#ffd43b'];

  // 縦看板（面から垂直に出る板）。斜めから見える面（南向きの広い面／東向きの広い面）と、手前の小口だけを描く
  // 通り側が北・西でも、見える側の隅（南端・東端）に寄せるので、板が見える。face: n/s/e/w（通り側）
  function bladeSvg(G, face, x0, y0, x1, y1, spec, word, color) {
    var P = G.P, S = spec.P, th = spec.th, za = spec.z0, zb = spec.z0 + spec.hb;
    var chars = Array.from(word), cell = spec.hb / chars.length, sz = Math.min(S * 0.78, cell * 0.8), ink = Neo.signInk(color);
    var ew = face === 'e' || face === 'w', bx, by, out, i, e;
    var fs = ' font-size="' + f(sz) + '" font-weight="800" text-anchor="middle" fill="' + ink + '"';
    if (ew) {
      bx = face === 'e' ? x1 : x0 - S; by = y1 - th - 1;
      out = '<polygon points="' + pts([P(bx + S, by + th, za), P(bx + S, by, za), P(bx + S, by, zb), P(bx + S, by + th, zb)]) + '" fill="#2a2622"/>' +
        '<polygon points="' + pts([P(bx, by + th, za), P(bx + S, by + th, za), P(bx + S, by + th, zb), P(bx, by + th, zb)]) + '" fill="' + color + '" stroke="#2a2622" stroke-width="1"/>';
      for (i = 0; i < chars.length; i++) {
        e = P(bx + S / 2, by + th, zb - cell * (i + 0.5));
        out += '<text x="' + f(e[0]) + '" y="' + f(e[1] + sz * 0.36) + '"' + fs + '>' + Neo.esc(chars[i]) + '</text>';
      }
    } else {
      bx = x1 - th - 1.5; by = face === 's' ? y1 : y0 - S;
      out = '<polygon points="' + pts([P(bx, by + S, za), P(bx + th, by + S, za), P(bx + th, by + S, zb), P(bx, by + S, zb)]) + '" fill="#2a2622"/>' +
        '<polygon points="' + pts([P(bx + th, by, za), P(bx + th, by + S, za), P(bx + th, by + S, zb), P(bx + th, by, zb)]) + '" fill="' + color + '" stroke="#2a2622" stroke-width="1"/>';
      e = P(bx + th, by, 0);
      out += '<g transform="matrix(-0.28 0.62 0 1 ' + f(e[0]) + ' ' + f(e[1]) + ')">'; // 面の座標（横=奥行き, 縦=高さ）を斜めの画面に写す
      for (i = 0; i < chars.length; i++) out += '<text x="' + f(S / 2) + '" y="' + f(-(zb - cell * (i + 0.5)) + sz * 0.36) + '"' + fs + '>' + Neo.esc(chars[i]) + '</text>';
      out += '</g>';
    }
    return out;
  }

  // 斜めから見える面（南 or 東）の上の点：u は面に沿った座標（南面ならx、東面ならy）, z は高さ, o は面から外への距離
  function facadePt(G, vis, fixed, u, z, o) { return vis === 's' ? G.P(u, fixed + o, z) : G.P(fixed + o, u, z); }

  // 大型ビジョン：暗い枠と、色ブロックの抽象的な絵。vis は 's'|'e'、fixed は面の位置（y1 or x1）、u0〜u1 は面に沿った範囲
  function screenSvg(G, vis, fixed, u0, u1, z0, z1, seed) {
    var rng = Neo.mulberry32(seed), out = '', c, r, cols = 3, rows = 4;
    function quad(a0, a1, b0, b1, fill, o) {
      return '<polygon points="' + pts([facadePt(G, vis, fixed, a0, b0, o), facadePt(G, vis, fixed, a1, b0, o), facadePt(G, vis, fixed, a1, b1, o), facadePt(G, vis, fixed, a0, b1, o)]) + '" fill="' + fill + '"/>';
    }
    out += quad(u0 - 0.8, u1 + 0.8, z0 - 0.8, z1 + 0.8, '#1c1b22', 0.2);
    for (c = 0; c < cols; c++) {
      for (r = 0; r < rows; r++) {
        var a = u0 + (u1 - u0) * c / cols, b = u0 + (u1 - u0) * (c + 1) / cols, za = z0 + (z1 - z0) * r / rows, zb = z0 + (z1 - z0) * (r + 1) / rows;
        if (rng() < 0.25) continue; // 暗いまま残す
        out += quad(a + 0.4, b - 0.4, za + 0.4, zb - 0.4, SCREEN_COLORS[Math.floor(rng() * 4)], 0.3);
      }
    }
    return out;
  }

  // 日よけ（1階の上の布）：面に貼りつく帯と、外へ少し張り出した庇
  function awningSvg(G, vis, fixed, u0, u1, color) {
    function quad(a, b, za, zb, oa, ob, fill) {
      return '<polygon points="' + pts([facadePt(G, vis, fixed, a, za, oa), facadePt(G, vis, fixed, b, za, oa), facadePt(G, vis, fixed, b, zb, ob), facadePt(G, vis, fixed, a, zb, ob)]) + '" fill="' + fill + '"/>';
    }
    return quad(u0, u1, 6.5, 10, 3.2, 0, color) +quad(u0, u1, 6.2, 6.5, 3.2, 3.2, 'rgba(0,0,0,.3)');
  }

  // 動かない部分（地面・川・通り・広場・線路・駅・屋根の箱）を作る。データのビルは中身が空の <g> にしておく
  function buildStatic(G, town, buildings) {
    var P = G.P, mw = town.mapSize.width, mh = town.mapSize.height, i;
    var out = '<rect x="0" y="0" width="' + f(G.W) + '" height="' + f(G.H) + '" fill="#efe9df"/>';
    out += '<polygon points="' + pts([P(0, 0), P(mw, 0), P(mw, mh), P(0, mh)]) + '" fill="#dcd6ca"/>';

    // 川（電気川）：水面・さざ波・護岸の線。通りと線路はこの上に重なる（橋）
    var rv = town.river, rr = Neo.mulberry32(4242), rip = '', ri;
    out += '<polygon points="' + pts([P(0, rv.y1), P(mw, rv.y1), P(mw, rv.y2), P(0, rv.y2)]) + '" fill="#6f9fb8"/>';
    for (ri = 0; ri < 40; ri++) {
      var rx = rr() * (mw - 40), ry = rv.y1 + 6 + rr() * (rv.y2 - rv.y1 - 10), rl2 = 10 + rr() * 22;
      rip += 'M' + pts([P(rx, ry)]) + ' L' + pts([P(rx + rl2, ry)]);
    }
    out += '<path d="' + rip + '" stroke="#8fb7cc" stroke-width="1.3" stroke-linecap="round" fill="none"/>' +
      '<path d="M' + pts([P(0, rv.y1)]) + ' L' + pts([P(mw, rv.y1)]) + ' M' + pts([P(0, rv.y2)]) + ' L' + pts([P(mw, rv.y2)]) + '" stroke="#8a857c" stroke-width="4" fill="none"/>';

    // データのビルのやわらかい影（北西側）
    buildings.forEach(function (b) {
      var x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.h / 2, y1 = b.y + b.h / 2;
      out += '<polygon points="' + pts([P(x0 - 16, y0 - 20), P(x1 - 16, y0 - 20), P(x1, y1), P(x0, y1)]) + '" fill="rgba(0,0,0,.12)"/>';
    });

    // 通り
    town.streets.forEach(function (s) {
      var q = s.x1 === s.x2
        ? [P(s.x1 - s.width / 2, s.y1), P(s.x1 + s.width / 2, s.y1), P(s.x1 + s.width / 2, s.y2), P(s.x1 - s.width / 2, s.y2)]
        : [P(s.x1, s.y1 - s.width / 2), P(s.x2, s.y1 - s.width / 2), P(s.x2, s.y1 + s.width / 2), P(s.x1, s.y1 + s.width / 2)];
      out += '<polygon points="' + pts(q) + '" fill="#8c877e"/>';
    });
    town.streets.forEach(function (s) {
      if (s.width >= 24) {
        var a = P(s.x1, s.y1), b = P(s.x2, s.y2);
        out += '<line x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '" stroke="#f3efe7" stroke-width="2" stroke-dasharray="10 10"/>';
      }
    });
    // 横断歩道（縞）
    var d = '';
    function stripe(x, y, w, h) {
      d += 'M' + pts([P(x, y)]) + ' L' + pts([P(x + w, y)]) + ' L' + pts([P(x + w, y + h)]) + ' L' + pts([P(x, y + h)]) + 'Z';
    }
    var horiz = town.streets.filter(function (t) { return t.y1 === t.y2; });
    var vert = town.streets.filter(function (t) { return t.x1 === t.x2; });
    horiz.forEach(function (hs) {
      vert.forEach(function (vs) {
        var cx = vs.x1, cy = hs.y1, o;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var by = cy + sgn * (hs.width / 2 + 9);
          for (o = -vs.width / 2 + 3; o < vs.width / 2 - 2; o += 6) stripe(cx + o, by - 5, 3, 10);
          var bx = cx + sgn * (vs.width / 2 + 9);
          for (o = -hs.width / 2 + 3; o < hs.width / 2 - 2; o += 6) stripe(bx - 5, cy + o, 10, 3);
        }
      });
    });
    out += '<path d="' + d + '" fill="#f5f1e8"/>';

    var main = town.streets.filter(function (t) { return t.id === 'main'; })[0];
    // 橋の欄干（川の上の中央通り）
    if (main) {
      [-1, 1].forEach(function (sg) {
        var bx0 = main.x1 + sg * (main.width / 2 + 3), a0 = P(bx0, rv.y1, 3), a1 = P(bx0, rv.y2, 3), g0 = P(bx0, rv.y1, 0), g1 = P(bx0, rv.y2, 0);
        out += '<line x1="' + f(g0[0]) + '" y1="' + f(g0[1]) + '" x2="' + f(g1[0]) + '" y2="' + f(g1[1]) + '" stroke="rgba(0,0,0,.25)" stroke-width="2"/>' +
          '<line x1="' + f(a0[0]) + '" y1="' + f(a0[1]) + '" x2="' + f(a1[0]) + '" y2="' + f(a1[1]) + '" stroke="#fff" stroke-width="1.4"/>';
      });
    }
    // 駅前広場：舗装とタイルの目地
    var pl = town.plaza, tile = '', tk;
    out += '<polygon points="' + pts([P(pl.x - pl.w / 2, pl.y - pl.h / 2), P(pl.x + pl.w / 2, pl.y - pl.h / 2), P(pl.x + pl.w / 2, pl.y + pl.h / 2), P(pl.x - pl.w / 2, pl.y + pl.h / 2)]) + '" fill="#cfc8bb"/>';
    for (tk = 10; tk < pl.w; tk += 10) tile += 'M' + pts([P(pl.x - pl.w / 2 + tk, pl.y - pl.h / 2)]) + ' L' + pts([P(pl.x - pl.w / 2 + tk, pl.y + pl.h / 2)]);
    for (tk = 10; tk < pl.h; tk += 10) tile += 'M' + pts([P(pl.x - pl.w / 2, pl.y - pl.h / 2 + tk)]) + ' L' + pts([P(pl.x + pl.w / 2, pl.y - pl.h / 2 + tk)]);
    out += '<path d="' + tile + '" stroke="#bdb6a9" stroke-width=".8" fill="none"/>';
    // 歩行者天国：路面に白い文字（地面の斜め投影の行列で寝かせる）
    if (main && town.pedestrianMall) {
      var o0 = P(0, 0, 0);
      [240, 800].forEach(function (yy) {
        out += '<text transform="matrix(1 0 -0.28 0.62 ' + f(o0[0]) + ' ' + f(o0[1]) + ') translate(' + (main.x1 + 5) + ' ' + yy + ') rotate(90)" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" fill-opacity=".5">' +
          Neo.esc(town.pedestrianMall.label) + '</text>';
      });
    }

    // 箱のリスト（奥＝北から手前＝南へ並べて描く）
    var items = [];
    var lay = Neo.townLayout(town, buildings);
    lay.rects.forEach(function (r, idx) {
      var floors = r.floors; // 階数は townLayout で決める（斜め・3Dで共通）
      var H = floors * FH, html = box(G, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, H,
        { roof: ROOFS[idx % ROOFS.length], south: '#d2cec6', east: '#c0bbb2' });
      var wl = '';
      for (var k = 1; k < floors; k++) wl += 'M' + pts([P(r.x, r.y + r.h, k * FH)]) + ' L' + pts([P(r.x + r.w, r.y + r.h, k * FH)]);
      html += '<path d="' + wl + '" stroke="#c9c4bb" stroke-width="1" fill="none"/>';
      // 見える面（南・東）のビジョンと日よけ。通り側が北・西のときは見える側の面に置く
      var vis = r.face === 'n' || r.face === 's' ? 's' : 'e', fx = vis === 's' ? r.y + r.h : r.x + r.w;
      var u0 = vis === 's' ? r.x : r.y, u1 = vis === 's' ? r.x + r.w : r.y + r.h, um = (u0 + u1) / 2, uw = (u1 - u0) * 0.3;
      if (r.screen) {
        var sh2 = (2 + (r.n % 2)) * FH;
        html += screenSvg(G, vis, fx, um - uw, um + uw, H - FH * 0.5 - sh2, H - FH * 0.5, 100 + r.n);
      }
      if (r.avenue && (r.face === 's' || r.face === 'e')) html += awningSvg(G, vis, fx, u0 + (u1 - u0) * 0.05, u1 - (u1 - u0) * 0.05, AWN[r.n % AWN.length]);
      var blade = r.sign ? bladeSvg(G, r.face, r.x, r.y, r.x + r.w, r.y + r.h, Neo.bladeSpec(floors, FH, r.avenue), r.sign, r.signColor) : '';
      // 北向きの板は建物の奥へ出るので、先に描いて建物に隠す
      items.push({ key: r.y + r.h, html: (r.face === 'n' ? blade : '') + '<g stroke="rgba(60,50,40,.25)" stroke-width="1">' + html + '</g>' + (r.face === 'n' ? '' : blade) });
    });
    lay.trees.forEach(function (t) {
      var a = P(t.x, t.y, 0), c = P(t.x, t.y, 12);
      items.push({ key: t.y + t.r, html: '<ellipse cx="' + f(a[0]) + '" cy="' + f(a[1]) + '" rx="' + t.r + '" ry="' + f(t.r * 0.6) + '" fill="rgba(0,0,0,.18)"/>' +
        '<circle cx="' + f(c[0]) + '" cy="' + f(c[1]) + '" r="' + t.r + '" fill="' + (t.alt ? '#6f8f5a' : '#7fa06a') + '"/>' });
    });

    // 高架の線路（2本）：縦(ns)は高さ22、横(ew)は30。柱は駅の中に立てず、床は駅の出入口で区切る
    var RL = { ns: 22, ew: 30 }, stn = town.station;
    town.rails.forEach(function (rl) {
      var lvl = RL[rl.id] || 22, dx = rl.x2 - rl.x1, dy = rl.y2 - rl.y1, len = Math.hypot(dx, dy);
      var ux = dx / len, uy = dy / len, nx = -uy, ny = ux, hw = rl.width / 2, vsg = ux ? 1 : -1; // vsg：南（ew）／東（ns）が見える側
      var cuts = [], c0;
      for (c0 = 0; c0 < len; c0 += 60) cuts.push(c0);
      [ux ? stn.x - stn.w / 2 - rl.x1 : stn.y - stn.h / 2 - rl.y1, ux ? stn.x + stn.w / 2 - rl.x1 : stn.y + stn.h / 2 - rl.y1].forEach(function (c) { if (c > 0 && c < len) cuts.push(c); });
      cuts.push(len);
      cuts.sort(function (p1, p2) { return p1 - p2; });
      for (var ci = 0; ci + 1 < cuts.length; ci++) {
        var t0 = cuts[ci], t1 = cuts[ci + 1];
        if (t1 - t0 < 0.5) continue;
        var ax = rl.x1 + ux * t0, ay = rl.y1 + uy * t0, bx2 = rl.x1 + ux * t1, by2 = rl.y1 + uy * t1;
        var html2 = '', inStn = Math.abs(ax - stn.x) < stn.w / 2 + 1 && Math.abs(ay - stn.y) < stn.h / 2 + 1;
        if (!inStn) {
          [-9, 9].forEach(function (o) {
            var g0 = P(ax + nx * o, ay + ny * o, 0), g1 = P(ax + nx * o, ay + ny * o, lvl - 6);
            html2 += '<line x1="' + f(g0[0]) + '" y1="' + f(g0[1]) + '" x2="' + f(g1[0]) + '" y2="' + f(g1[1]) + '" stroke="#57534e" stroke-width="3"/>';
          });
        }
        var sx2 = vsg * hw;
        html2 += '<polygon points="' + pts([P(ax + nx * sx2, ay + ny * sx2, lvl), P(bx2 + nx * sx2, by2 + ny * sx2, lvl), P(bx2 + nx * sx2, by2 + ny * sx2, lvl - 6), P(ax + nx * sx2, ay + ny * sx2, lvl - 6)]) + '" fill="#5a5650"/>';
        html2 += '<polygon points="' + pts([P(ax + nx * hw, ay + ny * hw, lvl), P(bx2 + nx * hw, by2 + ny * hw, lvl), P(bx2 - nx * hw, by2 - ny * hw, lvl), P(ax - nx * hw, ay - ny * hw, lvl)]) + '" fill="#6d6964"/>';
        [-7, -5, 5, 7].forEach(function (o) { // 複線
          var p0 = P(ax + nx * o, ay + ny * o, lvl), p1 = P(bx2 + nx * o, by2 + ny * o, lvl);
          html2 += '<line x1="' + f(p0[0]) + '" y1="' + f(p0[1]) + '" x2="' + f(p1[0]) + '" y2="' + f(p1[1]) + '" stroke="#b9b3a8" stroke-width="1.1"/>';
        });
        items.push({ key: (ay + by2) / 2, html: '<g>' + html2 + '</g>' });
      }
    });

    // 駅：交差部を包む建物（ガラスの帯つき）
    var st = town.station, sx0 = st.x - st.w / 2, sx1 = st.x + st.w / 2, sy0 = st.y - st.h / 2, sy1 = st.y + st.h / 2;
    var sh = box(G, st.x, st.y, st.w, st.h, 36, { roof: '#ece6da', south: '#cfc8b8', east: '#b8af9d' });
    sh += '<polygon points="' + pts([P(sx0, sy1, 20), P(sx1, sy1, 20), P(sx1, sy1, 30), P(sx0, sy1, 30)]) + '" fill="#8fb3c7"/>' +
      '<polygon points="' + pts([P(sx1, sy1, 20), P(sx1, sy0, 20), P(sx1, sy0, 30), P(sx1, sy1, 30)]) + '" fill="#7a9fb3"/>';
    [-24, -12, 12, 24].forEach(function (o) {
      var a = P(st.x + o, sy0 + 8, 36), b = P(st.x + o, sy1 - 8, 36);
      sh += '<line x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '" stroke="#b0aa9f" stroke-width="2"/>';
    });
    items.push({ key: st.y + st.h / 2 + 0.5, html: '<g stroke="rgba(60,50,40,.25)" stroke-width="1">' + sh + '</g>' });

    // データのビル（中身は update で描く）
    buildings.forEach(function (b) {
      items.push({ key: b.y + b.h / 2, html: '<g class="ob-b" data-bid="' + Neo.esc(b.id) + '"></g>' });
    });

    items.sort(function (a, b) { return a.key - b.key; });
    items.forEach(function (it) { out += it.html; });
    return out;
  }

  // データのビル1棟：壁・階ごとの帯・屋根・選択の枠
  function buildingHtml(G, town, b, shops, selected) {
    var P = G.P, x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.h / 2, y1 = b.y + b.h / 2, H = b.floors * FH, i, fl;
    var s = '<polygon points="' + pts([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, H), P(x0, y1, H)]) + '" fill="#ead9bb"/>' +
      '<polygon points="' + pts([P(x1, y1, 0), P(x1, y0, 0), P(x1, y0, H), P(x1, y1, H)]) + '" fill="#d4bf9a"/>';
    var lines = '';
    for (fl = 1; fl < b.floors; fl++) {
      lines += 'M' + pts([P(x0, y1, fl * FH)]) + ' L' + pts([P(x1, y1, fl * FH)]) +
        ' M' + pts([P(x1, y1, fl * FH)]) + ' L' + pts([P(x1, y0, fl * FH)]);
    }
    s += '<path d="' + lines + '" stroke="#c9b89a" stroke-width="1" fill="none"/>';
    // お店のある階だけ、ジャンルの色の帯（同じ階に複数なら横に等分）
    for (fl = 1; fl <= b.floors; fl++) {
      var here = shops.filter(function (sh) { return sh.floor === fl; });
      var n = here.length;
      for (i = 0; i < n; i++) {
        var t0 = i / n, t1 = (i + 1) / n, z0 = (fl - 1) * FH, z1 = fl * FH;
        var fillStyle = here[i].match ? 'fill:' + Neo.genreColorVar(here[i].genre) + ';fill-opacity:.85' : 'fill:' + NEUTRAL;
        s += '<polygon points="' + pts([P(x0 + b.w * t0, y1, z0), P(x0 + b.w * t1, y1, z0), P(x0 + b.w * t1, y1, z1), P(x0 + b.w * t0, y1, z1)]) +
          '" style="' + fillStyle + '" stroke="#c9b89a" stroke-width="1"/>';
      }
    }
    s += '<polygon points="' + pts([P(x0, y0, H), P(x1, y0, H), P(x1, y1, H), P(x0, y1, H)]) + '" fill="#f6eedf" stroke="#d9c9ad" stroke-width="2"/>';
    if (selected) {
      s += '<g fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round">' +
        '<polygon points="' + pts([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, H), P(x0, y1, H)]) + '"/>' +
        '<polygon points="' + pts([P(x1, y1, 0), P(x1, y0, 0), P(x1, y0, H), P(x1, y1, H)]) + '"/>' +
        '<polygon points="' + pts([P(x0, y0, H), P(x1, y0, H), P(x1, y1, H), P(x0, y1, H)]) + '"/></g>';
    }
    // 縦看板：見えているお店の主なジャンルから。隅に寄せるので階の帯は隠れない
    var sg = Neo.buildingSign(shops);
    if (sg) {
      var face = Neo.streetFace(b, town), blade = bladeSvg(G, face, x0, y0, x1, y1, Neo.bladeSpec(b.floors, FH, b.street === 'main'), sg.word, sg.color);
      s = face === 'n' ? blade + s : s + blade;
    }
    return s;
  }

  function label(text, x, y, dy) {
    return '<g data-ctr data-x="' + f(x) + '" data-y="' + f(y) + '"><text class="vt-label" y="' + (dy || 0) + '" text-anchor="middle">' + Neo.esc(text) + '</text></g>';
  }

  var view = {
    mount: function (container, api) {
      var town = Neo.data.town, buildings = Neo.data.buildings;
      var G = makeGeo(town, buildings), P = G.P;
      var bById = {};
      buildings.forEach(function (b) { bById[b.id] = b; });

      // 通り名・駅名・現在地
      var labels = '';
      town.streets.forEach(function (t) {
        if (t.id === 'roji2' || t.id === 'rojiv') return; // ジャンク小路の札は1枚だけ
        var p = t.x1 === t.x2 ? P(t.x1, 150, 0) : P(235, t.y1, 0);
        labels += label(t.name, p[0], p[1] + 4);
      });
      var sp = P(town.station.x, town.station.y, 38);
      labels += label(town.station.name, sp[0], sp[1], -8);
      var rp = P(150, (town.river.y1 + town.river.y2) / 2, 0);
      labels += label(town.river.name, rp[0], rp[1] + 4);
      var pp0 = P(town.plaza.x, town.plaza.y - town.plaza.h / 2 + 8, 0);
      labels += label(town.plaza.name, pp0[0], pp0[1]);
      var hp = P(town.here.x, town.here.y, 0);
      var here = '<g data-ctr data-x="' + f(hp[0]) + '" data-y="' + f(hp[1]) + '">' +
        '<circle class="vt-halo" r="16" fill="rgba(25,113,194,.28)"/>' +
        '<circle r="9" fill="#1971c2" stroke="#fff" stroke-width="3"/>' +
        '<text class="vt-label vt-small" y="26" text-anchor="middle">現在地</text></g>';

      container.innerHTML = '<svg class="vt-svg" width="100%" height="100%" role="group" aria-label="ネオ電気街の地図（斜めから）">' +
        '<g class="vt-world">' + buildStatic(G, town, buildings) +
        '<g class="ob-callouts"></g>' + labels + here + '<g class="ob-route" pointer-events="none" opacity=".9"></g><g class="vt-pins"></g></g></svg>';
      var svg = container.firstChild;
      var world = svg.querySelector('.vt-world');
      var pinsLayer = svg.querySelector('.vt-pins');
      var callLayer = svg.querySelector('.ob-callouts');
      var routeLayer = svg.querySelector('.ob-route');
      var groups = {};
      var gs = svg.querySelectorAll('.ob-b');
      for (var gi = 0; gi < gs.length; gi++) groups[gs[gi].getAttribute('data-bid')] = gs[gi];

      var co = []; // 階ごとの吹き出し {el, card, line, ay}

      // 吹き出しが縦に重ならないよう、画面上の高さで押し下げる
      // 右にはみ出すなら、ビルの左（西）側へ出す（全部まとめて向きをそろえる）
      function layoutCallouts() {
        if (!co.length || !pz) return;
        var k = pz.scale(), size = pz.size(), left = false, i;
        for (i = 0; i < co.length; i++) {
          var sx = pz.toScreen(co[i].r.x, co[i].r.y)[0];
          if (sx + 34 + co[i].w > size.W - 8) { left = true; break; }
        }
        var side = left ? 'l' : 'r';
        for (i = 0; i < co.length; i++) {
          var c = co[i], a = left ? c.l : c.r;
          c.ay = a.y;
          if (c.side !== side) {
            c.side = side;
            c.el.setAttribute('data-x', f(a.x)); c.el.setAttribute('data-y', f(a.y));
            pz.ctr(c.el);
          }
        }
        var prevBottom = -1e9;
        co.slice().sort(function (p, q) { return p.ay - q.ay; }).forEach(function (c) {
          var sy = c.ay * k, top = Math.max(sy - 10, prevBottom + 4), dyc = top + 10 - sy;
          c.line.setAttribute('x2', left ? -34 : 34);
          c.line.setAttribute('y2', f(dyc));
          c.card.setAttribute('transform', 'translate(' + (left ? -34 - c.w : 34) + ' ' + f(dyc) + ')');
          prevBottom = top + 20;
        });
      }

      var pz = null;
      pz = Neo.createPanZoom(container, svg, world, {
        w: G.W, h: G.H, store: Neo.mapState, key: 'camOblique', initial: { x: hp[0], y: hp[1] }, onApply: layoutCallouts
      });

      function pick(el, attr) { if (el && !pz.suppressed()) api.onSelectBuilding(el.getAttribute(attr)); }
      svg.addEventListener('click', function (e) {
        if (!e.target.closest) return;
        var el = e.target.closest('[data-pin]');
        if (el) { pick(el, 'data-pin'); return; }
        el = e.target.closest('[data-b]');
        if (el) pick(el, 'data-b');
      });
      svg.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        var el = e.target.closest ? e.target.closest('[data-pin]') : null;
        if (!el) return;
        e.preventDefault();
        pick(el, 'data-pin');
      });

      this._api = {
        update: function (vs) {
          var byB = {};
          (vs.shops || []).forEach(function (s) { (byB[s.building] = byB[s.building] || []).push(s); });

          // ビル（お店のあるビルだけ押せる）
          buildings.forEach(function (b) {
            var g = groups[b.id], list = byB[b.id] || [];
            g.innerHTML = buildingHtml(G, town, b, list, b.id === vs.selectedBuilding);
            if (list.length) g.setAttribute('data-b', b.id); else g.removeAttribute('data-b');
          });

          // ピン（屋根の中心に立てる）
          var ordered = vs.pins.slice().sort(function (a, b) { return (a.selected ? 1 : 0) - (b.selected ? 1 : 0); });
          var html = '';
          ordered.forEach(function (p) {
            var b = bById[p.building];
            if (!b) return;
            var pp = P(b.x, b.y, b.floors * FH);
            html += Neo.pinHtml({ id: b.id, name: b.name + '（お店' + p.count + '軒）', count: p.count, selected: p.selected, x: pp[0], y: pp[1], dy: -6 });
          });
          // ルート表示中：線は地面（z=0）、停留所は屋根の高さに置く
          var rt = vs.route, rhtml = '';
          if (rt) {
            rhtml = Neo.routeLineHtml(rt.path.map(function (p) { return P(p.x, p.y, 0); }));
            var firstB = rt.stops[0] && bById[rt.stops[0].building];
            if (!rt.startAtHere && firstB) { var sp0 = P(firstB.x, firstB.y, firstB.floors * FH); rhtml += Neo.routeStartHtml(sp0[0], sp0[1]); }
            rt.stops.slice().sort(function (a, b) {
              return (a.building === rt.activeBuilding ? 1 : 0) - (b.building === rt.activeBuilding ? 1 : 0);
            }).forEach(function (st) {
              var b = bById[st.building];
              if (!b) return;
              var pp = P(b.x, b.y, b.floors * FH);
              html += Neo.routeMarkerHtml({ id: b.id, name: st.name, numbers: st.numbers, x: pp[0], y: pp[1], active: b.id === rt.activeBuilding });
            });
          }
          routeLayer.innerHTML = rhtml;
          var focusId = document.activeElement && document.activeElement.getAttribute && pinsLayer.contains(document.activeElement)
            ? document.activeElement.getAttribute('data-pin') : null;
          pinsLayer.innerHTML = html;
          var els = pinsLayer.querySelectorAll('[data-ctr]');
          pz.refreshCtr();
          for (var i = 0; i < els.length; i++) {
            pz.ctr(els[i]);
            if (focusId && els[i].getAttribute('data-pin') === focusId) els[i].focus({ preventScroll: true });
          }

          // 選択中のビルの階ごとの吹き出し
          var sb = vs.selectedBuilding && bById[vs.selectedBuilding];
          var ch = '';
          co = [];
          if (sb) {
            var floors = {};
            (byB[sb.id] || []).forEach(function (s) { (floors[s.floor] = floors[s.floor] || []).push(s); });
            Object.keys(floors).map(Number).filter(function (n) { return n >= 1; }).sort(function (a, b) { return b - a; }).forEach(function (fl) {
              var list = floors[fl];
              var text = Neo.floorLabel(fl) + ' ' + list[0].name + (list.length > 1 ? ' ほか' + (list.length - 1) + '軒' : '');
              var w = text.length * 12 + 18;
              var a = P(sb.x + sb.w / 2, sb.y - sb.h / 2, (fl - 0.5) * FH);
              var al = P(sb.x - sb.w / 2, sb.y + sb.h / 2, (fl - 0.5) * FH);
              ch += '<g class="co" data-ctr data-x="' + f(a[0]) + '" data-y="' + f(a[1]) + '" data-w="' + w + '" data-lx="' + f(al[0]) + '" data-ly="' + f(al[1]) + '">' +
                '<line class="co-line" x1="0" y1="0" x2="34" y2="0"/>' +
                '<g class="co-card" transform="translate(34 0)"><rect x="0" y="-10" width="' + w + '" height="20" rx="6" fill="#fff" stroke="var(--border)"/>' +
                '<text class="co-text" x="8" y="4">' + Neo.esc(text) + '</text></g></g>';
            });
          }
          callLayer.innerHTML = ch;
          var cEls = callLayer.querySelectorAll('.co');
          for (var j = 0; j < cEls.length; j++) {
            pz.ctr(cEls[j]);
            var el = cEls[j];
            co.push({
              el: el, card: el.querySelector('.co-card'), line: el.querySelector('.co-line'), side: 'r',
              w: parseFloat(el.getAttribute('data-w')),
              r: { x: parseFloat(el.getAttribute('data-x')), y: parseFloat(el.getAttribute('data-y')) },
              l: { x: parseFloat(el.getAttribute('data-lx')), y: parseFloat(el.getAttribute('data-ly')) },
              ay: parseFloat(el.getAttribute('data-y'))
            });
          }
          layoutCallouts();
        },
        // 選択中のビルは壁の真ん中（高さの半分）を中心にする
        centerOn: function (x, y, instant, target) {
          var z = 0;
          buildings.forEach(function (b) { if (Math.abs(b.x - x) < 0.5 && Math.abs(b.y - y) < 0.5) z = b.floors * FH / 2; });
          var p = P(x, y, z);
          pz.centerOn(p[0], p[1], instant, target);
        },
        zoomBy: function (factor) { pz.zoomBy(factor); },
        // 範囲（地図の座標）を斜めの画面に写し、地面と一番高い屋根の両方が入るようにする
        fitBounds: function (x0, y0, x1, y1) {
          var zTop = 0, sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
          buildings.forEach(function (b) { zTop = Math.max(zTop, b.floors * FH); });
          [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(function (c) {
            [0, zTop].forEach(function (z) {
              var p = P(c[0], c[1], z);
              sx0 = Math.min(sx0, p[0]); sx1 = Math.max(sx1, p[0]); sy0 = Math.min(sy0, p[1]); sy1 = Math.max(sy1, p[1]);
            });
          });
          pz.fitRect(sx0, sy0, sx1, sy1, api.freeArea ? api.freeArea() : null);
        },
        unmount: function () { pz.destroy(); container.innerHTML = ''; }
      };
    },
    update: function (vs) { if (this._api) this._api.update(vs); },
    centerOn: function (x, y, instant, target) { if (this._api) this._api.centerOn(x, y, instant, target); },
    zoomBy: function (factor) { if (this._api) this._api.zoomBy(factor); },
    fitBounds: function (x0, y0, x1, y1) { if (this._api) this._api.fitBounds(x0, y0, x1, y1); },
    unmount: function () { if (this._api) { this._api.unmount(); this._api = null; } }
  };

  Neo.mapViews.oblique = view;
})();
