(function() {
    'use strict';

    var overlay = document.getElementById('dataConfirm');

    function showConsent() {
        overlay.style.display = 'flex';
    }

    function resumeBoot() {
        overlay.style.display = 'none';
        if (window.__resumeBoot) window.__resumeBoot();
    }

    document.getElementById('dataConfirmBegin').addEventListener('click', resumeBoot);
    document.getElementById('dataConfirmCancel').addEventListener('click', function() {
        try { window.close(); } catch (e) {}
        if (window.nw && window.nw.App) window.nw.App.quit();
        overlay.style.display = 'none';
    });

    if (window.ZipLoader && typeof window.ZipLoader.hasCachedArchives === 'function') {
        window.ZipLoader.hasCachedArchives().then(function(cached) {
            if (cached) {
                console.log('[wc] full asset cache found — skipping data consent');
                resumeBoot();
            } else {
                showConsent();
            }
        }).catch(function(error) {
            console.warn('[wc] cache check failed; showing data consent', error);
            showConsent();
        });
    } else {
        showConsent();
    }
})();
