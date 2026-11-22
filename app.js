/* おしえてラジオ — 聞いて、後輩に説明して、覚える
 *   声      : 事前に生成した音声ファイル（無い教材はブラウザの読み上げ）
 *   聞き取り: AmiVoice API（WebSocket / 公式 Wrp ライブラリ）。キーが無ければブラウザ標準
 */
(function () {
"use strict";

// ================================================================ 保存
var LS = {
  key: "aizuchi.appkey", oldKey: "amivoice-drill-appkey-v1",
  settings: "oshiete.settings", deck: "oshiete.deck", progress: "oshiete.progress.", log: "oshiete.log", usage: "aizuchi.usage"
};
function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function lsRaw(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function appkey() { return lsRaw(LS.key) || lsRaw(LS.oldKey); }

var settings = Object.assign({ mode: "talk", engine: "auto", nolog: false, size: 5, quiet: 3.5, rate: 1.0 }, lsGet(LS.settings, {}));
function saveSettings() { lsSet(LS.settings, settings); }

// ================================================================ 小道具
function $(id) { return document.getElementById(id); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function toKata(s) { return String(s).replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
function toHira(s) { return String(s).replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
function norm(s) { return toHira(String(s || "").normalize("NFKC").toLowerCase()).replace(/[\s、。，．,.!?！？「」『』（）()・_\-〜~]/g, ""); }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// ================================================================ 教材
var deck = null, progress = {};
// 旧形式（scene/point/why/trap/easy だけのカード）も、掛け合いに組み直して流せるようにする
function normalizeDeck(j) {
  var d;
  if (Array.isArray(j)) d = { title: "読み込んだ教材", terms: [], cards: j.map(function (x) { return { scene: x.trigger, point: x.short || x.answer, why: x.answer }; }) };
  else if (j && Array.isArray(j.cards)) d = j;
  else throw new Error("教材の形式が違います。cards の配列を持つ JSON を選んでください。");
  var terms = (Array.isArray(d.terms) ? d.terms : []).filter(function (t) { return t && t.w && t.r; })
    .map(function (t) { return { w: String(t.w), r: toHira(String(t.r)) }; })
    .sort(function (a, b) { return b.w.length - a.w.length; });
  var cards = d.cards.filter(function (c) { return c && (c.talk || c.point); }).map(function (c, i) {
    var talk = Array.isArray(c.talk) && c.talk.length ? c.talk.map(function (x) { return { s: x.s === "h" ? "h" : "m", t: String(x.t) }; }) : [
      c.scene ? { s: "h", t: String(c.scene) } : null, { s: "m", t: String(c.point || "") }, c.why ? { s: "m", t: String(c.why) } : null,
      c.trap ? { s: "h", t: "ひっかけは、ありますか？" } : null, c.trap ? { s: "m", t: String(c.trap) } : null
    ].filter(Boolean);
    var keys = Array.isArray(c.keys) && c.keys.length ? c.keys : termsIn(terms, String(c.point || "")).slice(0, 3).map(function (t) {
      return { w: t.w, alt: [t.r], q: t.w + "は、どこで出てくるんでしたっけ？", a: String(c.point || "") };
    });
    keys = keys.filter(function (k) { return k && k.w; }).map(function (k) {
      return { w: String(k.w), alt: (k.alt || []).map(String), q: String(k.q || k.w + "は、どうなるんでしたっけ？"), a: String(k.a || c.point || "") };
    });
    return {
      id: String(c.id || "c" + (i + 1)), title: String(c.title || c.point || "カード" + (i + 1)).slice(0, 40),
      talk: talk, ask: String(c.ask || "じゃあ先輩、今の、わたしに説明してもらえますか？"), keys: keys,
      point: String(c.point || ""), easy: String(c.easy || c.point || ""),
      scene: String(c.scene || ""), why: String(c.why || ""), trap: String(c.trap || "")
    };
  });
  if (!cards.length) throw new Error("流せるカードが1枚もありません。");
  return {
    id: String(d.id || "deck-" + cards.length + "-" + norm(d.title || "").slice(0, 20)), title: String(d.title || "読み込んだ教材"),
    cast: d.cast || { m: { name: "ミナト" }, h: { name: "ヒナ" } }, audio: d.audio || "", terms: terms, cards: cards
  };
}
function termsIn(terms, text) {
  var found = [], rest = String(text || "");
  terms.forEach(function (t) {
    var re = new RegExp("(^|[^A-Za-z0-9])" + escRe(t.w) + "(?![A-Za-z0-9])");
    if (re.test(rest)) { found.push(t); rest = rest.replace(new RegExp(escRe(t.w), "g"), " "); }
  });
  return found;
}
function setDeck(d) { deck = d; progress = lsGet(LS.progress + deck.id, {}); }
function saveProgress() { lsSet(LS.progress + deck.id, progress); }
function statusOf(c) { var p = progress[c.id]; return p ? p.last : "new"; }

// 今日の分: もう少し・まだ言えない（古い順）→ まだ聞いていない → 説明できた（古い順）
function pickToday(n) {
  var weak = [], fresh = [], done = [];
  deck.cards.forEach(function (c) { var s = statusOf(c); (s === "new" ? fresh : s === "ok" ? done : weak).push(c); });
  function byOld(a, b) { return (progress[a.id].t || 0) - (progress[b.id].t || 0); }
  weak.sort(byOld); done.sort(byOld);
  var out = weak.slice(0, Math.min(2, n));
  fresh.concat(weak.slice(out.length), done).forEach(function (c) { if (out.length < n) out.push(c); });
  return out;
}

// ================================================================ 声（再生）
var player = null;
var Voice = (function () {
  var synth = window.speechSynthesis || null, voices = [];
  function loadVoices() {
    if (!synth) return;
    var all = synth.getVoices().filter(function (v) { return /^ja/i.test(v.lang); });
    // 品質の高そうな声を優先（Edge の Natural、Google、Enhanced / Premium）
    function score(v) { return (/Natural|Neural|Online/i.test(v.name) ? 4 : 0) + (/Premium|Enhanced|拡張|高品質/i.test(v.name) ? 3 : 0) + (/Google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1); }
    voices = all.sort(function (a, b) { return score(b) - score(a); });
  }
  if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener("voiceschanged", loadVoices); }
  var cur = null; // { stop }
  function playFile(url) {
    return new Promise(function (resolve, reject) {
      var done = false;
      function fin(ok) { if (done) return; done = true; player.onended = player.onerror = null; clearTimeout(guard); ok ? resolve() : reject(new Error("audio")); }
      player.onended = function () { fin(true); };
      player.onerror = function () { fin(false); };
      cur = { stop: function () { try { player.pause(); } catch (e) {} fin(true); } };
      player.src = url;
      player.playbackRate = settings.rate;
      var guard = setTimeout(function () { fin(false); }, 30000);
      var p = player.play();
      if (p && p.catch) p.catch(function () { fin(false); });
    });
  }
  function speakText(who, text) {
    var say = text;
    deck.terms.forEach(function (t) {
      say = say.replace(new RegExp("(^|[^A-Za-z0-9])" + escRe(t.w) + "(?![A-Za-z0-9])", "g"), "$1" + toKata(t.r));
    });
    if (!synth) return sleep(Math.min(8000, say.length * 160 / settings.rate));
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (!done) { done = true; clearTimeout(guard); resolve(); } }
      var u = new SpeechSynthesisUtterance(say);
      u.lang = "ja-JP"; u.rate = settings.rate;
      var v = who === "h" ? (voices[1] || voices[0]) : voices[0];
      if (v) u.voice = v;
      u.pitch = who === "h" ? 1.25 : 0.9;
      u.onend = u.onerror = fin;
      cur = { stop: function () { try { synth.cancel(); } catch (e) {} fin(); } };
      var guard = setTimeout(fin, say.length * 400 + 5000);
      try { synth.speak(u); } catch (e) { fin(); }
    });
  }
  return {
    unlock: function () { if (synth) { try { synth.cancel(); synth.speak(new SpeechSynthesisUtterance(" ")); } catch (e) {} } },
    // url があれば録音済みの声、無ければ読み上げ
    say: function (who, text, url) {
      if (url && !window.OSHIETE_NO_AUDIO) return playFile(url).catch(function () { return speakText(who, text); });
      return speakText(who, text);
    },
    stop: function () { if (cur) cur.stop(); cur = null; },
    setRate: function (r) { player.playbackRate = r; }
  };
})();
function clip(c, name) { return deck.audio ? deck.audio + c.id + "/" + name + ".mp3" : ""; }
function common(name) { return deck.audio ? deck.audio + "common/" + name + ".mp3" : ""; }
var COMMON = {
  hello: ["h", "先輩、今日もよろしくお願いします！"],
  praise1: ["h", "ばっちりです！ よくわかりました。"], praise2: ["h", "完璧です！ わたしも説明できそうです。"],
  praise3: ["h", "すごい、全部入ってました！"], praise4: ["h", "なるほど！ すっきりしました。"],
  got1: ["h", "あ、そうでした！"], got2: ["h", "それです、それ！"], got3: ["h", "なるほど、思い出しました！"],
  again: ["h", "あれ、聞こえなかったです。もう一回お願いします！"],
  kamikudaku: ["m", "じゃあ、かみくだいて言うね。"], thanks: ["h", "ありがとうございます。また今度、説明してくださいね。"],
  matome: ["m", "まとめると。"], review: ["h", "先輩、前に教えてもらったやつです。もう一回いいですか？"],
  think: ["h", "頭の中で、説明してみてください。"], bye: ["h", "今日はここまでです。おつかれさまでした！"]
};

var audioCtx = null;
function beep(freq, ms) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + ms / 1000 + 0.02);
  } catch (e) {}
}

