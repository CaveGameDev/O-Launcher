!(function () {
  "use strict";
  var e = window.fflate;
  if (!e || "function" != typeof e.unzip) throw new Error("ZipLoader requires fflate.js to be loaded first.");
  var n,
    t = Object.create(null),
    r = Object.create(null),
    o = Object.create(null),
    a = (Object.create(null), null),
    i = [],
    c = !1,
    u = !1,
    s = null,
    l = null,
    f = null,
    d = null,
    p = window.fetch ? window.fetch.bind(window) : null,
    h = XMLHttpRequest.prototype.open,
    m = XMLHttpRequest.prototype.send,
    g = null,
    v = null,
    y = 6,
    w = !0,
    b = { baseUrl: "", useRemoteParts: !1, accountId: "", concurrency: "6", cacheEnabled: !0 },
    L = "default";
  function z(e, n) {
    var t = document.getElementById("zipProgressFill"),
      r = document.getElementById("zipProgressLabel");
    t && (t.style.width = Math.max(0, Math.min(100, Math.round(e))) + "%"), r && (r.textContent = n || "");
  }
  function x() {
    var e = document.getElementById("zipLaunchButton");
    e &&
      !e.__zipLaunchBound &&
      ((e.__zipLaunchBound = !0),
      (e.style.display = "block"),
      (e.disabled = !1),
      e.addEventListener("click", function () {
        var n;
        if (
          c &&
          !u &&
          ((u = !0),
          (e.disabled = !0),
          (e.style.display = "none"),
          (n = document.getElementById("zipProgress")) && (n.style.display = "none"),
          f)
        ) {
          var t = f;
          (f = null), t(!0);
        }
      }));
  }
  function E(e) {
    var n = String(e || "").replace(/\\/g, "/");
    try {
      var t = new URL(n, window.location.href),
        r = new URL("./", window.location.href).pathname;
      n = 0 === t.pathname.indexOf(r) ? t.pathname.slice(r.length) : t.pathname.replace(/^\/+/, "");
    } catch (e) {
      n = (n = n.replace(/^https?:\/\/[^/]+/i, "")).replace(/^\.\//, "").replace(/^\/+/, "");
    }
    return n.split("?")[0].split("#")[0].replace(/^\/+/, "");
  }
  function P(e) {
    var n = E(e);
    return 0 === n.indexOf("data/") || 0 === n.indexOf("maps/") || 0 === n.indexOf("img/") || 0 === n.indexOf("audio/");
  }
  function _(e) {
    var n = e.toLowerCase();
    return n.endsWith(".png")
      ? "image/png"
      : n.endsWith(".jpg") || n.endsWith(".jpeg")
        ? "image/jpeg"
        : n.endsWith(".ogg")
          ? "audio/ogg"
          : n.endsWith(".m4a")
            ? "audio/mp4"
            : n.endsWith(".json")
              ? "application/json"
              : n.endsWith(".yaml")
                ? "text/yaml"
                : n.endsWith(".webm")
                  ? "video/webm"
                  : "application/octet-stream";
  }
  function S(e, n, t, r, o) {
    z(t + (n > 0 ? Math.min(1, e / n) : 0) * r, o + " (" + Math.round((e / 1048576) * 10) / 10 + " MB)");
  }
  function j() {
    return (
      a ||
      (a = p("base.ini")
        .then(function (e) {
          return e.ok ? e.text() : "";
        })
        .then(function (e) {
          return (function (e) {
            var n = { baseUrl: "", useRemoteParts: !1, accountId: "", concurrency: "6", cacheEnabled: !0 };
            return (
              String(e || "")
                .split(/\r?\n/)
                .forEach(function (e) {
                  if ((e = e.trim()) && ";" !== e[0] && "#" !== e[0]) {
                    var t = e.indexOf("=");
                    if (!(t < 0)) {
                      var r = e.slice(0, t).trim(),
                        o = e.slice(t + 1).trim();
                      "baseUrl" === r && (n.baseUrl = o),
                        "useRemoteParts" === r && (n.useRemoteParts = "true" === o.toLowerCase()),
                        "accountId" === r && (n.accountId = o),
                        "concurrency" === r && (n.concurrency = o),
                        "cacheEnabled" === r && (n.cacheEnabled = "false" !== o.toLowerCase());
                    }
                  }
                }),
              n
            );
          })(e);
        })
        .catch(function () {
          return { baseUrl: "", useRemoteParts: !1, accountId: "", concurrency: "6", cacheEnabled: !0 };
        }))
    );
  }
  var B = null;
  function I() {
    return (
      B ||
        (B =
          "undefined" == typeof indexedDB
            ? Promise.reject(new Error("indexedDB unavailable"))
            : new Promise(function (e, n) {
                var t = indexedDB.open("WO_Assets", 1);
                (t.onupgradeneeded = function (e) {
                  var n = e.target.result;
                  n.objectStoreNames.contains("archives") || n.createObjectStore("archives", { keyPath: "key" }),
                    n.objectStoreNames.contains("meta") || n.createObjectStore("meta", { keyPath: "key" });
                }),
                  (t.onsuccess = function (n) {
                    e(n.target.result);
                  }),
                  (t.onerror = function (e) {
                    n(e.target.error);
                  });
              })),
      B
    );
  }
  function U(e, n) {
    return I()
      .then(function (t) {
        return new Promise(function (r) {
          try {
            var o = t.transaction(e, "readonly").objectStore(e).get(n);
            (o.onsuccess = function () {
              r(o.result ? o.result.value : null);
            }),
              (o.onerror = function () {
                r(null);
              });
          } catch (e) {
            r(null);
          }
        });
      })
      .catch(function () {
        return null;
      });
  }
  function R(e, n, t) {
    return I()
      .then(function (r) {
        return new Promise(function (o) {
          try {
            var a = r.transaction(e, "readwrite");
            a.objectStore(e).put({ key: n, value: t }),
              (a.oncomplete = function () {
                o(!0);
              }),
              (a.onerror = function () {
                o(!1);
              }),
              (a.onabort = function () {
                o(!1);
              });
          } catch (e) {
            o(!1);
          }
        });
      })
      .catch(function () {
        return !1;
      });
  }
  function O() {
    return void 0 !== n
      ? Promise.resolve(n)
      : p("manifest.json")
          .then(function (e) {
            return e.ok
              ? e.json().then(
                  function (e) {
                    return (n = e || null);
                  },
                  function () {
                    return (n = null), null;
                  }
                )
              : ((n = null), null);
          })
          .catch(function () {
            return (n = null), null;
          });
  }
  function A(e) {
    var n = b.baseUrl.replace(/\/+$/, "");
    return b.useRemoteParts && e.folder ? n + "/" + e.folder : n;
  }
  function k(e) {
    for (var n = A(e), t = e.folder ? n + "/" + e.folder : n, r = [], o = 0; o < e.count; o++) {
      var a = e.pad ? String(o + 1).padStart(e.pad, "0") : "",
        i = e.name + (e.pad ? ".part" + a : "");
      r.push(t ? t + "/" + i : i);
    }
    return (function (e) {
      var n = new Array(e.length),
        t = 0,
        r = 0;
      return new Promise(function (o, a) {
        !(function i() {
          for (; r < y && t < e.length; )
            (function (c) {
              var u;
              r++,
                ((u = e[c]),
                p(u, { method: "HEAD" }).then(function (e) {
                  return { size: Number(e.headers.get("content-length")) || 0 };
                })).then(
                  function (a) {
                    (n[c] = a), r--, t < e.length ? i() : 0 === r && o(n);
                  },
                  function (e) {
                    r--, a(e);
                  }
                );
            })(t++);
        })();
      });
    })(r)
      .then(function (e) {
        var n = e.map(function (e, n) {
            return { name: r[n].split("/").pop(), size: e.size };
          }),
          t = 0;
        return (
          n.forEach(function (e) {
            t += e.size;
          }),
          {
            version:
              "head:" +
              n
                .map(function (e) {
                  return e.name + ":" + e.size;
                })
                .join(","),
            totalSize: t,
            parts: n,
          }
        );
      })
      .catch(function () {
        return null;
      });
  }
  function C(e) {
    if (n && n.archives && n.archives[e.name]) {
      var t = n.archives[e.name];
      return {
        name: e.name,
        folder: "string" == typeof t.folder ? t.folder : e.folder,
        count: t.count || e.count,
        pad: "number" == typeof t.pad ? t.pad : e.pad,
      };
    }
    return e;
  }
  function M(n, o) {
    return new Promise(function (a, i) {
      e.unzip(n, function (e, n) {
        if (e) i(new Error("Could not unzip " + o + ": " + e.message));
        else {
          var c = 0;
          Object.keys(n).forEach(function (e) {
            if (e && !/\/$/.test(e)) {
              var o = E(e),
                a = n[e];
              (t[o] = a), (r[Z(o).insensitive] = o), c++;
            }
          }),
            console.log("ZipLoader: extracted " + c + " files from " + o),
            a(c);
        }
      });
    });
  }
  function Z(e) {
    var n = E(e),
      t = n;
    try {
      t = decodeURIComponent(n);
    } catch (e) {}
    return { exact: n, insensitive: t.toLowerCase() };
  }
  function F(e) {
    var n = Z(e),
      o = t[n.exact];
    if (o) return o;
    var a = r[n.insensitive];
    return (a && t[a]) || null;
  }
  function T(e) {
    return (
      (e = E(e)),
      o[e]
        ? Promise.resolve(o[e])
        : W(e).then(function () {
            var n = F(e);
            if (!n) throw new Error("VFS file not found: " + e);
            var t = new Blob([n], { type: _(e) });
            return (o[e] = URL.createObjectURL(t)), o[e];
          })
    );
  }
  function q(e, n, t, r, o) {
    for (var a = A(e), i = e.folder ? a + "/" + e.folder : a, c = [], u = 0; u < e.count; u++) {
      var s = e.pad ? String(u + 1).padStart(e.pad, "0") : "",
        l = e.name + (e.pad ? ".part" + s : "");
      c.push({
        url: i ? i + "/" + l : l,
        start: n + t * (u / e.count),
        span: t / e.count,
        label: r + " part " + (u + 1) + "/" + e.count,
      });
    }
    var f = performance.now();
    return (function (e) {
      var n = new Array(e.length),
        t = 0,
        r = 0;
      return new Promise(function (o, a) {
        !(function i() {
          for (; r < y && t < e.length; )
            (function (c) {
              var u, s, l, f;
              r++,
                ((u = e[c].url),
                (s = e[c].start),
                (l = e[c].span),
                (f = e[c].label),
                p
                  ? p(u).then(function (e) {
                      if (!e.ok) throw new Error("HTTP " + e.status + " for " + u);
                      var n = Number(e.headers.get("content-length")) || 0;
                      if (!e.body || !e.body.getReader)
                        return e.arrayBuffer().then(function (e) {
                          return S(e.byteLength, n || e.byteLength, s, l, f), new Uint8Array(e);
                        });
                      var t = e.body.getReader(),
                        r = [],
                        o = 0;
                      return (function e() {
                        return t.read().then(function (t) {
                          if (t.done) {
                            var a = new Uint8Array(o),
                              i = 0;
                            return (
                              r.forEach(function (e) {
                                a.set(e, i), (i += e.length);
                              }),
                              S(o, n || o, s, l, f),
                              a
                            );
                          }
                          return r.push(t.value), S((o += t.value.byteLength), n, s, l, f), e();
                        });
                      })();
                    })
                  : Promise.reject(new Error("Fetch is unavailable."))).then(
                  function (a) {
                    (n[c] = a), r--, t < e.length ? i() : 0 === r && o(n);
                  },
                  function (e) {
                    r--, a(e);
                  }
                );
            })(t++);
        })();
      });
    })(c).then(function (a) {
      if (o && o.parts && o.parts.length === a.length)
        for (var i = 0; i < a.length; i++)
          if (o.parts[i].size && a[i].length !== o.parts[i].size)
            throw new Error(
              r +
                " part " +
                (i + 1) +
                " size mismatch (" +
                a[i].length +
                " != " +
                o.parts[i].size +
                "); assets changed? bump manifest.json version."
            );
      var c = 0;
      a.forEach(function (e) {
        c += e.length;
      });
      var u = new Uint8Array(c),
        s = 0;
      return (
        a.forEach(function (e) {
          u.set(e, s), (s += e.length);
        }),
        console.log(
          "ZipLoader: [" +
            r +
            "] downloaded " +
            (c / 1048576).toFixed(1) +
            " MB in " +
            (performance.now() - f).toFixed(0) +
            " ms"
        ),
        M(u, r).then(function () {
          return (
            z(n + t, r + " ready"),
            w &&
              (!(function (e, n) {
                try {
                  return R("archives", "archive:" + e, new Blob([n]));
                } catch (e) {
                  return Promise.resolve(!1);
                }
              })(e.name, u),
              o && R("meta", "meta:" + e.name, o)),
            !0
          );
        })
      );
    });
  }
  function H(e, n, t, r) {
    return (function (e) {
      return O().then(function (n) {
        if (n && n.archives && n.archives[e.name]) {
          var t = n.archives[e.name];
          return { version: String(n.version || "1"), totalSize: t.totalSize || 0, parts: t.parts || [] };
        }
        return k(e);
      });
    })(e).then(function (o) {
      if (!w || !o) return q(e, n, t, r, o);
      var a,
        i = performance.now();
      return ((a = e.name), U("meta", "meta:" + a)).then(function (a) {
        return a && a.version === o.version && a.totalSize === o.totalSize
          ? (function (e) {
              return U("archives", "archive:" + e).then(function (e) {
                return e
                  ? "function" == typeof e.arrayBuffer
                    ? e.arrayBuffer().then(function (e) {
                        return new Uint8Array(e);
                      })
                    : e instanceof ArrayBuffer
                      ? new Uint8Array(e)
                      : e && e.buffer
                        ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength)
                        : null
                  : null;
              });
            })(e.name).then(function (a) {
              return a
                ? (console.log(
                    "ZipLoader: [" +
                      r +
                      "] cache hit (" +
                      (a.length / 1048576).toFixed(1) +
                      " MB, v" +
                      o.version +
                      ", read in " +
                      (performance.now() - i).toFixed(0) +
                      " ms)"
                  ),
                  z(n + 0.9 * t, r + " from cache..."),
                  M(a, r + " (cache)").then(function () {
                    return z(n + t, r + " ready (cache)"), !0;
                  }))
                : q(e, n, t, r, o);
            })
          : q(e, n, t, r, o);
      });
    });
  }
  function W(e) {
    return G();
  }
  function N() {
    i.splice(0, i.length).forEach(function (e) {
      (function (e) {
        return T(e.path).then(function (n) {
          var t = e.xhr,
            r = !1 === e.async || e.async;
          h.call(t, e.method, n, r);
          try {
            e.responseType && (t.responseType = e.responseType);
          } catch (e) {}
          return m.call(t, e.body);
        });
      })(e).catch(function (n) {
        console.error("ZipLoader: failed to serve " + e.path, n);
        try {
          e.xhr.dispatchEvent(new Event("error"));
        } catch (e) {}
      });
    });
  }
  function D() {
    !(function () {
      if (
        "undefined" != typeof Bitmap &&
        Bitmap.prototype &&
        "function" == typeof Bitmap.prototype._requestImage &&
        g !== Bitmap.prototype
      ) {
        var e = Bitmap.prototype,
          n = e._requestImage;
        (e._requestImage = function (e) {
          var t = this,
            r = E(e);
          if (0 !== r.indexOf("img/")) return n.call(this, e);
          this._image || (this._image = new Image()),
            (this._url = e),
            (this._loadingState = "requesting"),
            T(r)
              .then(function (e) {
                var r = t._url;
                n.call(t, e), (t._url = r);
              })
              .catch(function (n) {
                console.error("ZipLoader: image load failed", e, n), (t._loadingState = "error");
              });
        }),
          (g = e);
      }
    })(),
      (function () {
        if ("undefined" != typeof Graphics && "function" == typeof Graphics.setLoadingImage && v !== Graphics) {
          var e = Graphics,
            n = e.setLoadingImage;
          (e.setLoadingImage = function (t) {
            0 === E(t).indexOf("img/")
              ? T(t)
                  .then(function (t) {
                    n.call(e, t);
                  })
                  .catch(function (e) {
                    console.error("ZipLoader: loading image failed", t, e);
                  })
              : n.call(e, t);
          }),
            (v = e);
        }
      })();
  }
  function G() {
    return (
      s ||
      (s = (async function () {
        var e,
          n = performance.now();
        (e = document.getElementById("zipProgress")) && (e.style.display = "flex"),
          z(0, "Reading base.ini"),
          (function (e) {
            b = e || b;
            var n = parseInt(b.concurrency, 10);
            n >= 1 && n <= 16 && (y = n), (w = !1 !== b.cacheEnabled);
          })(await j()),
          (L = (function () {
            var e = null;
            try {
              e = new URLSearchParams(window.location.search).get("account");
            } catch (e) {}
            if (!e)
              try {
                e = window.localStorage.getItem("wo.accountId");
              } catch (e) {}
            return e || (e = b.accountId), e || "default";
          })()),
          await O(),
          z(1, "Account: " + L);
        var r = !1,
          o = [
            H(C({ name: "data.zip", folder: "", count: 1, pad: 0 }), 2, 6, "data.zip"),
            H(C({ name: "maps.zip", folder: "", count: 1, pad: 0 }), 8, 6, "maps.zip"),
            H(C({ name: "languages.zip", folder: "", count: 1, pad: 0 }), 14, 6, "languages").catch(function (e) {
              return (
                (r = !0),
                console.error(
                  "ZipLoader: languages.zip failed to load (" +
                    e.message +
                    "). Upload it next to the archives (project root / baseUrl); language text will be unavailable."
                ),
                !1
              );
            }),
            H(C({ name: "img_repk.zip", folder: "img_pack", count: 55, pad: 2 }), 20, 36, "images"),
            H(C({ name: "audio_repk.zip", folder: "aud_pack", count: 111, pad: 3 }), 56, 44, "audio"),
          ];
        return (
          await Promise.all(o),
          (c = !0),
          z(
            100,
            r
              ? "WARNING: languages.zip missing — language text unavailable. Press LAUNCH"
              : "All assets ready — press LAUNCH"
          ),
          N(),
          x(),
          console.log(
            "ZipLoader: data, maps, languages, images, and audio ready (" +
              Object.keys(t).length +
              ' files) for account "' +
              L +
              '" in ' +
              ((performance.now() - n) / 1e3).toFixed(1) +
              " s; press Launch"
          ),
          !0
        );
      })().catch(function (e) {
        throw ((d = e), z(0, "Zip loading failed: " + e.message), console.error("ZipLoader:", e), e);
      }))
    );
  }
  (XMLHttpRequest.prototype.open = function (e, n, t, r, o) {
    return (this.__zipMethod = e), (this.__zipUrl = n), (this.__zipAsync = t), h.call(this, e, n, t, r, o);
  }),
    (XMLHttpRequest.prototype.send = function (e) {
      var n = this.__zipUrl;
      if (P(n)) {
        var t = E(n);
        if (!1 === this.__zipAsync)
          return void console.warn("ZipLoader: synchronous VFS XHR requires ZipLoader.getText(): " + t);
        var r = { xhr: this, body: e, path: t, method: this.__zipMethod, async: !0, responseType: this.responseType };
        return i.push(r), void (c && N());
      }
      return m.call(this, e);
    }),
    p &&
      (window.fetch = function (e, n) {
        var t = "string" == typeof e ? e : e && e.url;
        if (!P(t)) return p(e, n);
        var r = E(t);
        return W().then(function () {
          var e = F(r);
          return e
            ? new Response(e, { status: 200, headers: { "Content-Type": _(r), "Cache-Control": "no-store" } })
            : new Response("", { status: 404 });
        });
      }),
    D(),
    (window.ZipLoader = {
      init: G,
      ready: function () {
        return c ? Promise.resolve(!0) : G();
      },
      isReady: function () {
        return c;
      },
      waitForLaunch: function () {
        return u
          ? Promise.resolve(!0)
          : (l ||
              (l = new Promise(function (e) {
                f = e;
              })),
            c && x(),
            l);
      },
      isLaunched: function () {
        return u;
      },
      getError: function () {
        return d;
      },
      getFile: function (e) {
        return F(e);
      },
      getText: function (e) {
        return (function (e) {
          var n = F(e);
          return n ? new TextDecoder("utf-8").decode(n) : null;
        })(e);
      },
      getBlobUrl: function (e) {
        return T(e);
      },
      refreshHooks: D,
      hasLanguagePack: function () {
        for (var e in t) if (0 === e.toLowerCase().indexOf("languages/")) return !0;
        return !1;
      },
      setAccount: function (e) {
        if (!e) return L;
        try {
          window.localStorage.setItem("wo.accountId", String(e));
        } catch (e) {}
        return (L = String(e));
      },
      accountId: function () {
        return L;
      },
      setCacheEnabled: function (e) {
        return (w = !!e);
      },
    });
})();
