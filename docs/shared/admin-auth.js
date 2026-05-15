/**
 * 本地管理页门禁（浏览器端会话门禁 + 与服务端 PIN 校验绑定）
 * - 目标：替代 prompt 口令，改为可视化 Gate UI
 * - 说明：静态页门禁仅降低误入风险；真正安全依赖服务端 /api/admin/* 的 X-Admin-Pin 校验
 */
(function (global) {
  var OK_KEY = 'jml_admin_ok_v2';
  var PIN_KEY = 'jml_admin_pin_v2';

  function getApiBase() {
    return (
      (global.__JML_API_BASE__ || global.API_BASE_URL || '') +
      ''
    )
      .replace(/\/+$/, '');
  }

  function getStoredPin() {
    try {
      return sessionStorage.getItem(PIN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setStoredPin(pin) {
    try {
      sessionStorage.setItem(PIN_KEY, String(pin || ''));
    } catch (e) {}
  }

  function isAuthed() {
    try {
      return sessionStorage.getItem(OK_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setAuthed() {
    try {
      sessionStorage.setItem(OK_KEY, '1');
    } catch (e) {}
  }

  function clearAuth() {
    try {
      sessionStorage.removeItem(OK_KEY);
      sessionStorage.removeItem(PIN_KEY);
    } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById('jml-admin-gate-style')) return;
    var style = document.createElement('style');
    style.id = 'jml-admin-gate-style';
    style.textContent =
      '.jml-gate-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:24px;box-sizing:border-box;}' +
      '.jml-gate-card{max-width:420px;width:100%;background:#1e293b;border-radius:12px;padding:28px 24px;box-shadow:0 20px 50px rgba(0,0,0,.35);}' +
      '.jml-gate-card h1{margin:0 0 8px;font-size:1.25rem;font-weight:600;color:#f8fafc;}' +
      '.jml-gate-card p{margin:0 0 20px;font-size:.85rem;color:#94a3b8;line-height:1.5;}' +
      '.jml-gate-card label{display:block;font-size:.8rem;margin-bottom:6px;color:#cbd5e1;}' +
      '.jml-gate-card input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#f8fafc;font-size:1rem;}' +
      '.jml-gate-card button{margin-top:16px;width:100%;padding:12px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;font-size:.95rem;cursor:pointer;}' +
      '.jml-gate-card button:active{opacity:.92;}' +
      '.jml-gate-err{margin-top:10px;font-size:.8rem;color:#f87171;}' +
      '.jml-gate-warn{margin-top:0;margin-bottom:16px;padding:12px;border-radius:8px;background:#422006;color:#fdba74;font-size:.8rem;line-height:1.45;}' +
      '.jml-gate-hint{margin-top:14px;font-size:.8rem;color:#64748b;line-height:1.5;}';
    document.head.appendChild(style);
  }

  async function verifyPinWithServer(pin) {
    var base = getApiBase();
    if (!base) {
      throw new Error('未配置 API 地址（请检查 config.js）');
    }
    var res = await fetch(base + '/api/admin/settings', {
      method: 'GET',
      headers: { 'X-Admin-Pin': String(pin || '') },
    });
    if (!res.ok) {
      var t = '';
      try {
        t = await res.text();
      } catch (e) {}
      throw new Error(t || '口令校验失败（' + res.status + '）');
    }
    var data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || '口令错误');
    }
    return true;
  }

  global.AdminAuth = {
    /**
     * @param {{ gateId: string, appId: string, title: string, blurb?: string, onUnlocked?: function(): void }} opts
     */
    mount: function (opts) {
      injectStyles();
      var gateEl = document.getElementById(opts.gateId);
      var appEl = document.getElementById(opts.appId);
      if (!gateEl || !appEl) return;

      function showApp() {
        gateEl.style.display = 'none';
        appEl.hidden = false;
        if (typeof opts.onUnlocked === 'function') {
          try {
            opts.onUnlocked();
          } catch (e) {}
        }
      }

      if (isAuthed() && getStoredPin()) {
        global.__JML_ADMIN_PIN__ = getStoredPin();
        showApp();
        return;
      }

      var blurb = opts.blurb || '请输入访问口令后继续。';
      gateEl.innerHTML =
        '<div class="jml-gate-wrap"><div class="jml-gate-card">' +
        '<h1>' +
        (opts.title || '管理') +
        '</h1>' +
        '<p>' +
        blurb +
        '</p>' +
        '<form id="jml-gate-form">' +
        '<label for="jml-gate-input">口令</label>' +
        '<input id="jml-gate-input" type="password" autocomplete="current-password" placeholder="管理员口令" required />' +
        '<div id="jml-gate-err" class="jml-gate-err" style="display:none;"></div>' +
        '<button id="jml-gate-submit" type="submit">进入</button>' +
        '</form>' +
        '<div class="jml-gate-hint">提示：口令由服务端配置（环境变量 <code>ADMIN_PIN</code> 或数据目录中的 <code>admin-pin.json</code>）。请输入当前生效的口令；校验通过后会请求 <code>/api/admin/settings</code>。</div>' +
        '</div></div>';

      var form = gateEl.querySelector('#jml-gate-form');
      var input = gateEl.querySelector('#jml-gate-input');
      var errEl = gateEl.querySelector('#jml-gate-err');
      var btn = gateEl.querySelector('#jml-gate-submit');

      function setErr(msg) {
        if (!errEl) return;
        errEl.textContent = msg || '';
        errEl.style.display = msg ? 'block' : 'none';
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        setErr('');
        var entered = (input.value || '').trim();
        if (!entered) return;
        if (btn) btn.disabled = true;
        verifyPinWithServer(entered)
          .then(function () {
            global.__JML_ADMIN_PIN__ = entered;
            setStoredPin(entered);
            setAuthed();
            showApp();
          })
          .catch(function (err) {
            setErr((err && err.message) || '口令错误');
            input.value = '';
            input.focus();
          })
          .finally(function () {
            if (btn) btn.disabled = false;
          });
      });

      if (input) input.focus();
    },

    logout: function () {
      clearAuth();
      global.location.reload();
    },
  };
})(typeof window !== 'undefined' ? window : this);