// ================================================================ 聞き取り
function engineName() {
  if (window.OSHIETE_MOCK_ASR) return "mock";
  var hasBrowser = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  if (settings.engine === "browser") return hasBrowser ? "browser" : "";
  if (settings.engine === "amivoice") return appkey() && window.Wrp ? "amivoice" : "";
  return appkey() && window.Wrp ? "amivoice" : hasBrowser ? "browser" : "";
}
function friendly(msg) {
  msg = String(msg || "");
  if (/authoriz|appkey|verify/i.test(msg)) return "APPKEY を確認してください（期限切れかもしれません）。";
  if (/NotAllowed|Permission|denied|not-allowed/i.test(msg)) return "マイクが許可されていません。ブラウザの設定でマイクを許可してください。";
  if (/NotFound|MediaDevices|AudioContext|audio-capture/i.test(msg)) return "マイクを使えません。https で開いているか確認してください。";
  if (/network/i.test(msg)) return "通信できませんでした。電波を確認してください。";
  return "声の聞き取りにつながりませんでした。通信と APPKEY を確認してください。";
}
function addUsage(ms) {
  var day = new Date().toISOString().slice(0, 10), u = lsGet(LS.usage, {});
  if (u.day !== day) u = { day: day, ms: 0 };
  u.ms += ms; lsSet(LS.usage, u);
}
// profileWords（その接続だけ有効な単語登録）: 「表記 よみ」を | でつなぐ。27語まで
function profileWords(list) {
  var seen = {};
  return list.map(function (t) {
    var w = t.w.replace(/ /g, "_");
    if (seen[w] || !/^[A-Za-z0-9_぀-ヿ一-鿿]+$/.test(w) || !/^[ぁ-ゖー]+$/.test(t.r)) return "";
    seen[w] = true; return w + " " + t.r;
  }).filter(Boolean).slice(0, 27).join("|");
}
function wordsFor(c) {
  var text = c.talk.map(function (x) { return x.t; }).join(" ") + " " + c.keys.map(function (k) { return k.w + " " + k.a; }).join(" ");
  var mine = termsIn(deck.terms, text);
  return profileWords(mine.concat(deck.terms.filter(function (t) { return mine.indexOf(t) < 0; })));
}

