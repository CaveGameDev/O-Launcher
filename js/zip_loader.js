//=============================================================================
// ZipLoader - fflate in-page VFS
//=============================================================================
// data.zip, maps.zip, image parts, and audio parts are extracted before the
// Launch button appears. Everything lives in memory for the current page only:
// no Service Worker, Cache API, archive cache, or VFS
// localStorage is used. RPG save persistence remains in StorageManager.

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

    function fetchBytes(url, start, span, label) {
        if (!_origFetch) return Promise.reject(new Error('Fetch is unavailable.'));
        return _origFetch(url, { cache: 'no-store' }).then(function(response) {
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

    function parseBaseIni(text) {
        var config = { baseUrl: '', useRemoteParts: false };
        String(text || '').split(/\r?\n/).forEach(function(line) {
            line = line.trim();
            if (!line || line[0] === ';' || line[0] === '#') return;
            var separator = line.indexOf('=');
            if (separator < 0) return;
            var key = line.slice(0, separator).trim();
            var value = line.slice(separator + 1).trim();
            if (key === 'baseUrl') config.baseUrl = value;
            if (key === 'useRemoteParts') config.useRemoteParts = value.toLowerCase() === 'true';
        });
        return config;
    }

    function loadConfig() {
        if (_configPromise) return _configPromise;
        _configPromise = fetchBytes('base.ini', 0, 0, 'Reading base.ini')
            .then(function(bytes) { return parseBaseIni(new TextDecoder().decode(bytes)); })
            .catch(function() { return { baseUrl: '', useRemoteParts: false }; });
        return _configPromise;
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
                    var bytes = files[name];
                    _vfs[normalized] = bytes;
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

    function loadArchive(key, url, start, span, label) {
        if (_archivePromises[key]) return _archivePromises[key];
        _archivePromises[key] = fetchBytes(url, start, span, 'Downloading ' + label)
            .then(function(bytes) {
                progress(start + span * 0.9, 'Unzipping ' + label + '...');
                return addZipFiles(bytes, label).then(function() {
                    progress(start + span, label + ' ready');
                    return true;
                });
            }).catch(function(error) {
                delete _archivePromises[key];
                throw error;
            });
        return _archivePromises[key];
    }

    function joinParts(folder, archiveName, count, pad, start, span, label) {
        var key = 'parts:' + folder + '/' + archiveName;
        if (_archivePromises[key]) return _archivePromises[key];
        _archivePromises[key] = (async function() {
            var pieces = [];
            var total = 0;
            for (var i = 1; i <= count; i++) {
                var suffix = String(i).padStart(pad, '0');
                var piece = await fetchBytes(folder + '/' + archiveName + '.part' + suffix,
                    start + span * ((i - 1) / count), span / count,
                    'Downloading ' + label + ' part ' + i + '/' + count);
                pieces.push(piece);
                total += piece.length;
            }
            var combined = new Uint8Array(total);
            var offset = 0;
            pieces.forEach(function(piece) {
                combined.set(piece, offset);
                offset += piece.length;
            });
            progress(start + span * 0.9, 'Unzipping ' + label + '...');
            await addZipFiles(combined, label);
            progress(start + span, label + ' ready');
            return true;
        })().catch(function(error) {
            delete _archivePromises[key];
            throw error;
        });
        return _archivePromises[key];
    }

    function ensureArchiveForPath(path) {
        path = normalizePath(path);
        if (path.indexOf('data/') === 0 || path.indexOf('maps/') === 0) {
            return init();
        }
        if (path.indexOf('img/') === 0) {
            return init().then(function() {
                return loadConfig().then(function(config) {
                    var folder = config.useRemoteParts
                        ? config.baseUrl.replace(/\/+$/, '') + '/img_pack' : 'img_pack';
                    return joinParts(folder, 'img_repk.zip', 55, 2, 0, 100, 'images');
                });
            });
        }
        if (path.indexOf('audio/') === 0) {
            return init().then(function() {
                return loadConfig().then(function(config) {
                    var folder = config.useRemoteParts
                        ? config.baseUrl.replace(/\/+$/, '') + '/aud_pack' : 'aud_pack';
                    return joinParts(folder, 'audio_repk.zip', 111, 3, 0, 100, 'audio');
                });
            });
        }
        return Promise.resolve();
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

    function init() {
        if (_initPromise) return _initPromise;
        _initPromise = (async function() {
            showProgress();
            progress(0, 'Loading data.zip first...');
            await loadArchive('data', 'data.zip', 0, 10, 'data.zip');
            progress(10, 'Loading maps.zip...');
            await loadArchive('maps', 'maps.zip', 10, 10, 'maps.zip');

            // Do not expose Launch after only the database. Extract both large
            // visual/audio archives in this same ordered boot promise so every
            // resource family is present before plugins and preloaders run.
            var config = await loadConfig();
            var baseUrl = config.baseUrl.replace(/\/+$/, '');
            var imageFolder = config.useRemoteParts ? baseUrl + '/img_pack' : 'img_pack';
            var audioFolder = config.useRemoteParts ? baseUrl + '/aud_pack' : 'aud_pack';
            progress(20, 'Loading image archive parts...');
            await joinParts(imageFolder, 'img_repk.zip', 55, 2, 20, 35, 'images');
            progress(55, 'Loading audio archive parts...');
            await joinParts(audioFolder, 'audio_repk.zip', 111, 3, 55, 45, 'audio');

            _ready = true;
            progress(100, 'All assets ready — press LAUNCH');
            drainXhrQueue();
            showLaunchButton();
            console.log('ZipLoader: data, maps, images, and audio ready (' + Object.keys(_vfs).length + ' files); waiting for Launch');
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
        refreshHooks: installHooks
    };
})();
