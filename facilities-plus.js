/* =========================================================================
   facilities-plus.js — المنشآت: مجمعات ومساجد معاً
   -------------------------------------------------------------------------
   صفحة «المنشآت التعليمية» كانت تعرض المجمعات وحدها وتحيل على المساجد
   بجملة «في صفحة المساجد» — وتلك الصفحة بلا رابط في القائمة الجانبية،
   فكان الوصول إليها بالمصادفة.

   لا نبني شيئاً جديداً: adminMosques و facCard و facToolbar و facilityDetail
   موجودة في app.js وتعمل مع المجموعتين. ينقص جمعهما وزرُّ إضافة يسأل عن
   النوع.

   العرض الموحّد احتاج شيئاً واحداً: facBulk و facBulkDelete كانتا تأخذان
   مجموعةً واحدة لكل الشبكة، فتشغيل مسجد ومجمع معاً يصيب أحدهما فقط.
   صارتا تقرآن نوع كل بطاقة من data-coll عليها.
   ========================================================================= */
(function () {
  "use strict";

  var TAB = "all";   /* all · complexes · mosques */

  function DBX() { try { return DB; } catch (e) { return {}; } }
  function E(s)  { try { return esc(s); } catch (e) { return String(s == null ? "" : s); } }
  function AR(n) { try { return toArabicDigits(n); } catch (e) { return String(n); } }
  function T(m,t){ try { showToast(m, t); } catch (e) {} }
  function MNT() { try { mount(); } catch (e) {} }

  /* =================================================================
     القراءة تمرّ بـ cur لا بـ DB
     -----------------------------------------------------------------
     كانت تقرأ DB رأساً، فتتجاوز حصر المنشأة كلَّه: مديرُ مسجدٍ يفتح
     «المنشآت التعليمية» فيرى مجمّعات النظام كلَّها ومساجدها — وهي
     الشاشة الوحيدة التي لا تمرّ بـ cur في المشروع.

     cur تُرجع الكاملَ لمن لا نطاق له (المالك والمدير)، فلا يتغيّر
     شيءٌ عندهما. والكتابةُ تبقى على DB نفسه أعلاه.
     ================================================================= */
  function SCOPED(coll, fallback) {
    try { if (typeof cur === "function") return cur(coll) || []; } catch (e) {}
    return Array.isArray(fallback) ? fallback : [];
  }
  function CX() { return SCOPED("complexes", DBX().complexes); }
  function MQ() { return SCOPED("mosques",   DBX().mosques); }

  window.facTab = function (v) {
    if (TAB === v) return;
    TAB = (v === "mosques" || v === "complexes") ? v : "all";
    try { if (STATE.facilityView) STATE.facilityView = null; } catch (e) {}
    MNT();
  };

  /* ==================================================================
     زر الإضافة يسأل عن النوع
     ================================================================== */
  window.facAdd = function () {
    openModal("إضافة منشأة", "اختر نوع المنشأة",
      '<div class="fx-pick">' +
        '<button class="fx-pick-btn" data-action="modal-complex">' +
          '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"' +
          ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5"/></svg>' +
          '<strong>مجمع تعليمي</strong>' +
          '<small>يضمّ عدة مساجد تحت إدارة واحدة</small></button>' +

        '<button class="fx-pick-btn" data-action="modal-mosque">' +
          '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"' +
          ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 3l2.2 2.8M6 10c0-1.2 6-2.4 6-2.4s6 1.2 6 2.4M6 10v10M18 10v10' +
          'M6 20h12M10 20v-3.6a2 2 0 014 0V20"/></svg>' +
          '<strong>مسجد</strong>' +
          '<small>تابع لمجمع أو مستقل بإدارته</small></button>' +
      '</div>',
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');
  };

  /* ==================================================================
     الإجراءات الجماعية: نوع كل بطاقة من بطاقتها
     ================================================================== */
  function selected(fallback) {
    var out = [];
    var nodes = document.querySelectorAll("#facGrid .fac-card.sel");
    for (var i = 0; i < nodes.length; i++) {
      out.push({
        id: nodes[i].getAttribute("data-id"),
        coll: nodes[i].getAttribute("data-coll") || fallback || "complexes"
      });
    }
    return out;
  }

  window.facBulk = function (kind, fallbackColl) {
    var sel = selected(fallbackColl);
    if (!sel.length) { T("حدد عنصراً واحداً على الأقل", "warn"); return; }

    if (kind === "delete") {
      window.__fxDel = sel;
      var cxN = sel.filter(function (s) { return s.coll === "complexes"; }).length;
      var mqN = sel.length - cxN;
      openModal("حذف المحدد", "تأكيد الحذف",
        '<div class="note-card"><p>سيُحذف نهائياً: ' +
        (cxN ? '<strong>' + AR(cxN) + '</strong> مجمع' : '') +
        (cxN && mqN ? ' و' : '') +
        (mqN ? '<strong>' + AR(mqN) + '</strong> مسجد' : '') +
        '. لا يمكن التراجع.</p>' +
        (cxN ? '<p style="margin-top:8px">حذف المجمع لا يحذف مساجده — تبقى مساجد مستقلة.</p>' : '') +
        '</div>',
        '<button class="btn btn-danger" onclick="window.facBulkDelete()">نعم، احذف</button>' +
        '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');
      return;
    }

    var status = kind === "play" ? "نشط" : "متوقف";
    var n = 0;
    sel.forEach(function (s) {
      var list = s.coll === "mosques" ? MQ() : CX();
      var it = list.find(function (x) { return String(x.id) === String(s.id); });
      if (it) { it.status = status; persistSet(s.coll, it); n++; }
    });
    MNT();
    T((kind === "play" ? "شُغّل " : "أُوقف ") + AR(n) + " عنصراً", "success");
  };

  window.facBulkDelete = function () {
    var sel = window.__fxDel || [];
    sel.forEach(function (s) {
      /* من القائمة الكاملة لا المرشَّحة: MQ()/CX() تُرجعان ما يراه صاحب
         الجلسة، والكتابة بهما فوق DB تمحو ما لا يراه وهو قائم. */
      if (s.coll === "mosques") {
        DBX().mosques = (Array.isArray(DBX().mosques) ? DBX().mosques : [])
          .filter(function (x) { return String(x.id) !== String(s.id); });
      } else {
        DBX().complexes = (Array.isArray(DBX().complexes) ? DBX().complexes : [])
          .filter(function (x) { return String(x.id) !== String(s.id); });
      }
      try { persistDelete(s.coll, s.id); } catch (e) {}
    });
    window.__fxDel = [];
    try { closeModal(); } catch (e) {}
    try { if (typeof renderComplexSelect === "function") renderComplexSelect(); } catch (e) {}
    try { if (typeof renderNav === "function") renderNav(); } catch (e) {}
    MNT();
    T("حُذف المحدد", "success");
  };

  /* ==================================================================
     العرض
     ================================================================== */
  function tabsBar() {
    var one = function (key, label, n, icon) {
      return '<button class="fx-tab' + (TAB === key ? " on" : "") + '"' +
        ' onclick="window.facTab(\'' + key + '\')">' + icon +
        '<span>' + label + '</span><b>' + AR(n) + '</b></button>';
    };
    var ALL = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"' +
      ' stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1.5"/>' +
      '<rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>' +
      '<rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
    var CXI = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"' +
      ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5"/></svg>';
    var MQI = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"' +
      ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3l2.2 2.8M6 10c0-1.2 6-2.4 6-2.4s6 1.2 6 2.4M6 10v10M18 10v10' +
      'M6 20h12M10 20v-3.6a2 2 0 014 0V20"/></svg>';

    return '<div class="fx-tabs">' +
      one("all", "الكل", CX().length + MQ().length, ALL) +
      one("complexes", "المجمعات", CX().length, CXI) +
      one("mosques", "المساجد", MQ().length, MQI) +
      '</div>';
  }

  /* facCard لا تضع data-coll، وبدونها لا تعرف الإجراءات الجماعية
     إلى أي مجموعة ينتمي المحدَّد في العرض المختلط */
  function card(item, coll) {
    var html = "";
    try { html = facCard(item, coll) || ""; } catch (e) { return ""; }
    var on = item.status === "نشط" ? "1" : "0";
    return html.replace('<div class="fac-card"',
      '<div class="fac-card" data-coll="' + coll + '" data-active="' + on + '"');
  }

  function head(title, sub) {
    try { return pageHead(title, sub); }
    catch (e) { return '<div class="page-head"><h2>' + E(title) + '</h2><p>' + E(sub) + '</p></div>'; }
  }

  function combinedPage() {
    var cx = CX(), mq = MQ();

    if (!cx.length && !mq.length) {
      var empty = "";
      try { empty = emptyState("لا توجد منشآت بعد",
        "أضف مجمعاً تعليمياً أو مسجداً مستقلاً من زر الإضافة."); } catch (e) {
        empty = '<p style="text-align:center;padding:30px">لا توجد منشآت بعد.</p>';
      }
      return '<div class="page">' + head("المنشآت التعليمية", "لا منشآت بعد") + tabsBar() +
        '<div class="card">' + empty +
        '<div style="text-align:center;padding-bottom:20px">' +
        '<button class="btn btn-primary" onclick="window.facAdd()">إضافة منشأة</button>' +
        '</div></div></div>';
    }

    var active = cx.filter(function (x) { return x.status === "نشط"; }).length +
                 mq.filter(function (x) { return x.status === "نشط"; }).length;

    var bar = "";
    try { bar = facToolbar("complexes", active, { addAction: "fx-add" }) || ""; } catch (e) {}
    /* زر الإضافة يسأل عن النوع بدل أن يفتح نافذة المجمع مباشرة */
    bar = bar.replace('data-action="fx-add"', 'onclick="window.facAdd()"');

    var cards = cx.map(function (x) { return card(x, "complexes"); }).join("") +
                mq.map(function (x) { return card(x, "mosques"); }).join("");

    return '<div class="page">' +
      head("المنشآت التعليمية", AR(cx.length) + " مجمع · " + AR(mq.length) + " مسجد") +
      tabsBar() + bar +
      '<div class="fac-grid" id="facGrid" data-coll="mixed">' + cards + '</div></div>';
  }

  /* يُدرج الشريط بين العنوان وأدوات الصفحة */
  function inject(html) {
    var bar = tabsBar();
    if (html.indexOf('<div class="fac-toolbar">') > -1) {
      return html.replace('<div class="fac-toolbar">', bar + '<div class="fac-toolbar">');
    }
    if (html.indexOf('<div class="card">') > -1) {
      return html.replace('<div class="card">', bar + '<div class="card">');
    }
    return html.replace('<div class="page">', '<div class="page">' + bar);
  }

  /* البطاقات في التبويبين المفردين تحتاج data-coll و data-active أيضاً.
     الحالة تُقرأ من البيانات لا من النصّ، فترتيب البطاقات هو ترتيب القائمة. */
  function tag(html, coll) {
    var list = coll === "mosques" ? MQ() : CX();
    var i = 0;
    return html.replace(/<div class="fac-card" data-id="([^"]*)"/g, function (m, id) {
      var it = list.find(function (x) { return String(x.id) === String(id); });
      i++;
      return '<div class="fac-card" data-coll="' + coll + '"' +
             ' data-active="' + (it && it.status === "نشط" ? "1" : "0") + '" data-id="' + id + '"';
    });
  }

  /* ==================================================================
     الفلتر: ptFilter في app.js تعمل على «#ptBody tr» وحدها، فصفحة
     المنشآت تستعمل بطاقات لا صفوفاً — فكان اختيار «متوقف» لا يفعل شيئاً،
     والشبكة تبدو فارغة بلا سبب ظاهر.
     ================================================================== */
  var origFilter = window.ptFilter;

  window.ptFilter = function (mode) {
    var grid = document.getElementById("facGrid");
    if (!grid) return origFilter ? origFilter.apply(this, arguments) : undefined;

    var cards = grid.querySelectorAll(".fac-card");
    var shown = 0;

    for (var i = 0; i < cards.length; i++) {
      var on = cards[i].getAttribute("data-active") === "1";
      var show = mode === "all" ? true : (mode === "on" ? on : !on);
      cards[i].style.display = show ? "" : "none";
      if (show) shown++;
    }

    var lbl = document.getElementById("ptFilterLabel");
    if (lbl) {
      lbl.textContent = (mode === "all" ? "الكل" : mode === "on" ? "فعال" : "متوقف") +
                        " (" + AR(shown) + ")";
    }
    var pan = document.getElementById("ptFilterPanel");
    if (pan) pan.style.display = "none";

    emptyNote(grid, shown, mode);
  };

  /* رسالة صريحة بدل شبكة فارغة بلا تفسير */
  function emptyNote(grid, shown, mode) {
    var old = document.getElementById("fxEmpty");
    if (old) old.remove();
    if (shown) return;

    var what = TAB === "mosques" ? "مساجد" : TAB === "complexes" ? "مجمعات" : "منشآت";
    var text = mode === "off" ? "لا توجد " + what + " متوقفة"
             : mode === "on"  ? "لا توجد " + what + " فعالة"
             : "لا توجد " + what;

    var el = document.createElement("div");
    el.id = "fxEmpty";
    el.className = "fx-empty";
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor"' +
      ' stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/>' +
      '<path d="M8 12h8"/></svg>' +
      '<strong>' + E(text) + '</strong>' +
      '<span>جرّب فرزاً آخر من زر الحالة أعلاه.</span>' +
      '<button class="btn btn-ghost btn-sm" onclick="window.ptFilter(\'all\')">عرض الكل</button>';
    grid.parentNode.insertBefore(el, grid.nextSibling);
  }

  function boot() {
    var origFac = window.adminFacilities;
    var origMq  = window.adminMosques;
    if (typeof origFac !== "function") return;

    var wrapped = function () {
      try { if (STATE && STATE.facilityView) return origFac.apply(this, arguments); } catch (e) {}

      try {
        if (TAB === "all") return combinedPage();
        if (TAB === "mosques" && typeof origMq === "function") {
          return inject(tag(origMq.apply(this, arguments) || "", "mosques"));
        }
        return inject(tag(origFac.apply(this, arguments) || "", "complexes"));
      } catch (e) {
        console.warn("facilities-plus:", e);
        return origFac.apply(this, arguments);
      }
    };

    window.adminFacilities = wrapped;
    window.adminComplexes  = wrapped;

    try {
      if (typeof PAGES !== "undefined") {
        Object.keys(PAGES).forEach(function (k) {
          if (PAGES[k] === origFac) PAGES[k] = wrapped;
        });
      }
    } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();