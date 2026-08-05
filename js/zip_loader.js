//=============================================================================
// ZipLoader - fflate in-page VFS
//=============================================================================
// data.zip, maps.zip, image parts, and audio parts are extracted before the
// Launch button appears. The extracted archives live in memory for the current
// page; RPG save persistence remains in StorageManager.
//
// v2 - fast boot changes:
//  * Part downloads run with bounded concurrency (previously one at a time),
//    and the four archives (data, maps, images, audio) download in parallel.
//  * After the first successful load each combined archive is persisted to
//    IndexedDB as a Blob. Later boots verify against manifest.json (one small
//    request) and read straight from disk, skipping the ~1.5 GB download.
//    If no manifest.json is deployed, a HEAD request per part is used instead.
//  * Asset fetches no longer use cache:'no-store', so the browser HTTP cache
//    can also participate when the server sends cache headers.
//  * An optional account id (?account=, localStorage 'wo.accountId', or
//    base.ini accountId) is recorded with the cache metadata so a server-side
//    warm-cache layer can key state per account instead of per machine.

(function() {
    'use strict';

    var fflate = window.fflate;
    if (!fflate || typeof fflate.unzip !== 'function') {
        throw new Error('ZipLoader requires fflate.js to be loaded first.');
    }

    var _vfs = Object.create(null);
    // ZIP entries preserve their original case, while RPG Maker's old NW.js
    // filesystem was commonly case-insensitive. Keep a second lookup table so
    // saves/plugins requesting AMB_FOREST.ogg can still resolve the archived
    // audio entry AMB_forest.ogg (and leaf.png vs Leaf.png).
    var _vfsInsensitive = Object.create(null);
    var _blobUrls = Object.create(null);
    var _archivePromises = Object.create(null);
    var _configPromise = null;
    var _xhrQueue = [];
    var _ready = false;
    var _launched = false;
    var _initPromise = null;
    var _launchPromise = null;
    var _resolveLaunch = null;
    var _error = null;
    var _origFetch = window.fetch ? window.fetch.bind(window) : null;
    var _origOpen = XMLHttpRequest.prototype.open;
    var _origSend = XMLHttpRequest.prototype.send;
    var _bitmapHookPrototype = null;
    var _graphicsHookTarget = null;

    // ---- config / account ---------------------------------------------------
    var CONCURRENCY = 6;
    var _cacheEnabled = true;
    var _config = { baseUrl: '', useRemoteParts: false, accountId: '', concurrency: '6', cacheEnabled: true };
    var _accountId = 'default';
    var _manifest; // undefined = not loaded yet, null = unavailable, object = parsed

    function progress(percent, label) {
        var fill = document.getElementById('zipProgressFill');
        var text = document.getElementById('zipProgressLabel');
        if (fill) fill.style.width = Math.max(0, Math.min(100, Math.round(percent))) + '%';
        if (text) text.textContent = label || '';
    }

    function showProgress() {
        var bar = document.getElementById('zipProgress');
        if (bar) bar.style.display = 'flex';
    }

    function hideProgress() {
        var bar = document.getElementById('zipProgress');
        if (bar) bar.style.display = 'none';
    }

    function showLaunchButton() {
        var button = document.getElementById('zipLaunchButton');
        if (!button || button.__zipLaunchBound) return;
        button.__zipLaunchBound = true;
        button.style.display = 'block';
        button.disabled = false;
        button.addEventListener('click', function() {
            if (!_ready || _launched) return;
            _launched = true;
            button.disabled = true;
            button.style.display = 'none';
            hideProgress();
            if (_resolveLaunch) {
                var resolve = _resolveLaunch;
                _resolveLaunch = null;
                resolve(true);
            }
        });
    }

    function waitForLaunch() {
        if (_launched) return Promise.resolve(true);
        if (!_launchPromise) {
            _launchPromise = new Promise(function(resolve) {
                _resolveLaunch = resolve;
            });
        }
        if (_ready) showLaunchButton();
        return _launchPromise;
    }

    function normalizePath(url) {
        var value = String(url || '').replace(/\\/g, '/');
        try {
            var parsed = new URL(value, window.location.href);
            var root = new URL('./', window.location.href).pathname;
            if (parsed.pathname.indexOf(root) === 0) {
                value = parsed.pathname.slice(root.length);
            } else {
                value = parsed.pathname.replace(/^\/+/, '');
            }
        } catch (e) {
            value = value.replace(/^https?:\/\/[^/]+/i, '');
            value = value.replace(/^\.\//, '').replace(/^\/+/, '');
        }
        return value.split('?')[0].split('#')[0].replace(/^\/+/, '');
    }

    function isVfsPath(url) {
        var path = normalizePath(url);
        return path.indexOf('data/') === 0 ||
            path.indexOf('maps/') === 0 ||
            path.indexOf('img/') === 0 ||
            path.indexOf('audio/') === 0;
    }

    function mimeType(path) {
        var value = path.toLowerCase();
        if (value.endsWith('.png')) return 'image/png';
        if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
        if (value.endsWith('.ogg')) return 'audio/ogg';
        if (value.endsWith('.m4a')) return 'audio/mp4';
        if (value.endsWith('.json')) return 'application/json';
        if (value.endsWith('.yaml')) return 'text/yaml';
        if (value.endsWith('.webm')) return 'video/webm';
        return 'application/octet-stream';
    }

    function updateByteProgress(done, total, start, span, label) {
        var fraction = total > 0 ? Math.min(1, done / total) : 0;
        progress(start + fraction * span, label + ' (' +
            Math.round(done / 1048576 * 10) / 10 + ' MB)');
    }

    // NOTE: no cache:'no-store' here. When the server sends cache headers the
    // browser HTTP cache can serve parts directly; correctness of the asset
    // version is handled by manifest.json (or per-part HEAD verification).
    function fetchBytes(url, start, span, label) {
        if (!_origFetch) return Promise.reject(new Error('Fetch is unavailable.'));
        return _origFetch(url).then(function(response) {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
            var total = Number(response.headers.get('content-length')) || 0;
            if (!response.body || !response.body.getReader) {
                return response.arrayBuffer().then(function(buffer) {
                    updateByteProgress(buffer.byteLength, total || buffer.byteLength, start, span, label);
                    return new Uint8Array(buffer);
                });
            }
            var reader = response.body.getReader();
            var chunks = [];
            var loaded = 0;
            function read() {
                return reader.read().then(function(part) {
                    if (part.done) {
                        var result = new Uint8Array(loaded);
                        var offset = 0;
                        chunks.forEach(function(chunk) {
                            result.set(chunk, offset);
                            offset += chunk.length;
                        });
                        updateByteProgress(loaded, total || loaded, start, span, label);
                        return result;
                    }
                    chunks.push(part.value);
                    loaded += part.value.byteLength;
                    updateByteProgress(loaded, total, start, span, label);
                    return read();
                });
            }
            return read();
        });
    }

    // Bounded-concurrency fetch queue. Resolves with results in request order.
    function fetchQueue(items) {
        var results = new Array(items.length);
        var index = 0;
        var active = 0;
        return new Promise(function(resolve, reject) {
            function pump() {
                while (active < CONCURRENCY && index < items.length) {
                    (function(i) {
                        active++;
                        fetchBytes(items[i].url, items[i].start, items[i].span, items[i].label).then(function(bytes) {
                            results[i] = bytes;
                            active--;
                            if (index < items.length) pump();
                            else if (active === 0) resolve(results);
                        }, function(err) {
                            active--;
                            reject(err);
                        });
                    })(index++);
                }
            }
            pump();
        });
    }

    // ---- base.ini -----------------------------------------------------------
    function parseBaseIni(text) {
        var config = { baseUrl: '', useRemoteParts: false, accountId: '', concurrency: '6', cacheEnabled: true };
        String(text || '').split(/\r?\n/).forEach(function(line) {
            line = line.trim();
            if (!line || line[0] === ';' || line[0] === '#') return;
            var separator = line.indexOf('=');
            if (separator < 0) return;
            var key = line.slice(0, separator).trim();
            var value = line.slice(separator + 1).trim();
            if (key === 'baseUrl') config.baseUrl = value;
            if (key === 'useRemoteParts') config.useRemoteParts = value.toLowerCase() === 'true';
            if (key === 'accountId') config.accountId = value;
            if (key === 'concurrency') config.concurrency = value;
            if (key === 'cacheEnabled') config.cacheEnabled = value.toLowerCase() !== 'false';
        });
        return config;
    }

    function loadConfig() {
        if (_configPromise) return _configPromise;
        _configPromise = _origFetch('base.ini')
            .then(function(response) {
                if (!response.ok) return '';
                return response.text();
            })
            .then(function(text) { return parseBaseIni(text); })
            .catch(function() { return { baseUrl: '', useRemoteParts: false, accountId: '', concurrency: '6', cacheEnabled: true }; });
        return _configPromise;
    }

    function applyConfig(config) {
        _config = config || _config;
        var c = parseInt(_config.concurrency, 10);
        if (c >= 1 && c <= 16) CONCURRENCY = c;
        _cacheEnabled = _config.cacheEnabled !== false;
    }

    function resolveAccountId() {
        var id = null;
        try {
            var params = new URLSearchParams(window.location.search);
            id = params.get('account');
        } catch (e) {}
        if (!id) {
            try { id = window.localStorage.getItem('wo.accountId'); } catch (e) {}
        }
        if (!id) id = _config.accountId;
        return id || 'default';
    }

    // ---- IndexedDB archive cache ---------------------------------------------
    var IDB_NAME = 'WO_Assets';
    var _idbPromise = null;

    function idbOpen() {
        if (typeof indexedDB === 'undefined') {
            return Promise.reject(new Error('indexedDB unavailable'));
        }
        return new Promise(function(resolve, reject) {
            var req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('archives')) {
                    db.createObjectStore('archives', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    }

    function idb() {
        if (!_idbPromise) _idbPromise = idbOpen();
        return _idbPromise;
    }

    function idbGet(store, key) {
        return idb().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    var tx = db.transaction(store, 'readonly');
                    var req = tx.objectStore(store).get(key);
                    req.onsuccess = function() { resolve(req.result ? req.result.value : null); };
                    req.onerror = function() { resolve(null); };
                } catch (e) { resolve(null); }
            });
        }).catch(function() { return null; });
    }

    function idbPut(store, key, value) {
        return idb().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    var tx = db.transaction(store, 'readwrite');
                    tx.objectStore(store).put({ key: key, value: value });
                    tx.oncomplete = function() { resolve(true); };
                    tx.onerror = function() { resolve(false); };
                    tx.onabort = function() { resolve(false); };
                } catch (e) { resolve(false); }
            });
        }).catch(function() { return false; });
    }

    function cacheGetArchive(name) {
        return idbGet('archives', 'archive:' + name).then(function(blob) {
            if (!blob) return null;
            if (typeof blob.arrayBuffer === 'function') {
                return blob.arrayBuffer().then(function(ab) { return new Uint8Array(ab); });
            }
            if (blob instanceof ArrayBuffer) return new Uint8Array(blob);
            if (blob && blob.buffer) return new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
            return null;
        });
    }

    // Store as a Blob so Chrome/Edge can spill large archives to disk.
    function cachePutArchive(name, bytes) {
        try {
            var blob = new Blob([bytes]);
            return idbPut('archives', 'archive:' + name, blob);
        } catch (e) {
            return Promise.resolve(false);
        }
    }

    function cacheGetMeta(name) {
        return idbGet('meta', 'meta:' + name);
    }

    function cachePutMeta(name, meta) {
        return idbPut('meta', 'meta:' + name, meta);
    }

    // ---- archive metadata (manifest first, HEAD fallback) ---------------------
    function loadManifest() {
        if (_manifest !== undefined) return Promise.resolve(_manifest);
        return _origFetch('manifest.json').then(function(response) {
            if (!response.ok) { _manifest = null; return null; }
            return response.json().then(function(json) {
                _manifest = json || null;
                return _manifest;
            }, function() { _manifest = null; return null; });
        }).catch(function() { _manifest = null; return null; });
    }

    function archiveBaseUrl(desc) {
        var base = _config.baseUrl.replace(/\/+$/, '');
        if (!_config.useRemoteParts || !desc.folder) return base;
        return base + '/' + desc.folder;
    }

    function headFetch(url) {
        return _origFetch(url, { method: 'HEAD' }).then(function(response) {
            return { size: Number(response.headers.get('content-length')) || 0 };
        });
    }

    function headQueue(urls) {
        var results = new Array(urls.length);
        var index = 0;
        var active = 0;
        return new Promise(function(resolve, reject) {
            function pump() {
                while (active < CONCURRENCY && index < urls.length) {
                    (function(i) {
                        active++;
                        headFetch(urls[i]).then(function(info) {
                            results[i] = info;
                            active--;
                            if (index < urls.length) pump();
                            else if (active === 0) resolve(results);
                        }, function(err) {
                            active--;
                            reject(err);
                        });
                    })(index++);
                }
            }
            pump();
        });
    }

    function headMeta(desc) {
        var base = archiveBaseUrl(desc);
        var folder = desc.folder ? base + '/' + desc.folder : base;
        var urls = [];
        for (var i = 0; i < desc.count; i++) {
            var suffix = desc.pad ? String(i + 1).padStart(desc.pad, '0') : '';
            var fileName = desc.name + (desc.pad ? '.part' + suffix : '');
            urls.push(folder ? folder + '/' + fileName : fileName);
        }
        return headQueue(urls).then(function(infos) {
            var parts = infos.map(function(info, idx) {
                return { name: urls[idx].split('/').pop(), size: info.size };
            });
            var totalSize = 0;
            parts.forEach(function(p) { totalSize += p.size; });
            return {
                version: 'head:' + parts.map(function(p) { return p.name + ':' + p.size; }).join(','),
                totalSize: totalSize,
                parts: parts
            };
        }).catch(function() { return null; });
    }

    // Returns the expected metadata for an archive, or null if it cannot be
    // determined (in which case the archive is simply downloaded uncached).
    function ensureMeta(desc) {
        return loadManifest().then(function(manifest) {
            if (manifest && manifest.archives && manifest.archives[desc.name]) {
                var m = manifest.archives[desc.name];
                return {
                    version: String(manifest.version || '1'),
                    totalSize: m.totalSize || 0,
                    parts: m.parts || []
                };
            }
            return headMeta(desc);
        });
    }

    // Prefer manifest-declared part counts/padding over the local defaults so
    // remote deployments can re-split archives without touching this file.
    function descWithManifest(desc) {
        if (_manifest && _manifest.archives && _manifest.archives[desc.name]) {
            var m = _manifest.archives[desc.name];
            return {
                name: desc.name,
                folder: typeof m.folder === 'string' ? m.folder : desc.folder,
                count: m.count || desc.count,
                pad: typeof m.pad === 'number' ? m.pad : desc.pad
            };
        }
        return desc;
    }

    // ---- VFS population -------------------------------------------------------
    function addZipFiles(bytes, label) {
        return new Promise(function(resolve, reject) {
            // fflate's async unzip keeps extraction off the synchronous boot
            // call stack while still completing before the corresponding VFS
            // request is released.
            fflate.unzip(bytes, function(error, files) {
                if (error) {
                    reject(new Error('Could not unzip ' + label + ': ' + error.message));
                    return;
                }
                var count = 0;
                Object.keys(files).forEach(function(name) {
                    if (!name || /\/$/.test(name)) return;
                    var normalized = normalizePath(name);
                    var fileBytes = files[name];
                    _vfs[normalized] = fileBytes;
                    // Use the same decoded/case-folded key as bytesFor() so
                    // encoded names and normal names resolve identically.
                    _vfsInsensitive[lookupPath(normalized).insensitive] = normalized;
                    count++;
                });
                console.log('ZipLoader: extracted ' + count + ' files from ' + label);
                resolve(count);
            });
        });
    }

    function lookupPath(path) {
        var normalized = normalizePath(path);
        var decoded = normalized;
        try {
            decoded = decodeURIComponent(normalized);
        } catch (e) {
            // Keep the original normalized path if a malformed escape is used.
        }
        return {
            exact: normalized,
            insensitive: decoded.toLowerCase()
        };
    }

    function bytesFor(path) {
        var lookup = lookupPath(path);
        var exact = _vfs[lookup.exact];
        if (exact) return exact;
        var archivedPath = _vfsInsensitive[lookup.insensitive];
        return archivedPath ? (_vfs[archivedPath] || null) : null;
    }

    function textFor(path) {
        var bytes = bytesFor(path);
        if (!bytes) return null;
        return new TextDecoder('utf-8').decode(bytes);
    }

    function blobUrlFor(path) {
        path = normalizePath(path);
        if (_blobUrls[path]) return Promise.resolve(_blobUrls[path]);
        return ensureArchiveForPath(path).then(function() {
            var bytes = bytesFor(path);
            if (!bytes) throw new Error('VFS file not found: ' + path);
            var blob = new Blob([bytes], { type: mimeType(path) });
            _blobUrls[path] = URL.createObjectURL(blob);
            return _blobUrls[path];
        });
    }

    // ---- download / cache orchestration --------------------------------------
    function downloadArchive(desc, start, span, label, expected) {
        var base = archiveBaseUrl(desc);
        var folder = desc.folder ? base + '/' + desc.folder : base;
        var items = [];
        for (var i = 0; i < desc.count; i++) {
            var suffix = desc.pad ? String(i + 1).padStart(desc.pad, '0') : '';
            var fileName = desc.name + (desc.pad ? '.part' + suffix : '');
            items.push({
                url: folder ? folder + '/' + fileName : fileName,
                start: start + span * (i / desc.count),
                span: span / desc.count,
                label: label + ' part ' + (i + 1) + '/' + desc.count
            });
        }
        var t0 = performance.now();
        return fetchQueue(items).then(function(pieces) {
            // Sanity-check downloaded sizes against the expected metadata. A
            // mismatch means the assets changed: bump manifest.json's version.
            if (expected && expected.parts && expected.parts.length === pieces.length) {
                for (var j = 0; j < pieces.length; j++) {
                    if (expected.parts[j].size && pieces[j].length !== expected.parts[j].size) {
                        throw new Error(label + ' part ' + (j + 1) + ' size mismatch (' +
                            pieces[j].length + ' != ' + expected.parts[j].size +
                            '); assets changed? bump manifest.json version.');
                    }
                }
            }
            var total = 0;
            pieces.forEach(function(p) { total += p.length; });
            var combined = new Uint8Array(total);
            var offset = 0;
            pieces.forEach(function(p) { combined.set(p, offset); offset += p.length; });
            console.log('ZipLoader: [' + label + '] downloaded ' + (total / 1048576).toFixed(1) +
                ' MB in ' + (performance.now() - t0).toFixed(0) + ' ms');
            return addZipFiles(combined, label).then(function() {
                progress(start + span, label + ' ready');
                if (_cacheEnabled) {
                    cachePutArchive(desc.name, combined);
                    if (expected) cachePutMeta(desc.name, expected);
                }
                return true;
            });
        });
    }

    function loadArchiveCached(desc, start, span, label) {
        return ensureMeta(desc).then(function(expected) {
            if (!_cacheEnabled || !expected) {
                return downloadArchive(desc, start, span, label, expected);
            }
            var t0 = performance.now();
            return cacheGetMeta(desc.name).then(function(cached) {
                if (cached && cached.version === expected.version &&
                    cached.totalSize === expected.totalSize) {
                    return cacheGetArchive(desc.name).then(function(bytes) {
                        if (bytes) {
                            console.log('ZipLoader: [' + label + '] cache hit (' +
                                (bytes.length / 1048576).toFixed(1) + ' MB, v' + expected.version +
                                ', read in ' + (performance.now() - t0).toFixed(0) + ' ms)');
                            progress(start + span * 0.9, label + ' from cache...');
                            return addZipFiles(bytes, label + ' (cache)').then(function() {
                                progress(start + span, label + ' ready (cache)');
                                return true;
                            });
                        }
                        return downloadArchive(desc, start, span, label, expected);
                    });
                }
                return downloadArchive(desc, start, span, label, expected);
            });
        });
    }

    // All VFS paths (data/, maps/, img/, audio/) are fully satisfied once init()
    // completes, because init loads every archive. On-demand callers simply wait
    // for the (deduplicated) init promise.
    function ensureArchiveForPath(path) {
        return init();
    }

    // ---- network interception --------------------------------------------------
    function replayRequest(item) {
        return blobUrlFor(item.path).then(function(blobUrl) {
            var xhr = item.xhr;
            var async = item.async === false ? true : item.async;
            _origOpen.call(xhr, item.method, blobUrl, async);
            try {
                if (item.responseType) xhr.responseType = item.responseType;
            } catch (e) {}
            return _origSend.call(xhr, item.body);
        });
    }

    function drainXhrQueue() {
        var queue = _xhrQueue.splice(0, _xhrQueue.length);
        queue.forEach(function(item) {
            replayRequest(item).catch(function(error) {
                console.error('ZipLoader: failed to serve ' + item.path, error);
                try { item.xhr.dispatchEvent(new Event('error')); } catch (e) {}
            });
        });
    }

    // Do not let database/plugin XHRs receive empty or network responses while
    // the two boot-critical archives are still being extracted.
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        this.__zipMethod = method;
        this.__zipUrl = url;
        this.__zipAsync = async;
        return _origOpen.call(this, method, url, async, user, password);
    };

    XMLHttpRequest.prototype.send = function(body) {
        var url = this.__zipUrl;
        if (isVfsPath(url)) {
            var path = normalizePath(url);

            // Native XMLHttpRequest status/responseText/readyState fields are
            // read-only, so a browser VFS cannot safely impersonate a completed
            // synchronous XHR. All synchronous game data consumers use the
            // ZipLoader.getText() bridge; leave any unknown sync request alone
            // rather than writing illegal native properties.
            if (this.__zipAsync === false) {
                console.warn('ZipLoader: synchronous VFS XHR requires ZipLoader.getText(): ' + path);
                return;
            }

            var item = {
                xhr: this,
                body: body,
                path: path,
                method: this.__zipMethod,
                async: true,
                responseType: this.responseType
            };
            _xhrQueue.push(item);
            // Hold every VFS request—not only database/maps—until all four
            // archives have finished extraction. This prevents preloaders from
            // racing the image/audio phases or observing a partial VFS.
            if (_ready) drainXhrQueue();
            return;
        }
        return _origSend.call(this, body);
    };

    if (_origFetch) {
        window.fetch = function(input, options) {
            var url = typeof input === 'string' ? input : input && input.url;
            if (!isVfsPath(url)) return _origFetch(input, options);
            var path = normalizePath(url);
            return ensureArchiveForPath(path).then(function() {
                var bytes = bytesFor(path);
                if (!bytes) return new Response('', { status: 404 });
                return new Response(bytes, {
                    status: 200,
                    headers: { 'Content-Type': mimeType(path), 'Cache-Control': 'no-store' }
                });
            });
        };
    }

    // Plugins in this project replace Bitmap and Graphics with subclasses after
    // zip_loader.js has loaded. Install the VFS hooks on the current prototypes
    // and expose refreshHooks() so the hooks are reattached after plugins finish.
    function installBitmapHook() {
        if (typeof Bitmap === 'undefined' || !Bitmap.prototype ||
            typeof Bitmap.prototype._requestImage !== 'function' ||
            _bitmapHookPrototype === Bitmap.prototype) return;
        var prototype = Bitmap.prototype;
        var originalRequest = prototype._requestImage;
        prototype._requestImage = function(url) {
            var self = this;
            var path = normalizePath(url);
            if (path.indexOf('img/') !== 0) {
                return originalRequest.call(this, url);
            }
            // Bitmap.decode() can run before the asynchronous archive/blob
            // promise settles, so _image must exist immediately.
            if (!this._image) this._image = new Image();
            this._url = url;
            this._loadingState = 'requesting';
            blobUrlFor(path).then(function(blobUrl) {
                var originalUrl = self._url;
                originalRequest.call(self, blobUrl);
                self._url = originalUrl;
            }).catch(function(error) {
                console.error('ZipLoader: image load failed', url, error);
                self._loadingState = 'error';
            });
        };
        _bitmapHookPrototype = prototype;
    }

    function installGraphicsHook() {
        if (typeof Graphics === 'undefined' ||
            typeof Graphics.setLoadingImage !== 'function' ||
            _graphicsHookTarget === Graphics) return;
        var target = Graphics;
        var originalSetLoadingImage = target.setLoadingImage;
        target.setLoadingImage = function(src) {
            if (normalizePath(src).indexOf('img/') === 0) {
                blobUrlFor(src).then(function(blobUrl) {
                    originalSetLoadingImage.call(target, blobUrl);
                }).catch(function(error) {
                    console.error('ZipLoader: loading image failed', src, error);
                });
            } else {
                originalSetLoadingImage.call(target, src);
            }
        };
        _graphicsHookTarget = target;
    }

    function installHooks() {
        installBitmapHook();
        installGraphicsHook();
    }

    installHooks();

    // ---- boot -----------------------------------------------------------------
    function init() {
        if (_initPromise) return _initPromise;
        _initPromise = (async function() {
            var t0 = performance.now();
            showProgress();
            progress(0, 'Reading base.ini');
            applyConfig(await loadConfig());
            _accountId = resolveAccountId();
            await loadManifest();
            progress(1, 'Account: ' + _accountId);

            var jobs = [
                loadArchiveCached(descWithManifest({ name: 'data.zip', folder: '', count: 1, pad: 0 }), 2, 8, 'data.zip'),
                loadArchiveCached(descWithManifest({ name: 'maps.zip', folder: '', count: 1, pad: 0 }), 10, 8, 'maps.zip'),
                loadArchiveCached(descWithManifest({ name: 'img_repk.zip', folder: 'img_pack', count: 55, pad: 2 }), 18, 38, 'images'),
                loadArchiveCached(descWithManifest({ name: 'audio_repk.zip', folder: 'aud_pack', count: 111, pad: 3 }), 56, 44, 'audio')
            ];
            await Promise.all(jobs);

            _ready = true;
            progress(100, 'All assets ready — press LAUNCH');
            drainXhrQueue();
            showLaunchButton();
            console.log('ZipLoader: data, maps, images, and audio ready (' + Object.keys(_vfs).length +
                ' files) for account "' + _accountId + '" in ' +
                ((performance.now() - t0) / 1000).toFixed(1) + ' s; press Launch');
            return true;
        })().catch(function(error) {
            _error = error;
            progress(0, 'Zip loading failed: ' + error.message);
            console.error('ZipLoader:', error);
            throw error;
        });
        return _initPromise;
    }

    window.ZipLoader = {
        init: init,
        ready: function() { return _ready ? Promise.resolve(true) : init(); },
        isReady: function() { return _ready; },
        waitForLaunch: waitForLaunch,
        isLaunched: function() { return _launched; },
        getError: function() { return _error; },
        getFile: function(path) { return bytesFor(path); },
        getText: function(path) { return textFor(path); },
        getBlobUrl: function(path) { return blobUrlFor(path); },
        refreshHooks: installHooks,
        // Account plumbing for the warm-cache layer: call setAccount() from a
        // login flow before ZipLoader.init() (or pass ?account= in the URL).
        setAccount: function(id) {
            if (!id) return _accountId;
            try { window.localStorage.setItem('wo.accountId', String(id)); } catch (e) {}
            _accountId = String(id);
            return _accountId;
        },
        accountId: function() { return _accountId; },
        setCacheEnabled: function(flag) { _cacheEnabled = !!flag; return _cacheEnabled; }
    };
})();