// 1回の「あなたの番」。話し終わり（無音）・ボタン・上限で終わる。
// opts: { words, maxMs, onLive, onText(全体の途中経過) } → Promise<{ text, reading, spoke, error }>
var Listener = (function () {
  var cur = null;
  function run(opts) {
    var kind = engineName();
    if (kind === "mock") return window.OSHIETE_MOCK_ASR(opts, function (c) { cur = c; }).then(function (r) { cur = null; return r; });
    if (!kind) return Promise.resolve({ text: "", error: "声の聞き取りが使えません。設定を確認してください。" });
    return new Promise(function (resolve) {
      var finals = [], partial = "", reading = [], spoke = false, live = false, ended = false, stopping = false;
      var lastAct = 0, startAt = 0, timer = null, lastError = "";
      function full() { return finals.join("") + partial; }
      function finish(extra) {
        if (ended) return; ended = true; cur = null; clearInterval(timer);
        resolve(Object.assign({ text: finals.join("") || partial, reading: reading.join(""), spoke: spoke }, extra || {}));
      }
      function stop() { // 送るのをやめ、最後の結果を待ってから終わる
        if (stopping || ended) return; stopping = true;
        impl.stop();
        setTimeout(function () { finish(); }, 2500);
      }
      function act() { lastAct = Date.now(); }
      function tick() {
        if (!live || stopping) return;
        var now = Date.now();
        if (opts.onTick) opts.onTick(Math.floor((now - startAt) / 1000));
        if (now - startAt > opts.maxMs) return stop();
        if (!spoke && now - startAt > (opts.noSpeechMs || 9000)) return stop();
        if (spoke && !impl.inUtterance() && now - lastAct > settings.quiet * 1000) return stop();
      }
      var impl = kind === "amivoice" ? amivoice() : browser();
      cur = { stop: stop, cancel: function () { impl.cancel(); finish({ cancelled: true }); } };
      timer = setInterval(tick, 200);

      function onLive() { if (live) return; live = true; startAt = lastAct = Date.now(); beep(880, 110); if (opts.onLive) opts.onLive(); }
      function amivoice() {
        var inUtt = false;
        Wrp.TRACE = function (m) { if (/^ERROR/.test(m)) lastError = m; };
        Wrp.feedDataResumeEnded = function () { if (ended) { try { Wrp.feedDataPause(); } catch (e) {} return; } onLive(); };
        Wrp.utteranceStarted = function () { inUtt = true; spoke = true; act(); };
        Wrp.utteranceEnded = function () { inUtt = false; act(); };
        Wrp.resultUpdated = function (b) {
          try { var j = JSON.parse(b); partial = String(j.text || "").replace(/_/g, " "); } catch (e) {}
          if (partial) { spoke = true; act(); if (opts.onText) opts.onText(full()); }
        };
        Wrp.resultFinalized = function (b) {
          try {
            var j = JSON.parse(b), seg = j.results && j.results[0];
            var t = String(j.text || "").replace(/_/g, " ");
            if (t) { finals.push(t); spoke = true; }
            if (seg) {
              reading.push((seg.tokens || []).map(function (x) { return x.spoken || ""; }).join(""));
              addUsage(Math.max(0, (seg.endtime || 0) - (seg.starttime || 0)));
            }
          } catch (e) {}
          partial = ""; act(); if (opts.onText) opts.onText(full());
          if (stopping) finish();
        };
        Wrp.feedDataPauseEnded = function (reason) { if (reason && reason.code && !stopping) lastError = reason.message || lastError; };
        Wrp.disconnectEnded = function () {
          if (stopping) { setTimeout(function () { finish(); }, 300); return; }
          finish(live && !lastError ? {} : { error: friendly(lastError || "disconnected") });
        };
        Wrp.serverURL = settings.nolog ? "wss://acp-api.amivoice.com/v1/nolog/" : "wss://acp-api.amivoice.com/v1/";
        Wrp.grammarFileNames = "-a-general";
        Wrp.authorization = appkey();
        Wrp.profileWords = opts.words || "";
        Wrp.resultUpdatedInterval = "300";
        Wrp.keepFillerToken = "";
        if (window.Recorder) Recorder.maxRecordingTime = opts.maxMs + 15000;
        var ok = false;
        try { ok = Wrp.feedDataResume(); } catch (e) { lastError = String(e); }
        if (!ok) setTimeout(function () { finish({ error: friendly(lastError) }); }, 0);
        setTimeout(function () { if (!live && !ended) { try { Wrp.feedDataPause(); } catch (e) {} finish({ error: friendly(lastError || "timeout") }); } }, 12000);
        return {
          inUtterance: function () { return inUtt; },
          stop: function () { try { Wrp.feedDataPause(); } catch (e) {} },
          cancel: function () { try { Wrp.feedDataPause(); } catch (e) {} }
        };
      }
      function browser() {
        var R = window.SpeechRecognition || window.webkitSpeechRecognition, rec = new R(), res = [];
        rec.lang = "ja-JP"; rec.continuous = true; rec.interimResults = true;
        rec.onstart = onLive;
        rec.onresult = function (e) {
          var fin = "", inter = "";
          for (var i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (inter += e.results[i][0].transcript));
          finals = fin ? [fin] : []; partial = inter; spoke = true; act();
          if (opts.onText) opts.onText(full());
        };
        rec.onerror = function (e) { if (e.error !== "no-speech" && e.error !== "aborted") lastError = e.error; };
        rec.onend = function () { finish(lastError && !spoke ? { error: friendly(lastError) } : {}); };
        try { rec.start(); } catch (e) { setTimeout(function () { finish({ error: friendly(String(e)) }); }, 0); }
        return { inUtterance: function () { return !!partial; }, stop: function () { try { rec.stop(); } catch (e) {} }, cancel: function () { try { rec.abort(); } catch (e) {} } };
      }
    });
  }
  var control = { stop: function () { if (cur) cur.stop(); }, cancel: function () { if (cur) cur.cancel(); } };
  return { run: run, stop: function () { control.stop(); }, cancel: function () { control.cancel(); } };
})();

