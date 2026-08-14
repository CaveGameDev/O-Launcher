//Fullscreen Text Patcher 1.0
// Made By STG
//
// Set QUALITY to 1 to disable the featureAC.
// ---------------------------------------------------------------------------
(function () {
    'use strict';

    var QUALITY = 2; // text supersample factor while fullscreen

    window.TextQuality = window.TextQuality || { scale: 1 };

    function isFullscreen() {
        return !!(document.fullscreenElement ||
                  document.webkitFullscreenElement ||
                  document.msFullscreenElement);
    }

    var _bitmapWidth = Object.getOwnPropertyDescriptor(Bitmap.prototype, 'width').get;
    var _bitmapHeight = Object.getOwnPropertyDescriptor(Bitmap.prototype, 'height').get;

    Object.defineProperty(Bitmap.prototype, 'width', {
        configurable: true,
        get: function () {
            var w = _bitmapWidth.call(this);
            var q = this.__textScale;
            return (q && q !== 1) ? Math.round(w / q) : w;
        }
    });

    Object.defineProperty(Bitmap.prototype, 'height', {
        configurable: true,
        get: function () {
            var h = _bitmapHeight.call(this);
            var q = this.__textScale;
            return (q && q !== 1) ? Math.round(h / q) : h;
        }
    });

    Bitmap.prototype.measureTextWidth = function (text) {
        var context = this._context;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.font = this._makeFontNameText();
        var width = context.measureText(text).width;
        context.restore();
        return width;
    };

    function scaleBitmap(bitmap, q) {
        if (!bitmap || !bitmap.__canvas) return;
        var oldQ = bitmap.__textScale || 1;
        if (oldQ === q) return;
        var canvas = bitmap.__canvas;
        var oldW = canvas.width;
        var oldH = canvas.height;
        var logicalW = Math.max(1, Math.round(oldW / oldQ));
        var logicalH = Math.max(1, Math.round(oldH / oldQ));
        var tmp = document.createElement('canvas');
        tmp.width = oldW;
        tmp.height = oldH;
        tmp.getContext('2d').drawImage(canvas, 0, 0);
        canvas.width = Math.max(1, logicalW * q);
        canvas.height = Math.max(1, logicalH * q);
        bitmap.__textScale = q;
        var bt = bitmap._baseTexture;
        bt.resolution = q;
        bt.realWidth = canvas.width;
        bt.realHeight = canvas.height;
        bt.width = canvas.width / q;
        bt.height = canvas.height / q;

        // Downscale with bilinear filtering
        bitmap.smooth = (q > 1);

        var ctx = canvas.getContext('2d');
        ctx.setTransform(q, 0, 0, q, 0, 0);
        ctx.drawImage(tmp, 0, 0, logicalW, logicalH);

        bitmap._setDirty();
    }

    function walkWindows(node, cb) {
        if (!node) return;
        if (node._windowContentsSprite && node.contents) cb(node);
        var children = node.children;
        if (children) {
            for (var i = 0; i < children.length; i++) {
                walkWindows(children[i], cb);
            }
        }
    }

    function rescaleAll(q) {
        if (!window.SceneManager) return;
        var scenes = [];
        if (SceneManager._scene) scenes.push(SceneManager._scene);
        if (SceneManager._stack) scenes = scenes.concat(SceneManager._stack);
        for (var i = 0; i < scenes.length; i++) {
            walkWindows(scenes[i], function (win) {
                scaleBitmap(win.contents, q);
                if (typeof win.refresh === 'function') {
                    try { win.refresh(); } catch (e) {}
                }
            });
        }
    }

    function setScale(q) {
        if (q === window.TextQuality.scale) return;
        window.TextQuality.scale = q;
        rescaleAll(q);
    }

    function onFsChange() {
        setScale(isFullscreen() ? QUALITY : 1);
    }

    var _createContents = Window_Base.prototype.createContents;
    Window_Base.prototype.createContents = function () {
        _createContents.call(this);
        scaleBitmap(this.contents, window.TextQuality.scale || 1);
    };

    // React to fullscreen changes 
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('msfullscreenchange', onFsChange);

    if (isFullscreen()) {
        window.TextQuality.scale = QUALITY;
    }
})();
