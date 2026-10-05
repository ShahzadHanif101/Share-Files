/* Drop-in replacement for google.script.run: keeps the existing UI code unchanged.
   google.script.run.withSuccessHandler(f).withFailureHandler(g).someFunction(a, b)
   -> POST /api/rpc { fn: 'someFunction', args: [a, b] }                         */
(function () {
  function runner(onOk, onFail) {
    return new Proxy({}, {
      get: function (_t, name) {
        if (typeof name !== 'string' || name === 'then') return undefined;
        if (name === 'withSuccessHandler') return function (fn) { return runner(fn, onFail); };
        if (name === 'withFailureHandler') return function (fn) { return runner(onOk, fn); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          var isLogin = name === 'login';
          fetch(isLogin ? '/api/login' : '/api/rpc', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(isLogin ? { password: args[0] } : { fn: name, args: args })
          })
            .then(function (res) {
              return res.json().catch(function () { return {}; }).then(function (data) {
                if (res.status === 401 && !isLogin) { window.location.replace('/login'); return; }
                if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ').');
                if (onOk) onOk(data.result);
              });
            })
            .catch(function (err) {
              if (onFail) onFail(err instanceof Error ? err : new Error(String(err)));
              else console.error(err);
            });
        };
      }
    });
  }
  window.google = { script: { run: runner(null, null) } };
})();
