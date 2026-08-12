/* ============================================================================
 * Unified OMORI VFS bridge (window.OVFS)
 * ============================================================================
 * One merged view over three stores:
 *
 *   1. ZipLoader's archive VFS  — the base game (data/, maps/, img/, audio/,
 *      languages/) plus every mod overlay already written there via putFile().
 *   2. The in-memory runtime store (window.__memoryFS), which WOClient repopulates
 *      from IndexedDB on boot.
 *   3. The persistent store (localStorage under "wo.fs.*", plus WOClient).
 *
 * Reads, exists checks and directory listings always prefer the newest overlay:
 * a mod-written file (memoryFS / ZipLoader.putFile) wins over the base archive
 * cache, so mods can replace audio/images/data at runtime and the fs polyfill
 * (require('fs')) sees exactly the same view the game does.
 *
 * It also bridges the desktop/encrypted file extensions that desktop mods
 * reference (audio/*.rpgmvo, maps/*.AUBREY, data/*.kel, text/*.hero, ...) onto
 * the decrypted equivalents stored in the browser VFS (*.ogg, *.json, *.yaml).
 * ========================================================================= */
(function () {
    'use strict';

    var memoryFS = window.__memoryFS || {};
    window.__memoryFS = memoryFS;

    function strip(path) {
        return window.stripSdcardPath
            ? window.stripSdcardPath(String(path == null ? '' : path))
            : String(path == null ? '' : path);
    }

    function fsKey(path) {
        return strip(path)
            .replace(/\\/g, '/')
            .replace(/^\.\/+/, '')
            .replace(/^\/+/, '')
            .replace(/\/+/g, '/');
    }

    function storageKey(key) { return 'wo.fs.' + key; }

    function persistedGet(key) {
        try {
            if (window.localStorage) {
                var v = window.localStorage.getItem(storageKey(key));
                if (v !== null) return v;
            }
        } catch (e) {}
        return undefined;
    }

    function persistedSet(key, data) {
        try { if (window.localStorage) window.localStorage.setItem(storageKey(key), data); } catch (e) {}
        if (window.WOClient && window.WOClient.put) {
            try { window.WOClient.put(key, data); } catch (e) {}
        }
    }

    function persistedDel(key) {
        try { if (window.localStorage) window.localStorage.removeItem(storageKey(key)); } catch (e) {}
        if (window.WOClient && window.WOClient.remove) {
            try { window.WOClient.remove(key); } catch (e) {}
        }
    }

    // Directories the archive VFS owns. Writes to these go through
    // ZipLoader.putFile so overrides take effect on the game's fetch/XHR/
    // bitmap/audio hooks immediately, beating the cached archive copy.
    var GAME_DIRS = ['data/', 'maps/', 'img/', 'audio/', 'js/', 'languages/'];

    function isGameAsset(key) {
        for (var i = 0; i < GAME_DIRS.length; i++) {
            if (key.indexOf(GAME_DIRS[i]) === 0) return true;
        }
        return false;
    }

    // Desktop (Steam-encrypted) extension -> decrypted browser VFS extension.
    // Desktop mods and plugins look these up with their on-disk names.
    var DECRYPTED_EXT = {
        rpgmvo: 'ogg',
        m4a: 'ogg',
        aubrey: 'json',
        kel: 'json',
        hero: 'yaml',
        pluto: 'yaml',
        omori: 'js'
    };

    // Canonical (desktop) casing for languages/en/*.yaml. The web archive
    // stores these lowercased, but the game's LanguageManager keys them by the
    // original desktop filename case (XX_BLUE, System, Bestiary, ...). The
    // language loader canonicalizes readdirSync results through this table so
    // getMessageData("XX_BLUE.…") and text.System/text.Database lookups resolve.
    var LANGUAGE_FILES = [
        '00_Bf_Dialogue.yaml','00_template.yaml','01_cutscenes_neighbors.yaml','01_map_whitespace.yaml','02_cutscenes_hideandseek.yaml','02_cutscenes_lostball.yaml','02_map_neighborsroom.yaml','03_cutscenes_basil.yaml','04_cutscenes_blackletters.yaml','05_cutscenes_spaceboyfriend.yaml','06_cutscenes_junkyard.yaml','07_cutscenes_spaceexboyfriend.yaml','08_cutscenes_captspaceboy.yaml','09_cutscenes_hobbeez.yaml','10_cutscenes_fakeknifefight.yaml','11_cutscenes_stolenalbum_pt1.yaml','12_cutscenes_stolenalbum_pt2.yaml','13_cutscenes_dinneratbasils.yaml','14_cutscenes_sweetheartquest.yaml','15_cutscenes_herothebachelor.yaml','16_cutscenes_thewedding.yaml','17_cutscenes_pollysworry.yaml','18_cutscenes_secretlake.yaml','19_cutscenes_kelshouse.yaml','20_cutscenes_sleepover.yaml','21_cutscenes_lastresort.yaml','22_cutscenes_humphrey.yaml','23_cutscenes_slimegirls.yaml','24_cutscenes_finalboss.yaml','25_cutscenes_blackhole.yaml','26_cutscenes_aubrey.yaml','27_cutscenes_treehouse.yaml','28_cutscenes_helpbasil.yaml','29_cutscenes_basilsplea.yaml','ALBUM.yaml','ALBUM_test.yaml','Bestiary.yaml','Database.yaml','System.yaml','TEST.yaml','XX_BLUE.yaml','XX_GENERAL.yaml','XX_ITEM_GET.yaml','XX_MARI_LOCATIONS.yaml','XX_MELON.yaml','XX_OCEAN.yaml','XX_QUEST.yaml','XX_QUEST_TRACKER.yaml','XX_SKILL_GET.yaml','XX_SYSTEM.yaml','XX_TAGREJECT.yaml','art_sculpture.yaml','basils_deathtrap.yaml','basils_finalmemories.yaml','basils_memories.yaml','basils_path.yaml','battle_book.yaml','black_space_flavor_text.yaml','black_space_rev.yaml','blackjack_minigame.yaml','blackspace_intro.yaml','breaktime_chatter.yaml','bs_basils_shadow.yaml','dreamworld_extras_blackspace.yaml','dreamworld_extras_dinosdig.yaml','dreamworld_extras_doomtomb.yaml','dreamworld_extras_misc.yaml','dreamworld_extras_objectflavor.yaml','dreamworld_extras_pyrefly.yaml','dreamworld_extras_shop.yaml','dreamworld_extras_slimegirls.yaml','dreamworld_lost_forest.yaml','dreamworld_npc_dialogue.yaml','dreamworld_npc_dialogue_forgottenpier.yaml','dreamworld_npc_dialogue_frozenforest.yaml','dreamworld_npc_dialogue_lastresort.yaml','dreamworld_npc_dialogue_orangeoasis.yaml','dreamworld_npc_dialogue_otherworld.yaml','dreamworld_npc_dialogue_pinwheel.yaml','dreamworld_npc_dialogue_playground.yaml','dreamworld_npc_dialogue_pyrefly_doomtomb.yaml','dreamworld_npc_dialogue_slimegirls.yaml','dreamworld_npc_dialogue_sproutmole_sweetheart.yaml','dreamworld_npc_dialogue_sweetheart.yaml','dreamworld_npc_dialogue_whitespace.yaml','dw_boss_rush.yaml','dw_flavor_text.yaml','dw_hero_charm.yaml','dw_map_of_truth.yaml','fa_fridges.yaml','fa_map_flavor.yaml','faraway_conditional.yaml','faraway_kels_room.yaml','faraway_something_about_basil.yaml','farawaytown_day3_friends.yaml','farawaytown_dialogue_day1_day.yaml','farawaytown_dialogue_day1_sunset.yaml','farawaytown_dialogue_day2_day.yaml','farawaytown_dialogue_day2_sunset.yaml','farawaytown_dialogue_day3_day.yaml','farawaytown_dialogue_day3_sunset.yaml','farawaytown_dialogue_strangers.yaml','farawaytown_dialogue_tucker.yaml','farawaytown_extradialogue.yaml','farawaytown_extras_dailydialogue.yaml','farawaytown_extras_endings.yaml','farawaytown_extras_fears.yaml','farawaytown_extras_hardwareminigame.yaml','farawaytown_extras_marinight.yaml','farawaytown_extras_mavericks.yaml','farawaytown_extras_misc.yaml','farawaytown_extras_momsdialogue.yaml','farawaytown_extras_objectflavor.yaml','farawaytown_extras_petrock.yaml','farawaytown_extras_pizzaminigame.yaml','farawaytown_extras_shop.yaml','farawaytown_extras_supermarketminigame.yaml','gacha_minigame.yaml','hidden_library.yaml','hide_and_seek.yaml','kel_errands.yaml','menus.yaml','miscellanous_dialogues.yaml','new_npcs.yaml','npc_general.yaml','party_dialogue.yaml','pluto.yaml','sidequest_dreamworld_bed.yaml','sidequest_dreamworld_coffeemachine.yaml','sidequest_dreamworld_crowfriends.yaml','sidequest_dreamworld_deliversprout.yaml','sidequest_dreamworld_demonboy.yaml','sidequest_dreamworld_feedhumphrey.yaml','sidequest_dreamworld_fliphim.yaml','sidequest_dreamworld_flowerpuzzle.yaml','sidequest_dreamworld_ghostgathering.yaml','sidequest_dreamworld_hector.yaml','sidequest_dreamworld_hectorjr.yaml','sidequest_dreamworld_ingredients.yaml','sidequest_dreamworld_itch.yaml','sidequest_dreamworld_jash.yaml','sidequest_dreamworld_lostrarebear.yaml','sidequest_dreamworld_lostson.yaml','sidequest_dreamworld_marina.yaml','sidequest_dreamworld_medusa.yaml','sidequest_dreamworld_molly.yaml','sidequest_dreamworld_mush.yaml','sidequest_dreamworld_oragne.yaml','sidequest_dreamworld_peanutjelly.yaml','sidequest_dreamworld_perfectwind.yaml','sidequest_dreamworld_pinkbeard.yaml','sidequest_dreamworld_poolnoodle.yaml','sidequest_dreamworld_rabbitkiller.yaml','sidequest_dreamworld_recycle.yaml','sidequest_dreamworld_seasons.yaml','sidequest_dreamworld_squizzards.yaml','sidequest_dreamworld_stargazing.yaml','sidequest_dreamworld_stolen.yaml','sidequest_dreamworld_stoprain.yaml','sidequest_dreamworld_tentacle.yaml','sidequest_farawaytown_anniversarychoco.yaml','sidequest_farawaytown_anniversarypizza.yaml','sidequest_farawaytown_artist.yaml','sidequest_farawaytown_birthdaygift1.yaml','sidequest_farawaytown_birthdaygift2.yaml','sidequest_farawaytown_bringangel.yaml','sidequest_farawaytown_brushteeth.yaml','sidequest_farawaytown_claus.yaml','sidequest_farawaytown_cooking.yaml','sidequest_farawaytown_fixarcademachine.yaml','sidequest_farawaytown_fixpipe.yaml','sidequest_farawaytown_flower.yaml','sidequest_farawaytown_forgotmeat.yaml','sidequest_farawaytown_fruitwaradrian.yaml','sidequest_farawaytown_fruitwarbrayden.yaml','sidequest_farawaytown_ginohighscore.yaml','sidequest_farawaytown_ginojukebox.yaml','sidequest_farawaytown_hobbeezhighscore.yaml','sidequest_farawaytown_jackson.yaml','sidequest_farawaytown_lostlucas.yaml','sidequest_farawaytown_medication.yaml','sidequest_farawaytown_michaelslunch.yaml','sidequest_farawaytown_michaelthemusician.yaml','sidequest_farawaytown_mincy.yaml','sidequest_farawaytown_missingshears.yaml','sidequest_farawaytown_mypie.yaml','sidequest_farawaytown_oldhobo.yaml','sidequest_farawaytown_pickingpaint.yaml','sidequest_farawaytown_pickupfurniture.yaml','sidequest_farawaytown_ringinthesink.yaml','sidequest_farawaytown_seashells.yaml','sidequest_farawaytown_shutin.yaml','sidequest_farawaytown_smellyhobo.yaml','sidequest_farawaytown_sneakingoutbrent.yaml','sidequest_farawaytown_sneakingoutjoy.yaml','sidequest_farawaytown_toiletseat.yaml','sidequest_farawaytown_trashpickup.yaml','sidequest_farawaytown_tutorbrent.yaml','sidequest_farawaytown_tutorjoy.yaml','sidequest_farawaytown_wherestheremote.yaml','signs.yaml','slot_machine_minigame.yaml','snaley_tragedy.yaml','televisions.yaml','wtf.yaml','xx_battle_text.yaml','xx_cutscenes_ems.yaml','xx_map_expansion.yaml','xx_tombstones.yaml'
    ];

    var _langFileIndex = null;
    function languageFileIndex() {
        if (_langFileIndex) return _langFileIndex;
        _langFileIndex = Object.create(null);
        LANGUAGE_FILES.forEach(function (name) {
            _langFileIndex[name.toLowerCase()] = name;
        });
        return _langFileIndex;
    }

    function candidateKeys(key) {
        var keys = [key];
        var m = key.match(/\.([a-z0-9]+)$/i);
        if (m) {
            var target = DECRYPTED_EXT[m[1].toLowerCase()];
            if (target) keys.push(key.replace(/\.([a-z0-9]+)$/i, '.' + target));
        }
        return keys;
    }

    function decode(bytes) { return new TextDecoder('utf-8').decode(bytes); }
    function encode(text) { return new TextEncoder().encode(text); }

    function zip() { return window.ZipLoader || null; }

    function zipBytes(key) {
        var z = zip();
        if (z && typeof z.getFile === 'function') {
            try { return z.getFile(key) || null; } catch (e) { return null; }
        }
        return null;
    }

    function zipHas(key) {
        var z = zip();
        if (z && typeof z.hasFile === 'function') {
            try { return !!z.hasFile(key); } catch (e) { return false; }
        }
        return false;
    }

    function readText(key) {
        var keys = candidateKeys(key);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (Object.prototype.hasOwnProperty.call(memoryFS, k)) return memoryFS[k];
            var persisted = persistedGet(k);
            if (persisted !== undefined) {
                memoryFS[k] = persisted;
                return persisted;
            }
            var bytes = zipBytes(k);
            if (bytes) return decode(bytes);
        }
        return null;
    }

    var OVFS = {
        fsKey: fsKey,
        isGameAsset: isGameAsset,
        LANGUAGE_FILES: LANGUAGE_FILES,

        /* Map an archived (lowercased) language filename back to its canonical
         * desktop case; unknown/mod-added names pass through unchanged. */
        canonicalLanguageFile: function (name) {
            var idx = languageFileIndex();
            return idx[String(name).toLowerCase()] || String(name);
        },

        /* Synchronous text read with the XHR fallback used for local dev where
         * the archives aren't present. Returns '' when the file is absent. */
        readTextSync: function (path) {
            var key = fsKey(path);
            var value = readText(key);
            if (value !== null) return value;

            var z = zip();
            if (z && typeof z.isReady === 'function' && z.isReady()) {
                // The archive VFS is authoritative for these paths once ready.
                if (isGameAsset(key)) return '';
            }
            if (/^languages\//i.test(key) &&
                z && typeof z.hasLanguagePack === 'function' && z.hasLanguagePack()) {
                return '';
            }

            try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', key, false);
                xhr.send();
                return (xhr.status === 200 || xhr.status === 0) ? xhr.responseText : '';
            } catch (e) {
                return '';
            }
        },

        readBytes: function (path) {
            var key = fsKey(path);
            var keys = candidateKeys(key);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var bytes = zipBytes(k);
                if (bytes) return bytes;
                if (Object.prototype.hasOwnProperty.call(memoryFS, k)) return encode(memoryFS[k]);
                var persisted = persistedGet(k);
                if (persisted !== undefined) return encode(persisted);
            }
            return null;
        },

        exists: function (path) {
            var key = fsKey(path);
            var keys = candidateKeys(key);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (Object.prototype.hasOwnProperty.call(memoryFS, k)) return true;
                if (persistedGet(k) !== undefined) return true;
                if (zipHas(k)) return true;
            }
            return false;
        },

        /* Write a text file. Game-asset paths are routed into the archive VFS so
         * the running game picks up the override immediately; everything else
         * (save/*.rpgsave, TITLEDATA, mod configs) is persisted for next boot. */
        write: function (path, data) {
            var key = fsKey(path);
            var strData = (data instanceof Uint8Array ||
                (typeof Buffer !== 'undefined' && data instanceof Buffer))
                ? decode(data)
                : String(data == null ? '' : data);
            memoryFS[key] = strData;
            if (isGameAsset(key)) {
                var z = zip();
                if (z && typeof z.putFile === 'function') {
                    try { z.putFile(key, encode(strData)); } catch (e) {}
                }
            } else {
                persistedSet(key, strData);
            }
            return true;
        },

        writeBytes: function (path, bytes) {
            var key = fsKey(path);
            if (isGameAsset(key)) {
                var z = zip();
                if (z && typeof z.putFile === 'function') {
                    try { z.putFile(key, bytes); } catch (e) {}
                }
                try { memoryFS[key] = decode(bytes); } catch (e) {}
            } else {
                var text = decode(bytes);
                memoryFS[key] = text;
                persistedSet(key, text);
            }
            return true;
        },

        remove: function (path) {
            var key = fsKey(path);
            delete memoryFS[key];
            persistedDel(key);
            if (isGameAsset(key)) {
                var z = zip();
                if (z && typeof z.removeFile === 'function') {
                    try { z.removeFile(key); } catch (e) {}
                }
            }
            return true;
        },

        /* Directory listing: base VFS + memoryFS + persisted, merged, deduped,
         * sorted, returning the immediate child names (like fs.readdirSync). */
        list: function (dir) {
            var prefix = fsKey(dir).replace(/\/+$/, '') + '/';
            var names = {};

            var z = zip();
            if (z && typeof z.listFiles === 'function') {
                try {
                    z.listFiles(prefix).forEach(function (full) {
                        var rel = full.slice(prefix.length);
                        if (rel !== '') names[rel.split('/')[0]] = true;
                    });
                } catch (e) {}
            }
            Object.keys(memoryFS).forEach(function (k) {
                if (k.indexOf(prefix) === 0) {
                    var rel = k.slice(prefix.length);
                    if (rel !== '') names[rel.split('/')[0]] = true;
                }
            });
            try {
                if (window.localStorage) {
                    for (var i = 0; i < window.localStorage.length; i++) {
                        var sk = window.localStorage.key(i);
                        if (sk && sk.indexOf('wo.fs.') === 0) {
                            var k = sk.slice('wo.fs.'.length);
                            if (k.indexOf(prefix) === 0) {
                                var rel2 = k.slice(prefix.length);
                                if (rel2 !== '') names[rel2.split('/')[0]] = true;
                            }
                        }
                    }
                }
            } catch (e) {}

            return Object.keys(names).sort();
        },

        listFull: function (dir) {
            var prefix = fsKey(dir).replace(/\/+$/, '') + '/';
            var out = {};
            var z = zip();
            if (z && typeof z.listFiles === 'function') {
                try { z.listFiles(prefix).forEach(function (f) { out[f] = true; }); } catch (e) {}
            }
            Object.keys(memoryFS).forEach(function (k) {
                if (k.indexOf(prefix) === 0) out[k] = true;
            });
            return Object.keys(out).sort();
        }
    };

    window.OVFS = OVFS;
})();
