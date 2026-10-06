/* view-3d.js — 「3D」ビューの入口（薄い包み）。3Dを選んだときだけ view-3d-impl.js（three.js）を読み込む */
(function () {
  'use strict';
  var Neo = (window.Neo = window.Neo || {});
  Neo.mapViews = Neo.mapViews || {};

  var impl = null, token = null, box = null, pending = null;

  function showMessage(container, html) {
    container.innerHTML = '<div class="v3d-msg">' + html + '</div>';
  }

  function unavailable(container) {
    showMessage(container, '<p>この端末では3D表示を利用できません</p>' +
      '<p><button type="button" class="btn btn-primary" data-v3d-fallback>斜め表示に切り替える</button></p>');
    var btn = container.querySelector('[data-v3d-fallback]');
    if (btn) btn.addEventListener('click', function () { if (Neo.switchMapView) Neo.switchMapView('oblique'); });
  }

  var view = {
    mount: function (container, api) {
      var tok = (token = { cancelled: false });
      box = container; impl = null; pending = { state: null, center: null, fit: null };
      showMessage(container, '3Dを読み込み中…');
      import('./view-3d-impl.js').then(function (m) {
        if (tok.cancelled) return; // 読み込み中に画面を離れた
        var v = m.create();
        try {
          v.mount(container, api);
        } catch (err) {
          try { v.unmount(); } catch (e2) { /* 無視 */ }
          unavailable(container);
          return;
        }
        impl = v;
        if (pending.state) v.update(pending.state);
        if (pending.center) v.centerOn.apply(v, pending.center);
        if (pending.fit) v.fitBounds.apply(v, pending.fit);
        pending = null;
      }).catch(function () {
        if (!tok.cancelled) unavailable(container);
      });
    },
    update: function (vs) { if (impl) impl.update(vs); else if (pending) pending.state = vs; },
    centerOn: function (x, y, instant, target) {
      if (impl) impl.centerOn(x, y, instant, target); else if (pending) pending.center = [x, y, instant, target];
    },
    zoomBy: function (f) { if (impl) impl.zoomBy(f); },
    fitBounds: function (x0, y0, x1, y1) {
      if (impl) impl.fitBounds(x0, y0, x1, y1); else if (pending) pending.fit = [x0, y0, x1, y1];
    },
    resetView: function () { if (impl) impl.resetView(); },
    unmount: function () {
      if (token) token.cancelled = true;
      if (impl) { impl.unmount(); impl = null; }
      if (box) { box.innerHTML = ''; box = null; }
      pending = null;
    }
  };

  Neo.mapViews['3d'] = view;
})();
