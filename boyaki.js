/* ぼやきメモ — 勉強のあと、覚えたことを声でぼやくと、専門用語ごと文字になって溜まる
 *   音声認識 : AmiVoice API（WebSocket / 公式 Wrp ライブラリ）
 *   用語辞書 : 「聞く」（あいづちラジオ）の教材の terms ＋ 自分で足した用語 → profileWords
 */
(function () {
"use strict";

var LS = {
  key: "aizuchi.appkey", oldKey: "amivoice-drill-appkey-v1", deck: "aizuchi.deck", usage: "aizuchi.usage",
  settings: "boyaki.settings", memos: "boyaki.memos", words: "boyaki.words"
};
function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function lsRaw(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function $(id) { return document.getElementById(id); }
function toKata(s) { return s.replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
function toHira(s) { return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function appkey() { return lsRaw(LS.key) || lsRaw(LS.oldKey); }

var settings = Object.assign({ nolog: false, silence: 8, words: 27 }, lsGet(LS.settings, {}));
function saveSettings() { lsSet(LS.settings, settings); }
var memos = lsGet(LS.memos, []);   // { id, t, text, terms:[表記], sec, sent }
function saveMemos() { lsSet(LS.memos, memos); }
var deckTerms = [];                // 教材の用語 { w, r }
var dict = [];                     // 自分で足した用語 ＋ 教材の用語
var filter = "";                   // 用語で絞り込み

// ---------------------------------------------------------------- 用語辞書
function parseExtra(text) {
  return String(text || "").split(/\n/).map(function (line) {
    var p = line.split(/[,、\t]/);
    if (p.length < 2) return null;
    var w = p[0].trim(), r = toHira(p[1].trim());
    return w && /^[ぁ-ゖー]+$/.test(r) ? { w: w, r: r, mine: true } : null;
  }).filter(Boolean);
}
function buildDict() {
  var seen = {};
  dict = parseExtra(lsRaw(LS.words) ? lsGet(LS.words, "") : "").concat(deckTerms).filter(function (t) {
    var k = t.w.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true;
  });
}
function termCounts() {
  var n = {};
  memos.forEach(function (m) { (m.terms || []).forEach(function (w) { n[w] = (n[w] || 0) + 1; }); });
  return n;
}
// 登録する順: 自分で足した用語 → ぼやきによく出る用語 → 長い用語
function wordsToRegister() {
  if (settings.words < 0) return "";
  var n = termCounts();
  var list = dict.slice().sort(function (a, b) {
    return (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || (n[b.w] || 0) - (n[a.w] || 0) || b.w.length - a.w.length;
  }).map(function (t) {
    var w = t.w.replace(/ /g, "_");
    if (!/^[A-Za-z0-9_぀-ヿ一-鿿]+$/.test(w)) return "";
    if (!/^[ぁ-ゖー]+$/.test(t.r)) return "";
    return w + " " + t.r;
  }).filter(Boolean);
  if (settings.words > 0) list = list.slice(0, settings.words);
  return list.join("|");
}
// 文字になったメモから用語を探す（英字の表記、またはカタカナの読み）
function termForms(t) {
  var forms = [t.w];
  if (t.r.length >= 4) forms.push(toKata(t.r));
  return forms;
}
function findTerms(text) {
  var found = [], rest = text;
  dict.slice().sort(function (a, b) { return b.w.length - a.w.length; }).forEach(function (t) {
    var hit = false;
    termForms(t).forEach(function (f) {
      var ascii = /^[\x20-\x7e]+$/.test(f);
      var re = new RegExp(ascii ? "(^|[^A-Za-z0-9])" + escRe(f) + "(?![A-Za-z0-9])" : escRe(f), "i");
      if (re.test(rest)) { hit = true; rest = rest.replace(new RegExp(escRe(f), "gi"), " "); }
    });
    if (hit) found.push(t.w);
  });
  return found;
}
function highlight(node, text, terms) {
  node.textContent = "";
  var forms = [];
  dict.forEach(function (t) { if (terms.indexOf(t.w) >= 0) forms = forms.concat(termForms(t)); });
  forms.sort(function (a, b) { return b.length - a.length; });
  if (!forms.length) { node.textContent = text; return; }
  var re = new RegExp("(" + forms.map(escRe).join("|") + ")", "gi");
  text.split(re).forEach(function (part, i) {
    if (!part) return;
    if (i % 2) { var b = document.createElement("b"); b.className = "term"; b.textContent = part; node.appendChild(b); }
    else node.appendChild(document.createTextNode(part));
  });
}

// ---------------------------------------------------------------- 音声認識（1回のぼやき＝1セッション）
var audioCtx = null;
function beep(freq, ms) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; g.gain.value = 0.08; o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + ms / 1000);
  } catch (e) {}
}
function friendly(msg) {
  msg = String(msg || "");
  if (/authoriz|appkey|verify/i.test(msg)) return "APPKEY を確認してください（期限切れかもしれません）。";
  if (/NotAllowed|Permission|denied/i.test(msg)) return "マイクが許可されていません。ブラウザの設定でマイクを許可してください。";
  if (/NotFound|MediaDevices|AudioContext/i.test(msg)) return "マイクを使えません。https で開いているか確認してください。";
  return "音声認識につながりませんでした。通信と APPKEY を確認してください。";
}
function parse(body) {
  var r = { text: "", conf: -1, ms: 0 };
  try {
    var j = JSON.parse(body);
    r.text = String(j.text || "").replace(/_/g, " ");
    var seg = j.results && j.results[0];
    if (seg) { r.conf = typeof seg.confidence === "number" ? seg.confidence : -1; r.ms = Math.max(0, (seg.endtime || 0) - (seg.starttime || 0)); }
  } catch (e) {}
  return r;
}
var Engine = {
  start: function (words, cb) {
    if (window.BOYAKI_MOCK) return window.BOYAKI_MOCK.start(words, cb);
    var lastError = "", ended = false, live = false;
    function end(err) { if (ended) return; ended = true; cb.onEnd(err ? friendly(err) : null); }
    Wrp.TRACE = function (m) { if (/^ERROR/.test(m)) lastError = m; };
    Wrp.feedDataResumeEnded = function () { if (ended) { try { Wrp.feedDataPause(); } catch (e) {} return; } live = true; cb.onLive(); };
    Wrp.utteranceStarted = function () { cb.onSpeech(); };
    Wrp.utteranceEnded = function () {};
    Wrp.resultUpdated = function (b) { cb.onPartial(parse(b).text); };
    Wrp.resultFinalized = function (b) { var r = parse(b); if (r.text) cb.onFinal(r); };
    Wrp.feedDataPauseEnded = function (reason) { if (reason && reason.code) lastError = reason.message || lastError || "error"; };
    Wrp.disconnectEnded = function () { end(live && !/authoriz/i.test(lastError) ? "" : lastError || (live ? "" : "disconnected")); };
    Wrp.serverURL = settings.nolog ? "wss://acp-api.amivoice.com/v1/nolog/" : "wss://acp-api.amivoice.com/v1/";
    Wrp.grammarFileNames = "-a-general";
    Wrp.authorization = appkey();
    Wrp.profileWords = words;
    Wrp.resultUpdatedInterval = "400";
    Wrp.keepFillerToken = ""; // 「えー」「あのー」は落とす
    if (window.Recorder) Recorder.maxRecordingTime = 190000;
    var ok = false;
    try { ok = Wrp.feedDataResume(); } catch (e) { lastError = String(e); }
    if (!ok) { end(lastError || "start"); return; }
    setTimeout(function () { if (!live) { try { Wrp.feedDataPause(); } catch (e) {} end(lastError || "timeout"); } }, 12000);
  },
  stop: function () {
    if (window.BOYAKI_MOCK) return window.BOYAKI_MOCK.stop();
    try { Wrp.feedDataPause(); } catch (e) {}
  }
};

// ---------------------------------------------------------------- 録る
var MAX_SEC = 180;
var rec = null; // { state, segs, startedAt, lastVoice, tick, words, retried }
function setRecUI(state, note) {
  $("rec").dataset.state = state;
  var on = state !== "idle";
  $("recBtn").setAttribute("aria-pressed", on ? "true" : "false");
  $("recLabel").textContent = state === "idle" ? "ぼやく" : state === "connecting" ? "つないでいます" : state === "stopping" ? "保存しています" : "止める";
  $("live").hidden = !(state === "live" || state === "stopping");
  $("recLead").hidden = on || memos.length > 0;
  if (state === "idle") $("recTime").textContent = "";
  if (note !== undefined) { $("recNote").textContent = note; $("recNote").className = "rec-note" + (/確認|許可|使えません|つながりません/.test(note) ? " bad" : ""); }
}
function fmt(sec) { return Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2); }
function addUsage(ms) {
  var day = new Date().toISOString().slice(0, 10), u = lsGet(LS.usage, {});
  if (u.day !== day) u = { day: day, ms: 0 };
  u.ms += ms; lsSet(LS.usage, u);
}
var wake = null;
function startRec(retryWords) {
  if (!appkey() && !window.BOYAKI_MOCK) {
    renderSettings(); $("settingsSheet").showModal();
    $("keyState").className = "hint bad"; $("keyState").textContent = "ぼやくには APPKEY が必要です。";
    return;
  }
  var words = retryWords === undefined ? wordsToRegister() : retryWords;
  rec = { state: "connecting", segs: [], startedAt: 0, lastVoice: 0, tick: null, words: words, retried: retryWords !== undefined, live: false };
  var me = rec;
  $("liveText").textContent = ""; $("livePartial").textContent = "";
  setRecUI("connecting", "");
  Engine.start(words, {
    onLive: function () {
      if (rec !== me) return;
      me.live = true; me.state = "live"; me.startedAt = me.lastVoice = Date.now();
      beep(880, 90);
      setRecUI("live", me.retried && !words ? "用語の登録なしで始めました。設定で登録する数を減らしてみてください。" : "話してください。黙ると止まります。");
      try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { wake = l; }).catch(function () {}); } catch (e) {}
      me.tick = setInterval(function () {
        var now = Date.now(), sec = Math.floor((now - me.startedAt) / 1000);
        $("recTime").textContent = fmt(sec);
        var quiet = (now - me.lastVoice) / 1000;
        var limit = me.segs.length ? settings.silence : Math.max(settings.silence, 15); // 話しはじめは長めに待つ
        if (sec >= MAX_SEC || (settings.silence > 0 && quiet >= limit)) stopRec();
      }, 500);
    },
    onSpeech: function () { me.lastVoice = Date.now(); },
    onPartial: function (t) { if (rec !== me) return; me.lastVoice = Date.now(); $("livePartial").textContent = t; },
    onFinal: function (r) {
      if (rec !== me) return;
      me.lastVoice = Date.now(); me.segs.push(r); addUsage(r.ms);
      $("livePartial").textContent = "";
      $("liveText").textContent = me.segs.map(function (s) { return s.text; }).join("\n");
      $("live").scrollTop = $("live").scrollHeight;
    },
    onEnd: function (err) {
      if (rec !== me) return;
      clearInterval(me.tick); clearTimeout(me.forceEnd);
      if (wake) { try { wake.release(); } catch (e) {} wake = null; }
      rec = null;
      if (err && !me.live && words && !me.retried && !/APPKEY|マイク/.test(err)) { // 用語の登録が原因かもしれないので、登録なしでやり直す
        setRecUI("connecting", "");
        setTimeout(function () { if (!rec) startRec(""); }, 400); // 前の接続が閉じきるのを待つ
        return;
      }
      finishRec(me, err);
    }
  });
}
function stopRec() {
  if (!rec || rec.state === "stopping") return;
  var me = rec;
  me.state = "stopping"; clearInterval(me.tick);
  beep(520, 120);
  setRecUI("stopping", "");
  Engine.stop();
  me.forceEnd = setTimeout(function () { if (rec === me) { rec = null; finishRec(me, null); } }, 6000); // 切断の通知が来ない端末への保険
}
function finishRec(me, err) {
  var text = me.segs.map(function (s) { return s.text; }).join("\n").trim();
  if (text) {
    memos.unshift({
      id: "m" + Date.now(), t: Date.now(), text: text, terms: findTerms(text),
      sec: Math.round(me.segs.reduce(function (a, s) { return a + s.ms; }, 0) / 1000), sent: false
    });
    saveMemos();
  }
  render();
  setRecUI("idle", err ? err : text ? "メモしました。" : "何も聞き取れませんでした。");
}