// 説明に入っていた要素
function hitKeys(keys, text, reading) {
  var t = norm(text), rd = norm(reading || "");
  return keys.map(function (k) {
    return [k.w].concat(k.alt).some(function (a) {
      var n = norm(a); if (!n) return false;
      return t.indexOf(n) >= 0 || (rd && rd.indexOf(norm(toHira(a))) >= 0);
    });
  });
}
var PASS_WORDS = ["わからない", "わからん", "わかりません", "わかんない", "ぱす", "すきっぷ", "おしえて"];
var AGAIN_WORDS = ["もういっかい", "もういちど", "もう1回", "もう一回", "もう一度", "ききなおし", "くりかえ"];
function isAgain(text) { var t = norm(text); return t.length <= 14 && AGAIN_WORDS.some(function (w) { return t.indexOf(norm(w)) >= 0; }); }
function isPass(text) { var t = norm(text); return t.length <= 14 && PASS_WORDS.some(function (w) { return t.indexOf(w) >= 0; }); }

// ================================================================ 画面
var screens = ["home", "session", "result"];
function show(name) { screens.forEach(function (s) { $(s).hidden = s !== name; }); window.scrollTo(0, 0); }
function name(who) { return who === "you" ? "あなた" : (deck.cast[who] && deck.cast[who].name) || (who === "h" ? "ヒナ" : "ミナト"); }

function renderHome() {
  var today = pickToday(settings.size);
  $("todayTitle").textContent = "今日の" + today.length + "枚";
  $("todayTime").textContent = "約" + Math.round(today.length * (settings.mode === "talk" ? 1.6 : 1.1)) + "分";
  var ol = $("todayList"); ol.textContent = "";
  today.forEach(function (c) {
    var li = document.createElement("li"), s = statusOf(c);
    li.className = "st-" + s;
    var t = document.createElement("span"); t.className = "t"; t.textContent = c.title;
    var b = document.createElement("span"); b.className = "b";
    b.textContent = s === "new" ? "はじめて" : s === "ok" ? "おさらい" : s === "part" ? "もう少し" : "まだ言えない";
    li.appendChild(t); li.appendChild(b); ol.appendChild(li);
  });
  document.querySelectorAll(".mode [data-mode]").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.mode === settings.mode ? "true" : "false"); });
  var e = engineName();
  var note = $("engineNote");
  note.className = "engine";
  if (settings.mode === "listen") note.textContent = "ヒナに聞かれたら、頭の中で説明してみてください。少し待ってから、ミナトさんがまとめます。";
  else if (e === "amivoice" || e === "mock") note.textContent = "聞き取り：AmiVoice（このカードの用語を辞書に登録して聞き取ります）";
  else if (e === "browser") { note.textContent = "聞き取り：ブラウザ標準。製品名が崩れやすいので、設定で AmiVoice の APPKEY を入れるのがおすすめです。"; note.className = "engine warn"; }
  else { note.textContent = "この端末では声の聞き取りが使えません。設定で AmiVoice の APPKEY を入れるか、「聞くだけ」で使ってください。"; note.className = "engine warn"; }
  $("deckName").textContent = deck.title;
  var ok = 0, part = 0, lost = 0, dots = $("dots"); dots.textContent = "";
  deck.cards.forEach(function (c) {
    var s = statusOf(c), d = document.createElement("span");
    d.className = "d d-" + s; dots.appendChild(d);
    if (s === "ok") ok++; else if (s === "part") part++; else if (s === "lost") lost++;
  });
  $("progressText").textContent = "説明できた " + ok + " / " + deck.cards.length;
  dots.setAttribute("aria-label", deck.cards.length + "枚中、説明できた" + ok + "枚、もう少し" + part + "枚、まだ言えない" + lost + "枚");
}

var chatEl = null;
function bubble(who, text, cls) {
  var li = document.createElement("li");
  li.className = "msg msg-" + who + (cls ? " " + cls : "");
  var n = document.createElement("span"); n.className = "who"; n.textContent = name(who);
  var p = document.createElement("p"); p.textContent = text;
  li.appendChild(n); li.appendChild(p);
  chatEl.querySelectorAll(".msg.now").forEach(function (x) { x.classList.remove("now"); });
  li.classList.add("now");
  chatEl.appendChild(li);
  li.scrollIntoView({ block: "end", behavior: "smooth" });
  return li;
}
function setStatus(t) { $("sStatus").textContent = t; }
function fitChat() { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }

// ================================================================ 学習の流れ
var run = 0, paused = false, set = [], pos = 0, results = [], skipFlag = false;
var mode = "talk"; // このセットの進め方（聞き取りが使えなくなったら、このセットだけ「聞くだけ」にする）
var wake = null;
function alive(tok) { return tok === run; }
function halt() { run++; Voice.stop(); Listener.cancel(); }

async function say(tok, who, text, url) {
  if (!alive(tok)) return;
  bubble(who, text);
  setStatus(name(who) + "が話しています");
  await Voice.say(who, text, url);
  if (alive(tok)) await sleep(220);
}
async function sayCommon(tok, key) { var c = COMMON[key]; await say(tok, c[0], c[1], common(key)); }

// キーのチップ（言うまで中身を伏せる）
function renderKeys(keys, hits, reveal) {
  var box = $("keys"); box.textContent = "";
  keys.forEach(function (k, i) {
    var s = document.createElement("span");
    s.className = "key" + (hits[i] ? " hit" : reveal ? " miss" : "");
    s.textContent = hits[i] || reveal ? k.w : "？？？";
    box.appendChild(s);
  });
}

