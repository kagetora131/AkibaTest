/* admin.js — 管理画面（見た目のみ）。切り替えはメモリ上の permissionOverrides だけで、保存しない */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.screens = Neo.screens || {};
  Neo.afterRender = Neo.afterRender || {};
  // admin.js は app.js より先に読み込まれるので、状態の入れ物をここでも用意する（app.js は既存の入れ物を引き継ぐ）
  Neo.state = Neo.state || { permissionOverrides: {}, adminAuthed: false };

  function authed() { return !!(Neo.state && Neo.state.adminAuthed); }
  function setAuthed(v) { if (Neo.state) Neo.state.adminAuthed = !!v; }

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

  function adminBar() {
    return '<div class="admin-bar">' +
      '<span class="admin-pill">運営用（デモ）</span>' +
      '<a href="#/">お客様画面を見る</a>' +
      '<button type="button" class="btn btn-ghost" data-action="admin-logout">ログアウト</button>' +
      '</div>';
  }

  Neo.screens.admin = function () {
    if (!authed()) return ''; // 通常は app.js が先にトップへ戻してログインを開く
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
      setAuthed(false);
      Neo.syncAdminEntry();
      location.hash = '#/'; // お客様画面へ戻る
    }
  });

  /* ---------- ログイン用ダイアログ（右下の小さなボタンから開く） ---------- */

  var entryBtn = null, dlg = null;

  // ダイアログ内のエラー表示（role="alert" の段落の中身を差し替える）
  function loginError(msg) {
    var el = document.getElementById('login-error');
    if (el) el.textContent = msg;
  }

  // 右下ボタンの表示を状態に合わせる（管理画面では隠す。ログイン済みなら「管理画面へ」）
  Neo.syncAdminEntry = function () {
    if (!entryBtn) return;
    entryBtn.hidden = onAdmin();
    entryBtn.textContent = authed() ?'管理画面へ' : '管理（デモ版専用）';
  };

  // ダイアログを開く（入力とエラーは空にしてから）
  Neo.openAdminLogin = function () {
    if (!dlg || dlg.open) return;
    loginError('');
    document.getElementById('login-id').value = '';
    document.getElementById('login-pw').value = '';
    dlg.showModal();
    document.getElementById('login-id').focus();
  };

  // 文字列 → SHA-256（小文字16進）
  function sha256Hex(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  // ログイン送信。通信・保存・ログ出力はしない（入力値はこの関数の中だけで使う）
  function onLoginSubmit(e) {
    e.preventDefault(); // 何があっても通常の送信（URLへの値の付与）をさせない
    e.stopPropagation();
    var idEl = document.getElementById('login-id'), pwEl = document.getElementById('login-pw');
    if (!idEl || !pwEl) return;
    if (!idEl.value || !pwEl.value) { loginError('ID とパスワードを入力してください。'); return; }
    if (!window.crypto || !crypto.subtle) {
      loginError('この環境ではログインできません。https または localhost で開いてください。');
      return;
    }
    sha256Hex(idEl.value + ':' + pwEl.value).then(function (hex) {
      if (hex === ADMIN_HASH) {
        setAuthed(true);
        idEl.value = ''; pwEl.value = '';
        dlg.close();
        Neo.syncAdminEntry();
        location.hash = '#/admin'; // 画面切替で見出しにフォーカスが移る
      } else {
        loginError('ID またはパスワードが違います。');
        pwEl.value = '';
        pwEl.focus();
      }
    }, function () {
      loginError('この環境ではログインできません。https または localhost で開いてください。');
    });
  }

  // 保険：フォームに直接つけられなかった場合でも、ログインフォームの送信は必ず止める
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.getAttribute && f.getAttribute('id') === 'admin-login') e.preventDefault();
  });

  function setupLogin() {
    // 送信の処理を最初に登録する（あとの処理で例外が出ても送信は守られる）
    try {
      var form = document.getElementById('admin-login');
      if (form) form.addEventListener('submit', onLoginSubmit);
    } catch (err) { /* 無視 */ }
    try {
      entryBtn = document.getElementById('admin-entry');
      dlg = document.getElementById('login-dialog');
      if (!entryBtn || !dlg) return;
      entryBtn.addEventListener('click', function () {
        if (authed()) location.hash = '#/admin';
        else Neo.openAdminLogin();
      });
      document.getElementById('login-cancel').addEventListener('click', function () { dlg.close(); });
      // 背景（ダイアログの外側）を押したら閉じる
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
      // Esc・キャンセル・背景のどれで閉じても、入力を空にして右下のボタンへフォーカスを戻す
      dlg.addEventListener('close', function () {
        document.getElementById('login-id').value = '';
        document.getElementById('login-pw').value = '';
        loginError('');
        if (!authed()) entryBtn.focus(); // ログイン成功時は管理画面の見出しへ移る
      });
      Neo.syncAdminEntry(); // app.js 読み込み後は updateNav からも呼ばれる
    } catch (err) { /* 無視 */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLogin);
  else setupLogin();
})();
