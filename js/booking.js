/* booking.js — ツアー受付（見た目のみ）。送信・保存・通信は一切しない */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.screens = Neo.screens || {};

  // 「受付後」表示のフラグ。画面を離れたら戻す
  Neo.bookingState = { submitted: false };
  window.addEventListener('hashchange', function () { Neo.bookingState.submitted = false; });

  function visibleTours() {
    var F = Neo.filters, out = [];
    ((Neo.data.tours && Neo.data.tours.tours) || []).forEach(function (t) {
      var r = F.buildRoute(t.stops, Neo.data, Neo.state);
      if (r.items.length) out.push({ tour: t, route: r });
    });
    return out;
  }

  // 今日の日付 YYYY-MM-DD（ローカル）
  function todayStr() {
    var d = Neo.filters.today();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function planArea(query) {
    var F = Neo.filters, E = Neo.esc;
    var tours = visibleTours();
    var tourId = query && query.get('tour');
    var plan = query && query.get('plan');

    if (tourId) {
      var hit = null;
      tours.forEach(function (x) { if (x.tour.id === tourId) hit = x; });
      if (hit) {
        return '<section class="card"><h2>選んだツアー</h2>' +
          '<p><strong>' + E(hit.tour.title) + '</strong><br><span class="muted small">' +
          E(F.formatDuration(hit.route.totalMinutes)) + ' ／ ' + hit.route.items.length + '軒</span></p>' +
          '<p><a href="#/booking">別のツアーを選ぶ</a></p></section>';
      }
    } else if (plan === 'ai') {
      var st = Neo.arrangeState, extra = '';
      if (st && st.generated && st.themes.size > 0) {
        var p = F.planArrange({ themes: Array.from(st.themes), duration: st.duration, rest: st.rest },
          Neo.data, Neo.state, new Date());
        if (p.items.length) {
          extra = '<br><span class="muted small">' + E(F.formatDuration(p.totalMinutes)) + ' ／ ' + p.items.length + '軒</span>';
        }
      }
      return '<section class="card"><h2>選んだツアー</h2><p><strong>AIアレンジのプラン</strong>' + extra +
        '</p><p><a href="#/booking">別のツアーを選ぶ</a></p></section>';
    }

    var opts = tours.map(function (x) {
      return '<option value="' + E(x.tour.id) + '">' + E(x.tour.title) + '</option>';
    }).join('') + '<option value="ai">AIアレンジのプラン</option>';
    return '<div class="field"><label for="b-tour">ツアーを選ぶ</label>' +
      '<select id="b-tour" class="input">' + opts + '</select></div>';
  }

  function formHtml(query) {
    var nums = '';
    for (var i = 1; i <= 6; i++) nums += '<option value="' + i + '">' + i + '名</option>';
    return '<form data-booking novalidate>' +
      planArea(query) +
      '<div class="field"><label for="b-name">お名前 <span class="req">必須</span></label>' +
        '<input id="b-name" class="input" type="text" autocomplete="off">' +
        '<div class="field-error" id="err-name" role="alert"></div></div>' +
      '<div class="field"><label for="b-num">人数</label><select id="b-num" class="input">' + nums + '</select></div>' +
      '<div class="field"><label for="b-date">希望日 <span class="req">必須</span></label>' +
        '<input id="b-date" class="input" type="date" min="' + todayStr() + '">' +
        '<div class="field-error" id="err-date" role="alert"></div></div>' +
      '<div class="field"><label for="b-contact">連絡先</label>' +
        '<input id="b-contact" class="input" type="text" autocomplete="off" placeholder="例：sample@example.com"></div>' +
      '<div class="field"><label for="b-note">ご要望</label>' +
        '<textarea id="b-note" class="input" rows="4"></textarea></div>' +
      '<p class="muted">料金のお支払いはありません（デモ）</p>' +
      '<p><button type="submit" class="btn btn-primary">受付内容を確認（デモ）</button></p>' +
      '</form>';
  }

  function doneHtml() {
    return '<section class="card" role="status"><h2>受付はされていません</h2>' +
      '<p>これはデモ画面のため、送信や保存は行っていません。入力内容は消去しました。</p>' +
      '<p class="btn-row"><button type="button" class="btn btn-ghost" data-action="booking-again">もう一度入力する</button>' +
      '<a class="btn btn-ghost" href="#/">トップへ</a></p></section>';
  }

  Neo.screens.booking = function (params) {
    return '<h1>ツアー受付</h1>' +
      '<p class="notice card"><strong>デモのため送信されません。入力した内容はどこにも保存・送信されません。</strong></p>' +
      '<div class="booking-area">' + (Neo.bookingState.submitted ? doneHtml() : formHtml(params && params.query)) + '</div>';
  };

  function onBooking() { return (location.hash.replace(/^#/, '').split(/[/?]/)[1] || '') === 'booking'; }

  // 送信は常にキャンセル。通信も保存もしない
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.hasAttribute || !form.hasAttribute('data-booking')) return;
    e.preventDefault();
    var name = document.getElementById('b-name'), date = document.getElementById('b-date');
    var en = document.getElementById('err-name'), ed = document.getElementById('err-date');
    var bad = null;
    en.textContent = name.value.trim() ? '' : 'お名前を入力してください。';
    ed.textContent = date.value ? '' : '希望日を入力してください。';
    if (en.textContent) bad = name; else if (ed.textContent) bad = date;
    if (bad) { bad.focus(); return; }
    Neo.bookingState.submitted = true;
    Neo.rerender(); // 入力内容は残さず、結果カードに置き換える
    var h = document.querySelector('.booking-area h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  });

  document.addEventListener('click', function (e) {
    if (!onBooking()) return;
    var t = e.target.closest ? e.target : e.target.parentElement;
    if (t && t.closest('[data-action="booking-again"]')) {
      Neo.bookingState.submitted = false;
      Neo.rerender();
    }
  });
})();