// あなたの番
async function yourTurn(tok, c, keys, opts) {
  var hits = keys.map(function () { return false; });
  var turn = $("turn");
  $("turnLabel").textContent = opts.label || "あなたの番";
  $("turnQ").textContent = opts.question || "";
  $("turnTime").textContent = "";
  $("live").textContent = "";
  $("live").classList.remove("said");
  renderKeys(keys, hits, false);
  turn.hidden = false; turn.dataset.state = "connecting"; fitChat();
  setStatus("つないでいます");
  var r = await Listener.run({
    words: wordsFor(c), maxMs: opts.maxMs || 75000, noSpeechMs: opts.noSpeechMs || 10000,
    onLive: function () { if (!alive(tok)) return; turn.dataset.state = "live"; setStatus("どうぞ。話し終わったら少し黙ってください"); },
    onTick: function (s) { if (alive(tok)) $("turnTime").textContent = Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); },
    onText: function (t) {
      if (!alive(tok)) return;
      $("live").textContent = t;
      var h = hitKeys(keys, t, "");
      if (h.some(function (x, i) { return x && !hits[i]; })) { hits = hits.map(function (x, i) { return x || h[i]; }); renderKeys(keys, hits, false); beep(1320, 60); }
    }
  });
  turn.dataset.state = "done";
  if (!alive(tok)) return null;
  var final = hitKeys(keys, r.text || "", r.reading || "");
  hits = hits.map(function (x, i) { return x || final[i]; });
  r.hits = hits;
  return r;
}

function hideTurn() { $("turn").hidden = true; }

async function playCard(tok, c, idx) {
  chatEl = $("chat"); chatEl.textContent = "";
  hideTurn();
  $("sPos").textContent = (idx + 1) + " / " + set.length;
  $("sTitle").textContent = c.title;
  var before = statusOf(c), talkDone = false;
  var res = { card: c, result: "heard", hits: c.keys.map(function () { return false; }), text: "" };

  async function talk() { for (var i = 0; i < c.talk.length; i++) await say(tok, c.talk[i].s, c.talk[i].t, clip(c, "t" + i)); talkDone = true; }

  // おさらいの1枚は、いきなり説明から（思い出す練習）
  var recall = before === "ok" && mode === "talk";
  if (recall) await sayCommon(tok, "review"); else await talk();
  if (!alive(tok)) return null;
  await say(tok, "h", c.ask, clip(c, "ask"));
  if (!alive(tok)) return null;

  async function thinkOnly() { // 聞くだけ: 頭の中で説明する時間をとって、ミナトがまとめる
    await sayCommon(tok, "think");
    for (var s = 6; s > 0 && alive(tok); s--) { setStatus("頭の中で説明してみてください（あと" + s + "秒）"); await sleep(1000); }
    await sayCommon(tok, "matome");
    await say(tok, "m", c.point, clip(c, "point"));
    return res;
  }
  function failed(err) { // 聞き取りが使えない → このセットは聞くだけで続ける
    hideTurn(); mode = "listen";
    bubble("h", err + " このセットは、聞くだけで進めますね。", "err");
    return thinkOnly();
  }
  if (mode === "listen") return thinkOnly();

  var r = await yourTurn(tok, c, c.keys, { question: c.ask });
  if (!alive(tok)) return null;
  if (r.error) return failed(r.error);
  if (!r.text && !r.cancelled) { // 聞こえなかったら、もう一回だけ
    hideTurn();
    await sayCommon(tok, "again");
    r = await yourTurn(tok, c, c.keys, { question: c.ask });
    if (!alive(tok)) return null;
    if (r.error) return failed(r.error);
  }
  if (r.text && isAgain(r.text) && !r.hits.some(Boolean)) { // 「もう一回」: 掛け合いを聞き直して、もう一度説明
    hideTurn(); bubble("you", r.text);
    await talk(); if (!alive(tok)) return null;
    await say(tok, "h", c.ask, clip(c, "ask")); if (!alive(tok)) return null;
    r = await yourTurn(tok, c, c.keys, { question: c.ask });
    if (!alive(tok)) return null;
    if (r.error) return failed(r.error);
  }
  hideTurn();
  if (r.text) bubble("you", r.text);
  res.text = r.text || ""; res.hits = r.hits;
  var hitCount = r.hits.filter(Boolean).length;

  if (r.cancelled || !r.text || isPass(r.text) || hitCount === 0) {
    if (recall && !talkDone) { await talk(); }
    else { await sayCommon(tok, "kamikudaku"); await say(tok, "m", c.easy, clip(c, "easy")); }
    await sayCommon(tok, "thanks");
    res.result = "lost";
    return res;
  }
  if (hitCount === c.keys.length) {
    await sayCommon(tok, pick(["praise1", "praise2", "praise3", "praise4"]));
    res.result = "ok";
    return res;
  }
  // 抜けた所をひとつ聞き返す
  var mi = r.hits.indexOf(false), k = c.keys[mi];
  await say(tok, "h", k.q, clip(c, "k" + mi + "q"));
  if (!alive(tok)) return null;
  var r2 = await yourTurn(tok, c, [k], { label: "あなたの番（聞き返し）", question: k.q, maxMs: 30000, noSpeechMs: 8000 });
  if (!alive(tok)) return null;
  hideTurn();
  if (r2 && r2.text) { bubble("you", r2.text); res.text += "\n（聞き返しへの答え）" + r2.text; }
  if (r2 && !r2.error && r2.hits[0] && !isPass(r2.text)) {
    res.hits[mi] = true;
    await sayCommon(tok, pick(["got1", "got2", "got3"]));
  } else {
    await say(tok, "m", k.a, clip(c, "k" + mi + "a"));
  }
  if (res.hits.filter(Boolean).length < c.keys.length) {
    await sayCommon(tok, "matome");
    await say(tok, "m", c.point, clip(c, "point"));
  }
  res.result = res.hits.every(Boolean) ? "ok" : "part";
  return res;
}

