/* あいづちラジオ — 聞いて、あいづちで進む資格勉強ラジオ
 *   読み上げ : ブラウザ標準の speechSynthesis
 *   音声認識 : AmiVoice API（WebSocket / 公式 Wrp ライブラリ）
 */
(function () {
"use strict";

// ---------------------------------------------------------------- 保存先
var LS = {
  key: "aizuchi.appkey",
  oldKey: "amivoice-drill-appkey-v1", // 旧「反射ドリル」で保存したキーを引き継ぐ
  settings: "aizuchi.settings",
  deck: "aizuchi.deck",
  stats: "aizuchi.stats.",
  memos: "aizuchi.memos",
  usage: "aizuchi.usage"
};
function lsGet(k, fallback) {
  try { var v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function lsRaw(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }

var settings = Object.assign(
  { voice: false, echo: false, nolog: false, wait: 6, trap: true, rate: 1.0, filter: "all", lastId: "" },
  lsGet(LS.settings, {})
);
function saveSettings() { lsSet(LS.settings, settings); }
function appkey() { return lsRaw(LS.key) || lsRaw(LS.oldKey); }

// ---------------------------------------------------------------- 小道具
function $(id) { return document.getElementById(id); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function toKata(s) { return s.replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
function toHira(s) { return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
// 照合用の正規化: 全角→半角、小文字、カタカナ→ひらがな、記号と空白を落とす
function norm(s) {
  return toHira(String(s || "").normalize("NFKC").toLowerCase()).replace(/[\s、。，．,.!?！？「」『』（）()・_\-ー〜~]/g, "");
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function sentences(text) { return (String(text || "").match(/[^。！？]+[。！？]?/g) || []).map(function (s) { return s.trim(); }).filter(Boolean); }

// ---------------------------------------------------------------- 教材
var deck = null;      // { id, title, terms:[{w,r}], cards:[{id,scene,point,why,trap,easy}] }
var stats = {};       // cardId -> { n, last: "heard"|"ok"|"lost" }
var playlist = [];    // カードの index の並び（「わからん」は少し先に差し込まれる）
var pos = 0;

// 旧形式（{trigger, answer, short} の配列）を耳用のカードに機械変換する
function earify(s) {
  return String(s || "")
    .replace(/\\/g, "")
    .replace(/\s*(→|⇒)\s*/g, "、そこから")
    .replace(/\s*[＋+]\s*/g, "と")
    .replace(/\s*＝\s*/g, "は、")
    .replace(/\s*≠\s*/g, "ではなく")
    .replace(/✕|×/g, "は不正解")
    .replace(/[／/](?![a-z])/g, "、")
    .replace(/—+|―+/g, "、")
    .replace(/[（(]/g, "。").replace(/[）)]/g, "。")
    .replace(/。\s*。/g, "。").replace(/、\s*。/g, "。").replace(/\s+/g, " ").trim();
}
function normalizeDeck(json) {
  var d;
  if (Array.isArray(json)) {
    d = {
      title: "読み込んだ教材（旧形式から変換）",
      terms: [],
      cards: json.filter(function (x) { return x && x.trigger && x.answer; }).map(function (x) {
        var ans = earify(x.answer);
        return { scene: earify(x.trigger), point: x.short ? earify(x.short) : (sentences(ans)[0] || ans), why: ans };
      })
    };
  } else if (json && Array.isArray(json.cards)) {
    d = { id: json.id, title: json.title || "読み込んだ教材", terms: Array.isArray(json.terms) ? json.terms : [], cards: json.cards };
  } else {
    throw new Error("教材の形式が違います。cards の配列を持つ JSON を選んでください。");
  }
  d.cards = d.cards.filter(function (c) { return c && c.point && (c.why || c.scene); }).map(function (c, i) {
    return {
      id: String(c.id || "c" + (i + 1)),
      scene: String(c.scene || ""), point: String(c.point), why: String(c.why || ""),
      trap: String(c.trap || ""), easy: String(c.easy || "")
    };
  });
  if (!d.cards.length) throw new Error("読み上げられるカードが1枚もありません。point と why を持つカードが必要です。");
  d.terms = d.terms.filter(function (t) { return t && t.w && t.r; }).map(function (t) { return { w: String(t.w), r: toHira(String(t.r)) }; });
  d.terms.sort(function (a, b) { return b.w.length - a.w.length; }); // 長い用語から当てる（GitHub を Git より先に）
  if (!d.id) d.id = "deck-" + d.cards.length + "-" + norm(d.title).slice(0, 24);
  return d;
}
function setDeck(d) {
  deck = d;
  stats = lsGet(LS.stats + deck.id, {});
  buildPlaylist(settings.filter, settings.lastId);
}
function saveStats() { lsSet(LS.stats + deck.id, stats); }
function statusOf(i) { var s = stats[deck.cards[i].id]; return s ? s.last : "new"; }
function buildPlaylist(filter, startId) {
  var all = deck.cards.map(function (_, i) { return i; });
  var list = all;
  if (filter === "new") list = all.filter(function (i) { return statusOf(i) === "new"; });
  if (filter === "lost") list = all.filter(function (i) { return statusOf(i) === "lost"; });
  if (!list.length) { list = all; filter = "all"; }
  settings.filter = filter;
  playlist = list;
  pos = 0;
  if (startId) {
    var at = playlist.findIndex(function (i) { return deck.cards[i].id === startId; });
    if (at >= 0) pos = at;
  }
  saveSettings();
}
function currentCard() { return deck.cards[playlist[pos]]; }

// 用語辞書: 1つの {表記, 読み} を「読み上げの発音」と「AmiVoice の単語登録」の両方に使う
function termsIn(text) {
  var found = [], rest = String(text || "");
  deck.terms.forEach(function (t) {
    var re = new RegExp("(^|[^A-Za-z0-9])" + escRe(t.w) + "(?![A-Za-z0-9])");
    if (re.test(rest)) { found.push(t); rest = rest.replace(new RegExp(escRe(t.w), "g"), " "); }
  });
  return found;
}
function forSpeech(text) {
  var out = String(text || "");
  deck.terms.forEach(function (t) {
    var re = new RegExp("(^|[^A-Za-z0-9])" + escRe(t.w) + "(?![A-Za-z0-9])", "g");
    var say = toKata(t.r);
    out = out.replace(re, "$1" + say).replace(re, "$1" + say);
  });
  return out;
}
// profileWords（そのセッションだけ有効な単語登録）: 「表記 読み」を | で連結
function profileWords(terms) {
  return terms.map(function (t) {
    var w = t.w.replace(/ /g, "_");
    if (!/^[A-Za-z0-9_぀-ヿ一-鿿]+$/.test(w)) return "";
    if (!/^[ぁ-ゖー]+$/.test(t.r)) return "";
    return w + " " + t.r;
  }).filter(Boolean).slice(0, 30).join("|");
}

// ---------------------------------------------------------------- 読み上げ
var TTS = (function () {
  var synth = window.speechSynthesis || null;
  var voice = null;
  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices().filter(function (v) { return /^ja/i.test(v.lang); });
    voice = vs.find(function (v) { return v.localService; }) || vs[0] || null;
  }
  if (synth) { pickVoice(); if (synth.addEventListener) synth.addEventListener("voiceschanged", pickVoice); }
  return {
    // 最初のタップの中で一度だけ呼ぶ（iOS は操作の中でしか読み上げを開始できない）
    unlock: function () { if (synth) { try { synth.cancel(); synth.speak(new SpeechSynthesisUtterance(" ")); } catch (e) {} } },
    cancel: function () { if (synth) { try { synth.cancel(); } catch (e) {} } },
    say: function (text) {
      var spoken = forSpeech(text);
      var guess = spoken.length * 190 / settings.rate + 400;
      if (!synth) return sleep(Math.min(guess, 6000));
      return new Promise(function (resolve) {
        var done = false;
        function fin() { if (!done) { done = true; clearTimeout(guard); resolve(); } }
        var u = new SpeechSynthesisUtterance(spoken);
        u.lang = "ja-JP"; u.rate = settings.rate; if (voice) u.voice = voice;
        u.onend = fin; u.onerror = fin;
        var guard = setTimeout(fin, guess * 2.5 + 4000); // onend が来ない端末への保険
        try { synth.speak(u); } catch (e) { fin(); }
      });
    }
  };
})();

// マイクが開いた合図（画面を見なくても話しはじめがわかるように）
var audioCtx = null;
function beep(freq, ms) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; g.gain.value = 0.08;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + ms / 1000);
  } catch (e) {}
}

// ---------------------------------------------------------------- 音声認識（AmiVoice）
// 1回の「聞き取り窓」ごとに 接続 → s コマンド → 音声 → e コマンド → 切断 を行う。
// AmiVoice の課金は発話区間だけなので、窓を短く区切っても無音ぶんは増えない。
var ASR = (function () {
  var cur = null;          // 進行中の聞き取り
  var idle = Promise.resolve();
  var idleDone = null;
  var lastError = "";

  function parse(body) {
    var r = { text: "", reading: "", conf: -1, ms: 0 };
    try {
      var j = JSON.parse(body);
      r.text = j.text || "";
      var seg = j.results && j.results[0];
      if (seg) {
        r.conf = typeof seg.confidence === "number" ? seg.confidence : -1;
        r.ms = Math.max(0, (seg.endtime || 0) - (seg.starttime || 0));
        // spoken（読み・ひらがな）を使うと「もう一回 / もういっかい」の表記ゆれを気にせず照合できる
        r.reading = (seg.tokens || []).map(function (t) { return t.spoken || ""; }).join("").replace(/[^ぁ-ゖー]/g, "");
      }
    } catch (e) {}
    return r;
  }
  function setup() {
    if (!window.Wrp) return;
    Wrp.TRACE = function (msg) { if (/^ERROR/.test(msg)) lastError = msg; };
    Wrp.feedDataResumeEnded = function () {
      if (cur) cur.onLive();
      else { try { Wrp.feedDataPause(); } catch (e) {} } // 待っている人がいないのにマイクが開いたら、すぐ閉じる
    };
    Wrp.utteranceStarted = function () { if (cur) cur.onSpeech(true); };
    Wrp.utteranceEnded = function () { if (cur) cur.onSpeech(false); };
    Wrp.resultUpdated = function (body) { if (cur && cur.onPartial) cur.onPartial(parse(body)); };
    Wrp.resultFinalized = function (body) { if (cur) cur.onFinal(parse(body)); };
    Wrp.feedDataPauseEnded = function (reason) { if (cur && reason && reason.code) cur.onError(reason.message || lastError); };
    Wrp.disconnectEnded = function () {
      if (idleDone) { idleDone(); idleDone = null; }
      if (cur) cur.onError(lastError || "接続が切れました");
    };
  }
  function addUsage(ms) {
    var day = new Date().toISOString().slice(0, 10);
    var u = lsGet(LS.usage, {});
    if (u.day !== day) u = { day: day, ms: 0 };
    u.ms += ms; lsSet(LS.usage, u);
  }
  function friendly(msg) {
    msg = String(msg || "");
    if (/authoriz|appkey|verify/i.test(msg)) return "APPKEY を確認してください（期限切れかもしれません）。";
    if (/NotAllowed|Permission|denied/i.test(msg)) return "マイクが許可されていません。ブラウザの設定でマイクを許可してください。";
    if (/NotFound|MediaDevices|AudioContext/i.test(msg)) return "マイクを使えません。https で開いているか確認してください。";
    return "音声認識につながりませんでした。通信と APPKEY を確認してください。";
  }

  // opts: { ms: 待つ時間, words: profileWords, memo: 長めの発話を最後まで聞く, onPartial, onLive }
  function listen(opts) {
    if (window.AIZUCHI_MOCK_ASR) return window.AIZUCHI_MOCK_ASR(opts);
    return idle.then(function () {
      return new Promise(function (resolve) {
        var done = false, live = false, speaking = false, finals = [], timer = null, tail = null;
        function finish(extra) {
          if (done) return;
          done = true; cur = null;
          clearTimeout(timer); clearTimeout(tail);
          try { Wrp.feedDataPause(); } catch (e) {}
          var out = { text: "", reading: "", conf: -1 };
          if (finals.length) {
            out.text = finals.map(function (f) { return f.text; }).join("");
            out.reading = finals.map(function (f) { return f.reading; }).join("");
            out.conf = Math.min.apply(null, finals.map(function (f) { return f.conf; }));
          }
          resolve(Object.assign(out, extra || {}));
        }
        function onTimeout() {
          if (speaking) { timer = setTimeout(function () { finish({ timedOut: !finals.length }); }, 4000); return; } // 話している途中なら結果を待つ
          finish({ timedOut: !finals.length });
        }
        var me = cur = {
          cancel: function () { finish({ cancelled: true }); },
          onLive: function () {
            if (live) return; live = true;
            beep(880, 90);
            if (opts.onLive) opts.onLive();
            timer = setTimeout(onTimeout, opts.ms);
          },
          onSpeech: function (on) { speaking = on; if (on) clearTimeout(tail); },
          onPartial: opts.onPartial,
          onFinal: function (r) {
            if (!r.text) return;
            finals.push(r); addUsage(r.ms);
            if (!opts.memo) { finish(); return; }
            clearTimeout(tail);
            tail = setTimeout(function () { finish(); }, 2500); // メモは 2.5 秒黙ったら終わり
          },
          onError: function (msg) {
            if (done) return;
            if (!live && opts.words && !opts.retried) { // 単語登録が原因で始められないときは、登録なしでやり直す
              done = true; cur = null; clearTimeout(timer);
              resolve(listen(Object.assign({}, opts, { words: "", retried: true })));
              return;
            }
            finish({ error: friendly(msg) });
          }
        };
        lastError = "";
        idle = new Promise(function (r) { idleDone = r; setTimeout(r, 6000); });
        Wrp.serverURL = settings.nolog ? "wss://acp-api.amivoice.com/v1/nolog/" : "wss://acp-api.amivoice.com/v1/";
        Wrp.grammarFileNames = "-a-general";
        Wrp.authorization = appkey();
        Wrp.profileWords = opts.words || "";
        Wrp.resultUpdatedInterval = "400";
        Wrp.keepFillerToken = "";
        if (window.Recorder) Recorder.maxRecordingTime = 60000;
        var started = false;
        try { started = Wrp.feedDataResume(); } catch (e) { lastError = String(e); }
        if (!started) { if (idleDone) { idleDone(); idleDone = null; } finish({ error: friendly(lastError) }); return; }
        setTimeout(function () { if (!live && cur === me) me.onError(lastError || "timeout"); }, 12000);
      });
    });
  }
  setup();
  return {
    listen: listen,
    cancel: function () { if (cur) cur.cancel(); },
    ready: function () { return !!(window.AIZUCHI_MOCK_ASR || (window.Wrp && appkey() && navigator.mediaDevices)); }
  };
})();
function voiceOn() { return settings.voice && ASR.ready(); }

// あいづちの辞書（読みで照合する）。ボタンに書いてある言葉＝声で言える言葉。
var INTENTS = [
  // words: 含まれていれば採用 / exact: 短くて紛れやすいので完全一致のみ（漢字は、読みが取れないときの保険）
  { act: "ok",    words: ["なるほど", "わかった", "わかりました", "分かった", "分かりました", "おっけー", "おーけー", "ok", "りょうかい", "了解", "つぎへ", "次へ", "つぎいって", "つぎにいって"], exact: ["つぎ", "次", "はい", "うん"] },
  { act: "again", words: ["もういっかい", "もういちど", "もっかい", "もう一回", "もう1回", "もう一度", "くりかえし", "りぴーと", "ききなおし"], exact: [] },
  { act: "lost",  words: ["わからん", "わからない", "わかりません", "わかんない", "分からん", "分からない", "分かりません", "分かんない", "どういうこと", "むずかしい", "難しい", "むずい", "ぴんとこない"], exact: ["なんで"] },
  { act: "memo",  words: ["めもして", "めもする", "しつもん", "質問", "めもをとって"], exact: ["めも"] },
  { act: "stop",  words: ["すとっぷ", "とめて", "止めて", "いちじていし", "一時停止", "きゅうけい", "休憩"], exact: ["ていし", "停止"] },
  { act: "back",  words: ["ひとつまえ", "一つ前", "1つ前", "まえにもどって", "もどって", "戻って"], exact: ["まえ", "前", "もどる", "戻る"] }
];
var CONF_MIN = 0.5; // これ未満の認識結果は、あいづちとして採用しない
function detectIntent(r) {
  var cands = [norm(r.reading), norm(r.text)].filter(Boolean);
  var best = null;
  cands.forEach(function (c) {
    if (c.length > 16) return; // 長い発話はあいづちではない
    INTENTS.forEach(function (it) {
      it.exact.forEach(function (w) { if (c === w || c === w + "です") if (!best || w.length > best.len) best = { act: it.act, len: w.length }; });
      it.words.forEach(function (w) { if (c.indexOf(w) >= 0) if (!best || w.length > best.len) best = { act: it.act, len: w.length }; });
    });
  });
  return best ? best.act : "";
}

// ---------------------------------------------------------------- 画面
var el = {};
function setStatus(state, text, heard) {
  el.status.dataset.state = state;
  el.statusText.textContent = text;
  el.heard.textContent = heard || "";
}
function fillSeg(node, text) {
  node.textContent = "";
  sentences(text).forEach(function (s) {
    var span = document.createElement("span");
    span.className = "s"; span.textContent = s;
    node.appendChild(span);
  });
}
function renderDial() {
  el.dial.textContent = "";
  playlist.forEach(function (ci, i) {
    var t = document.createElement("span");
    var st = statusOf(ci);
    t.className = "tick" + (st !== "new" ? " " + st : "") + ((i + 1) % 5 === 0 ? " fifth" : "") + (i === pos && view === "card" ? " now" : "");
    el.dial.appendChild(t);
  });
  var ok = 0, lost = 0;
  deck.cards.forEach(function (_, i) { var s = statusOf(i); if (s === "ok") ok++; if (s === "lost") lost++; });
  el.okCount.textContent = ok; el.lostCount.textContent = lost;
  el.posLabel.textContent = view === "card" ? (pos + 1) + " / " + playlist.length + " 枚目" : deck.cards.length + " 枚";
  el.dial.setAttribute("aria-label", playlist.length + "枚中" + (pos + 1) + "枚目。なるほど" + ok + "、わからん" + lost);
}
var view = "intro"; // intro | card | outro
function show(v) {
  view = v;
  el.intro.hidden = v !== "intro"; el.card.hidden = v !== "card"; el.outro.hidden = v !== "outro";
  el.replies.setAttribute("aria-disabled", v === "card" ? "false" : "true");
  renderDial();
}
function renderCard() {
  var c = currentCard();
  fillSeg(el.segScene, c.scene); fillSeg(el.segPoint, c.point); fillSeg(el.segWhy, c.why);
  el.trapBox.hidden = !c.trap; fillSeg(el.segTrap, c.trap);
  el.easyBox.hidden = true; fillSeg(el.segEasy, c.easy);
  el.echoBox.hidden = true;
  el.card.classList.remove("dim");
  settings.lastId = c.id; saveSettings();
  show("card");
  window.scrollTo(0, 0);
}
function renderIntro() {
  el.introDeck.textContent = "いまの教材：" + deck.title + "（" + deck.cards.length + "枚）";
  show("intro");
}
function setPlaying(on) {
  playing = on;
  el.playBtn.dataset.playing = on ? "true" : "false";
  el.playBtn.setAttribute("aria-label", on ? "一時停止" : "再生");
  if (on) { try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { wake = l; }).catch(function () {}); } catch (e) {} }
  else if (wake) { try { wake.release(); } catch (e) {} wake = null; }
}
function renderVoiceBtn() {
  el.voiceBtn.setAttribute("aria-pressed", voiceOn() ? "true" : "false");
  el.voiceBtn.textContent = voiceOn() ? "声で返す：入" : "声で返す：切";
}
function flash(act) {
  var b = el.replies.querySelector('[data-act="' + act + '"]');
  if (!b) return;
  b.classList.add("flash"); setTimeout(function () { b.classList.remove("flash"); }, 450);
}

// ---------------------------------------------------------------- 再生の流れ
var playing = false, wake = null, runId = 0, part = "top";
function alive(tok) { return tok === runId; }
function halt() { runId++; TTS.cancel(); ASR.cancel(); }
function go(fn) {
  halt();
  var tok = runId;
  return fn(tok).catch(function (e) { console.error(e); if (alive(tok)) { setPlaying(false); setStatus("error", "止まりました。再生を押すと続きから始めます"); } });
}

async function speakSeg(node, tok) {
  var spans = node.querySelectorAll(".s");
  for (var i = 0; i < spans.length; i++) {
    if (!alive(tok)) return;
    spans[i].classList.add("on");
    spans[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
    await TTS.say(spans[i].textContent);
    spans[i].classList.remove("on"); spans[i].classList.add("done");
  }
}
function mark(card, last) {
  var s = stats[card.id] || { n: 0, last: "new" };
  if (last === "heard") { s.n++; if (s.last === "new") s.last = "heard"; } else { s.last = last; }
  stats[card.id] = s; saveStats(); renderDial();
}
// 「わからん」の1枚は、3枚あとにもう一度流す
function requeue() {
  var ci = playlist[pos];
  if (playlist.indexOf(ci, pos + 1) >= 0) return;
  playlist.splice(Math.min(pos + 4, playlist.length), 0, ci);
}

async function playCard(tok, which) {
  part = which || "top";
  var c = currentCard();
  setPlaying(true);
  if (part === "top") {
    renderCard();
    el.card.classList.add("dim");
    setStatus("speaking", "読み上げ中");
    var order = [el.segScene, el.segPoint, el.segWhy];
    if (c.trap && settings.trap) order.push(el.segTrap);
    for (var i = 0; i < order.length; i++) {
      await speakSeg(order[i], tok); if (!alive(tok)) return;
      await sleep(280); if (!alive(tok)) return;
    }
    el.card.classList.remove("dim");
    mark(c, "heard");
    if (settings.echo && voiceOn()) { await echoStep(tok, c); if (!alive(tok)) return; }
  } else {
    el.easyBox.hidden = false;
    setStatus("speaking", "かみくだいて読み上げ中");
    await TTS.say("かみくだくと。"); if (!alive(tok)) return;
    await speakSeg(el.segEasy, tok); if (!alive(tok)) return;
  }
  await replyStep(tok);
}

// 要点を声に出す（復唱）。正誤はつけず、言えた用語を点灯するだけ。
async function echoStep(tok, c) {
  var targets = termsIn(c.point);
  if (!targets.length) return;
  el.echoBox.hidden = false;
  el.echoChips.textContent = "";
  var chips = targets.map(function (t) {
    var s = document.createElement("span"); s.className = "chip"; s.textContent = t.w; el.echoChips.appendChild(s); return s;
  });
  el.echoBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
  setStatus("speaking", "読み上げ中");
  await TTS.say("要点を、声に出してどうぞ。"); if (!alive(tok)) return;
  setStatus("listening", "要点を声に出してどうぞ");
  var r = await ASR.listen({ ms: 9000, words: profileWords(targets), onPartial: function (p) { el.heard.textContent = p.text; } });
  if (!alive(tok)) return;
  if (r.error) { voiceFailed(r.error); setPlaying(false); halt(); return; }
  if (!r.text) { setStatus("speaking", "読み上げ中"); return; }
  var said = norm(r.text), reading = r.reading, missed = [];
  targets.forEach(function (t, i) {
    var hit = said.indexOf(norm(t.w)) >= 0 || said.indexOf(t.r) >= 0 || reading.indexOf(t.r.replace(/ー/g, "")) >= 0 || reading.indexOf(t.r) >= 0;
    chips[i].classList.add(hit ? "hit" : "miss");
    if (!hit) missed.push(t);
  });
  setStatus("speaking", "読み上げ中", "「" + r.text + "」");
  await TTS.say(missed.length ? missed.map(function (t) { return toKata(t.r); }).join("、") + "、が抜けました。" : "言えました。");
}

function voiceFailed(msg) {
  settings.voice = false; saveSettings(); renderVoiceBtn();
  setStatus("error", msg + " ボタンで続けられます。");
}

async function replyStep(tok) {
  var waitMs = settings.wait > 0 ? settings.wait * 1000 : 0;
  if (voiceOn()) {
    for (var tries = 0; tries < 3; tries++) {
      setStatus("listening", "あいづちをどうぞ");
      var r = await ASR.listen({ ms: waitMs || 50000, onPartial: function (p) { el.heard.textContent = p.text; } });
      if (!alive(tok)) return;
      if (r.error) { voiceFailed(r.error); setPlaying(false); return; } // 理由を読めるよう、ここで止める
      if (r.timedOut || !r.text) { if (waitMs) break; continue; }
      var act = r.conf >= 0 && r.conf < CONF_MIN ? "" : detectIntent(r);
      if (act) { setStatus("listening", "あいづちをどうぞ", "「" + r.text + "」"); return doAct(act); }
      setStatus("listening", "もう一度どうぞ", "「" + r.text + "」は、あいづちとして聞き取れませんでした");
      await sleep(900); if (!alive(tok)) return;
    }
    if (!waitMs) { setStatus("waiting", "ボタンで返してください"); setPlaying(false); return; }
  } else {
    setStatus("waiting", "あいづちをどうぞ", waitMs ? "返事が無ければ次へ進みます" : "");
    if (!waitMs) return; // 返事があるまで待つ
    await sleep(waitMs); if (!alive(tok)) return;
  }
  advance(1);
}

function advance(step) {
  var next = pos + step;
  if (next < 0) next = 0;
  if (next >= playlist.length) { finishDeck(); return; }
  pos = next;
  go(function (tok) { return playCard(tok, "top"); });
}
function finishDeck() {
  halt(); setPlaying(false);
  var ok = 0, lost = 0;
  deck.cards.forEach(function (_, i) { var s = statusOf(i); if (s === "ok") ok++; if (s === "lost") lost++; });
  el.outroLead.textContent = lost ? "ひととおり聞きました。" : "ひととおり聞きました。わからんは残っていません。";
  el.outroSub.textContent = deck.cards.length + "枚のうち、なるほど " + ok + "枚、わからん " + lost + "枚。";
  el.againLost.hidden = !lost;
  el.outroHandoff.hidden = !lost && !loadMemos().length;
  show("outro");
  setStatus("idle", "おつかれさまでした");
}

// あいづち（声・ボタン共通）
function doAct(act) {
  if (view !== "card") return;
  var c = currentCard();
  flash(act);
  if (act === "ok") { if (part === "top") mark(c, "ok"); advance(1); }
  else if (act === "again") { go(function (tok) { return playCard(tok, "top"); }); }
  else if (act === "lost") {
    mark(c, "lost"); requeue(); renderDial();
    if (c.easy) go(function (tok) { return playCard(tok, "easy"); });
    else go(async function (tok) { setPlaying(true); setStatus("speaking", "読み上げ中"); await TTS.say("あとでもう一度流します。"); if (alive(tok)) advance(1); });
  }
  else if (act === "memo") { go(memoStep); }
  else if (act === "stop") { pause(); }
  else if (act === "back") { advance(-1); }
}
function pause() {
  halt(); setPlaying(false);
  if (view === "card") setStatus("idle", "一時停止中");
}

// ---------------------------------------------------------------- メモ
function loadMemos() { return lsGet(LS.memos, []); }
function addMemo(text) {
  var c = currentCard();
  var list = loadMemos();
  list.push({ deck: deck.id, card: c.id, of: c.point, text: text, t: Date.now() });
  lsSet(LS.memos, list); renderMemoCount();
}
function renderMemoCount() {
  var n = loadMemos().length;
  el.memoCount.hidden = !n; el.memoCount.textContent = n;
}
async function memoStep(tok) {
  if (!voiceOn()) { // 声が使えないときは手入力
    setPlaying(false); setStatus("idle", "メモを入力中");
    $("memoText").value = ""; $("memoInput").showModal(); $("memoText").focus();
    return;
  }
  var c = currentCard();
  setPlaying(true);
  setStatus("speaking", "読み上げ中");
  await TTS.say("メモをどうぞ。"); if (!alive(tok)) return;
  setStatus("memo", "メモを聞いています");
  var words = profileWords(termsIn([c.scene, c.point, c.why, c.trap].join(" "))); // この1枚に出てくる用語だけ登録
  var r = await ASR.listen({ ms: 10000, memo: true, words: words, onPartial: function (p) { el.heard.textContent = p.text; } });
  if (!alive(tok)) return;
  if (r.error) { voiceFailed(r.error); setPlaying(false); return; }
  if (r.text) {
    addMemo(r.text);
    setStatus("speaking", "メモしました", "「" + r.text + "」");
    await TTS.say("メモしました。");
  } else {
    setStatus("speaking", "読み上げ中");
    await TTS.say("聞き取れませんでした。");
  }
  if (!alive(tok)) return;
  await replyStep(tok);
}
function renderMemos() {
  var list = loadMemos();
  el.memoList.textContent = "";
  $("memoEmpty").hidden = !!list.length;
  list.forEach(function (m, i) {
    var li = document.createElement("li");
    var t = document.createElement("span"); t.className = "m-text"; t.textContent = m.text;
    var of = document.createElement("span"); of.className = "m-of"; of.textContent = m.of;
    var del = document.createElement("button"); del.type = "button"; del.className = "link-btn m-del"; del.textContent = "消す";
    del.addEventListener("click", function () { var l = loadMemos(); l.splice(i, 1); lsSet(LS.memos, l); renderMemos(); renderMemoCount(); });
    li.appendChild(t); li.appendChild(of); li.appendChild(del);
    el.memoList.appendChild(li);
  });
}

// ---------------------------------------------------------------- 生成 AI への受け渡し（コピーして貼るだけ。API キー不要）
var FORMAT_NOTE = [
  "出力は次の JSON だけにしてください。",
  '{ "title": "教材名", "terms": [{"w": "EventBridge", "r": "いべんとぶりっじ"}], "cards": [{"id": "c01", "scene": "", "point": "", "why": "", "trap": "", "easy": ""}] }',
  "",
  "書き方のルール（目ではなく耳で聞く教材です）:",
  "- scene: どんな場面・要件の話か。1〜2文。",
  "- point: 覚える要点。1文、40字以内。",
  "- why: なぜそうなるか。3〜4文。1文は50字以内。",
  "- trap: 試験で間違えやすい選択肢と、外れる理由。2〜3文。無ければ空文字。",
  "- easy: 専門用語を減らした、たとえ話による言い換え。2〜3文。",
  "- 矢印、プラス、イコール、括弧、箇条書きなどの記号は使わず、話し言葉の文にする。",
  "- 英字の製品名や略語は本文では英字のまま書き、すべて terms に {表記 w, ひらがなの読み r} で登録する。"
].join("\n");
function promptForDeck() {
  return "次のノートを、音声で聞く資格勉強用の教材に書き直してください。\n\n" + FORMAT_NOTE + "\n\n--- ここからノート ---\n（ここにノートや問題集のメモを貼る）";
}
function promptForHandoff() {
  var lost = deck.cards.filter(function (_, i) { return statusOf(i) === "lost"; });
  var memos = loadMemos();
  var out = ["資格勉強の音声教材を聞いて、理解できなかったところと、途中で浮かんだ疑問です。", ""];
  if (lost.length) {
    out.push("■ わからなかったカード");
    lost.forEach(function (c) { out.push("- 場面: " + c.scene + "\n  要点: " + c.point + "\n  解説: " + c.why); });
    out.push("");
  }
  if (memos.length) {
    out.push("■ 聞きながら声で残したメモ（音声認識の結果そのままなので、誤字があるかもしれません）");
    memos.forEach(function (m) { out.push("- 「" + m.text + "」（カードの要点: " + m.of + "）"); });
    out.push("");
  }
  out.push("お願い:");
  out.push("1. メモの疑問にそれぞれ短く答えてください。");
  out.push("2. わからなかったカードごとに、別の角度から説明し直した補足カードを作ってください。前提知識が足りていなさそうなら、その前提を説明するカードも足してください。");
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

// ---------------------------------------------------------------- シート
function renderList() {
  $("deckTitle").textContent = deck.title;
  document.querySelectorAll(".seg-ctl button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.filter === settings.filter ? "true" : "false"); });
  var ol = $("cardList"); ol.textContent = "";
  deck.cards.forEach(function (c, i) {
    var li = document.createElement("li");
    var b = document.createElement("button"); b.type = "button";
    var inList = playlist.indexOf(i) >= 0;
    if (view === "card" && playlist[pos] === i) b.className = "now"; else if (!inList) b.className = "off";
    var m = document.createElement("span"); m.className = "mark " + statusOf(i);
    var t = document.createElement("span"); t.textContent = c.point;
    b.appendChild(m); b.appendChild(t);
    b.addEventListener("click", function () {
      if (playlist.indexOf(i) < 0) buildPlaylist("all");
      pos = playlist.indexOf(i);
      $("listSheet").close();
      TTS.unlock();
      go(function (tok) { return playCard(tok, "top"); });
    });
    li.appendChild(b); ol.appendChild(li);
  });
}
function renderSettings() {
  $("appkey").value = appkey();
  $("optEcho").checked = settings.echo; $("optNolog").checked = settings.nolog; $("optTrap").checked = settings.trap;
  $("optWait").value = String(settings.wait);
  $("deckInfo").textContent = "いまの教材：" + deck.title + "（" + deck.cards.length + "枚）";
  var u = lsGet(LS.usage, {});
  var today = new Date().toISOString().slice(0, 10);
  $("usage").textContent = "今日、声の認識に使った時間：約 " + Math.round((u.day === today ? u.ms : 0) / 1000) + " 秒";
  $("keyState").className = "hint"; $("keyState").textContent = appkey() ? "キーは保存済みです。" : "";
}

async function enableVoice() {
  if (!appkey() && !window.AIZUCHI_MOCK_ASR) {
    renderSettings(); $("settingsSheet").showModal();
    $("keyState").className = "hint bad"; $("keyState").textContent = "声で返すには APPKEY が必要です。";
    return;
  }
  if (!window.AIZUCHI_MOCK_ASR) {
    try { // 先にマイクの許可をもらっておく
      var s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) {
      setStatus("error", "マイクが許可されていません。ブラウザの設定でマイクを許可してください。");
      return;
    }
  }
  settings.voice = true; saveSettings(); renderVoiceBtn();
}

// ---------------------------------------------------------------- 起動
function bind() {
  ["status", "statusText", "heard", "dial", "okCount", "lostCount", "posLabel", "intro", "introDeck", "card", "outro", "outroLead", "outroSub",
   "againLost", "outroHandoff", "replies", "playBtn", "voiceBtn", "rateBtn", "segScene", "segPoint", "segWhy", "segTrap", "segEasy",
   "trapBox", "easyBox", "echoBox", "echoChips", "memoCount", "memoList"].forEach(function (id) { el[id] = $(id); });

  el.playBtn.addEventListener("click", function () {
    if (playing) { pause(); return; }
    TTS.unlock(); beep(1, 1);
    if (view === "outro") { buildPlaylist("all"); }
    go(function (tok) { return playCard(tok, "top"); });
  });
  $("prevBtn").addEventListener("click", function () { if (view === "card") { TTS.unlock(); advance(-1); } });
  $("nextBtn").addEventListener("click", function () { if (view === "card") { TTS.unlock(); advance(1); } });
  el.replies.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    TTS.unlock(); doAct(b.dataset.act);
  });
  var RATES = [0.9, 1.0, 1.2, 1.5];
  function renderRate() { el.rateBtn.textContent = settings.rate.toFixed(1) + "倍"; }
  el.rateBtn.addEventListener("click", function () {
    settings.rate = RATES[(RATES.indexOf(settings.rate) + 1) % RATES.length]; saveSettings(); renderRate();
  });
  renderRate();
  el.voiceBtn.addEventListener("click", function () {
    if (voiceOn()) { settings.voice = false; saveSettings(); ASR.cancel(); renderVoiceBtn(); }
    else enableVoice();
  });

  // シートの開閉
  document.querySelectorAll("dialog [data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
  document.querySelectorAll("dialog").forEach(function (d) { d.addEventListener("click", function (e) { if (e.target === d) d.close(); }); });
  $("openList").addEventListener("click", function () { renderList(); $("listSheet").showModal(); });
  $("openMemo").addEventListener("click", function () { renderMemos(); $("handoffState").textContent = ""; $("memoSheet").showModal(); });
  $("openSettings").addEventListener("click", function () { renderSettings(); $("settingsSheet").showModal(); });
  document.querySelectorAll(".seg-ctl button").forEach(function (b) {
    b.addEventListener("click", function () {
      pause(); buildPlaylist(b.dataset.filter);
      if (view === "card") renderCard(); else renderDial();
      renderList();
    });
  });

  // メモ
  $("memoSave").addEventListener("click", function () {
    var v = $("memoText").value.trim();
    if (v) addMemo(v);
    $("memoInput").close();
  });
  $("memoInput").addEventListener("close", function () { // 残しても、やめても、あいづち待ちに戻る
    if (view === "card") go(function (tok) { setPlaying(true); return replyStep(tok); });
  });
  function handoff(stateEl) { copyText(promptForHandoff(), stateEl, "コピーしました。Claude などのチャットに貼り付けてください。"); }
  $("handoffBtn").addEventListener("click", function () { handoff($("handoffState")); });
  el.outroHandoff.addEventListener("click", function () { renderMemos(); $("memoSheet").showModal(); handoff($("handoffState")); });
  el.againLost.addEventListener("click", function () { TTS.unlock(); buildPlaylist("lost"); go(function (tok) { return playCard(tok, "top"); }); });
  $("againAll").addEventListener("click", function () { TTS.unlock(); buildPlaylist("all"); go(function (tok) { return playCard(tok, "top"); }); });

  // 設定
  $("saveKey").addEventListener("click", function () {
    var v = $("appkey").value.trim();
    try { if (v) localStorage.setItem(LS.key, v); else { localStorage.removeItem(LS.key); localStorage.removeItem(LS.oldKey); } } catch (e) {}
    $("keyState").className = "hint good"; $("keyState").textContent = v ? "キーを保存しました。「声で返す」を入にすると使えます。" : "キーを消しました。";
    renderVoiceBtn();
  });
  $("testMic").addEventListener("click", async function () {
    var st = $("keyState");
    if (!ASR.ready()) { st.className = "hint bad"; st.textContent = "先に APPKEY を保存してください。"; return; }
    pause();
    st.className = "hint"; st.textContent = "接続中…";
    var r = await ASR.listen({ ms: 7000, words: profileWords(deck.terms), onLive: function () { st.textContent = "どうぞ。「なるほど」や用語を言ってみてください。"; } });
    if (r.error) { st.className = "hint bad"; st.textContent = r.error; return; }
    if (!r.text) { st.textContent = "何も聞き取れませんでした。マイクに近づいてもう一度。"; return; }
    var act = detectIntent(r);
    renderSettings(); // 使った時間の表示を更新
    st.className = "hint good";
    st.textContent = "聞き取り：「" + r.text + "」／読み：" + (r.reading || "–") + "／信頼度 " + (r.conf >= 0 ? r.conf.toFixed(2) : "–") + (act ? "／あいづち：" + act : "／あいづちではない");
  });
  $("optEcho").addEventListener("change", function (e) { settings.echo = e.target.checked; saveSettings(); });
  $("optNolog").addEventListener("change", function (e) { settings.nolog = e.target.checked; saveSettings(); });
  $("optTrap").addEventListener("change", function (e) { settings.trap = e.target.checked; saveSettings(); });
  $("optWait").addEventListener("change", function (e) { settings.wait = Number(e.target.value); saveSettings(); });
  $("deckFile").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    var st = $("deckState");
    f.text().then(function (txt) {
      var d = normalizeDeck(JSON.parse(txt));
      lsSet(LS.deck, d); pause(); settings.lastId = ""; setDeck(d); renderIntro(); renderSettings();
      st.className = "hint good"; st.textContent = "読み込みました：" + d.title + "（" + d.cards.length + "枚）";
    }).catch(function (err) {
      st.className = "hint bad";
      st.textContent = err instanceof SyntaxError ? "JSON として読めませんでした。ファイルの中身を確認してください。" : err.message;
    });
    e.target.value = "";
  });
  $("deckReset").addEventListener("click", function () {
    try { localStorage.removeItem(LS.deck); } catch (e) {}
    pause(); settings.lastId = "";
    loadSample().then(function () { renderIntro(); renderSettings(); $("deckState").className = "hint good"; $("deckState").textContent = "サンプルに戻しました。"; });
  });
  $("copyPrompt").addEventListener("click", function () { copyText(promptForDeck(), $("promptState"), "コピーしました。ノートを貼り足して AI に渡し、返ってきた JSON を保存して読み込みます。"); });
  $("resetStats").addEventListener("click", function () {
    pause(); stats = {}; saveStats(); buildPlaylist("all"); renderIntro(); renderSettings();
    $("deckState").className = "hint good"; $("deckState").textContent = "聞いた記録を消しました。";
  });

  // 画面を閉じたら止める（裏では読み上げが続かないため）
  document.addEventListener("visibilitychange", function () { if (document.hidden && playing) pause(); });
}
function loadSample() {
  return fetch("deck-sample.json").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) { setDeck(normalizeDeck(j)); });
}
function boot() {
  bind();
  var custom = lsGet(LS.deck, null);
  var ready;
  try { if (custom) { setDeck(normalizeDeck(custom)); ready = Promise.resolve(); } } catch (e) { custom = null; }
  if (!custom) ready = loadSample();
  ready.then(function () {
    renderVoiceBtn(); renderMemoCount(); renderIntro();
    if (settings.lastId && stats[settings.lastId]) setStatus("idle", "再生を押すと、前回の続きから始まります");
  }).catch(function () {
    setStatus("error", "教材を読み込めませんでした。https か localhost で開いているか確認してください。");
  });
}
// テストから中身を触るための出入口
window.AIZUCHI = { detectIntent: detectIntent, normalizeDeck: normalizeDeck, forSpeech: function (t) { return forSpeech(t); }, profileWords: function (t) { return profileWords(termsIn(t)); }, termsIn: function (t) { return termsIn(t); } };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
