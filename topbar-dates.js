/* =========================================================================
   مجمع ميراث التعليمي — شريط التواريخ في الأعلى (قوائم مخصّصة)
   ---------------------------------------------------------------------------
   • فلاتر: السنوات، الفترة، الشهر (12 هجرياً)، الأسبوع (4) — على شكل pills فاتحة.
   • زر «تحديد تاريخ» (أخضر) يفتح تقويم المتصفح لاختيار أي يوم.
   • قائمة تاريخ منسدلة تعرض آخر الأيام، المختار فيها بلون أخضر (custom — بلا
     الغامق الأزرق/الرمادي بتاع قوائم المتصفح).
   • لا يلمس أي صفحة أو تصميم آخر — يعمل على كل الصفحات تلقائياً.
   • أي تعديل مستقبلي (سنة/فترة/شهر/أسبوع) من هذا الملف فقط.
   ========================================================================= */
(function () {
  "use strict";

  /* =======================================================================
     (1)  البيانات — عدّل من هنا فقط
     ======================================================================= */
  /* السنة الهجرية الحالية (حساب تلقائي) */
  function currentHijriYear() {
    try {
      const s = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", { year: "numeric" }).format(new Date());
      const y = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
      if (y > 1400 && y < 1600) return y;
    } catch (e) {}
    return 1448;
  }
  const CUR_YEAR = currentHijriYear();

  const YEAR_FROM = CUR_YEAR;         // السنة الحالية فقط (بدون سنوات سابقة)
  const YEAR_TO   = CUR_YEAR + 4;      // + 4 سنوات بعدها

  const PERIODS = [
    "الفترة الأولى", "الفترة الثانية", "الفترة الثالثة",
    "الفترة الرمضانية", "الفترة الصيفية", "فترة الاختبارات"
  ];

  const MONTH_NAMES = [
    "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
    "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"
  ];

  const WEEK_COUNT = 4;                 // أربعة أسابيع
  const RECENT_DAYS = 14;               // عدد الأيام في قائمة التاريخ

  const YEARS = [];
  for (let y = YEAR_FROM; y <= YEAR_TO; y++) YEARS.push("العام " + y + "هـ");
  const MONTHS = MONTH_NAMES.map(function (m) { return "شهر " + m; });
  const WEEKS = [];
  for (let w = 1; w <= WEEK_COUNT; w++) WEEKS.push("الأسبوع " + w);

  /* =======================================================================
     (2)  أدوات التاريخ
     ======================================================================= */
  const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  function toAr(s) { return String(s).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); }
  function fmtDay(dt) { return AR_DAYS[dt.getDay()] + "، " + toAr(dt.getDate()) + "/" + toAr(dt.getMonth() + 1); }
  function toInputVal(dt) { const p = function (n) { return (n < 10 ? "0" : "") + n; }; return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate()); }

  const CHEV = '<svg class="tb-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  /* =======================================================================
     (3)  إغلاق كل القوائم المفتوحة
     ======================================================================= */
  const allPanels = [];
  function closeAll(except) {
    allPanels.forEach(function (p) {
      if (p === except) return;
      p.panel.hidden = true;
      p.pill.setAttribute("aria-expanded", "false");
      p.pill.classList.remove("open");
    });
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".tb-wrap")) closeAll(null);
  });

  /* =======================================================================
     (4)  بناء قائمة مخصّصة واحدة
        label = النص الظاهر وهي مقفولة (اسم الفئة)
        items = عناصر القائمة
        onPick(value) = ماذا يحدث عند الاختيار
     ======================================================================= */
  function buildDropdown(label, items, opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "tb-wrap";

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "tb-pill";
    pill.setAttribute("aria-haspopup", "listbox");
    pill.setAttribute("aria-expanded", "false");
    pill.innerHTML = '<span class="tb-lbl">' + label + '</span>' + CHEV;

    const panel = document.createElement("div");
    panel.className = "tb-panel";
    panel.setAttribute("role", "listbox");
    panel.hidden = true;

    const lblEl = pill.querySelector(".tb-lbl");
    let selected = opts.selected || null;

    function addItem(it) {
      const o = document.createElement("div");
      o.className = "tb-opt" + (it === selected ? " sel" : "");
      o.setAttribute("role", "option");
      o.textContent = it;
      o.addEventListener("click", function (ev) {
        ev.stopPropagation();
        panel.querySelectorAll(".tb-opt.sel").forEach(function (x) { x.classList.remove("sel"); });
        o.classList.add("sel");
        lblEl.textContent = it;
        pill.classList.add("has-val");
        selected = it;
        panel.hidden = true;
        pill.setAttribute("aria-expanded", "false");
        pill.classList.remove("open");
        if (typeof opts.onPick === "function") opts.onPick(it);
      });
      panel.appendChild(o);
    }
    items.forEach(addItem);

    if (selected) { lblEl.textContent = selected; pill.classList.add("has-val"); }

    /* إعادة ملء القائمة من خارجها — لقائمة «الفترة» التي تُبنى من فترات قاعدة البيانات */
    wrap._setItems = function (list, sel, onPick) {
      panel.innerHTML = "";
      selected = sel || null;
      if (typeof onPick === "function") opts.onPick = onPick;
      list.forEach(addItem);
      lblEl.textContent = selected || label;
      pill.classList.toggle("has-val", !!selected);
    };

    const rec = { pill: pill, panel: panel };
    allPanels.push(rec);

    pill.addEventListener("click", function (ev) {
      ev.stopPropagation();
      const willOpen = panel.hidden;
      closeAll(rec);
      panel.hidden = !willOpen;
      pill.setAttribute("aria-expanded", willOpen ? "true" : "false");
      pill.classList.toggle("open", willOpen);
    });

    wrap.appendChild(pill);
    wrap.appendChild(panel);
    return wrap;
  }

  /* =======================================================================
     (5)  مزامنة القيمة مع <select> الأصلي المخفي (لأي كود يقرأه مستقبلاً)
     ======================================================================= */
  function syncHidden(sel, value) {
    if (!sel) return;
    let opt = Array.prototype.find.call(sel.options, function (o) { return o.value === value || o.textContent === value; });
    if (!opt) { opt = document.createElement("option"); opt.value = value; opt.textContent = value; sel.appendChild(opt); }
    sel.value = opt.value;
  }
  function findNative(id, title) {
    return document.getElementById(id) ||
           document.querySelector('select.filter-sel[title="' + title + '"]');
  }

  /* =======================================================================
     (6)  مجموعة التاريخ: زر أخضر + قائمة آخر الأيام
     ======================================================================= */
  function buildDateGroup(bar) {
    const today = new Date();

    // حقل تاريخ أصلي مخفي (يفتح تقويم المتصفح لأي يوم)
    const native = document.createElement("input");
    native.type = "date";
    native.className = "date-native";
    native.value = toInputVal(today);

    // الزر الأخضر
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-btn";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg><span>تحديد تاريخ</span>';

    // قائمة آخر الأيام (مخصّصة)
    const wrap = document.createElement("div");
    wrap.className = "tb-wrap";
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "tb-pill tb-datepill has-val";
    pill.setAttribute("aria-haspopup", "listbox");
    pill.setAttribute("aria-expanded", "false");
    pill.innerHTML = '<span class="tb-lbl">' + fmtDay(today) + '</span>' + CHEV;
    const lblEl = pill.querySelector(".tb-lbl");

    const panel = document.createElement("div");
    panel.className = "tb-panel";
    panel.setAttribute("role", "listbox");
    panel.hidden = true;

    const days = [];
    for (let i = 0; i < RECENT_DAYS; i++) {
      const d = new Date(today.getTime());
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    function selectDate(dt) {
      lblEl.textContent = fmtDay(dt);
      native.value = toInputVal(dt);
      panel.querySelectorAll(".tb-opt.sel").forEach(function (x) { x.classList.remove("sel"); });
      const key = toInputVal(dt);
      const match = panel.querySelector('.tb-opt[data-k="' + key + '"]');
      if (match) match.classList.add("sel");
    }

    days.forEach(function (d, i) {
      const o = document.createElement("div");
      o.className = "tb-opt" + (i === 0 ? " sel" : "");
      o.setAttribute("role", "option");
      o.setAttribute("data-k", toInputVal(d));
      o.textContent = fmtDay(d);
      o.addEventListener("click", function (ev) {
        ev.stopPropagation();
        selectDate(d);
        panel.hidden = true;
        pill.setAttribute("aria-expanded", "false");
        pill.classList.remove("open");
      });
      panel.appendChild(o);
    });

    const rec = { pill: pill, panel: panel };
    allPanels.push(rec);
    pill.addEventListener("click", function (ev) {
      ev.stopPropagation();
      const willOpen = panel.hidden;
      closeAll(rec);
      panel.hidden = !willOpen;
      pill.setAttribute("aria-expanded", willOpen ? "true" : "false");
      pill.classList.toggle("open", willOpen);
    });

    // الزر الأخضر يفتح تقويم المتصفح
    btn.addEventListener("click", function () {
      if (typeof native.showPicker === "function") { try { native.showPicker(); return; } catch (e) {} }
      native.focus(); native.click();
    });
    native.addEventListener("change", function () {
      if (!native.value) return;
      const p = native.value.split("-");
      selectDate(new Date(+p[0], +p[1] - 1, +p[2]));
    });

    wrap.appendChild(pill);
    wrap.appendChild(panel);

    // الترتيب (يمين ← يسار في RTL): الزر ثم قائمة اليوم
    bar.appendChild(btn);
    bar.appendChild(wrap);
    bar.appendChild(native);
  }

  /* =======================================================================
     (7)  البناء الكامل للشريط
        الترتيب (يمين ← يسار): [تحديد تاريخ] [اليوم] [الاسبوع] [الشهر] [الفترة] [السنوات]
     ======================================================================= */
  /* قائمة «الفترة» تُبنى من فترات النظام الحقيقية متى وُجدت (app.js يوفّر
     trmViewOptions)، ويعرض اختيارُها النظامَ كلَّه على تلك الفترة. وبلا
     فترات تبقى القائمة الثابتة كما كانت. */
  let periodDD = null, periodSig = "";
  window.tbPeriodSync = function () {
    if (!periodDD || typeof window.trmViewOptions !== "function") return;
    let o = null;
    try { o = window.trmViewOptions(); } catch (e) { return; }
    if (!o || !o.items || !o.items.length) return;
    const sig = JSON.stringify(o);
    if (sig === periodSig) return;
    periodSig = sig;
    const byLabel = {};
    o.items.forEach(function (x) { byLabel[x.label] = x.id; });
    periodDD._setItems(o.items.map(function (x) { return x.label; }), o.selected, function (v) {
      const selPeriod = document.getElementById("selPeriod");
      if (selPeriod) syncHidden(selPeriod, v);
      if (typeof window.trmViewSet === "function" && byLabel[v] != null) window.trmViewSet(byLabel[v]);
    });
  };

  function buildBar() {
    const bar = document.getElementById("topFilters") || document.querySelector(".topbar-filters");
    if (!bar) return;
    if (bar.dataset.tbReady === "1") return;
    bar.dataset.tbReady = "1";

    // نخفي عناصر الفلاتر الأصلية (نبقيها للمزامنة فقط)
    bar.querySelectorAll(".filter-sel, .filter-date").forEach(function (el) { el.style.display = "none"; });

    const selYear   = findNative("selYear",   "العام الدراسي");
    const selPeriod = findNative("selPeriod", "الفترة");
    const selMonth  = findNative("selMonth",  "الشهر");
    const selWeek   = findNative("selWeek",   "الأسبوع");

    buildDateGroup(bar);

    bar.appendChild(buildDropdown("الاسبوع", WEEKS,   { onPick: function (v) { syncHidden(selWeek, v); } }));
    bar.appendChild(buildDropdown("الشهر",   MONTHS,  { onPick: function (v) { syncHidden(selMonth, v); } }));
    periodDD = buildDropdown("الفترة",  PERIODS, { onPick: function (v) { syncHidden(selPeriod, v); } });
    bar.appendChild(periodDD);
    periodSig = "";
    if (typeof window.tbPeriodSync === "function") window.tbPeriodSync();
    bar.appendChild(buildDropdown("السنوات", YEARS,   { selected: "العام " + CUR_YEAR + "هـ", onPick: function (v) { syncHidden(selYear, v); } }));
  }

  /* =======================================================================
     (8)  زر تبديل الوضع الداكن / الفاتح
     ======================================================================= */
  function themeIcon(theme) {
    if (theme === "dark") {
      return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }
  function currentTheme() {
    try { return localStorage.getItem("mirath_theme") || "light"; } catch (e) { return "light"; }
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("mirath_theme", theme); } catch (e) {}
  }
  /* نطبّق الوضع المحفوظ فوراً لتقليل الوميض */
  applyTheme(currentTheme());

  function setupThemeToggle() {
    if (document.getElementById("themeToggle")) return;
    const orgSel = document.querySelector(".org-select");
    if (!orgSel) return;
    const btn = document.createElement("button");
    btn.id = "themeToggle";
    btn.type = "button";
    btn.className = "icon-btn theme-toggle";
    btn.setAttribute("aria-label", "تبديل الوضع الداكن والفاتح");
    btn.title = "تبديل الوضع الداكن / الفاتح";
    btn.innerHTML = themeIcon(currentTheme());
    btn.addEventListener("click", function () {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      btn.innerHTML = themeIcon(next);
    });
    /* نضعه بجانب قائمة المجمعات مباشرة */
    orgSel.parentNode.insertBefore(btn, orgSel.nextSibling);
  }

  /* =======================================================================
     (9)  التشغيل
     ======================================================================= */
  function boot() { buildBar(); setupThemeToggle(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.fillTopbarDates = boot;
})();

/* =========================================================================
   إضافة معزولة: إصلاح أزرار (التنبيهات/الرسائل) + رسائل داخل الموقع
   - تُعيد ربط زر التنبيهات وزر الرسائل حتى لو تعطّل ربطهما.
   - تضيف خيار «رسالة في الموقع» بجانب واتساب عند مراسلة المعلم،
     وتصل للمعلم في صفحته عبر صندوق وارد.
   - كل شيء داخل try/catch حتى لا يتعطّل باقي الشريط أبداً.
   ========================================================================= */
(function () {
  "use strict";

  function T(m, t) { if (typeof window.showToast === "function") window.showToast(m, t); else if (t === "warn") alert(m); }
  function DBf() { return window.__db || null; }
  function ME() { return window.CURRENT_USER || null; }
  function ESC(s) { return typeof window.esc === "function" ? window.esc(s) : String(s == null ? "" : s); }
  function IC(n, s) { return typeof window.ic === "function" ? window.ic(n, s) : ""; }
  function INI(n) { return typeof window.initials === "function" ? window.initials(n) : String(n || "").charAt(0); }
  function CUR(c) { return typeof window.cur === "function" ? window.cur(c) : ((window.DB && window.DB[c]) || []); }
  function WA(p, n, cls) { return typeof window.waButton === "function" ? window.waButton(p, n, cls) : ""; }

  /* --- (1) إعادة ربط الأزرار --- */
  function wireBtn(id, fnName) {
    var b = document.getElementById(id);
    if (!b || b.dataset.tbWired === "1") return;
    b.dataset.tbWired = "1";
    b.addEventListener("click", function () {
      var fn = window[fnName];
      if (typeof fn === "function") { try { fn(); } catch (e) { console.warn(fnName, e); } }
    });
  }
  function wireButtons() {
    wireBtn("btnNotif", "openNotifPanel");
    wireBtn("btnMsg", "openMsgPanel");
  }

  /* --- (2) إرسال رسالة داخل الموقع --- */
  function sendSiteMessage(toEmail, toName, text, done) {
    var d = DBf(), u = ME();
    if (!d) { T("قاعدة البيانات غير متصلة", "warn"); return; }
    var id = "smsg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    var rec = {
      id: id,
      toEmail: String(toEmail || "").toLowerCase(),
      toName: toName || "",
      fromName: (u && u.name) || "الإدارة",
      fromRole: (u && u.role) || "admin",
      text: text,
      ts: Date.now(),
      read: false
    };
    d.collection("site_messages").doc(id).set(rec)
      .then(function () { T("تم إرسال الرسالة إلى " + (toName || "")); if (done) done(); })
      .catch(function (e) { console.warn("sendSiteMessage", e); T("تعذّر إرسال الرسالة", "warn"); });
  }

  function composeTo(toEmail, toName) {
    if (!toEmail) { T("هذا المعلم ليس له بريد مسجّل لاستقبال الرسائل", "warn"); return; }
    if (typeof window.openModal === "function") {
      window.openModal("رسالة إلى " + toName, "ستصل إليه داخل الموقع في صفحته",
        '<div class="field"><label>نص الرسالة</label>' +
        '<textarea id="siteMsgText" rows="4" placeholder="اكتب رسالتك هنا..."></textarea></div>',
        '<button class="btn btn-primary" id="siteMsgSend">' + IC("send", 15) + ' إرسال</button>' +
        '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');
      setTimeout(function () {
        var s = document.getElementById("siteMsgSend");
        if (s) s.addEventListener("click", function () {
          var el = document.getElementById("siteMsgText");
          var txt = el ? el.value.trim() : "";
          if (!txt) { T("اكتب نص الرسالة أولاً", "warn"); return; }
          sendSiteMessage(toEmail, toName, txt, function () { if (typeof window.closeModal === "function") window.closeModal(); });
        });
        var f = document.getElementById("siteMsgText"); if (f) f.focus();
      }, 40);
    } else {
      var txt = window.prompt("رسالة إلى " + toName + ":");
      if (txt && txt.trim()) sendSiteMessage(toEmail, toName, txt.trim());
    }
  }

  /* التقاط الضغط على زر «الموقع» */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-site-msg]");
    if (!t) return;
    e.preventDefault();
    composeTo(t.getAttribute("data-email"), t.getAttribute("data-name"));
  });

  /* --- (3) صندوق وارد المعلم --- */
  function openInbox() {
    var d = DBf(), u = ME();
    var email = String((u && u.email) || "").toLowerCase();
    if (typeof window.openPanel !== "function") return;
    window.openPanel(
      '<div class="panel-back" data-action="close-panel"></div>' +
      '<aside class="side-panel" data-stop>' +
      '<div class="panel-head"><h3>الرسائل الواردة</h3>' +
      '<div class="ph-sub">رسائل الإدارة إليك</div>' +
      '<button class="modal-close" data-action="close-panel">' + IC("x", 18) + '</button></div>' +
      '<div class="panel-body" id="inboxBody"><div class="muted" style="padding:16px;text-align:center">جارٍ التحميل…</div></div>' +
      '</aside>');
    if (!d || !email) { var b0 = document.getElementById("inboxBody"); if (b0) b0.innerHTML = '<div class="muted" style="padding:16px;text-align:center">لا يمكن تحميل الرسائل.</div>'; return; }
    d.collection("site_messages").where("toEmail", "==", email).get().then(function (snap) {
      var msgs = [];
      snap.forEach(function (doc) { msgs.push(doc.data()); });
      msgs.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      var body = document.getElementById("inboxBody");
      if (!body) return;
      if (!msgs.length) {
        body.innerHTML = '<div class="empty" style="padding:32px 16px"><div class="empty-mark">' + IC("chat", 42) + '</div><h4>لا توجد رسائل</h4><p>لم تصلك أي رسائل بعد.</p></div>';
      } else {
        body.innerHTML = msgs.map(function (m) {
          return '<div class="panel-block" style="border:1px solid var(--border-soft);border-radius:var(--r-sm);padding:13px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<strong style="font-size:13.5px">' + ESC(m.fromName || "الإدارة") + '</strong>' +
            (m.read ? '' : '<span class="badge b-red no-dot" style="font-size:10px">جديدة</span>') + '</div>' +
            '<div style="font-size:13.5px;line-height:1.7;color:var(--text-main)">' + ESC(m.text || "") + '</div>' +
            '<div class="muted" style="font-size:11px;margin-top:6px">' + new Date(m.ts || Date.now()).toLocaleString("ar") + '</div>' +
            '</div>';
        }).join("");
      }
      /* تعليم الكل كمقروء */
      snap.forEach(function (doc) { if (!doc.data().read) doc.ref.update({ read: true }).catch(function () {}); });
      updateMsgBadge(0);
    }).catch(function (e) {
      console.warn("inbox", e);
      var body = document.getElementById("inboxBody");
      if (body) body.innerHTML = '<div class="muted" style="padding:16px;text-align:center">تعذّر تحميل الرسائل.</div>';
    });
  }

  /* --- (4) لوحة التواصل (للإدارة) مع خيار الموقع --- */
  function openContacts() {
    /* نافذة التواصل في app.js أحدث: مجموعات حسب الدور (معلمون · طلاب ·
       زملاء الحلقة · الإدارة) وزرّ واتساب لكل جهة. وهذه النسخة تعرض
       المعلمين وحدهم بمجموعة واحدة، وكانت تحجب تلك لأن زرّ الرسائل
       يناديها هي — فيظنّ المستخدم أن التحديثات لم تصل.

       الشرط الثاني يمنع الاستدعاء الذاتي لو صارت هذه هي العامّة. */
    if (typeof window.openContacts === "function" && window.openContacts !== openContacts) {
      window.openContacts();
      return;
    }

    if (typeof window.openPanel !== "function") { if (typeof window.__origMsgPanel === "function") window.__origMsgPanel(); return; }
    var teachers = CUR("teachers");
    var rowsT = teachers.length ? teachers.map(function (t) {
      var siteBtn = '<button class="btn btn-primary btn-sm" data-site-msg data-email="' + ESC(t.username || "") + '" data-name="' + ESC(t.name) + '">' + IC("chat", 15) + ' الموقع</button>';
      return '<div class="list-row" style="padding:11px 0;border-bottom:1px solid var(--border-soft)">' +
        '<span class="mini-avatar">' + INI(t.name) + '</span>' +
        '<span style="flex:1"><strong style="display:block;font-size:13.5px">' + ESC(t.name) + '</strong>' +
        '<small class="muted" style="font-size:11.5px">' + ESC(t.circle || "بلا حلقة") + '</small></span>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + WA(t.phone, t.name, "btn-soft") + siteBtn + '</div></div>';
    }).join("") : '<div class="muted" style="padding:16px;text-align:center">لا يوجد معلمون.</div>';

    window.openPanel(
      '<div class="panel-back" data-action="close-panel"></div>' +
      '<aside class="side-panel" data-stop>' +
      '<div class="panel-head"><h3>التواصل</h3>' +
      '<div class="ph-sub">راسل المعلم عبر واتساب أو داخل الموقع</div>' +
      '<button class="modal-close" data-action="close-panel">' + IC("x", 18) + '</button></div>' +
      '<div class="panel-body">' +
      '<div class="panel-block"><h4>' + IC("teacher", 15) + ' المعلمون</h4>' + rowsT + '</div>' +
      '</div></aside>');
  }

  /* --- (5) تجاوز openMsgPanel حسب الدور --- */
  function installMsgOverride() {
    if (window.__msgOverrideInstalled) return;
    if (typeof window.openMsgPanel === "function") window.__origMsgPanel = window.openMsgPanel;
    window.__msgOverrideInstalled = true;
    window.openMsgPanel = function () {
      try {
        var u = ME();
        var role = u && u.role;
        if (role === "teacher" || role === "parent") openInbox();
        else openContacts();
      } catch (err) {
        console.warn("openMsgPanel override", err);
        if (typeof window.__origMsgPanel === "function") window.__origMsgPanel();
      }
    };
  }

  /* --- (6) شارة عدد الرسائل غير المقروءة للمعلم --- */
  function updateMsgBadge(force) {
    var btn = document.getElementById("btnMsg");
    if (!btn) return;
    var d = DBf(), u = ME();
    var email = String((u && u.email) || "").toLowerCase();
    var role = u && u.role;
    if (!d || !email || (role !== "teacher" && role !== "parent")) return;
    if (force === 0) { var ex = btn.querySelector(".dot-badge"); if (ex) ex.remove(); return; }
    d.collection("site_messages").where("toEmail", "==", email).get().then(function (snap) {
      var n = 0; snap.forEach(function (doc) { if (!doc.data().read) n++; });
      var b = btn.querySelector(".dot-badge");
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("span"); b.className = "dot-badge"; btn.appendChild(b); }
      b.textContent = n;
    }).catch(function () {});
  }

  /* --- التشغيل --- */
  function start() {
    try {
      wireButtons();
      installMsgOverride();
      setTimeout(function () { try { updateMsgBadge(); } catch (e) {} }, 1200);
    } catch (e) { console.warn("msg addon", e); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  /* إعادة المحاولة بعد اكتمال تسجيل الدخول */
  setTimeout(start, 1500);
})();