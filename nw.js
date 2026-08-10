        (function() {
            'use strict';
            
            const STEAM_KEY = '6bdb2e585882fbd48826ef9cffd4c511';
            
            window.nw = {
                App: {
                    argv: ['nw', 'index.html', '--' + STEAM_KEY],
                    quit: function() { window.close(); },
                    dataPath: '/home/web/.config/omori',
                    manifest: { name: 'OMORI', version: '1.0.0', main: 'index.html' },
                    on: function(event, callback) { 
                        if (event === 'open' || event === 'ready') setTimeout(callback, 0);
                        return this;
                    },
                    getDataPath: function() { return '/home/web/.config/omori'; },
                    getManifest: function() { return { name: 'OMORI', version: '1.0.0' }; },
                    getArgv: function() { return ['nw', 'index.html', '--' + STEAM_KEY]; },
                    getFullArgv: function() { return ['nw', 'index.html', '--' + STEAM_KEY]; },
                    clearCache: function() {},
                    closeAllWindows: function() { window.close(); }
                },
                Window: {
                    get: function() {
                        return {
                            showDevTools: function() {},
                            enterFullscreen: function() { document.documentElement.requestFullscreen?.().catch(() => {}); },
                            leaveFullscreen: function() { document.exitFullscreen?.().catch(() => {}); },
                            focus: function() { window.focus(); },
                            on: function() { return this; },
                            close: function() { window.close(); },
                            minimize: function() {},
                            maximize: function() {},
                            isFullscreen: function() { return !!document.fullscreenElement; },
                            setResizable: function() {},
                            setPosition: function(x, y) { window.moveTo(x, y); },
                            setSize: function(w, h) { window.resizeTo(w, h); },
                            show: function() {},
                            hide: function() {},
                            reload: function() { window.location.reload(); }
                        };
                    }
                },
                Shell: {
                    openExternal: function(url) { window.open(url, '_blank'); }
                }
            };
            
            window.nw.gui = window.nw;
            window.gui = window.nw;
        })();
