/* admin.js — 管理画面（見た目のみ）。切り替えはメモリ上の permissionOverrides だけで、保存しない */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.screens = Neo.screens || {};
  Neo.afterRender = Neo.afterRender || {};

  var SHORT = { approved: '掲載中', pending: '確認中', declined: '掲載不可', removal_requested: '削除申請' };
  var COLOR = { approved: '#2b8a3e', pending: '#f59f00', declined: '#868e96', removal_requested: '#e64980' };

  var pendingFocus = null; // 再描画後にフォーカスを戻す select のキー

  function overrideCount() { return Object.keys(Neo.state.permissionOverrides).length; }

  function statCards() {
    var F = Neo.filters, d = Neo.data, E = Neo.esc, counts = {};
    d.shops.forEach(function (s) {
      var k = F.effectiveStatus(s, Neo.state);
      counts[k] = (counts[k] || 0) + 1;
    });
    return '<div class="admin-stats">' + Object.keys(d.permissionStatuses).map(function (k) {
      return '<div class="card admin-stat" style="--sc: ' + (COLOR[k] || 'var(--muted)') + '">' +
        '<div class="muted small">' + E(SHORT[k] || k) + '</div>' +
        '<div class="admin-num">' + (counts[k] || 0) + '<span class="small"> 軒</span></div></div>';
    }).join('') + '</div>';
  }

  function reflectCard() {
    var F = Neo.filters, d = Neo.data;
    var shops = F.visibleShops(d, Neo.state).length;
    var camps = F.visibleCampaigns(d, Neo.state).filter(function (c) { return c.status === 'active'; }).length;
    var tours = 0;
    ((d.tours && d.tours.tours) || []).forEach(function (t) {
      if (F.buildRoute(t.stops, d, Neo.state).items.length) tours++;
    });
    return '<section class="card"><h2 class="slash-heading">公開画面への反映</h2><ul class="plain-list reflect-list">' +
      '<li>公開画面に出ているお店: <strong>' + shops + '軒</strong> <a href="#/map">マップ</a></li>' +
      '<li>開催中のキャンペーン: <strong>' + camps + '件</strong> <a href="#/shops?f=live">キャンペーン</a></li>' +
      '<li>表示されるツアー: <strong>' + tours + '本</strong> <a href="#/tours">ツアー</a></li>' +
      '</ul></section>';
  }

  function rows() {
    var F = Neo.filters, d = Neo.data, E = Neo.esc;
    return d.shops.map(function (s) {
      var eff = F.effectiveStatus(s, Neo.state);
      var changed = eff !== s.permission.status;
      var p = s.permission;
      var opts = Object.keys(d.permissionStatuses).map(function (k) {
        return '<option value="' + E(k) + '"' + (k === eff ? ' selected' : '') + '>' +
          E(d.permissionStatuses[k]) + '</option>';
      }).join('');
      return '<tr class="' + (changed ? 'is-changed' : '') + '">' +
        '<td data-label="店名"><strong>' + E(s.name) + '</strong></td>' +
        '<td data-label="場所">' + E(Neo.placeLabel(s)) + '</td>' +
        '<td data-label="ジャンル">' + E(d.genres[s.genre] || '') + '</td>' +
        '<td data-label="掲載状態"><div class="status-cell">' +
          '<span class="status-dot" style="background: ' + (COLOR[eff] || 'var(--muted)') + '" aria-hidden="true"></span>' +
          '<select class="input status-select" data-shop="' + E(s.id) + '" aria-label="' + E(s.name) + 'の掲載状態">' + opts + '</select>' +
          (changed ? '<span class="changed-pill">変更あり（未保存）</span>' : '') +
        '</div></td>' +
        '<td data-label="確認方法">' + E(p.method || '—') +
          (typeof p.grantedDaysAgo === 'number' ? '<br><span class="muted small">' + p.grantedDaysAgo + '日前に許可</span>' : '') + '</td>' +
        '<td data-label="担当">' + E(p.contact || '—') + '</td>' +
        '<td data-label="メモ">' + E(p.note || '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  // デモ版限定のログイン。静的サイトなので本当の保護ではない。ID・パスワードそのものはコードに書かない。
  // ハッシュは「ID:パスワード」（UTF-8）の SHA-256（小文字16進）
  var ADMIN_HASH = 'e2339bb6a249ed0533b57b598b20696896cf344d929cfd682dc23e20301511bf';

  var focusH1 = false; // ログイン直後に管理画面の見出しへフォーカスを移す

  function loginScreen() {
    return '<section class="card login-card">' +
      '<h1>運営ログイン（デモ）</h1>' +
      '<p class="notice card">この画面は運営担当者用です（デモ）。</p>' +
      '<form id="admin-login" novalidate>' +
        '<div class="field"><label for="login-id">ID</label>' +
          '<input class="input" type="text" id="login-id" name="user" autocomplete="username"></div>' +
        '<div class="field"><label for="login-pw">パスワード</label>' +
          '<input class="input" type="password" id="login-pw" name="pw" autocomplete="current-password"></div>' +
        '<p class="field-error" id="login-error" role="alert"></p>' +
        '<button type="submit" class="btn btn-primary">ログイン</button>' +
      '</form></section>';
  }

  function adminBar() {
    return '<div class="admin-bar">' +
      '<span class="admin-pill">運営用（デモ）</span>' +
      '<a href="#/">お客様画面を見る</a>' +
      '<button type="button" class="btn btn-ghost" data-action="admin-logout">ログアウト</button>' +
      '</div>';
  }

  Neo.screens.admin = function () {
    if (!Neo.state.adminAuthed) return loginScreen();
    var none = overrideCount() === 0;
    return adminBar() + '<h1>管理画面（デモ）</h1>' +
      '<p class="notice card">この画面での切り替えは保存されません。ページを再読み込みすると元に戻ります。本番では運営担当者だけが見られる画面です。</p>' +
      statCards() + reflectCard() +
      '<p class="admin-actions"><button type="button" class="btn btn-ghost" data-action="admin-reset"' +
        (none ? ' disabled' : '') + '>すべて元に戻す</button></p>' +
      '<table class="admin-table"><thead><tr><th scope="col">店名</th><th scope="col">場所</th><th scope="col">ジャンル</th>' +
      '<th scope="col">掲載状態</th><th scope="col">確認方法</th><th scope="col">担当</th><th scope="col">メモ</th></tr></thead>' +
      '<tbody>' + rows() + '</tbody></table>';
  };

  Neo.afterRender.admin = function () {
    if (focusH1) {
      focusH1 = false;
      var h = document.querySelector('#app h1');
      if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    }
    if (!pendingFocus) return;
    var sels = document.querySelectorAll('.status-select');
    for (var i = 0; i < sels.length; i++) {
      if (sels[i].getAttribute('data-shop') === pendingFocus) {
        try { sels[i].focus({ preventScroll: true }); } catch (e) { /* 無視 */ }
      }
    }
    pendingFocus = null;
  };

  function onAdmin() { return (location.hash.replace(/^#/, '').split(/[/?]/)[1] || '') === 'admin'; }

  document.addEventListener('change', function (e) {
    if (!onAdmin() || !Neo.data) return;
    var el = e.target;
    if (!el.classList || !el.classList.contains('status-select')) return;
    var id = el.getAttribute('data-shop'), val = el.value, orig = null;
    Neo.data.shops.forEach(function (s) { if (s.id === id) orig = s.permission.status; });
    if (orig === null) return;
    if (val === orig) delete Neo.state.permissionOverrides[id];
    else Neo.state.permissionOverrides[id] = val;
    pendingFocus = id;
    Neo.rerender();
  });

  document.addEventListener('click', function (e) {
    if (!onAdmin() || !Neo.data) return;
    var t = e.target.closest ? e.target : e.target.parentElement;
    if (!t) return;
    if (t.closest('[data-action="admin-reset"]')) {
      Neo.state.permissionOverrides = {};
      Neo.rerender();
    } else if (t.closest('[data-action="admin-logout"]')) {
      Neo.state.adminAuthed = false;
      Neo.rerender();
    }
  });

  // ログイン欄の下にエラーを出す（role="alert" の段落の中身を差し替える）
  function loginError(msg) {
    var el = document.getElementById('login-error');
    if (el) el.textContent = msg;
  }

  // 文字列 → SHA-256（小文字16進）
  function sha256Hex(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  // ログイン送信。通信・保存・ログ出力はしない（入力値はこの関数の中だけで使う）
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.getAttribute || form.getAttribute('id') !== 'admin-login') return;
    e.preventDefault();
    var idEl = form.elements.user, pwEl = form.elements.pw;
    if (!idEl.value || !pwEl.value) { loginError('ID とパスワードを入力してください。'); return; }
    if (!window.crypto || !crypto.subtle) {
      loginError('この環境ではログインできません。https または localhost で開いてください。');
      return;
    }
    sha256Hex(idEl.value + ':' + pwEl.value).then(function (hex) {
      if (hex === ADMIN_HASH) {
        Neo.state.adminAuthed = true;
        idEl.value = ''; pwEl.value = '';
        focusH1 = true;
        Neo.rerender();
      } else {
        loginError('ID またはパスワードが違います。');
        pwEl.value = '';
        pwEl.focus();
      }
    }, function () {
      loginError('この環境ではログインできません。https または localhost で開いてください。');
    });
  });
})();
