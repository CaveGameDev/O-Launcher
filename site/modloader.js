(function() {
    'use strict';

    // -------- OneLoader compatibility shims ----------------------------------
    // Many OMORI mods are authored for the OneLoader desktop
    // framework. Provide minimal browser-compatible shims so they don't crash.
    if (!window.$modLoader) {
        window.$modLoader = {
            mods: new Map(),
            allMods: new Map(),
            $log: function(msg) { console.log('[OneLoader]', msg); }
        };
    }
    if (!window.Snek) {
        window.Snek = {};
    }
    if (!Snek.ModConfigs) {
        Snek.ModConfigs = {
            _configs: [],
            addConfig: function(cfg) {
                this._configs.push(cfg);
                console.log('ModLoader: mod config registered:', cfg.header);
            }
        };
    }
    if (!window.$modLoader.mods.has) {
        // Ensure mods is a proper Map-like object
        var modMap = new Map();
        window.$modLoader.mods = modMap;
        window.$modLoader.allMods = modMap;
    }

    // -------- JSON Patch (RFC 6902) ------------------------------------------
    function resolvePath(obj, path, create) {
        var parts = path.replace(/^\//, '').split('/');
        var container = obj;
        for (var i = 0; i < parts.length - 1; i++) {
            var key = parts[i];
            var next = parts[i + 1];
            if (container[key] === undefined || container[key] === null) {
                if (create) {
                    container[key] = /^\d+$/.test(next) ? [] : {};
                } else {
                    return { container: container, key: key, missing: true };
                }
            }
            container = container[key];
        }
        return { container: container, key: parts[parts.length - 1] };
    }

    function jsonPatch(obj, patches) {
        for (var i = 0; i < patches.length; i++) {
            var p = patches[i];
            var resolved = resolvePath(obj, p.path, p.op === 'add');
            if (resolved.missing) {
                console.warn('ModLoader: patch target not found:', p.path);
                continue;
            }
            var container = resolved.container;
            var key = resolved.key;
            var idx = /^\d+$/.test(key) ? parseInt(key, 10) : null;
            switch (p.op) {
                case 'replace':
                    container[key] = p.value;
                    break;
                case 'add':
                    if (idx !== null && Array.isArray(container)) {
                        container.splice(idx, 0, p.value);
                    } else {
                        container[key] = p.value;
                    }
                    break;
                case 'remove':
                    if (idx !== null && Array.isArray(container)) {
                        container.splice(idx, 1);
                    } else {
                        delete container[key];
                    }
                    break;
            }
        }
        return obj;
    }

    // -------- VFS injection --------------------------------------------------
    function injectVFS(path, bytes) {
        if (!window.ZipLoader || !ZipLoader.putFile) {
            console.warn('ModLoader: ZipLoader.putFile not available');
            return false;
        }
        var data = (typeof bytes === 'string') ? new TextEncoder().encode(bytes) : bytes;
        ZipLoader.putFile(path, data);
        return true;
    }

    function injectVFSBinary(path, bytes) {
        return injectVFS(path, bytes);
    }

    // -------- YAML patching (s6.js compat) -----------------------------------
    function patchLanguageYAML(yamlText) {
        // Strip leading backslash-n escapes that s6.js doesn't handle
        return yamlText.replace(/^(\\\\n)/gm, '');
    }

    function loadLanguageFile(name, yamlText) {
        var patched = patchLanguageYAML(yamlText);
        var path = 'languages/en/' + name;
        var encoded = new TextEncoder().encode(patched);
        ZipLoader.putFile(path, encoded);
        return path;
    }

    // -------- Plugin execution -----------------------------------------------
    function runPlugin(code, name) {
        try {
            var patched = patchPluginForBrowser(code, name);
            var fn = new Function(patched || code);
            fn();
            console.log('ModLoader: plugin loaded:', name, (patched ? '(patched for browser)' : ''));
            return true;
        } catch (e) {
            console.error('ModLoader: plugin failed:', name, e.message);
            return false;
        }
    }

    // -------- Mod loading ----------------------------------------------------
    function loadMod(zipBytes, modName) {
        return new Promise(function(resolve, reject) {
            if (!window.fflate || !fflate.unzip) {
                reject(new Error('fflate not available'));
                return;
            }
            fflate.unzip(new Uint8Array(zipBytes), function(error, files) {
                if (error) { reject(error); return; }

                var mod = { name: modName, files: 0, plugins: 0, languages: 0, data: 0, maps: 0, assets: 0 };
                var manifest = null;
                var pluginCodes = [];
                var languageFiles = {};

                // Find mod.json
                for (var name in files) {
                    if (/\/mod\.json$/i.test(name) && !name.split('/')[1].startsWith('.')) {
                        try {
                            manifest = JSON.parse(new TextDecoder('utf-8').decode(files[name]));
                        } catch(e) { /* continue */ }
                        break;
                    }
                }

                var prefix = '';
                if (manifest) {
                    // Determine the top-level folder
                    var firstFile = Object.keys(files)[0];
                    if (firstFile) prefix = firstFile.split('/')[0] + '/';
                    mod.name = manifest.name || modName;
                    mod.description = manifest.description || '';
                    mod.version = manifest.version || '';
                }

                // Process every file
                for (var name in files) {
                    if (name.endsWith('/') || !files[name]) continue;
                    var bytes = files[name];
                    var rel = name.indexOf(prefix) === 0 ? name.slice(prefix.length) : name;

                    // Skip metadata and extras
                    if (rel === 'mod.json' || rel.startsWith('EXTRAS/') ||
                        rel.startsWith('_bundletool_') || rel.startsWith('olid/')) continue;

                    // Plugins
                    if (rel.startsWith('plugins/') && rel.endsWith('.js')) {
                        var code = new TextDecoder('utf-8').decode(bytes);
                        pluginCodes.push({ name: rel.replace('plugins/', ''), code: code });
                        mod.plugins++;
                        continue;
                    }

                    // Language YAML
                    if (rel.startsWith('languages/') && rel.endsWith('.yaml')) {
                        var yamlText = new TextDecoder('utf-8').decode(bytes);
                        var yamlName = rel.replace('languages/', '');
                        languageFiles[yamlName] = yamlText;
                        mod.languages++;
                        continue;
                    }

                    // Data delta (.jsond) — apply as JSON patch to base data
                    if (rel.startsWith('data/') && rel.endsWith('.jsond')) {
                        var baseName = rel.replace('data/', '').replace('.jsond', '.json');
                        // Load base file from VFS, apply patch, write back
                        try {
                            var patches = JSON.parse(new TextDecoder('utf-8').decode(bytes));
                            if (!Array.isArray(patches)) throw new Error('Not a patch array');
                            var baseBytes = ZipLoader.getFile('data/' + baseName);
                            if (!baseBytes) {
                                console.warn('ModLoader: base ' + baseName + ' not in VFS yet, storing patch deferred');
                                mod._deferredPatches = mod._deferredPatches || [];
                                mod._deferredPatches.push({ baseName: baseName, patches: patches });
                            } else {
                                var baseObj = JSON.parse(new TextDecoder('utf-8').decode(baseBytes));
                                jsonPatch(baseObj, patches);
                                var merged = new TextEncoder().encode(JSON.stringify(baseObj));
                                ZipLoader.putFile('data/' + baseName, merged);
                            }
                        } catch (e) {
                            console.warn('ModLoader: failed to apply ' + baseName + ':', e.message);
                        }
                        mod.data++;
                        continue;
                    }

                    // Everything else: inject into VFS
                    var isText = rel.endsWith('.json') || rel.endsWith('.jsond') ||
                                 rel.endsWith('.yaml') || rel.endsWith('.ymld') ||
                                 rel.endsWith('.world');
                    if (isText) {
                        injectVFS(rel, bytes);
                    } else {
                        injectVFSBinary(rel, bytes);
                    }
                    if (rel.startsWith('maps/') || rel.startsWith('Map')) mod.maps++;
                    else mod.assets++;
                    mod.files++;
                }

                // Register this mod in OneLoader-compatible registry
                var modId = (manifest && manifest.id) || modName.replace(/\.zip$/i, '');
                window.$modLoader.mods.set(modId, { id: modId, name: mod.name, version: mod.version });
                window.$modLoader.allMods.set(modId, { id: modId, name: mod.name, version: mod.version });
                console.log('ModLoader: registered mod "' + modId + '" in $modLoader.mods');

                resolve({ manifest: manifest, mod: mod, plugins: pluginCodes, languages: languageFiles });
            });
        });
    }

    // -------- Plugin auto-patching for browser compatibility ------------------
    function patchPluginForBrowser(code, name) {
        // tileDFixerAmb.js — replaces DataManager.loadTiledMapData with NW.js fs code.
        // Rewrite to hook into the browser VFS pipeline instead.
        if (name === 'tileDFixerAmb.js') {
            return [
                '// tileDFixerAmb.js — auto-patched for browser VFS',
                '(function() {',
                '  function fuck(map) {',
                '    if (!map) return map;',
                '    if (map.layers) map.layers = map.layers.map(function(layer) {',
                '      if (!layer || !layer.properties) return layer;',
                '      if (Array.isArray(layer.properties)) {',
                '        var np = {}, npt = {};',
                '        layer.properties.forEach(function(p) { np[p.name] = p.value; npt[p.name] = p.type; });',
                '        layer.properties = np; layer.propertytypes = npt;',
                '      }',
                '      return layer;',
                '    });',
                '    if (map.tilesets) map.tilesets = map.tilesets.map(function(ts) {',
                '      if (!ts || !ts.tiles || !Array.isArray(ts.tiles)) return ts;',
                '      var nt = {};',
                '      ts.tiles.forEach(function(el) {',
                '        var extra = Object.keys(el).filter(function(k) { return k !== "id"; });',
                '        if (extra.length > 0) {',
                '          nt[el.id] = {};',
                '          extra.forEach(function(k) { nt[el.id][k] = el[k]; });',
                '        }',
                '      });',
                '      ts.tiles = nt;',
                '      return ts;',
                '    });',
                '    return map;',
                '  }',
                '  // Hook _tempTiledData setter to auto-apply fuck() after every tiled map load',
                '  if (typeof DataManager !== "undefined") {',
                '    var _tiledKey = "_tempTiledData";',
                '    var _origVal = DataManager[_tiledKey];',
                '    Object.defineProperty(DataManager, _tiledKey, {',
                '      get: function() { return _origVal; },',
                '      set: function(v) { _origVal = fuck(v); },',
                '      configurable: true, enumerable: true',
                '    });',
                '    console.log("tileDFixerAmb: _tempTiledData auto-fix hooked");',
                '  }',
                '})();'
            ].join('\n');
        }
        if (name === 'TitleScreenAtlasChangeAm.js') {
            // The mod replaces initialize() but misses _titleScaleX/Y.
            // These are used by the original createTitleCommands() for
            // button positioning. Without them buttons land at NaN coords.
            return code +
                '\n// --- auto-patch: restore missing scale factors ---\n' +
                '(function(){\n' +
                '  var _origInit = Scene_OmoriTitleScreen.prototype.initialize;\n' +
                '  Scene_OmoriTitleScreen.prototype.initialize = function() {\n' +
                '    this._titleScaleX = Graphics.width / 640;\n' +
                '    this._titleScaleY = Graphics.height / 480;\n' +
                '    return _origInit.apply(this, arguments);\n' +
                '  };\n' +
                '})();';
        }
        return null; // no patching needed
    }

    // -------- Stub injection for skipped plugins ------------------------------
    function injectSkippedStubs() {
        var stubs = {
            'stbvorbis.js': '// Web Audio native bypass — no stbvorbis needed.',
            'stbvorbis_stream.js': '// Web Audio native bypass.',
            'stbvorbis_asm.js': '// Web Audio native bypass.',
            'stbvorbis_stream_asm.js': '// Web Audio native bypass.',
            'greenworks.js': '// Browser runtime — no Steam API.',
            'trmix.min.js': '// Browser runtime bypass.'
        };
        var injected = 0;
        for (var name in stubs) {
            if (window.__INLINE_PLUGINS && window.__INLINE_PLUGINS[name] === undefined) {
                window.__INLINE_PLUGINS[name] = stubs[name];
                injected++;
            }
        }
        if (injected) console.log('ModLoader: injected ' + injected + ' stub(s) for skipped engine plugins');
        return injected;
    }

    // -------- Public API -----------------------------------------------------
    window.ModLoader = {
        load: loadMod,
        runPlugins: function(plugins) {
            for (var i = 0; i < plugins.length; i++) {
                runPlugin(plugins[i].code, plugins[i].name);
            }
        },
        loadLanguages: function(languages) {
            var count = 0;
            for (var name in languages) {
                loadLanguageFile(name, languages[name]);
                count++;
            }
            return count;
        },
        injectVFS: injectVFS,
        injectVFSBinary: injectVFSBinary,
        applyPatch: jsonPatch,
        patchLanguageYAML: patchLanguageYAML
    };

    console.log('ModLoader: ready');

    // -------- UI hooks ----------------------------------------------------------
    var _loadedMods = [];

    window.handleModUpload = function(event) {
        var files = event.target.files;
        if (!files || !files.length) return;
        var info = document.getElementById('modInfo');
        var warn = document.getElementById('modWarn');
        var launchBtn = document.getElementById('zipLaunchButton');
        warn.textContent = '';

        var remaining = files.length;
        var totalPlugins = 0;
        var totalFiles = 0;
        var modNames = [];
        _loadedMods = [];

        function processNext(index) {
            if (index >= files.length) {
                info.textContent = modNames.length + ' mod(s): ' + modNames.join(', ') +
                    ' (' + totalPlugins + ' plugins, ' + totalFiles + ' files)';
                if (launchBtn) launchBtn.textContent = 'LAUNCH (' + modNames.length + ' mods)';
                return;
            }
            var file = files[index];
            info.textContent = 'Reading ' + file.name + ' (' + (index + 1) + '/' + files.length + ')...';
            var reader = new FileReader();
            reader.onload = function() {
                ModLoader.load(reader.result, file.name).then(function(result) {
                    _loadedMods.push(result);
                    totalPlugins += result.plugins.length;
                    totalFiles += result.mod.files;
                    modNames.push(result.mod.name);
                    processNext(index + 1);
                }).catch(function(err) {
                    warn.textContent += file.name + ': ' + err.message + '; ';
                    console.error('ModLoader:', file.name, err);
                    processNext(index + 1);
                });
            };
            reader.readAsArrayBuffer(file);
        }
        processNext(0);
    };
        reader.readAsArrayBuffer(file);
    };

    // Hook into the LAUNCH button to apply mod before boot
    var _hookTimer = setInterval(function() {
        var btn = document.getElementById('zipLaunchButton');
        if (!btn || btn._hooked) return;
        btn._hooked = true;
        btn.addEventListener('click', function(e) {
            if (!_loadedMods.length) {
                if (window.__resumeBoot) window.__resumeBoot();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            var info = document.getElementById('modInfo');
            info.textContent = 'Applying ' + _loadedMods.length + ' mod(s)...';
            injectSkippedStubs();
            setTimeout(function() {
                for (var m = 0; m < _loadedMods.length; m++) {
                    var mod = _loadedMods[m];
                    // Apply any deferred data patches
                    if (mod.mod._deferredPatches) {
                        var dps = mod.mod._deferredPatches;
                        for (var i = 0; i < dps.length; i++) {
                            var dp = dps[i];
                            try {
                                var baseBytes = ZipLoader.getFile('data/' + dp.baseName);
                                if (baseBytes) {
                                    var baseObj = JSON.parse(new TextDecoder('utf-8').decode(baseBytes));
                                    jsonPatch(baseObj, dp.patches);
                                    ZipLoader.putFile('data/' + dp.baseName, new TextEncoder().encode(JSON.stringify(baseObj)));
                                    console.log('ModLoader: applied deferred patch to', dp.baseName);
                                }
                            } catch (e) {
                                console.warn('ModLoader: deferred patch failed for', dp.baseName, e.message);
                            }
                        }
                        delete mod.mod._deferredPatches;
                    }
                    if (mod.plugins && mod.plugins.length) {
                        ModLoader.runPlugins(mod.plugins);
                    }
                    if (mod.languages) {
                        ModLoader.loadLanguages(mod.languages);
                    }
                }
                info.textContent = _loadedMods.length + ' mod(s) applied!';
                if (window.__resumeBoot) window.__resumeBoot();
            }, 50);
        });
        clearInterval(_hookTimer);
    }, 200);

    // Show the mod upload UI when assets are ready
    var _modShowTimer = setInterval(function() {
        var progressDiv = document.getElementById('zipProgress');
        var modUI = document.getElementById('modUploader');
        if (!modUI || !(modUI.style.display === 'none')) return;
        // Show when progress hits 100% (Launch button visible)
        var launchBtn = document.getElementById('zipLaunchButton');
        if (launchBtn && launchBtn.style.display !== 'none') {
            modUI.style.display = 'block';
            clearInterval(_modShowTimer);
        }
    }, 500);
})();
