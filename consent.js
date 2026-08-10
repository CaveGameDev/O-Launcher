        // Lock the consent page so no part of the boot (or accidental taps)
        // reveals the loader until the player explicitly agrees to the download.
        document.getElementById('dataConfirm').style.display = 'flex';
        document.getElementById('dataConfirmBegin').addEventListener('click', function() {
            document.getElementById('dataConfirm').style.display = 'none';
            if (window.__resumeBoot) window.__resumeBoot();
        });
        document.getElementById('dataConfirmCancel').addEventListener('click', function() {
            try { window.close(); } catch (e) {}
            if (window.nw && window.nw.App) window.nw.App.quit();
            document.getElementById('dataConfirm').style.display = 'none';
        });
