    (function() {
        'use strict';
        
        var CDN_BASE = 'https://cdn.jsdelivr.net/gh/CaveGameDev/O-Launcher@Full-Fix/';
        window.__CDN_BASE = CDN_BASE;
        
        // ----- 3a. Remove duplicate "aud_pack/" or "img_pack/" segments -----
        function removeDuplicatePackPaths(url) {
            if (typeof url !== 'string') return url;
            // Matches "aud_pack/aud_pack/" or "img_pack/img_pack/" (case‑insensitive)
            // and replaces with a single folder name.
            var regex = /(aud_pack|img_pack)\/\1\//gi;
            var previous;
            do {
                previous = url;
                url = url.replace(regex, '$1/');
            } while (url !== previous);
            return url;
        }

        function stripSdcardPath(path) {
            if (!path || typeof path !== 'string') return path;
            var prefix = '/sdcard/OMORI/';
            if (path.indexOf(prefix) === 0) return path.substring(prefix.length);
            if (path.indexOf('sdcard/OMORI/') === 0) return path.substring(13);
            return path;
        }

        function rewriteToCDN(url) {
            if (!url || typeof url !== 'string') return url;
            // Skip absolute / data / blob URLs
            if (/^(https?:)?\/\//i.test(url)) return url;
            if (/^data:/i.test(url)) return url;
            if (/^blob:/i.test(url)) return url;
            
            var p = url.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
            // Rewrite known asset paths to CDN
            if (p.indexOf('movies/') === 0 || p.indexOf('fonts/') === 0 || p.indexOf('js/') === 0 || p === 'fflate.js') {
                return CDN_BASE + p;
            }
            return url;
        }
        
        // Apply duplicate path removal to all URL rewriting
        window.stripSdcardPath = function(path) {
            return removeDuplicatePackPaths(stripSdcardPath(path));
        };
        window.rewriteToCDN = function(url) {
            return removeDuplicatePackPaths(rewriteToCDN(url));
        };

        // ----- 3b. Intercept XHR -----
        var origXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            if (typeof url === 'string') {
                url = removeDuplicatePackPaths(stripSdcardPath(url));
                url = removeDuplicatePackPaths(rewriteToCDN(url));
            }
            return origXHROpen.call(this, method, url, async !== false, user, password);
        };

        // ----- 3c. Intercept fetch() -----
        if (typeof window.fetch !== 'undefined') {
            var origFetch = window.fetch;
            window.fetch = function(input, init) {
                var url;
                if (typeof input === 'string') {
                    url = input;
                } else if (input instanceof Request) {
                    url = input.url;
                } else {
                    return origFetch.call(this, input, init);
                }
                var cleaned = removeDuplicatePackPaths(url);
                if (cleaned !== url) {
                    if (typeof input === 'string') {
                        return origFetch.call(this, cleaned, init);
                    } else {
                        var newReq = new Request(cleaned, input);
                        return origFetch.call(this, newReq, init);
                    }
                }
                return origFetch.call(this, input, init);
            };
        }

        // ----- 3d. Intercept dynamic <script> src -----
        var origSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
        if (origSrcDesc && origSrcDesc.set) {
            Object.defineProperty(HTMLScriptElement.prototype, 'src', {
                get: origSrcDesc.get,
                set: function(url) {
                    if (typeof url === 'string') {
                        url = removeDuplicatePackPaths(stripSdcardPath(url));
                        url = removeDuplicatePackPaths(rewriteToCDN(url));
                    }
                    origSrcDesc.set.call(this, url);
                },
                configurable: true
            });
        }
    })();
