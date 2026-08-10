(function() {
    'use strict';

    var failures = [];
    var rendered = false;

    function report(kind, detail) {
        var key = kind + '|' + detail;
        for (var i = 0; i < failures.length; i++) {
            if (failures[i].key === key) return; // dedupe repeated identical failures
        }
        failures.push({ key: key, kind: kind, detail: detail });
        console.error('[BootCheck] ' + kind + ': ' + detail);
    }

    function httpStatusFor(url) {
        try {
            var entries = performance.getEntriesByType('resource');
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                if (entry.name === url || entry.name.split('?')[0] === url) {
                    if (typeof entry.responseStatus === 'number' && entry.responseStatus > 0) {
                        return entry.responseStatus;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    window.addEventListener('error', function(event) {
        var target = event && event.target;
        if (!target || target.tagName !== 'SCRIPT' || !target.src || event.message) return;
        var status = httpStatusFor(target.src);
        report('load', 'Failed to load script: ' + target.src +
            (status ? ' (HTTP ' + status + ')' : ' (check the Network tab for the status)'));
    }, true);

    window.addEventListener('error', function(event) {
        if (!event || !event.message) return;
        report('error', (event.message || 'unknown error') +
            (event.filename ? ' at ' + event.filename + ':' + event.lineno : ''));
    });

    window.addEventListener('unhandledrejection', function(event) {
        var reason = event && event.reason;
        var text = reason && reason.message ? reason.message : String(reason || 'unknown rejection');
        report('rejection', text);
    });

    function checkGlobals() {
        var required = [
            { name: 'fflate',     ok: typeof window.fflate !== 'undefined' && typeof window.fflate.unzip === 'function' },
            { name: 'LZString',   ok: typeof window.LZString !== 'undefined' },
            { name: 'PIXI',       ok: typeof window.PIXI !== 'undefined' },
            { name: 'ZipLoader',  ok: typeof window.ZipLoader !== 'undefined' }
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (!required[i].ok) missing.push(required[i].name);
        }
        if (missing.length) {
            report('missing', 'Required library failed to load: ' + missing.join(', ') +
                '. The game cannot boot without it — look for 404s in the Network tab.');
        }
    }

    function showOverlay() {
        if (rendered || failures.length === 0) return;
        rendered = true;

        var el = document.createElement('div');
        el.id = 'bootCheckOverlay';
        el.style.cssText = 'display:flex;flex-direction:column;justify-content:center;align-items:center;' +
            'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.97);' +
            'z-index:2147483647;font-family:GameFont,monospace;color:#fff;text-align:center;' +
            'padding:24px;box-sizing:border-box;';

        var title = document.createElement('div');
        title.textContent = 'BOOT FAILED';
        title.style.cssText = 'font-size:20px;letter-spacing:4px;color:#f88;margin-bottom:18px;';

        var list = document.createElement('div');
        list.style.cssText = 'max-width:520px;font-size:12px;line-height:1.7;color:#ddd;margin-bottom:8px;';
        for (var i = 0; i < failures.length; i++) {
            var line = document.createElement('div');
            line.textContent = '• ' + failures[i].detail;
            line.style.cssText = 'margin-bottom:6px;word-break:break-word;';
            list.appendChild(line);
        }

        var hint = document.createElement('div');
        hint.textContent = 'Open the browser console (F12) and Network tab for details.';
        hint.style.cssText = 'font-size:11px;color:#888;margin-bottom:22px;';

        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'RELOAD';
        button.style.cssText = 'padding:11px 34px;border:1px solid rgba(210,190,255,0.8);border-radius:5px;' +
            'background:linear-gradient(180deg,#8d78e8,#5e4ab4);color:#fff;font:inherit;font-size:13px;' +
            'letter-spacing:2px;cursor:pointer;';
        button.addEventListener('click', function() { location.reload(); });

        el.appendChild(title);
        el.appendChild(list);
        el.appendChild(hint);
        el.appendChild(button);
        document.body.appendChild(el);
    }

    function onDomReady() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', onDomReady);
            return;
        }
        checkGlobals();
        showOverlay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
        onDomReady();
    }
})();