function record(res) {
  if (!res) return;
  var c = res.card, p = progress[c.id] || { n: 0 };
  p.n++; p.t = Date.now();
  if (res.result !== "heard") p.last = res.result; else if (!p.last) p.last = "part";
  progress[c.id] = p; saveProgress();
  if (res.text) {
    var log = lsGet(LS.log, []);
    log.push({ deck: deck.id, card: c.id, t: Date.now(), text: res.text, hit: c.keys.filter(function (_, i) { return res.hits[i]; }).map(function (k) { return k.w; }), miss: c.keys.filter(function (_, i) { return !res.hits[i]; }).map(function (k) { return k.w; }), result: res.result });
    lsSet(LS.log, log.slice(-400));
  }
}

async function runSet(tok, startAt) {
  for (pos = startAt; pos < set.length; pos++) {
    if (!alive(tok)) return;
    skipFlag = false;
    var res = await playCard(tok, set[pos], pos);
    if (!alive(tok)) return;
    results[pos] = res; record(res);
    await sleep(500);
  }
  if (!alive(tok)) return;
  await sayCommon(tok, "bye");
  if (!alive(tok)) return;
  finishSet();
}

function startSet() {
  Voice.unlock(); beep(1, 1);
  set = pickToday(settings.size); results = []; pos = 0; paused = false; mode = settings.mode;
  show("session"); setPaused(false);
  try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { wake = l; }).catch(function () {}); } catch (e) {}
  halt(); var tok = run;
  chatEl = $("chat"); chatEl.textContent = "";
  $("sPos").textContent = ""; $("sTitle").textContent = "";
  // あいさつはタップの中で鳴らす（iPhone は操作の中でしか音を出し始められない）。マイクの許可も同時にもらう
  var hello = sayCommon(tok, "hello");
  var mic = Promise.resolve();
  if (settings.mode === "talk" && engineName() && engineName() !== "mock" && navigator.mediaDevices) {
    mic = navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); },
      function () { mode = "listen"; bubble("h", "マイクが使えないので、このセットは聞くだけで進めますね。", "err"); });
  }
  (async function () {
    await Promise.all([hello, mic]);
    await runSet(tok, 0);
  })().catch(function (e) { console.error(e); setStatus("止まりました。もう一度はじめてください"); });
}
function setPaused(on) {
  paused = on;
  $("pauseBtn").dataset.paused = on ? "true" : "false";
  $("pauseBtn").setAttribute("aria-label", on ? "続ける" : "一時停止");
}
function pauseSet() { if (paused) return; halt(); hideTurn(); setPaused(true); setStatus("一時停止中。▶ で、この1枚の最初から"); }
function resumeSet() { if (!paused) return; setPaused(false); Voice.unlock(); var tok = run; runSet(tok, pos).catch(function (e) { console.error(e); }); }
function skipCard() { halt(); hideTurn(); setPaused(false); var tok = run; runSet(tok, pos + 1).catch(function (e) { console.error(e); }); }
function quitSet() {
  halt(); hideTurn();
  if (wake) { try { wake.release(); } catch (e) {} wake = null; }
  if (results.filter(Boolean).length) finishSet(); else { show("home"); renderHome(); }
}

function finishSet() {
  halt();
  if (wake) { try { wake.release(); } catch (e) {} wake = null; }
  var done = results.filter(Boolean);
  var ok = done.filter(function (r) { return r.result === "ok"; }).length;
  var talked = done.filter(function (r) { return r.result !== "heard"; }).length;
  $("rLead").textContent = talked ? done.length + "枚中 " + ok + "枚、\n説明できました。" : done.length + "枚、聞きました。";
  $("rSub").textContent = talked ? "言えなかった言葉は、次のセットで先に出てきます。" : "次は「話す」で、ヒナに説明してみてください。";
  var ol = $("rList"); ol.textContent = "";
  done.forEach(function (r) {
    var li = document.createElement("li"); li.className = "r-item st-" + r.result;
    var h = document.createElement("div"); h.className = "r-head";
    var t = document.createElement("span"); t.className = "t"; t.textContent = r.card.title;
    var b = document.createElement("span"); b.className = "b";
    b.textContent = { ok: "説明できた", part: "もう少し", lost: "まだ言えない", heard: "聞いた" }[r.result];
    h.appendChild(t); h.appendChild(b); li.appendChild(h);
    if (r.result !== "heard") {
      var k = document.createElement("div"); k.className = "keys";
      r.card.keys.forEach(function (key, i) { var s = document.createElement("span"); s.className = "key " + (r.hits[i] ? "hit" : "miss"); s.textContent = key.w; k.appendChild(s); });
      li.appendChild(k);
    }
    if (r.text) { var p = document.createElement("p"); p.className = "said"; p.textContent = "「" + r.text.replace(/\n（聞き返しへの答え）/, "」「") + "」"; li.appendChild(p); }
    ol.appendChild(li);
  });
  $("rHandoff").hidden = !done.some(function (r) { return r.text; });
  $("rHandoffState").textContent = "";
  show("result");
}

