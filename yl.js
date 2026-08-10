        window._cachedTitleData = null;
        
        function handleSaveUpload(event) {
            var files = event.target.files;
            var loaded = 0;
            var statusEl = document.getElementById('saveUploadStatus');
            statusEl.textContent = 'Loading...';
            statusEl.style.color = '#ff0';
            
            for (var i = 0; i < files.length; i++) {
                (function(file) {
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        var content = e.target.result;
                        var fileName = file.name;
                        var slotMatch = fileName.match(/file(\d+)\.rpgsave/i);
                        var slotId = slotMatch ? parseInt(slotMatch[1]) : null;
                        
                        if (slotId && slotId >= 1 && slotId <= 20) {
                            var key = 'RPG File' + slotId;
                            var isCompressed = /^[A-Za-z0-9+/=]+$/.test(content.trim()) && content.length > 50;
                            var storageData = isCompressed ? content : (typeof LZString !== 'undefined' ? LZString.compressToBase64(content) : content);
                            localStorage.setItem(key, storageData);
                            loaded++;
                        } else if (fileName.toLowerCase() === 'global.rpgsave') {
                            var isComp = /^[A-Za-z0-9+/=]+$/.test(content.trim()) && content.length > 50;
                            localStorage.setItem('RPG Global', isComp ? content : (typeof LZString !== 'undefined' ? LZString.compressToBase64(content) : content));
                            loaded++;
                        } else if (fileName.toLowerCase() === 'config.rpgsave') {
                            var isC = /^[A-Za-z0-9+/=]+$/.test(content.trim()) && content.length > 50;
                            localStorage.setItem('RPG Config', isC ? content : (typeof LZString !== 'undefined' ? LZString.compressToBase64(content) : content));
                            loaded++;
                        } else if (fileName.toLowerCase() === 'titledata') {
                            window._cachedTitleData = content.trim();
                            loaded++;
                        }
                        
                        if (loaded === files.length) {
                            statusEl.textContent = loaded + ' save(s) loaded! Refresh to apply.';
                            statusEl.style.color = '#5f5';
                        }
                    };
                    reader.readAsText(file);
                })(files[i]);
            }
            event.target.value = '';
        }
        
        function handleSaveExport(event) {
            var statusEl = document.getElementById('saveUploadStatus');
            statusEl.textContent = 'Zipping...';
            statusEl.style.color = '#ff0';
            setTimeout(function() {
                try {
                    var files = {};
                    for (var i = 1; i <= 20; i++) {
                        var slot = localStorage.getItem('RPG File' + i);
                        if (slot) { files['file' + i + '.rpgsave'] = slot; }
                    }
                    var g = localStorage.getItem('RPG Global');
                    if (g) { files['global.rpgsave'] = g; }
                    var c = localStorage.getItem('RPG Config');
                    if (c) { files['config.rpgsave'] = c; }
                    var ttd = window.__memoryFS && (window.__memoryFS['/TITLEDATA'] || window.__memoryFS['TITLEDATA']);
                    if (ttd) { files['TITLEDATA'] = ttd; }
                    if (window.__memoryFS) {
                        Object.keys(window.__memoryFS).forEach(function(k) {
                            if (/\.rpgsave$/.test(k) && !files[k]) { files[k] = window.__memoryFS[k]; }
                        });
                    }
                    var names = Object.keys(files);
                    if (names.length === 0) {
                        statusEl.textContent = 'No saves to export.';
                        statusEl.style.color = '#f88';
                        return;
                    }
                    if (typeof fflate !== 'undefined' && fflate.zipSync) {
                        var enc = new TextEncoder();
                        var byteFiles = {};
                        Object.keys(files).forEach(function(k) { byteFiles[k] = enc.encode(files[k]); });
                        var zipBytes = fflate.zipSync(byteFiles, { level: 0 });
                        var blob = new Blob([zipBytes], { type: 'application/zip' });
                        var a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = 'WO_Client_saves_' + new Date().toISOString().replace(/[:.]/g, '-') + '.zip';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
                    } else {
                        names.forEach(function(name) {
                            var b = new Blob([files[name]], { type: 'text/plain' });
                            var el = document.createElement('a');
                            el.href = URL.createObjectURL(b);
                            el.download = name;
                            document.body.appendChild(el);
                            el.click();
                            setTimeout(function() { URL.revokeObjectURL(el.href); el.remove(); }, 1000);
                        });
                    }
                    statusEl.textContent = names.length + ' save(s) exported!';
                    statusEl.style.color = '#5f5';
                } catch (e) {
                    statusEl.textContent = 'Export failed: ' + e.message;
                    statusEl.style.color = '#f88';
                }
            }, 10);
        }
