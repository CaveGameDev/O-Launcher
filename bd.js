        // Consent gate: main.js registers the real boot (which pulls ~1.6 GB of
        // archives via ZipLoader.init) on window.onload. Hold the original boot
        // and replace the onload handler with a no-op, then expose __resumeBoot
        // so nothing heavy runs until the player clicks the confirmation button.
        // The overlay is already shown during document parse; no data is used
        // before consent.
        (function() {
            if (window.__resumeBoot) return;
            var realBoot = window.onload;
            window.onload = function() {};
            window.__resumeBoot = function() {
                window.__resumeBoot = function() {};
                if (typeof realBoot === 'function') realBoot();
            };
        })();