// ---------------------------------------------------------------- 表示
function dayLabel(t) {
  var d = new Date(t), now = new Date();
  var same = d.toDateString() === now.toDateString();
  return (same ? "今日 " : (d.getMonth() + 1) + "月" + d.getDate() + "日 ") + d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
}
function render() {
  var has = memos.length > 0;
  $("firstBox").hidden = has; $("memosBox").hidden = !has; $("dock").hidden = !has;
  $("recLead").hidden = has;
  // 用語
  var n = termCounts(), names = Object.keys(n).sort(function (a, b) { return n[b] - n[a] || a.localeCompare(b); });
  $("termsBox").hidden = !names.length;
  var chips = $("termChips"); chips.textContent = "";
  names.forEach(function (w) {
    var b = document.createElement("button"); b.type = "button";
    b.className = "chip chip-btn" + (filter === w ? " on" : "");
    b.textContent = w + (n[w] > 1 ? " ×" + n[w] : "");
    b.setAttribute("aria-pressed", filter === w ? "true" : "false");
    b.addEventListener("click", function () { filter = filter === w ? "" : w; render(); });
    chips.appendChild(b);
  });
  // メモ
  var list = memos.filter(function (m) { return !filter || (m.terms || []).indexOf(filter) >= 0; });
  $("memosTitle").textContent = filter ? "「" + filter + "」が出てくるメモ " + list.length + "件" : "メモ " + memos.length + "件";
  $("clearFilter").hidden = !filter;
  var ul = $("memoList"); ul.textContent = "";
  list.forEach(function (m) {
    var li = document.createElement("li"); li.className = "b-memo";
    var meta = document.createElement("p"); meta.className = "b-meta";
    meta.textContent = dayLabel(m.t) + "　" + m.sec + "秒" + (m.sent ? "　渡した" : "");
    var body = document.createElement("p"); body.className = "b-text"; highlight(body, m.text, m.terms || []);
    var del = document.createElement("button"); del.type = "button"; del.className = "link-btn b-del"; del.textContent = "消す";
    del.addEventListener("click", function () { memos = memos.filter(function (x) { return x.id !== m.id; }); saveMemos(); render(); });
    li.appendChild(meta); li.appendChild(del); li.appendChild(body); ul.appendChild(li);
  });
  var unsent = memos.filter(function (m) { return !m.sent; }).length;
  $("handoffBtn").textContent = unsent ? "Claude に渡す文面をコピー（まだの " + unsent + "件）" : "Claude に渡す文面をコピー（全 " + memos.length + "件）";
}
function renderSettings() {
  $("appkey").value = appkey();
  $("optNolog").checked = settings.nolog;
  $("optSilence").value = String(settings.silence);
  $("optWords").value = String(settings.words);
  $("extraWords").value = lsRaw(LS.words) ? lsGet(LS.words, "") : "";
  var reg = wordsToRegister();
  $("dictInfo").textContent = "辞書にある用語：" + dict.length + "語（教材 " + deckTerms.length + "語＋自分で足した分）。いま登録されるのは " + (reg ? reg.split("|").length : 0) + "語です。";
  var u = lsGet(LS.usage, {}), today = new Date().toISOString().slice(0, 10);
  $("usage").textContent = "今日、声の認識に使った時間：約 " + Math.round((u.day === today ? u.ms : 0) / 1000) + " 秒";
  $("keyState").className = "hint"; $("keyState").textContent = appkey() ? "キーは保存済みです。" : "";
}

