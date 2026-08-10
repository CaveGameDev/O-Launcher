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
