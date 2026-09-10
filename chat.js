/* =========================================================================
   chat.js — محادثات فورية داخل الموقع + واتساب + إشعار بصوت
   -------------------------------------------------------------------------
   يُحمَّل بعد app.js فيستبدل دالتين معرَّفتين فيه دون تعديل ملفه:
     msgCompose    — تفتح محادثة متصلة بدل نموذج «رسالة جديدة»
     openMsgPanel  — تعرض المحادثات مجمَّعة بالمُراسِل لا رسائل متفرقة

   الرسائل تبقى في site_messages كما هي، ويُضاف إليها حقل threadId
   ليجمع الطرفين في محادثة واحدة. الرسائل القديمة تظهر كما كانت.

   يتطلّب: تحديث firestore.rules (قراءة المُرسِل لرسائله · إرسال الطلاب)
           وفهرس threadId + ts في firestore.indexes.json
   ========================================================================= */
(function () {
  "use strict";

  var SOUND_SRC = "notify.wav";
  var THREAD_LIMIT = 200;

  /* ------------------------------------------------------------------
     أدوات مختصرة — تُقرأ من app.js إن وُجدت، وإلا تعمل بلا اعتماد عليه
     ------------------------------------------------------------------ */
  function DBX()    { try { return DB; } catch (e) { return {}; } }
  function USER()   { try { return (STATE && STATE.user) || {}; } catch (e) { return {}; } }
  function DBASE()  { return window.__db || null; }
  function E(s)     { try { return esc(s); } catch (e) { return String(s == null ? "" : s); } }
  function IC(n, s) { try { return ic(n, s); } catch (e) { return ""; } }
  function T(m, t)  { try { showToast(m, t); } catch (e) {} }
  function MAIL()   { return String(USER().email || "").toLowerCase(); }
  function MYID()   { var u = USER(); return String(u.uid || u.id || ""); }

  /* معرّف المحادثة: البريدان مرتَّبان، فيتطابق من الطرفين */
  /* الحرف الأول للاسم — بلا ألقاب */
  function AV(n) {
    var c = String(n || "").replace(/^(الشيخ|الأستاذ)\s+/, "").trim().charAt(0);
    return c || "؟";
  }

  function threadOf(a, b) {
    return [String(a || "").toLowerCase(), String(b || "").toLowerCase()]
      .filter(Boolean).sort().join("|");
  }

  /* ==================================================================
     الصوت
     ------------------------------------------------------------------
     المتصفح يمنع التشغيل قبل أول تفاعل من المستخدم، فيُفكّ القفل بأول
     نقرة: يُشغَّل الملف صامتاً ثم يُوقَف، فيصير مسموحاً بعدها.
     ================================================================== */
  var AUDIO = null, AUDIO_READY = false;

  function initSound() {
    try {
      AUDIO = new Audio(SOUND_SRC);
      AUDIO.preload = "auto";
      AUDIO.volume = 0.6;
    } catch (e) { return; }

    var unlock = function () {
      if (AUDIO_READY || !AUDIO) return;
      var p = AUDIO.play();
      if (p && p.then) p.then(function () {
        AUDIO.pause(); AUDIO.currentTime = 0; AUDIO_READY = true;
      }).catch(function () {});
    };
    ["click", "touchstart", "keydown"].forEach(function (ev) {
      document.addEventListener(ev, unlock, { once: true, passive: true });
    });
  }

  function ping() {
    if (!AUDIO) return;
    try { AUDIO.currentTime = 0; var p = AUDIO.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }

  /* إشعار النظام — يُطلب الإذن عند أول فتح للتواصل لا عند تحميل الصفحة */
  function askPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      try { Notification.requestPermission(); } catch (e) {}
    }
  }

  function systemNotify(title, body, onClick) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      var n = new Notification(title, {
        body: body, icon: "logo-mark.png", dir: "rtl", lang: "ar", tag: "site-msg"
      });
      n.onclick = function () { window.focus(); n.close(); if (onClick) onClick(); };
    } catch (e) {}
  }

  /* ==================================================================
     جهات التواصل — المعلمون والطلاب والإدارة
     ------------------------------------------------------------------
     تُبنى على contactGroups في app.js، ويُضاف إليها الطلاب لمن لم يكونوا
     يرونهم: الطالب يرى زملاء حلقته، وولي الأمر يرى معلّمي أبنائه فقط.
     ================================================================== */
  /* عدد غير المقروء من شخص بعينه */
  /* ==================================================================
     نافذة التواصل — أُزيل استبدالها
     ------------------------------------------------------------------
     كان هذا الملف يستبدل openContacts بنسخة أقدم، فصار للنافذة نسختان:
     واحدة في app.js وأخرى هنا، والثانية تُحمَّل بعده فتلغيه. ولمّا
     أُضيفت زملاء الحلقة وأزرار الواتساب إلى app.js صار الاستبدال
     يُخفيها لا يُضيف إليها.

     ما بقي من هذا الملف يعمل كما هو: النقر على «الموقع» ينادي
     msgCompose المستبدلة أدناه، فتفتح المحادثة المتصلة.
     ================================================================== */


  /* أيقونة واتساب — يستعملها زرّ «نسخة على واتساب» في نافذة المحادثة */
  var WA_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5v-.5c-.1-.2-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2m0 1.8a8.2 8.2 0 0 1 6.7 12.9l-.2.3.6 2.2-2.3-.6-.3.2A8.2 8.2 0 1 1 12 3.8"/></svg>';

  /* ==================================================================
     المحادثة
     ================================================================== */
  var OPEN = null;      /* { id, name, mail, phone, tid, unsub } */

  function personById(id, mail) {
    var d = DBX();
    var pools = [d.users || [], d.students || [], d.teachers || []];
    for (var i = 0; i < pools.length; i++) {
      for (var j = 0; j < pools[i].length; j++) {
        var x = pools[i][j];
        if (String(x.uid || "") === String(id) || String(x.id) === String(id)) return x;
        if (mail && String(x.email || x.username || "").toLowerCase() === String(mail).toLowerCase()) return x;
      }
    }
    return null;
  }

  /* رسائل المحادثة من الذاكرة — تشمل القديمة التي بلا threadId */
  function localThread(mail, id) {
    var msgs = Array.isArray(DBX().site_messages) ? DBX().site_messages : [];
    var him = String(mail || "").toLowerCase(), me = MAIL(), myId = MYID();
    return msgs.filter(function (m) {
      var to = String(m.toEmail || "").toLowerCase(), fr = String(m.fromEmail || "").toLowerCase();
      var mineOut = (fr === me || String(m.fromId || "") === myId) &&
                    (to === him || String(m.toId || "") === String(id) || String(m.toUid || "") === String(id));
      var mineIn  = (to === me || String(m.toId || "") === myId || String(m.toUid || "") === myId) &&
                    (fr === him || String(m.fromId || "") === String(id));
      return mineOut || mineIn;
    });
  }

  /* سجل الطالب قد لا يحمل بريداً، والبريد هو عنوان الرسالة — فيُلتمس
     من حساب المستخدم المرتبط به قبل الاستسلام. */
  function resolveMail(person, rec) {
    var m = String(person.mail || (rec && (rec.email || rec.username)) || "").toLowerCase();
    if (m) return m;
    var id = String(person.id || "");
    var users = Array.isArray(DBX().users) ? DBX().users : [];
    var key = String(person.name || "").trim();
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (!u || u.active === false) continue;
      var hit = String(u.uid || "") === id || String(u.id) === id ||
                String(u.studentId || "") === id ||
                (key && String(u.name || "").trim() === key);
      if (hit && (u.email || u.username)) return String(u.email || u.username).toLowerCase();
    }
    return "";
  }

  window.openChatWith = function (person) {
    askPermission();

    var rec = personById(person.id, person.mail);
    var mail = resolveMail(person, rec);
    var phone = person.phone || (rec && (rec.phone || rec.parentPhone)) || "";

    if (!mail) {
      T("لا يوجد بريد مسجَّل لهذه الجهة — راسلها على واتساب", "warn");
      return;
    }

    if (OPEN && OPEN.unsub) { try { OPEN.unsub(); } catch (e) {} }
    OPEN = { id: person.id, name: person.name, mail: mail, phone: phone,
             tid: threadOf(MAIL(), mail), unsub: null, msgs: [] };

    var wa = "";
    try { wa = waLink(phone, ""); } catch (e) {}

    openModal("محادثة — " + person.name, mail,
      '<div class="chat-wrap">' +
        '<div class="chat-scroll" id="chatScroll">' +
          '<div class="chat-load">جارٍ تحميل المحادثة…</div>' +
        '</div>' +
        '<div class="chat-bar">' +
          '<input id="chatText" type="text" placeholder="اكتب رسالتك…" autocomplete="off">' +
          '<button type="button" class="chat-send" id="chatSend" title="إرسال داخل الموقع">' + IC("send", 16) + '</button>' +
          (wa ? '<button type="button" class="chat-wa" id="chatWa" title="إرسال نسخة على واتساب">' + WA_SVG + '</button>' : '') +
        '</div>' +
      '</div>',
      '<button class="btn btn-ghost" data-action="msg-inbox">' + IC("chat", 16) + ' كل المحادثات</button>');

    /* الرسائل المحفوظة محلياً تظهر فوراً ثم يحدّثها المستمع */
    OPEN.msgs = localThread(mail, person.id);
    renderThread();
    wireComposer(wa);
    listenThread();
  };

  function wireComposer(wa) {
    var send = document.getElementById("chatSend");
    var input = document.getElementById("chatText");
    var btnWa = document.getElementById("chatWa");

    if (send) send.onclick = function () { doSend(false); };
    if (btnWa) btnWa.onclick = function () { doSend(true, wa); };
    if (input) {
      input.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); doSend(false); } };
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    }
  }

  /* الاستماع اللحظي لرسائل هذه المحادثة */
  function listenThread() {
    var d = DBASE();
    if (!d || !OPEN) return;
    var tid = OPEN.tid;

    OPEN.unsub = d.collection("site_messages")
      .where("threadId", "==", tid)
      .onSnapshot(function (snap) {
        if (!OPEN || OPEN.tid !== tid) return;
        var live = [];
        snap.forEach(function (doc) { live.push(doc.data()); });

        /* تُدمج مع القديمة بلا تكرار */
        var seen = {}, all = [];
        live.concat(OPEN.msgs).forEach(function (m) {
          var k = String(m.id || (m.ts + "|" + m.text));
          if (seen[k]) return;
          seen[k] = 1; all.push(m);
        });
        OPEN.msgs = all;
        renderThread();
        markThreadRead(snap);
      }, function (err) {
        console.warn("chat listen:", err && err.code);
        var box = document.getElementById("chatScroll");
        if (box && !OPEN.msgs.length) {
          box.innerHTML = '<div class="chat-load">تعذّر تحميل المحادثة — تأكد من تحديث قواعد Firestore.</div>';
        }
      });
  }

  /* تعليم الوارد كمقروء — القواعد تسمح للمستقبِل بحقل read وحده */
  function markThreadRead(snap) {
    var me = MAIL();
    snap.forEach(function (doc) {
      var m = doc.data();
      if (m.read) return;
      if (String(m.toEmail || "").toLowerCase() !== me) return;
      doc.ref.update({ read: true }).catch(function () {});
      var local = (DBX().site_messages || []).find(function (x) { return String(x.id) === String(m.id); });
      if (local) local.read = true;
    });
    try { updateMsgBadge(); } catch (e) {}
  }

  function renderThread() {
    var box = document.getElementById("chatScroll");
    if (!box || !OPEN) return;

    var list = OPEN.msgs.slice()
      .sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); })
      .slice(-THREAD_LIMIT);

    if (!list.length) {
      box.innerHTML = '<div class="chat-load">لا رسائل بعد — ابدأ المحادثة.</div>';
      return;
    }

    var me = MAIL(), myId = MYID(), lastDay = "";
    box.innerHTML = list.map(function (m) {
      var mine = String(m.fromEmail || "").toLowerCase() === me || String(m.fromId || "") === myId;
      var t = new Date(m.ts || Date.now());
      var day = t.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
      var sep = day !== lastDay ? '<div class="chat-day">' + E(day) + '</div>' : "";
      lastDay = day;
      var time = t.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

      return sep + '<div class="chat-msg ' + (mine ? "mine" : "his") + '">' +
        (m.title && m.title !== "محادثة" ? '<strong class="chat-t">' + E(m.title) + '</strong>' : '') +
        '<p>' + E(m.text || "") + '</p>' +
        '<time>' + E(time) + (m.via === "wa" ? " · واتساب" : "") + '</time></div>';
    }).join("");

    box.scrollTop = box.scrollHeight;
  }

  /* ------------------------------------------------------------------
     الإرسال — داخل الموقع، ومعه نسخة على واتساب عند الطلب
     ------------------------------------------------------------------ */
  function doSend(alsoWa, waBase) {
    if (!OPEN) return;
    var input = document.getElementById("chatText");
    var text = input ? String(input.value || "").trim() : "";
    if (!text) { T("اكتب نص الرسالة", "warn"); return; }

    var u = USER();
    var rec = personById(OPEN.id, OPEN.mail);
    var msg = {
      id: "m" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      threadId: OPEN.tid,
      title: "محادثة",
      text: text,
      ts: Date.now(),
      toId: String(OPEN.id || ""),
      toUid: rec ? String(rec.uid || rec.id || OPEN.id) : String(OPEN.id || ""),
      toEmail: OPEN.mail,
      toName: OPEN.name || "",
      fromId: MYID(),
      fromEmail: MAIL(),
      fromName: u.name || "",
      read: false,
      type: "info",
      via: alsoWa ? "wa" : "site"
    };

    if (input) { input.value = ""; input.disabled = true; }

    /* تظهر فوراً ثم تُثبَّت — فلا ينتظر المستخدم الشبكة */
    OPEN.msgs.push(msg);
    if (!Array.isArray(DBX().site_messages)) DBX().site_messages = [];
    DBX().site_messages.push(msg);
    renderThread();

    var saved;
    try { saved = persistSet("site_messages", msg); } catch (e) { saved = false; }

    Promise.resolve(saved).then(function (ok) {
      if (input) { input.disabled = false; input.focus(); }
      if (!ok) T("لم تُحفظ الرسالة — تحقّق من الاتصال", "warn");
    }).catch(function () {
      if (input) { input.disabled = false; }
      T("لم تُحفظ الرسالة — تحقّق من الاتصال", "warn");
    });

    if (alsoWa && waBase) {
      var url = "";
      try { url = waLink(OPEN.phone, text); } catch (e) { url = waBase; }
      if (url) window.open(url, "_blank", "noopener");
    }
  }

  /* ==================================================================
     صندوق الرسائل — محادثات مجمَّعة بالمُراسِل
     ================================================================== */
  window.openMsgPanel = function () {
    var msgs = [];
    try { msgs = myMessages() || []; } catch (e) { msgs = []; }

    /* رسائلي الصادرة أيضاً لتظهر المحادثة التي بدأتُها ولم يُرَد عليها */
    var me = MAIL(), myId = MYID();
    (DBX().site_messages || []).forEach(function (m) {
      if (String(m.fromEmail || "").toLowerCase() === me || String(m.fromId || "") === myId) msgs.push(m);
    });

    var th = {}, seenId = {};
    msgs.forEach(function (m) {
      if (m.id && seenId[m.id]) return;
      if (m.id) seenId[m.id] = 1;
      var out = String(m.fromEmail || "").toLowerCase() === me || String(m.fromId || "") === myId;
      var mail = String((out ? m.toEmail : m.fromEmail) || "").toLowerCase();
      var id   = String((out ? (m.toId || m.toUid) : m.fromId) || "");
      var name = (out ? m.toName : m.fromName) || "—";
      var k = mail || id;
      if (!k) return;
      if (!th[k]) th[k] = { mail: mail, id: id, name: name, last: 0, text: "", unread: 0 };
      if ((m.ts || 0) > th[k].last) { th[k].last = m.ts || 0; th[k].text = m.text || ""; th[k].name = name || th[k].name; }
      if (!out && !m.read) th[k].unread++;
    });

    var list = Object.keys(th).map(function (k) { return th[k]; })
      .sort(function (a, b) { return b.last - a.last; });

    var body = list.length ? list.map(function (c) {
      var when = "";
      try { when = timeAgo(c.last); } catch (e) {}
      return '<button type="button" class="alert-item nt ' + (c.unread ? "" : "read") + '"' +
        ' data-chat-open="1" data-id="' + E(c.id) + '" data-mail="' + E(c.mail) + '"' +
        ' data-name="' + E(c.name) + '">' +
        '<span class="mini-avatar">' + E(AV(c.name)) + '</span>' +
        '<div class="at"><strong>' + E(c.name) + '</strong>' +
        '<small>' + E(String(c.text).slice(0, 80)) + '</small>' +
        '<span class="nt-time">' + E(when) + '</span></div>' +
        (c.unread ? '<span class="nt-dot"></span>' : '') + '</button>';
    }).join("")
      : '<div class="empty"><div class="empty-mark">' + IC("chat", 42) + '</div>' +
        '<h4>لا توجد محادثات</h4><p>ابدأ محادثة من زر التواصل.</p></div>';

    openPanel('<div class="panel-back" data-action="close-panel"></div>' +
      '<aside class="side-panel" data-stop>' +
      '<div class="panel-head"><h3>المحادثات</h3>' +
      '<div class="ph-sub">' + (list.length ? list.length + " محادثة" : "لا جديد") + '</div>' +
      '<button class="modal-close" data-action="close-panel">' + IC("x", 18) + '</button></div>' +
      '<div class="panel-body">' + body + '</div></aside>');
  };

  /* أي نداء قديم لـ msgCompose يفتح المحادثة الجديدة */
  window.msgCompose = function (toId, toName) {
    var rec = personById(toId, "");
    window.openChatWith({
      id: toId,
      name: toName || (rec && rec.name) || "",
      mail: rec ? String(rec.email || rec.username || "").toLowerCase() : "",
      phone: rec ? (rec.phone || rec.parentPhone || "") : ""
    });
  };

  /* ==================================================================
     المستمع العام — الوارد الجديد: صوت + تنبيه + شارة
     ================================================================== */
  var INBOX_UNSUB = null, FIRST_SNAP = true;

  function watchInbox() {
    var d = DBASE(), mail = MAIL();
    if (!d || !mail) return;
    if (INBOX_UNSUB) { try { INBOX_UNSUB(); } catch (e) {} }
    FIRST_SNAP = true;

    INBOX_UNSUB = d.collection("site_messages")
      .where("toEmail", "==", mail)
      .onSnapshot(function (snap) {
        var fresh = [];

        snap.docChanges().forEach(function (ch) {
          if (ch.type !== "added") return;
          var m = ch.doc.data();
          if (!Array.isArray(DBX().site_messages)) DBX().site_messages = [];
          var arr = DBX().site_messages;
          var found = false;
          for (var i = 0; i < arr.length; i++) {
            if (String(arr[i].id) === String(m.id)) { arr[i] = m; found = true; break; }
          }
          if (!found) arr.push(m);
          if (!FIRST_SNAP && !m.read) fresh.push(m);
        });

        try { updateMsgBadge(); } catch (e) {}

        /* المحادثة المفتوحة تُحدَّث بنفسها عبر مستمعها، فلا تُنبِّه مرتين */
        if (fresh.length) {
          var last = fresh[fresh.length - 1];
          var open = OPEN && String(last.fromEmail || "").toLowerCase() === OPEN.mail;
          if (!open) {
            ping();
            T("رسالة جديدة من " + (last.fromName || "—"), "info");
            if (document.hidden) {
              systemNotify(last.fromName || "رسالة جديدة", String(last.text || "").slice(0, 90), function () {
                window.openChatWith({ id: last.fromId, name: last.fromName, mail: last.fromEmail, phone: "" });
              });
            }
          }
        }

        FIRST_SNAP = false;
      }, function (err) { console.warn("inbox listen:", err && err.code); });
  }

  /* ==================================================================
     الربط
     ================================================================== */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-chat-open]");
    if (!b) return;
    e.preventDefault();
    try { closePanel(); } catch (er) {}
    window.openChatWith({
      id: b.dataset.id || "",
      name: b.dataset.name || "",
      mail: (b.dataset.mail || "").toLowerCase(),
      phone: b.dataset.phone || ""
    });
  });

  /* إغلاق النافذة يوقف مستمع المحادثة فلا تتراكم الاشتراكات */
  document.addEventListener("click", function (e) {
    var c = e.target.closest && e.target.closest('[data-action="close-modal"]');
    if (!c || !OPEN) return;
    if (OPEN.unsub) { try { OPEN.unsub(); } catch (er) {} }
    OPEN = null;
  });

  /* ينتظر تسجيل الدخول: STATE.user يُملأ في auth.js بعد المصادقة */
  function boot() {
    initSound();
    var tries = 0;
    var t = setInterval(function () {
      if (MAIL()) { clearInterval(t); watchInbox(); return; }
      if (++tries > 60) clearInterval(t);        /* ثلاث دقائق ثم يتوقف */
    }, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