// ---------------------------------------------------------------- Claude への受け渡し（コピーして貼るだけ）
var FORMAT_NOTE = [
  "教材は次の JSON 形式で、コードブロックに入れて出力してください。",
  '{ "title": "教材名", "terms": [{"w": "EventBridge", "r": "いべんとぶりっじ", "d": "イベントを受け取って次の処理へ渡す中継役です。"}], "cards": [{"id": "c01", "scene": "", "point": "", "why": "", "trap": "", "easy": ""}] }',
  "",
  "教材の書き方（目ではなく耳で聞く教材です）:",
  "- scene: どんな場面・要件の話か。1〜2文。",
  "- point: 覚える要点。1文、40字以内。",
  "- why: なぜそうなるか。3〜4文。1文は50字以内。",
  "- trap: 間違えやすい点と、その理由。2〜3文。無ければ空文字。",
  "- easy: 専門用語を減らした、たとえ話による言い換え。2〜3文。",
  "- 矢印、プラス、イコール、括弧、箇条書きなどの記号は使わず、話し言葉の文にする。",
  "- 英字の製品名や略語は本文では英字のまま書き、すべて terms に {表記 w, ひらがなの読み r, 1文の短い説明 d} で登録する。"
].join("\n");
function memoLines(list) {
  return list.slice().reverse().map(function (m) { return "【" + dayLabel(m.t) + "】\n" + m.text; }).join("\n\n");
}
function handoffText(list) {
  return [
    "資格勉強のあと、覚えたことを思い出しながら声に出したメモです。音声認識の結果そのままなので、言い間違いや誤字が混じっています。",
    "",
    "お願い:",
    "1. 間違って理解している所と、説明があやふやな所を指摘してください。合っている所は一言で構いません。",
    "2. 話に出てこなかったけれど、この範囲で押さえるべき論点があれば挙げてください。",
    "3. 1 と 2 をもとに、弱い所だけを聞き直すための教材を作ってください。",
    "",
    FORMAT_NOTE,
    "",
    "--- ここからメモ ---",
    memoLines(list)
  ].join("\n");
}
function copyText(text, stateEl, okMsg, done) {
  function ok() { stateEl.className = "hint good"; stateEl.textContent = okMsg; if (done) done(); }
  function ng() { stateEl.className = "hint bad"; stateEl.textContent = "コピーできませんでした。ブラウザの設定を確認してください。"; }
  function legacy() {
    var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    (stateEl.closest("dialog") || document.body).appendChild(ta); ta.select();
    try { document.execCommand("copy") ? ok() : ng(); } catch (e) { ng(); }
    ta.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, legacy); else legacy();
}

