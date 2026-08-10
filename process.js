        if (typeof window.process === 'undefined') {
            window.process = {
                platform: 'browser',
                versions: { node: '12.0.0', chrome: '80.0.0' },
                env: { NODE_ENV: 'production' },
                cwd: function() { return '/'; },
                nextTick: function(cb) { setTimeout(cb, 0); }
            };
        }