// ================================================================ Claude への受け渡し（コピーして貼る）
var FORMAT_NOTE = [
  "教材は次の JSON 形式で、コードブロックに入れて出力してください。",
  '{ "title": "教材名", "terms": [{"w": "EventBridge", "r": "いべんとぶりっじ"}], "cards": [ {',
  '  "id": "c01", "title": "20字以内の題",',
  '  "talk": [{"s": "h", "t": "後輩ヒナの質問"}, {"s": "m", "t": "講師ミナトの説明"}],',
  '  "ask": "ヒナが先輩（学習者）に説明を頼むひとこと",',
  '  "keys": [{"w": "説明に入っていてほしい言葉", "alt": ["言い換え", "ひらがなの読み"], "q": "抜けたときのヒナの聞き返し", "a": "ミナトの短い答え"}],',
  '  "point": "要点を1文で", "easy": "たとえ話での言い換え", "scene": "場面", "why": "理由", "trap": "ひっかけ"',
  '} ] }',
  "",
  "書き方のルール（目ではなく耳で聞く教材です）:",
  "- talk は、ヒナの質問から始まる5往復以内の掛け合い。1つの台詞は60字以内の話し言葉。",
  "- ひっかけ（間違えやすい選択肢と、外れる理由）を talk の中に必ず入れる。",
  "- keys は2〜3個。学習者が説明できたかを判定する言葉。alt に言い換えとひらがなの読みを入れる。",
  "- 矢印、プラス、イコール、括弧、箇条書きなどの記号は使わない。",
  "- 英字の製品名や略語は英字のまま書き、すべて terms に {表記 w, ひらがなの読み r} で登録する。"
].join("\n");
function promptForDeck() {
  return "次のノートを、耳で聞いて覚える資格勉強の教材にしてください。講師ミナトと後輩ヒナの掛け合いで説明し、最後にヒナが学習者に説明を頼む形です。\n\n" + FORMAT_NOTE + "\n\n--- ここからノート ---\n（ここにノートや問題集のメモを貼る）";
}
function promptForHandoff() {
  var log = lsGet(LS.log, []).filter(function (x) { return x.deck === deck.id; });
  var byCard = {};
  log.forEach(function (x) { (byCard[x.card] = byCard[x.card] || []).push(x); });
  var out = ["資格勉強の音声教材を聞いたあと、学習者が後輩に説明するつもりで声に出した説明です。音声認識の結果そのままなので、言い間違いや誤字が混じっています。", ""];
  deck.cards.forEach(function (c) {
    var mine = byCard[c.id]; if (!mine) return;
    out.push("■ カード: " + c.title);
    out.push("  要点: " + c.point);
    if (c.why) out.push("  解説: " + c.why);
    if (c.trap) out.push("  ひっかけ: " + c.trap);
    mine.slice(-3).forEach(function (x) {
      out.push("  学習者の説明: 「" + x.text.replace(/\n/g, " ") + "」" + (x.miss.length ? "（言えなかった言葉: " + x.miss.join("、") + "）" : ""));
    });
    out.push("");
  });
  out.push("お願い:");
  out.push("1. カードごとに、学習者の説明をカードの内容と照らして、間違っている所とあやふやな所を短く指摘してください。合っている所は一言で構いません。");
  out.push("2. 間違いやあやふやがあったカードについて、別の角度から説明し直した補足カードを作ってください。前提知識が足りていなさそうなら、その前提を説明するカードも足してください。");
  out.push("");
  out.push(FORMAT_NOTE);
  return out.join("\n");
}
function copyText(text, stateEl, okMsg) {
  function ok() { stateEl.className = "hint good"; stateEl.textContent = okMsg; }
  function ng() { stateEl.className = "hint bad"; stateEl.textContent = "コピーできませんでした。ブラウザの設定を確認してください。"; }
  function legacy() {
    var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    (stateEl.closest("dialog") || document.body).appendChild(ta); ta.select();
    try { document.execCommand("copy") ? ok() : ng(); } catch (e) { ng(); }
    ta.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, legacy); else legacy();
}

