//Simply put, CDN path call patches because I'm lazy asf :>
(function() {
        'use strict';
        
        var CDN_BASE = '';
        window.__CDN_BASE = CDN_BASE;
        
        function removeDuplicatePackPaths(url) {
            if (typeof url !== 'string') return url;
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

            if (/^(https?:)?\/\//i.test(url)) return url;
            if (/^data:/i.test(url)) return url;
            if (/^blob:/i.test(url)) return url;        
            var p = url.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
            if (p.indexOf('movies/') === 0 || p.indexOf('fonts/') === 0 || p.indexOf('js/') === 0 || p === 'fflate.js') {
                return CDN_BASE + p;
            }
            return url;
        }

        window.stripSdcardPath = function(path) {
            return removeDuplicatePackPaths(stripSdcardPath(path));
        };
        window.rewriteToCDN = function(url) {
            return removeDuplicatePackPaths(rewriteToCDN(url));
        };

        var origXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            if (typeof url === 'string') {
                url = removeDuplicatePackPaths(stripSdcardPath(url));
                url = removeDuplicatePackPaths(rewriteToCDN(url));
            }
            return origXHROpen.call(this, method, url, async !== false, user, password);
        };

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
