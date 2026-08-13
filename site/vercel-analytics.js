/**
 * Vercel Web Analytics Integration
 * 
 * This file initializes Vercel Web Analytics for the project.
 * The analytics will only track data in production (when deployed to Vercel).
 * No tracking occurs in development mode.
 */

(function() {
    'use strict';
    
    // Initialize the analytics queue
    window.va = window.va || function () { 
        (window.vaq = window.vaq || []).push(arguments); 
    };
    
    // Detect environment
    var isProduction = true;
    try {
        // Check if we're in development
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '') {
            isProduction = false;
        }
    } catch (e) {
        console.log('[Vercel Analytics] Could not detect environment');
    }
    
    // Only load the script in production or when explicitly enabled
    if (isProduction || window.VERCEL_ANALYTICS_DEBUG) {
        var script = document.createElement('script');
        script.defer = true;
        script.src = '/_vercel/insights/script.js';
        script.dataset.sdkn = '@vercel/analytics';
        script.dataset.sdkv = '2.0.1';
        
        script.onerror = function() {
            var errorMessage = isProduction 
                ? 'Be sure to enable Web Analytics for your project and deploy again. See https://vercel.com/docs/analytics/quickstart for more information.'
                : 'Please check if any ad blockers are enabled and try again.';
            console.log('[Vercel Web Analytics] Failed to load script. ' + errorMessage);
        };
        
        document.head.appendChild(script);
    } else {
        console.log('[Vercel Analytics] Development mode detected - analytics disabled');
    }
})();
