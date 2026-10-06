/* filters.js — 表示ルールなどの純粋ロジック（DOMには触れない） */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});

  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var DAY_MS = 86400000;

  /* ---------- 掲載許可 ---------- */

  // 実効ステータス：管理画面での切替（メモリ上）を優先
  function effectiveStatus(shop, state) {
    var ov = state && state.permissionOverrides;
    if (ov && ov[shop.id]) return ov[shop.id];
    return shop.permission.status;
  }

  // 掲載許可済み（approved）の店だけ
  function visibleShops(data, state) {
    return data.shops.filter(function (s) {
      return effectiveStatus(s, state) === 'approved';
    });
  }

  function isShopVisible(shopId, data, state) {
    return visibleShops(data, state).some(function (s) { return s.id === shopId; });
  }

  /* ---------- 日付 ---------- */

  // 今日の 00:00（ローカル）
  function today() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // n日後（夏時間等に左右されないよう年月日で計算）
  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  // "10/6(月)" 形式
  function formatDate(date) {
    return (date.getMonth() + 1) + '/' + date.getDate() + '(' + WEEK[date.getDay()] + ')';
  }

  function updatedLabel(daysAgo) {
    return daysAgo === 0 ? '最終更新: 今日' : '最終更新: ' + daysAgo + '日前';
  }

  /* ---------- キャンペーン ---------- */

  // 日付単位で判定（開始日・終了日を含む）
  function campaignStatus(c, todayDate) {
    var t = todayDate.getTime();
    var start = addDays(todayDate, c.startOffsetDays).getTime();
    var end = addDays(todayDate, c.endOffsetDays).getTime();
    if (t < start) return 'upcoming';
    if (t <= end) return 'active';
    return 'ended';
  }

  // 店が表示可 かつ 開催中／もうすぐ開始 のみ。開催中→終了が近い順、開始前→開始が近い順
  function visibleCampaigns(data, state) {
    var td = today();
    var out = [];
    data.campaigns.forEach(function (c) {
      if (!isShopVisible(c.shopId, data, state)) return;
      var st = campaignStatus(c, td);
      if (st === 'ended') return;
      var o = {};
      for (var k in c) o[k] = c[k];
      o.status = st;
      o.startDate = addDays(td, c.startOffsetDays);
      o.endDate = addDays(td, c.endOffsetDays);
      out.push(o);
    });
    out.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      if (a.status === 'active') return a.endDate - b.endDate;
      return a.startDate - b.startDate;
    });
    return out;
  }

  function campaignsForShop(shopId, data, state) {
    return visibleCampaigns(data, state).filter(function (c) { return c.shopId === shopId; });
  }

  // 「あと3日」「今日まで」「明日から」「5日後に開始」。c は visibleCampaigns の要素（status・startDate・endDate付き）
  // 日付は00:00同士の差を四捨五入して日数にする（夏時間対策）
  function campaignCountdown(c, todayDate) {
    if (c.status === 'active') {
      var n = Math.round((c.endDate - todayDate) / DAY_MS);
      return n === 0 ? '今日まで' : 'あと ' + n + '日';
    }
    var m = Math.round((c.startDate - todayDate) / DAY_MS);
    return m === 1 ? '明日から' : m + '日後に開始';
  }

  /* ---------- 営業時間 ---------- */

  // "11:00-20:00" → 分
  function parseHours(str) {
    var m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
    if (!m) return null;
    return { open: +m[1] * 60 + +m[2], close: +m[3] * 60 + +m[4] };
  }

  // "水曜" / "なし" / "月・木曜" などから曜日番号の配列（0=日..6=土）
  function closedDays(shop) {
    var s = String(shop.closed || '');
    var days = [];
    for (var i = 0; i < WEEK.length; i++) {
      if (s.indexOf(WEEK[i]) !== -1 && s.indexOf('なし') === -1) days.push(i);
    }
    return days;
  }

  function isOpenOnDay(shop, weekday) {
    return closedDays(shop).indexOf(weekday) === -1;
  }

  function isOpenNow(shop, date) {
    date = date || new Date();
    if (!isOpenOnDay(shop, date.getDay())) return false;
    var h = parseHours(shop.hours);
    if (!h) return false;
    var m = date.getHours() * 60 + date.getMinutes();
    return m >= h.open && m < h.close;
  }

  /* ---------- 距離 ---------- */

  function distance(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ---------- ツアー ---------- */

  // 地図上の距離 → 徒歩の分数
  function walkMinutes(a, b) {
    if (a.building && a.building === b.building) return 1; // 同じビルなら階の移動だけ
    return Math.max(2, Math.ceil(distance(a, b) / 60));
  }

  // 掲載できない店の停留所を黙って外し、移動時間を前後の店から再計算する
  function buildRoute(stops, data, state) {
    var visible = {};
    visibleShops(data, state).forEach(function (s) { visible[s.id] = s; });
    var items = [], total = 0, walk = 0, prev = null;
    (stops || []).forEach(function (st) {
      var shop = visible[st.shopId];
      if (!shop) return;
      var w = prev ? walkMinutes(prev, shop) : 0;
      items.push({ shop: shop, stayMinutes: st.stayMinutes, comment: st.comment, walkFromPrev: w });
      total += st.stayMinutes + w;
      walk += w;
      prev = shop;
    });
    return { items: items, totalMinutes: total, walkMinutes: walk };
  }

  // 「約1時間50分」「約45分」「約2時間」
  // 5分単位に切り上げてから表示（122分 → 約2時間5分）
  function formatDuration(min) {
    min = Math.ceil(min / 5) * 5;
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return '約' + m + '分';
    return '約' + h + '時間' + (m ? m + '分' : '');
  }

  // 0時からの分 → "HH:MM"
  function formatClock(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* ---------- ルートの形（通りに沿った線。建物を横切らない） ---------- */

  // 点 p から線分 s（x1,y1→x2,y2）への最も近い点
  function projectOnStreet(p, s) {
    var dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / l2)) : 0;
    return { x: s.x1 + t * dx, y: s.y1 + t * dy };
  }

  // 2本の線分の交点（交わらなければ null）
  function segIntersect(a, b) {
    var d1x = a.x2 - a.x1, d1y = a.y2 - a.y1, d2x = b.x2 - b.x1, d2y = b.y2 - b.y1;
    var den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return null;
    var t = ((b.x1 - a.x1) * d2y - (b.y1 - a.y1) * d2x) / den;
    var u = ((b.x1 - a.x1) * d1y - (b.y1 - a.y1) * d1x) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return { x: a.x1 + t * d1x, y: a.y1 + t * d1y };
  }

  // from → to を通りに沿って結ぶ点列。from/to は {x, y} に加えて、店・ビルなら street（所属する通りの id）を持つ
  // 現在地のように street が無いものは、いちばん近い通りにつなぐ。同じビルどうしは [] を返す
  function streetPath(from, to, data) {
    var fb = from.building || from.id, tb = to.building || to.id;
    if (fb && tb && fb === tb) return [];
    var streets = (data.town && data.town.streets) || [];
    if (!streets.length) return [from, to].map(function (p) { return { x: p.x, y: p.y }; });

    // 通りごとの点（端点・交点・入口）。後で通りに沿って並べ、隣どうしを辺にする
    var onStreet = streets.map(function (s) { return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]; });
    var i, j;
    for (i = 0; i < streets.length; i++) {
      for (j = i + 1; j < streets.length; j++) {
        var p = segIntersect(streets[i], streets[j]);
        if (p) { onStreet[i].push(p); onStreet[j].push(p); }
      }
    }
    // 入口：その建物の通り（なければ最も近い通り）の上の、いちばん近い点
    function entrance(e) {
      var si = -1, best = Infinity, pt = null;
      for (var k = 0; k < streets.length; k++) {
        if (e.street && streets[k].id !== e.street) continue;
        var q = projectOnStreet(e, streets[k]), dd = Math.hypot(q.x - e.x, q.y - e.y);
        if (dd < best) { best = dd; si = k; pt = q; }
      }
      if (si < 0) { // street が見つからないときは全部の通りから探す
        for (var k2 = 0; k2 < streets.length; k2++) {
          var q2 = projectOnStreet(e, streets[k2]), d2 = Math.hypot(q2.x - e.x, q2.y - e.y);
          if (d2 < best) { best = d2; si = k2; pt = q2; }
        }
      }
      onStreet[si].push(pt);
      return pt;
    }
    var entFrom = entrance(from), entTo = entrance(to);

    // 点に番号をつける（同じ位置は同じ番号）
    var nodes = [], index = {};
    function nodeId(p) {
      var key = Math.round(p.x * 100) + ',' + Math.round(p.y * 100);
      if (index[key] === undefined) { index[key] = nodes.length; nodes.push({ x: p.x, y: p.y, edges: [] }); }
      return index[key];
    }
    function link(a, b) {
      if (a === b) return;
      var w = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
      nodes[a].edges.push({ to: b, w: w }); nodes[b].edges.push({ to: a, w: w });
    }
    streets.forEach(function (s, si) {
      var ids = onStreet[si].map(function (p) {
        return { id: nodeId(p), t: (p.x - s.x1) * (s.x2 - s.x1) + (p.y - s.y1) * (s.y2 - s.y1) };
      }).sort(function (a, b) { return a.t - b.t; });
      for (var k = 0; k + 1 < ids.length; k++) link(ids[k].id, ids[k + 1].id);
    });

    // 最短経路（ダイクストラ法。点は十数個だけ）
    var src = nodeId(entFrom), dst = nodeId(entTo);
    var dist = nodes.map(function () { return Infinity; }), prev = nodes.map(function () { return -1; }), done = nodes.map(function () { return false; });
    dist[src] = 0;
    for (;;) {
      var u = -1;
      for (i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === dst) break;
      done[u] = true;
      nodes[u].edges.forEach(function (e) {
        if (dist[u] + e.w < dist[e.to]) { dist[e.to] = dist[u] + e.w; prev[e.to] = u; }
      });
    }
    var out = [{ x: from.x, y: from.y }];
    if (dist[dst] === Infinity) { out.push({ x: to.x, y: to.y }); return out; } // つながらないときは直線
    var chain = [];
    for (var n = dst; n >= 0; n = prev[n]) chain.push(n);
    chain.reverse().forEach(function (id) { out.push({ x: nodes[id].x, y: nodes[id].y }); });
    out.push({ x: to.x, y: to.y });
    return out;
  }

  // 行程（items: {shop}）→ 地図に描く線と番号つきの停留所
  // path: 連続する重複を除いた点列。stops: ビルごとにまとめた停留所 [{building, name, numbers: [1,2], x, y}]（訪れた順）
  function routeGeometry(items, startAtHere, data) {
    var path = [], stops = [], byBuilding = {};
    function add(p) {
      var l = path[path.length - 1];
      if (!l || Math.abs(l.x - p.x) > 0.01 || Math.abs(l.y - p.y) > 0.01) path.push({ x: p.x, y: p.y });
    }
    var prev = startAtHere && data.town && data.town.here ? data.town.here : null;
    if (prev) add(prev);
    (items || []).forEach(function (it, i) {
      var s = it.shop;
      if (prev) streetPath(prev, s, data).forEach(add); else add(s);
      prev = s;
      var st = byBuilding[s.building];
      if (!st) {
        var name = '';
        (data.buildings || []).forEach(function (b) { if (b.id === s.building) name = b.name; });
        st = byBuilding[s.building] = { building: s.building, name: name, numbers: [], x: s.x, y: s.y };
        stops.push(st);
      }
      st.numbers.push(i + 1);
    });
    return { path: path, stops: stops };
  }

  /* ---------- AIアレンジ（APIなし・ルールだけで作る） ---------- */

  var ARR_START = 11 * 60;   // 出発は11:00の想定
  var ARR_STAY = 30;         // 1軒あたりの滞在
  var ARR_CAFE_STAY = 20;    // カフェ休憩の滞在
  var ARR_DONUT_STAY = 20;   // 食事・おやつ：ドーナツだけ20分、ほかは30分（ARR_STAY）

  // その店での滞在（分）。休憩のカフェ・食事の店は短め
  function stayFor(shop, cafe) {
    if (shop === cafe) return ARR_CAFE_STAY;
    if (shop.genre === 'quick_food') return shop.foodType === 'donut' ? ARR_DONUT_STAY : ARR_STAY;
    return ARR_STAY;
  }

  // 近い順（貪欲法）。出発は入口に一番近い店から
  function nearestOrder(shops, entry) {
    var left = shops.slice(), out = [], cur = entry;
    while (left.length) {
      var bi = 0, bd = Infinity;
      for (var i = 0; i < left.length; i++) {
        var dd = distance(cur, left[i]);
        if (dd < bd) { bd = dd; bi = i; }
      }
      cur = left.splice(bi, 1)[0];
      out.push(cur);
    }
    return out;
  }

  // 一番長い移動の途中にカフェを1軒入れる（1軒だけなら、その後ろに一番近いカフェ）
  function insertCafe(stops, cafes) {
    if (!stops.length || !cafes.length) return { seq: stops.slice(), cafe: null };
    var best = null, pos, i;
    if (stops.length === 1) {
      var bd = Infinity;
      cafes.forEach(function (c) { var dd = distance(stops[0], c); if (dd < bd) { bd = dd; best = c; } });
      return { seq: [stops[0], best], cafe: best };
    }
    var li = 0, lw = -1;
    for (i = 0; i < stops.length - 1; i++) {
      var w = walkMinutes(stops[i], stops[i + 1]);
      if (w > lw) { lw = w; li = i; }
    }
    var bs = Infinity;
    cafes.forEach(function (c) {
      var s = walkMinutes(stops[li], c) + walkMinutes(c, stops[li + 1]);
      if (s < bs) { bs = s; best = c; }
    });
    var seq = stops.slice();
    seq.splice(li + 1, 0, best);
    return { seq: seq, cafe: best };
  }

  // 時刻表を作る。閉店に間に合わない店があれば fail に入れて返す
  function scheduleSeq(seq, cafe, entry) {
    var t = ARR_START, prev = entry, times = [], walks = [];
    for (var i = 0; i < seq.length; i++) {
      var shop = seq[i];
      var stay = stayFor(shop, cafe);
      var w = walkMinutes(prev, shop);
      var arrive = t + w;
      var h = parseHours(shop.hours);
      if (h && arrive < h.open) arrive = h.open; // 開店まで待つ
      var leave = arrive + stay;
      if (h && leave > h.close) return { fail: shop };
      times.push({ arrive: arrive, leave: leave });
      walks.push(w);
      t = leave;
      prev = shop;
    }
    return { times: times, walks: walks, end: t };
  }

  // 食事の店を1軒入れる。経路の真ん中あたり（3分の1〜3分の2）の位置のうち、
  // 閉店に間に合う組み合わせで、歩く時間の合計がいちばん短いもの（1軒だけなら、その後ろ）
  function insertFood(seq, foods, cafe, entry) {
    var n = seq.length, lo, hi, best = null;
    if (!n || !foods.length) return null;
    if (n === 1) { lo = hi = 1; }
    else {
      lo = Math.max(1, Math.ceil(n / 3)); hi = Math.min(n - 1, Math.floor(2 * n / 3));
      if (hi < lo) hi = lo;
    }
    foods.forEach(function (food) {
      for (var p = lo; p <= hi; p++) {
        var s2 = seq.slice();
        s2.splice(p, 0, food);
        var sc = scheduleSeq(s2, cafe, entry);
        if (sc.fail) continue;
        var w = sc.walks.reduce(function (a, b) { return a + b; }, 0);
        if (!best || w < best.w) best = { seq: s2, food: food, sc: sc, w: w };
      }
    });
    return best;
  }

  // inputs: {themes: 配列 or Set, duration: 分, rest: 真偽, food: 食事の種類の配列（donut/burger/soba/gyudon）。null・空なら入れない}
  function planArrange(inputs, data, state, now) {
    now = now || new Date();
    var weekday = now.getDay();
    var themeIds = Array.from(inputs.themes || []);
    var genres = {};
    ((data.tours && data.tours.themes) || []).forEach(function (th) {
      if (themeIds.indexOf(th.id) >= 0) (th.genres || []).forEach(function (g) { genres[g] = true; });
    });
    delete genres.cafe; // カフェは休憩としてだけ使う
    var visible = visibleShops(data, state);
    var themed = visible.filter(function (s) { return genres[s.genre]; });
    var open = themed.filter(function (s) { return isOpenOnDay(s, weekday); });
    var cafes = visible.filter(function (s) { return s.genre === 'cafe' && isOpenOnDay(s, weekday); });
    // 食事・おやつ（チェーン店）。テーマの候補には入らず、このオプションでだけ入る
    var foodKinds = Array.from(inputs.food || []);
    var foods = foodKinds.length ? visible.filter(function (s) {
      return s.genre === 'quick_food' && foodKinds.indexOf(s.foodType) >= 0 && isOpenOnDay(s, weekday);
    }) : [];

    var res = {
      items: [], times: [], totalMinutes: 0, walkMinutes: 0, startMinutes: ARR_START,
      weekdayLabel: WEEK[weekday] + '曜', excludedClosedCount: themed.length - open.length
    };

    var entry = (data.town && data.town.here) || { x: 0, y: 0 }; // 出発地点（駅前広場）
    var stops = nearestOrder(open, entry);
    var useCafe = !!inputs.rest;
    var useFood = foods.length > 0;
    var badCafe = [];
    var guard = 0, built = null;
    while (stops.length && guard++ < 200) {
      var usable = cafes.filter(function (c) { return badCafe.indexOf(c) < 0; });
      var ins = useCafe ? insertCafe(stops, usable) : { seq: stops.slice(), cafe: null };
      var sc = scheduleSeq(ins.seq, ins.cafe, entry);
      if (sc.fail) {
        if (sc.fail === ins.cafe) badCafe.push(ins.cafe);          // カフェが閉店に間に合わない→別のカフェ
        else stops = stops.filter(function (s) { return s !== sc.fail; }); // 店を外して作り直す
        continue;
      }
      // 食事の店を1軒（カフェ休憩とは別。両方入ることもある）
      var food = null;
      if (useFood) {
        var fi = insertFood(ins.seq, foods, ins.cafe, entry);
        if (fi) { food = fi.food; ins = { seq: fi.seq, cafe: ins.cafe }; sc = fi.sc; }
      }
      if (sc.end - ARR_START > inputs.duration) {
        // 通常の店より先に、カフェ・食事を外す（通常の店を減らすときも、食事の店は残る）
        if (stops.length === 1) {
          if (ins.cafe) { useCafe = false; continue; }
          if (food) { useFood = false; continue; }
        }
        if (stops.length > 1) { stops = stops.slice(0, -1); continue; }    // 最後の店を外す
      }
      built = { ins: ins, sc: sc, food: food };
      break;
    }
    // 選んだ時間を超えるプランは出さない（1軒だけでも超えるなら空にする）
    if (!built || built.sc.end - ARR_START > inputs.duration) return res;

    var gen = data.genres || {};
    built.ins.seq.forEach(function (shop, i) {
      var isCafe = shop === built.ins.cafe, isFood = shop === built.food;
      res.items.push({
        shop: shop,
        stayMinutes: stayFor(shop, built.ins.cafe),
        comment: isCafe ? 'ここでひと休み。' : isFood ? (shop.foodType === 'donut' ? 'ここでおやつ。' : 'ここで食事。') : (gen[shop.genre] || '') + 'をチェック。',
        walkFromPrev: built.sc.walks[i]
      });
      res.walkMinutes += built.sc.walks[i];
    });
    res.times = built.sc.times;
    res.totalMinutes = built.sc.end - ARR_START;
    return res;
  }

  Neo.filters = {
    formatClock: formatClock,
    planArrange: planArrange,
    walkMinutes: walkMinutes,
    streetPath: streetPath,
    routeGeometry: routeGeometry,
    buildRoute: buildRoute,
    formatDuration: formatDuration,
    effectiveStatus: effectiveStatus,
    visibleShops: visibleShops,
    isShopVisible: isShopVisible,
    today: today,
    addDays: addDays,
    campaignStatus: campaignStatus,
    visibleCampaigns: visibleCampaigns,
    campaignsForShop: campaignsForShop,
    campaignCountdown: campaignCountdown,
    formatDate: formatDate,
    updatedLabel: updatedLabel,
    parseHours: parseHours,
    closedDays: closedDays,
    isOpenOnDay: isOpenOnDay,
    isOpenNow: isOpenNow,
    distance: distance
  };
})();