// ================================================================ シート
function renderRecords() {
  var log = lsGet(LS.log, []).filter(function (x) { return x.deck === deck.id; }).reverse();
  var ol = $("recList"); ol.textContent = "";
  $("recEmpty").hidden = !!log.length; $("handoffBtn").disabled = !log.length;
  var byId = {}; deck.cards.forEach(function (c) { byId[c.id] = c; });
  log.slice(0, 60).forEach(function (x) {
    var c = byId[x.card]; if (!c) return;
    var li = document.createElement("li"); li.className = "st-" + x.result;
    var h = document.createElement("div"); h.className = "r-head";
    var t = document.createElement("span"); t.className = "t"; t.textContent = c.title;
    var d = new Date(x.t), b = document.createElement("span"); b.className = "when"; b.textContent = (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
    h.appendChild(t); h.appendChild(b); li.appendChild(h);
    var k = document.createElement("div"); k.className = "keys";
    x.hit.forEach(function (w) { var s = document.createElement("span"); s.className = "key hit"; s.textContent = w; k.appendChild(s); });
    x.miss.forEach(function (w) { var s = document.createElement("span"); s.className = "key miss"; s.textContent = w; k.appendChild(s); });
    li.appendChild(k);
    var p = document.createElement("p"); p.className = "said"; p.textContent = "「" + x.text.replace(/\n（聞き返しへの答え）/, "」「") + "」"; li.appendChild(p);
    ol.appendChild(li);
  });
}
function renderSettings() {
  $("appkey").value = appkey();
  $("optEngine").value = settings.engine; $("optNolog").checked = settings.nolog;
  $("optSize").value = String(settings.size); $("optQuiet").value = String(settings.quiet);
  $("deckInfo").textContent = "いまの教材：" + deck.title + "（" + deck.cards.length + "枚）";
  var u = lsGet(LS.usage, {}), today = new Date().toISOString().slice(0, 10);
  $("usage").textContent = "今日、AmiVoice で聞き取った時間：約 " + Math.round((u.day === today ? u.ms : 0) / 1000) + " 秒";
  $("keyState").className = "hint"; $("keyState").textContent = appkey() ? "キーは保存済みです。" : "";
}

// ================================================================ 起動
function bind() {
  player = $("player");
  $("startBtn").addEventListener("click", startSet);
  document.querySelectorAll(".mode [data-mode]").forEach(function (b) {
    b.addEventListener("click", function () { settings.mode = b.dataset.mode; saveSettings(); renderHome(); });
  });
  $("pauseBtn").addEventListener("click", function () { if (paused) resumeSet(); else pauseSet(); });
  $("skipBtn").addEventListener("click", skipCard);
  $("quitBtn").addEventListener("click", quitSet);
  $("doneBtn").addEventListener("click", function () { Listener.stop(); });
  $("passBtn").addEventListener("click", function () { Listener.cancel(); });
  var RATES = [1.0, 1.15, 1.3, 0.9];
  function renderRate() { $("rateBtn").textContent = (settings.rate === Math.round(settings.rate) ? settings.rate.toFixed(1) : String(settings.rate)) + "倍"; }
  $("rateBtn").addEventListener("click", function () { settings.rate = RATES[(RATES.indexOf(settings.rate) + 1) % RATES.length]; saveSettings(); Voice.setRate(settings.rate); renderRate(); });
  renderRate();
  $("moreBtn").addEventListener("click", startSet);
  $("homeBtn").addEventListener("click", function () { show("home"); renderHome(); });
  $("rHandoff").addEventListener("click", function () { copyText(promptForHandoff(), $("rHandoffState"), "コピーしました。Claude のチャットに貼り付けてください。"); });

  document.querySelectorAll("dialog [data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
  document.querySelectorAll("dialog").forEach(function (d) { d.addEventListener("click", function (e) { if (e.target === d) d.close(); }); });
  $("openRecords").addEventListener("click", function () { renderRecords(); $("handoffState").textContent = ""; $("recordsSheet").showModal(); });
  $("openSettings").addEventListener("click", function () { renderSettings(); $("settingsSheet").showModal(); });
  $("settingsSheet").addEventListener("close", renderHome);
  $("handoffBtn").addEventListener("click", function () { copyText(promptForHandoff(), $("handoffState"), "コピーしました。Claude のチャットに貼り付けてください。"); });

  $("saveKey").addEventListener("click", function () {
    var v = $("appkey").value.trim();
    try { if (v) localStorage.setItem(LS.key, v); else { localStorage.removeItem(LS.key); localStorage.removeItem(LS.oldKey); } } catch (e) {}
    $("keyState").className = "hint good"; $("keyState").textContent = v ? "キーを保存しました。" : "キーを消しました。";
  });
  $("testMic").addEventListener("click", async function () {
    var st = $("keyState");
    if (!engineName()) { st.className = "hint bad"; st.textContent = "声の聞き取りが使えません。APPKEY を保存してください。"; return; }
    st.className = "hint"; st.textContent = "つないでいます…";
    var c = deck.cards[0];
    var r = await Listener.run({ words: wordsFor(c), maxMs: 12000, noSpeechMs: 7000,
      onLive: function () { st.textContent = "どうぞ。「EventBridge で拾って Lambda から Slack へ」と言ってみてください。"; },
      onText: function (t) { st.textContent = "聞き取り中：" + t; } });
    if (r.error) { st.className = "hint bad"; st.textContent = r.error; return; }
    if (!r.text) { st.className = "hint bad"; st.textContent = r.spoke ? "声は届きましたが、文字になりませんでした。" : "マイクに声が入っていません。ほかのアプリがマイクを使っていないか確認してください。"; return; }
    var h = hitKeys(c.keys, r.text, r.reading);
    st.className = "hint good";
    st.textContent = "聞き取り（" + (engineName() === "amivoice" ? "AmiVoice" : "ブラウザ標準") + "）：「" + r.text + "」　入っていた言葉：" + (c.keys.filter(function (_, i) { return h[i]; }).map(function (k) { return k.w; }).join("、") || "なし");
  });
  $("optEngine").addEventListener("change", function (e) { settings.engine = e.target.value; saveSettings(); });
  $("optNolog").addEventListener("change", function (e) { settings.nolog = e.target.checked; saveSettings(); });
  $("optSize").addEventListener("change", function (e) { settings.size = Number(e.target.value); saveSettings(); });
  $("optQuiet").addEventListener("change", function (e) { settings.quiet = Number(e.target.value); saveSettings(); });
  $("deckFile").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return; var st = $("deckState");
    f.text().then(function (txt) {
      var m = txt.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) txt = m[1];
      var d = normalizeDeck(JSON.parse(txt)); d.audio = "";
      lsSet(LS.deck, d); setDeck(d); renderSettings();
      st.className = "hint good"; st.textContent = "読み込みました：" + d.title + "（" + d.cards.length + "枚）";
    }).catch(function (err) { st.className = "hint bad"; st.textContent = err instanceof SyntaxError ? "JSON として読めませんでした。" : err.message; });
    e.target.value = "";
  });
  $("deckReset").addEventListener("click", function () {
    try { localStorage.removeItem(LS.deck); } catch (e) {}
    loadSample().then(function () { renderSettings(); $("deckState").className = "hint good"; $("deckState").textContent = "サンプルに戻しました。"; });
  });
  $("copyPrompt").addEventListener("click", function () { copyText(promptForDeck(), $("promptState"), "コピーしました。ノートを貼り足して Claude に渡し、返ってきた JSON をファイルに保存して読み込みます。"); });
  var armed = 0;
  $("resetProgress").addEventListener("click", function () {
    var b = this;
    if (Date.now() - armed < 4000) {
      progress = {}; saveProgress(); lsSet(LS.log, lsGet(LS.log, []).filter(function (x) { return x.deck !== deck.id; }));
      armed = 0; b.textContent = "記録を消す"; $("deckState").className = "hint good"; $("deckState").textContent = "記録を消しました。"; return;
    }
    armed = Date.now(); b.textContent = "もう一度押すと消えます";
    setTimeout(function () { if (armed) { armed = 0; b.textContent = "記録を消す"; } }, 4000);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && !$("session").hidden && !paused && mode === "talk") pauseSet();
  });
}
function loadSample() {
  return fetch("deck-sample.json").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) { setDeck(normalizeDeck(j)); });
}
function boot() {
  bind();
  var custom = lsGet(LS.deck, null), ready;
  try { if (custom) { setDeck(normalizeDeck(custom)); ready = Promise.resolve(); } } catch (e) { custom = null; }
  if (!custom) ready = loadSample();
  ready.then(renderHome).catch(function () { $("engineNote").textContent = "教材を読み込めませんでした。https か localhost で開いてください。"; });
}
window.OSHIETE = { hitKeys: hitKeys, isPass: isPass, normalizeDeck: normalizeDeck, deck: function () { return deck; } };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
