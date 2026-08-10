        (function() {
            'use strict';
            
            if (typeof Buffer === 'undefined') {
                window.Buffer = class Buffer extends Uint8Array {
                    constructor(data) {
                        super(typeof data === 'string' ? new TextEncoder().encode(data) : data);
                    }
                    static from(data) { return new Uint8Array(typeof data === 'string' ? new TextEncoder().encode(data) : data); }
                    toString() { return new TextDecoder('utf-8').decode(this); }
                };
            }
            
            function readFileSyncXHR(path) {
                try {
                    let urlPath = path.replace(/\\/g, '/').replace(/^\//, '');
                    var normalized = urlPath.replace(/^\.\//, '').replace(/^\/+/, '');
                    if (window.ZipLoader && window.ZipLoader.getFile) {
                        var bytes = window.ZipLoader.getFile(normalized);
                        if (bytes) return new TextDecoder('utf-8').decode(bytes);
                    }
                    if (/^languages\//i.test(normalized) &&
                        window.ZipLoader && typeof window.ZipLoader.hasLanguagePack === 'function' &&
                        window.ZipLoader.hasLanguagePack()) {
                        return '';
                    }
                    urlPath = window.rewriteToCDN ? window.rewriteToCDN(urlPath) : urlPath;
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', urlPath, false);
                    xhr.send();
                    return (xhr.status === 200 || xhr.status === 0) ? xhr.responseText : null;
                } catch(e) {
                    return null;
                }
            }
            
            const memoryFS = {};
            window.__memoryFS = memoryFS;
            
            window.require = function(mod) {
                const cleanMod = window.stripSdcardPath ? window.stripSdcardPath(mod) : mod;
                if (cleanMod === 'fs') {
                    return {
                        readdirSync: function(dirPath) {
                            var normalized = (dirPath || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
                            if (normalized.includes('languages/en') || normalized.includes('languages\\en')) {
                                return ['00_Bf_Dialogue.yaml','00_template.yaml','01_cutscenes_neighbors.yaml','01_map_whitespace.yaml','02_cutscenes_hideandseek.yaml','02_cutscenes_lostball.yaml','02_map_neighborsroom.yaml','03_cutscenes_basil.yaml','04_cutscenes_blackletters.yaml','05_cutscenes_spaceboyfriend.yaml','06_cutscenes_junkyard.yaml','07_cutscenes_spaceexboyfriend.yaml','08_cutscenes_captspaceboy.yaml','09_cutscenes_hobbeez.yaml','10_cutscenes_fakeknifefight.yaml','11_cutscenes_stolenalbum_pt1.yaml','12_cutscenes_stolenalbum_pt2.yaml','13_cutscenes_dinneratbasils.yaml','14_cutscenes_sweetheartquest.yaml','15_cutscenes_herothebachelor.yaml','16_cutscenes_thewedding.yaml','17_cutscenes_pollysworry.yaml','18_cutscenes_secretlake.yaml','19_cutscenes_kelshouse.yaml','20_cutscenes_sleepover.yaml','21_cutscenes_lastresort.yaml','22_cutscenes_humphrey.yaml','23_cutscenes_slimegirls.yaml','24_cutscenes_finalboss.yaml','25_cutscenes_blackhole.yaml','26_cutscenes_aubrey.yaml','27_cutscenes_treehouse.yaml','28_cutscenes_helpbasil.yaml','29_cutscenes_basilsplea.yaml','ALBUM.yaml','ALBUM_test.yaml','Bestiary.yaml','Database.yaml','System.yaml','TEST.yaml','XX_BLUE.yaml','XX_GENERAL.yaml','XX_ITEM_GET.yaml','XX_MARI_LOCATIONS.yaml','XX_MELON.yaml','XX_OCEAN.yaml','XX_QUEST.yaml','XX_QUEST_TRACKER.yaml','XX_SKILL_GET.yaml','XX_SYSTEM.yaml','XX_TAGREJECT.yaml','art_sculpture.yaml','basils_deathtrap.yaml','basils_finalmemories.yaml','basils_memories.yaml','basils_path.yaml','battle_book.yaml','black_space_flavor_text.yaml','black_space_rev.yaml','blackjack_minigame.yaml','blackspace_intro.yaml','breaktime_chatter.yaml','bs_basils_shadow.yaml','dreamworld_extras_blackspace.yaml','dreamworld_extras_dinosdig.yaml','dreamworld_extras_doomtomb.yaml','dreamworld_extras_misc.yaml','dreamworld_extras_objectflavor.yaml','dreamworld_extras_pyrefly.yaml','dreamworld_extras_shop.yaml','dreamworld_extras_slimegirls.yaml','dreamworld_lost_forest.yaml','dreamworld_npc_dialogue.yaml','dreamworld_npc_dialogue_forgottenpier.yaml','dreamworld_npc_dialogue_frozenforest.yaml','dreamworld_npc_dialogue_lastresort.yaml','dreamworld_npc_dialogue_orangeoasis.yaml','dreamworld_npc_dialogue_otherworld.yaml','dreamworld_npc_dialogue_pinwheel.yaml','dreamworld_npc_dialogue_playground.yaml','dreamworld_npc_dialogue_pyrefly_doomtomb.yaml','dreamworld_npc_dialogue_slimegirls.yaml','dreamworld_npc_dialogue_sproutmole_sweetheart.yaml','dreamworld_npc_dialogue_sweetheart.yaml','dreamworld_npc_dialogue_whitespace.yaml','dw_boss_rush.yaml','dw_flavor_text.yaml','dw_hero_charm.yaml','dw_map_of_truth.yaml','fa_fridges.yaml','fa_map_flavor.yaml','faraway_conditional.yaml','faraway_kels_room.yaml','faraway_something_about_basil.yaml','farawaytown_day3_friends.yaml','farawaytown_dialogue_day1_day.yaml','farawaytown_dialogue_day1_sunset.yaml','farawaytown_dialogue_day2_day.yaml','farawaytown_dialogue_day2_sunset.yaml','farawaytown_dialogue_day3_day.yaml','farawaytown_dialogue_day3_sunset.yaml','farawaytown_dialogue_strangers.yaml','farawaytown_dialogue_tucker.yaml','farawaytown_extradialogue.yaml','farawaytown_extras_dailydialogue.yaml','farawaytown_extras_endings.yaml','farawaytown_extras_fears.yaml','farawaytown_extras_hardwareminigame.yaml','farawaytown_extras_marinight.yaml','farawaytown_extras_mavericks.yaml','farawaytown_extras_misc.yaml','farawaytown_extras_momsdialogue.yaml','farawaytown_extras_objectflavor.yaml','farawaytown_extras_petrock.yaml','farawaytown_extras_pizzaminigame.yaml','farawaytown_extras_shop.yaml','farawaytown_extras_supermarketminigame.yaml','gacha_minigame.yaml','hidden_library.yaml','hide_and_seek.yaml','kel_errands.yaml','menus.yaml','miscellanous_dialogues.yaml','new_npcs.yaml','npc_general.yaml','party_dialogue.yaml','pluto.yaml','sidequest_dreamworld_bed.yaml','sidequest_dreamworld_coffeemachine.yaml','sidequest_dreamworld_crowfriends.yaml','sidequest_dreamworld_deliversprout.yaml','sidequest_dreamworld_demonboy.yaml','sidequest_dreamworld_feedhumphrey.yaml','sidequest_dreamworld_fliphim.yaml','sidequest_dreamworld_flowerpuzzle.yaml','sidequest_dreamworld_ghostgathering.yaml','sidequest_dreamworld_hector.yaml','sidequest_dreamworld_hectorjr.yaml','sidequest_dreamworld_ingredients.yaml','sidequest_dreamworld_itch.yaml','sidequest_dreamworld_jash.yaml','sidequest_dreamworld_lostrarebear.yaml','sidequest_dreamworld_lostson.yaml','sidequest_dreamworld_marina.yaml','sidequest_dreamworld_medusa.yaml','sidequest_dreamworld_molly.yaml','sidequest_dreamworld_mush.yaml','sidequest_dreamworld_oragne.yaml','sidequest_dreamworld_peanutjelly.yaml','sidequest_dreamworld_perfectwind.yaml','sidequest_dreamworld_pinkbeard.yaml','sidequest_dreamworld_poolnoodle.yaml','sidequest_dreamworld_rabbitkiller.yaml','sidequest_dreamworld_recycle.yaml','sidequest_dreamworld_seasons.yaml','sidequest_dreamworld_squizzards.yaml','sidequest_dreamworld_stargazing.yaml','sidequest_dreamworld_stolen.yaml','sidequest_dreamworld_stoprain.yaml','sidequest_dreamworld_tentacle.yaml','sidequest_farawaytown_anniversarychoco.yaml','sidequest_farawaytown_anniversarypizza.yaml','sidequest_farawaytown_artist.yaml','sidequest_farawaytown_birthdaygift1.yaml','sidequest_farawaytown_birthdaygift2.yaml','sidequest_farawaytown_bringangel.yaml','sidequest_farawaytown_brushteeth.yaml','sidequest_farawaytown_claus.yaml','sidequest_farawaytown_cooking.yaml','sidequest_farawaytown_fixarcademachine.yaml','sidequest_farawaytown_fixpipe.yaml','sidequest_farawaytown_flower.yaml','sidequest_farawaytown_forgotmeat.yaml','sidequest_farawaytown_fruitwaradrian.yaml','sidequest_farawaytown_fruitwarbrayden.yaml','sidequest_farawaytown_ginohighscore.yaml','sidequest_farawaytown_ginojukebox.yaml','sidequest_farawaytown_hobbeezhighscore.yaml','sidequest_farawaytown_jackson.yaml','sidequest_farawaytown_lostlucas.yaml','sidequest_farawaytown_medication.yaml','sidequest_farawaytown_michaelslunch.yaml','sidequest_farawaytown_michaelthemusician.yaml','sidequest_farawaytown_mincy.yaml','sidequest_farawaytown_missingshears.yaml','sidequest_farawaytown_mypie.yaml','sidequest_farawaytown_oldhobo.yaml','sidequest_farawaytown_pickingpaint.yaml','sidequest_farawaytown_pickupfurniture.yaml','sidequest_farawaytown_ringinthesink.yaml','sidequest_farawaytown_seashells.yaml','sidequest_farawaytown_shutin.yaml','sidequest_farawaytown_smellyhobo.yaml','sidequest_farawaytown_sneakingoutbrent.yaml','sidequest_farawaytown_sneakingoutjoy.yaml','sidequest_farawaytown_toiletseat.yaml','sidequest_farawaytown_trashpickup.yaml','sidequest_farawaytown_tutorbrent.yaml','sidequest_farawaytown_tutorjoy.yaml','sidequest_farawaytown_wherestheremote.yaml','signs.yaml','slot_machine_minigame.yaml','snaley_tragedy.yaml','televisions.yaml','wtf.yaml','xx_battle_text.yaml','xx_cutscenes_ems.yaml','xx_map_expansion.yaml','xx_tombstones.yaml'];
                            }
                            return [];
                        },
                        readFileSync: function(path, options) {
                            const fixedPath = window.stripSdcardPath ? window.stripSdcardPath(path) : path;
                            if (memoryFS[fixedPath]) return memoryFS[fixedPath];
                            const content = readFileSyncXHR(fixedPath);
                            if (content !== null) {
                                memoryFS[fixedPath] = content;
                                return content;
                            }
                            return '';
                        },
                        existsSync: function(path) { return true; },
                        mkdirSync: function(dirPath) { return true; },
                        unlinkSync: function(path) {
                            var key = window.stripSdcardPath ? window.stripSdcardPath(path) : path;
                            delete memoryFS[key];
                            if (window.WOClient && window.WOClient.remove) {
                                try { window.WOClient.remove(key); } catch (e) {}
                            }
                        },
                        writeFileSync: function(path, data) {
                            var strData = data;
                            if (data instanceof Uint8Array || (typeof Buffer !== 'undefined' && data instanceof Buffer)) {
                                strData = new TextDecoder('utf-8').decode(data);
                            }
                            var key = window.stripSdcardPath ? window.stripSdcardPath(path) : path;
                            memoryFS[key] = strData;
                            if (window.WOClient && window.WOClient.put) {
                                try { window.WOClient.put(key, strData); } catch (e) {}
                            }
                        },
                        writeFile: function(path, data, callback) {
                            this.writeFileSync(path, data);
                            if (typeof callback === 'function') {
                                setTimeout(function() { callback(null); }, 0);
                            }
                        },
                        readFile: function(path, options, callback) {
                            if (typeof options === 'function') {
                                callback = options;
                                options = null;
                            }
                            var key = window.stripSdcardPath ? window.stripSdcardPath(path) : path;
                            var content = memoryFS[key];
                            if (content === undefined) {
                                content = readFileSyncXHR(key);
                                if (content !== null) {
                                    memoryFS[key] = content;
                                } else {
                                    content = '';
                                }
                            }
                            if (typeof callback === 'function') {
                                setTimeout(function() { callback(null, content); }, 0);
                            }
                        }
                    };
                }
                if (cleanMod === 'path') {
                    return {
                        // FIX: Boolean).join
                        join: (...args) => args.filter(Boolean).join('/').replace(/\/+/g, '/'),
                        dirname: (p) => p.split('/').slice(0, -1).join('/') || '.'
                    };
                }
                if (cleanMod === 'nw.gui') return window.nw;
                if (cleanMod.includes('js-yaml')) {
                    // Robust YAML parser for browser
                    function stripInlineComment(val) {
                        var inQ = false;
                        var qCh = '';
                        for (var i = 0; i < val.length; i++) {
                            var ch = val[i];
                            if (!inQ && (ch === '"' || ch === "'")) { inQ = true; qCh = ch; continue; }
                            if (inQ && ch === qCh) { inQ = false; qCh = ''; continue; }
                            if (!inQ && ch === '#') { return val.substring(0, i).trim(); }
                        }
                        return val.trim();
                    }
                    function parseYamlValue(val) {
                        val = stripInlineComment(val);
                        if (val === '' || val === 'null' || val === '~') return undefined;
                        if (val === 'true') return true;
                        if (val === 'false') return false;
                        if ((val.startsWith('{') && val.endsWith('}')) ||
                            (val.startsWith('[') && val.endsWith(']'))) {
                            try {
                                return parseFlow(val);
                            } catch(e) { return val; }
                        }
                        if (!isNaN(val) && val !== '') return Number(val);
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) return val.slice(1, -1);
                        return val;
                    }
                    function stripQuotes(s) {
                        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                            return s.slice(1, -1);
                        }
                        return s;
                    }
                    function splitFlowLevels(str, pos) {
                        var parts = [];
                        var cur = '';
                        var depth = 0;
                        var inQ = false;
                        var qCh = '';
                        for (var i = 0; i < str.length; i++) {
                            var ch = str[i];
                            if (!inQ && (ch === '"' || ch === "'")) { inQ = true; qCh = ch; cur += ch; continue; }
                            if (inQ && ch === qCh) { inQ = false; qCh = ''; cur += ch; continue; }
                            if (!inQ) {
                                if (ch === '[' || ch === '{') { depth++; cur += ch; continue; }
                                if (ch === ']' || ch === '}') { depth--; cur += ch; continue; }
                                if (ch === pos && depth === 0) { parts.push(cur); cur = ''; continue; }
                            }
                            cur += ch;
                        }
                        parts.push(cur);
                        return parts;
                    }
                    function parseFlow(val) {
                        if (val.startsWith('{') && val.endsWith('}')) {
                            var mInner = val.slice(1, -1);
                            var mResult = {};
                            var mParts = splitFlowLevels(mInner, ',');
                            for (var i = 0; i < mParts.length; i++) {
                                var part = mParts[i].trim();
                                if (!part) continue;
                                var kv = splitFlowLevels(part, ':');
                                if (kv.length === 1 || part === ':') continue;
                                var key = stripQuotes(kv[0].trim());
                                var valStr = kv.slice(1).join(':').trim();
                                if (valStr === '') { mResult[key] = {}; continue; }
                                mResult[key] = parseFlowValue(valStr);
                            }
                            return mResult;
                        }
                        if (val.startsWith('[') && val.endsWith(']')) {
                            var sInner = val.slice(1, -1);
                            var sResult = [];
                            var sParts = splitFlowLevels(sInner, ',');
                            for (var j = 0; j < sParts.length; j++) {
                                var el = sParts[j].trim();
                                if (!el) continue;
                                sResult.push(parseFlowValue(el));
                            }
                            return sResult;
                        }
                        return parseFlowValue(val);
                    }
                    function parseFlowValue(val) {
                        val = stripInlineComment(val.trim());
                        if (val === '' || val === '~') return undefined;
                        if (val === 'null') return null;
                        if (val === 'true') return true;
                        if (val === 'false') return false;
                        if (!isNaN(val) && val !== '') return Number(val);
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                            return val.slice(1, -1);
                        }
                        if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
                            return parseFlow(val);
                        }
                        return val;
                    }
                    return {
                        load: function(yamlString) {
                            var result = {};
                            var lines = yamlString.split('\n');
                            var stack = [{obj: result, indent: -1, parent: null, key: null}];
                            for (var li = 0; li < lines.length; li++) {
                                var line = lines[li];
                                var trimmed = line.trim();
                                if (!trimmed || trimmed.startsWith('#')) continue;
                                var indent = line.search(/\S|$/);
                                while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
                                var ctx = stack[stack.length - 1].obj;

                                // YAML sequence item: "- value" or "- key: value"
                                var seqMatch = trimmed.match(/^-\s+(.*)$/);
                                if (seqMatch) {
                                    var seqVal = seqMatch[1];
                                    // Convert ctx from object to array if it's the first sequence item
                                    if (!Array.isArray(ctx)) {
                                        var entry = stack[stack.length - 1];
                                        var arr = [];
                                        if (entry.parent && entry.key !== null) {
                                            entry.parent[entry.key] = arr;
                                        }
                                        entry.obj = arr;
                                        ctx = arr;
                                    }
                                    // FIX: When the list item value starts with { or [,
                                    // it's an inline flow object/array — parse it as a
                                    // whole value instead of splitting on the first colon.
                                    if (seqVal.charAt(0) === '{' || seqVal.charAt(0) === '[') {
                                        var parsed = parseYamlValue(seqVal);
                                        ctx.push(parsed !== undefined ? parsed : seqVal);
                                        continue;
                                    }
                                    // Check if item is a mapping: "- key: value"
                                    var seqVm = seqVal.match(/^([^:]+):\s*(.*)$/);
                                    if (seqVm) {
                                        var seqKey = seqVm[1].trim();
                                        var seqValue = seqVm[2].trim();
                                        var seqParsed = parseYamlValue(seqValue);
                                        var newObj = {};
                                        if (seqParsed === undefined) {
                                            newObj[seqKey] = {};
                                        } else {
                                            newObj[seqKey] = seqParsed;
                                        }
                                        ctx.push(newObj);
                                        stack.push({obj: newObj, indent: indent, parent: null, key: null});
                                    } else {
                                        var parsed2 = parseYamlValue(seqVal);
                                        ctx.push(parsed2 !== undefined ? parsed2 : seqVal);
                                    }
                                    continue;
                                }

                                var vm = trimmed.match(/^([^:]+):\s*(.*)$/);
                                if (!vm) continue;
                                var key = vm[1].trim();
                                var val = vm[2].trim();
                                var parsed = parseYamlValue(val);
                                if (parsed === undefined) {
                                    ctx[key] = {};
                                    stack.push({obj: ctx[key], indent: indent, parent: ctx, key: key});
                                } else {
                                    ctx[key] = parsed;
                                }
                            }
                            return result;
                        },
                        safeLoad: function(yamlString) {
                            return this.load(yamlString);
                        }
                    };
                }
                return {};
            };
        })();