// ---------------------------------------------------------------- 起動
function bind() {
  $("recBtn").addEventListener("click", function () {
    beep(1, 1); // 最初のタップで音を出せるようにしておく
    if (rec) stopRec(); else startRec();
  });
  $("clearFilter").addEventListener("click", function () { filter = ""; render(); });
  document.querySelectorAll("dialog [data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
  document.querySelectorAll("dialog").forEach(function (d) { d.addEventListener("click", function (e) { if (e.target === d) d.close(); }); });
  $("openSettings").addEventListener("click", function () { renderSettings(); $("settingsSheet").showModal(); });
  $("openImport").addEventListener("click", function () { $("importState").textContent = ""; $("importSheet").showModal(); });

  $("handoffBtn").addEventListener("click", function () {
    var unsent = memos.filter(function (m) { return !m.sent; });
    var list = unsent.length ? unsent : memos;
    copyText(handoffText(list), $("handoffState"), "コピーしました。Claude のチャットに貼り付けてください。", function () {
      list.forEach(function (m) { m.sent = true; }); saveMemos(); render();
    });
  });
  $("importSave").addEventListener("click", function () {
    var st = $("importState"), raw = $("importText").value.trim();
    var m = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) raw = m[1].trim();
    try {
      var j = JSON.parse(raw);
      if (!j || !Array.isArray(j.cards) || !j.cards.some(function (c) { return c && c.point && (c.why || c.scene); })) throw new Error("shape");
      lsSet(LS.deck, j);
      location.href = "./";
    } catch (e) {
      st.className = "hint bad";
      st.textContent = e.message === "shape" ? "cards が見つかりません。Claude が返した JSON を丸ごと貼ってください。" : "JSON として読めませんでした。コードブロックの中身を丸ごと貼ってください。";
    }
  });

  $("saveKey").addEventListener("click", function () {
    var v = $("appkey").value.trim();
    try { if (v) localStorage.setItem(LS.key, v); else { localStorage.removeItem(LS.key); localStorage.removeItem(LS.oldKey); } } catch (e) {}
    $("keyState").className = "hint good"; $("keyState").textContent = v ? "キーを保存しました。" : "キーを消しました。";
  });
  $("optNolog").addEventListener("change", function (e) { settings.nolog = e.target.checked; saveSettings(); });
  $("optSilence").addEventListener("change", function (e) { settings.silence = Number(e.target.value); saveSettings(); });
  $("optWords").addEventListener("change", function (e) { settings.words = Number(e.target.value); saveSettings(); renderSettings(); });
  $("saveWords").addEventListener("click", function () {
    var raw = $("extraWords").value, ok = parseExtra(raw), lines = raw.split(/\n/).filter(function (l) { return l.trim(); }).length;
    lsSet(LS.words, raw); buildDict(); renderSettings();
    $("wordsState").className = ok.length === lines ? "hint good" : "hint bad";
    $("wordsState").textContent = ok.length === lines ? ok.length + "語を保存しました。" : ok.length + "語を保存しました。" + (lines - ok.length) + "行は読めませんでした（よみは、ひらがなかカタカナで書いてください）。";
  });
  $("copyAll").addEventListener("click", function () { copyText(memoLines(memos), $("memoState"), "コピーしました。"); });
  var armed = 0;
  $("clearAll").addEventListener("click", function () {
    if (Date.now() - armed < 4000) { memos = []; saveMemos(); filter = ""; render(); armed = 0; this.textContent = "メモを全部消す"; $("memoState").className = "hint good"; $("memoState").textContent = "メモを全部消しました。"; return; }
    armed = Date.now(); this.textContent = "もう一度押すと消えます";
    var b = this; setTimeout(function () { if (armed) { armed = 0; b.textContent = "メモを全部消す"; } }, 4000);
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden && rec) stopRec(); });
}
function loadTerms() {
  function take(j) {
    deckTerms = (j && Array.isArray(j.terms) ? j.terms : []).filter(function (t) { return t && t.w && t.r; }).map(function (t) { return { w: String(t.w), r: toHira(String(t.r)) }; });
  }
  var custom = lsGet(LS.deck, null);
  if (custom && Array.isArray(custom.terms) && custom.terms.length) { take(custom); return Promise.resolve(); }
  return fetch("deck-sample.json").then(function (r) { return r.json(); }).then(take).catch(function () { deckTerms = []; });
}
function boot() {
  bind();
  loadTerms().then(function () { buildDict(); render(); setRecUI("idle", ""); });
}
window.BOYAKI = { findTerms: function (t) { return findTerms(t); }, words: function () { return wordsToRegister(); } };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
