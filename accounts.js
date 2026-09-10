/* =========================================================================
   accounts.js — إكمال «المستخدمون والحسابات»
   -------------------------------------------------------------------------
   خمس فجوات:
     ١) حذف المستخدم كان يترك حساب الدخول قائماً — يستطيع الدخول بعد حذفه.
     ٢) لا استعادة لكلمة المرور — النسيان يعني مراجعة الإدارة.
     ٣) الحسابات المعلّقة بلا شاشة — المستخدم ينتظر ولا أحد يراه.
     ٤) تعديل البريد أو الهوية يغيّر المستند دون حساب الدخول.
     ٥) لا كشف للحسابات اليتيمة في الاتجاهين.

   البنود ١ و ٤ و ٥ تنادي Cloud Functions لأن عميل Firebase لا يملك صلاحية
   على حسابات غيره. البند ٣ يعمل بالعميل وحده. والبند ٢ في reset.html.
   ========================================================================= */
(function () {
  "use strict";

  var REGION = "europe-west1";

  function DBX()  { try { return DB; } catch (e) { return {}; } }
  function USER() { try { return (STATE && STATE.user) || {}; } catch (e) { return {}; } }
  function E(s)   { try { return esc(s); } catch (e) { return String(s == null ? "" : s); } }
  function IC(n,s){ try { return ic(n, s); } catch (e) { return ""; } }
  function T(m,t) { try { showToast(m, t); } catch (e) {} }
  function AR(n)  { try { return toArabicDigits(n); } catch (e) { return String(n); } }
  function MNT()  { try { mount(); } catch (e) {} }
  function isAdmin() { var r = USER().role || ""; return r === "admin" || r === "owner"; }

  /* ------------------------------------------------------------------
     نداء دالة خادم — رسالة واضحة حين لا تكون منشورة
     ------------------------------------------------------------------ */
  function callFn(name, data) {
    if (typeof firebase === "undefined" || !firebase.functions) {
      return Promise.reject(new Error("مكتبة functions غير محمّلة — أضف firebase-functions-compat.js"));
    }
    return firebase.app().functions(REGION).httpsCallable(name)(data || {})
      .then(function (r) { return r.data; })
      .catch(function (e) {
        var msg = (e && e.message) || "خطأ غير معروف";
        if (e && (e.code === "functions/not-found" || e.code === "not-found")) {
          msg = "الدالة غير منشورة — نفّذ: firebase deploy --only functions";
        }
        if (e && (e.code === "functions/internal") && /not found/i.test(msg)) {
          msg = "الدوال غير منشورة بعد.";
        }
        throw new Error(msg);
      });
  }

  /* openModal ترسم فوراً بـ innerHTML، فالربط لا يحتاج تأخيراً.
     كان الربط بعد 40ms فمن ضغط أسرع منها لا يحدث شيء. */
  function wire(id, fn) {
    var b = document.getElementById(id);
    if (b) { b.onclick = fn; return true; }
    /* احتياط: عارض نوافذ غير متزامن */
    requestAnimationFrame(function () {
      var el = document.getElementById(id);
      if (el) el.onclick = fn;
    });
    return false;
  }

  function busy(sel, on, label) {
    var b = document.querySelector(sel);
    if (!b) return;
    b.disabled = !!on;
    if (on) { b.dataset.old = b.textContent; b.textContent = label || "جارٍ التنفيذ…"; }
    else if (b.dataset.old) b.textContent = b.dataset.old;
  }

  /* ==================================================================
     ١) حذف المستخدم كاملاً
     ================================================================== */
  window.acDelete = function (uid) {
    var u = (DBX().users || []).find(function (x) { return String(x.uid || x.id) === String(uid); });
    if (!u) return;

    openModal("حذف الحساب نهائياً", "",
      '<div class="note-card"><p>سيُحذف <strong>' + E(u.name || "") + '</strong> من النظام ' +
      '<strong>ومن حسابات الدخول معاً</strong>، فلا يستطيع الدخول بعدها.</p>' +
      '<p style="margin-top:8px">سجلاته (الحضور · التسميع · الخطط) لا تُحذف، وتبقى منسوبة لاسمه في سجل العمليات.</p></div>',
      '<button class="btn btn-danger" id="acDelGo">حذف نهائي</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    wire("acDelGo", function () {
        busy("#acDelGo", true, "جارٍ الحذف…");
        callFn("deleteUserFully", { uid: uid }).then(function (r) {
          var arr = DBX().users || [];
          var i = arr.findIndex(function (x) { return String(x.uid || x.id) === String(uid); });
          if (i > -1) arr.splice(i, 1);
          try { closeModal(); } catch (e) {}
          T("حُذف الحساب" + (r.authDeleted ? " ومعه حساب الدخول" : ""), "success");
          MNT();
        }).catch(function (e) {
          busy("#acDelGo", false);
          T(e.message, "warn");
        });
    });
  };

  /* ==================================================================
     ٤) تعديل بيانات الدخول
     ------------------------------------------------------------------
     مفتوحة للمدير ولصاحب الحساب نفسه — والخادم يتحقق من ذلك ثانيةً،
     فالإخفاء في الواجهة ليس حماية.
     ================================================================== */
  window.acLogin = function (uid) {
    var me = USER();
    var u = (DBX().users || []).find(function (x) { return String(x.uid || x.id) === String(uid); })
            || (String(me.uid) === String(uid) ? me : null);
    if (!u) return;

    var mine = String(me.uid) === String(uid);
    if (!isAdmin() && !mine) { T("لا تعدّل بيانات دخول غيرك", "warn"); return; }

    openModal("بيانات الدخول — " + (u.name || ""),
      "يتغيّر المستند وحساب الدخول معاً",
      '<div class="form-grid">' +
        '<div class="field full"><label>البريد الإلكتروني</label>' +
        '<input id="ac_mail" dir="ltr" value="' + E(u.email || "") + '" placeholder="name@domain.com"></div>' +
        '<div class="field full"><label>رقم الهوية</label>' +
        '<input id="ac_user" dir="ltr" inputmode="numeric" maxlength="10" value="' + E(u.username || "") + '"' +
        ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\').slice(0,10)"></div>' +
      '</div>' +
      '<div class="note-card" style="margin-top:12px"><p>بلا بريد، يكون الدخول برقم الهوية ' +
      'عبر العنوان الاصطناعي <code dir="ltr">{الهوية}@mirath.id</code>.</p></div>',
      '<button class="btn btn-primary" id="acLoginGo">حفظ</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    wire("acLoginGo", function () {
        var mail = (document.getElementById("ac_mail") || {}).value || "";
        var user = (document.getElementById("ac_user") || {}).value || "";
        busy("#acLoginGo", true, "جارٍ الحفظ…");

        callFn("updateUserLogin", { uid: uid, email: mail.trim(), username: user.trim() })
          .then(function (r) {
            var t = (DBX().users || []).find(function (x) { return String(x.uid || x.id) === String(uid); });
            if (t) { t.email = mail.trim(); t.username = user.trim(); t.loginEmail = r.loginEmail; }
            try { closeModal(); } catch (e) {}
            T("حُدّثت بيانات الدخول: " + r.loginEmail, "success");
            MNT();
          })
          .catch(function (e) { busy("#acLoginGo", false); T(e.message, "warn"); });
    });
  };

  /* ==================================================================
     ٣) الحسابات المعلّقة — بالعميل وحده
     ================================================================== */
  function pendingList() {
    return (DBX().users || []).filter(function (u) {
      return u && (u.pending === true || (u.active === false && !u.approvedAt));
    });
  }

  window.acApprove = function (uid) {
    var u = (DBX().users || []).find(function (x) { return String(x.uid || x.id) === String(uid); });
    if (!u) return;

    openModal("اعتماد الحساب", u.name || u.email || "",
      '<div class="form-grid"><div class="field full"><label>الدور</label>' +
      '<select id="ac_role">' +
      [["teacher", "معلم / ة"], ["supervisor", "مشرف / ة"], ["parent", "ولي أمر"], ["student", "طالب / ة"]]
        .map(function (r) { return '<option value="' + r[0] + '">' + r[1] + '</option>'; }).join("") +
      '</select></div></div>' +
      '<div class="note-card" style="margin-top:12px"><p>بعد الاعتماد يصير الحساب فعّالاً ' +
      'ويستطيع الدخول فوراً بالدور المختار.</p></div>',
      '<button class="btn btn-primary" id="acApGo">اعتماد</button>' +
      '<button class="btn btn-danger" id="acRjGo">رفض وحذف</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    var go = function (reject) {
        var role = (document.getElementById("ac_role") || {}).value || "teacher";
        busy(reject ? "#acRjGo" : "#acApGo", true, "جارٍ…");
        callFn("approveUser", { uid: uid, role: role, reject: reject }).then(function () {
          var arr = DBX().users || [];
          var i = arr.findIndex(function (x) { return String(x.uid || x.id) === String(uid); });
          if (i > -1) { if (reject) arr.splice(i, 1); else { arr[i].active = true; arr[i].pending = false; arr[i].role = role; } }
          try { closeModal(); } catch (e) {}
          T(reject ? "رُفض الطلب وحُذف الحساب" : "اعتُمد الحساب", "success");
          MNT();
      }).catch(function (e) { busy(reject ? "#acRjGo" : "#acApGo", false); T(e.message, "warn"); });
    };
    wire("acApGo", function () { go(false); });
    wire("acRjGo", function () { go(true); });
  };

  function pendingPanel() {
    var list = pendingList();

    var body = list.length ? list.map(function (u) {
      var when = u.createdAt ? new Date(u.createdAt).toLocaleDateString("ar-EG") : "—";
      return '<tr><td><strong>' + E(u.name || "—") + '</strong></td>' +
        '<td dir="ltr" style="font-size:12px">' + E(u.email || u.loginEmail || "—") + '</td>' +
        '<td dir="ltr" class="pt-num">' + E(u.username || "—") + '</td>' +
        '<td>' + E(when) + '</td>' +
        '<td class="cp-acts">' +
        (isAdmin() ? '<button class="btn btn-primary btn-sm" onclick="window.acApprove(\'' +
                     E(u.uid || u.id) + '\')">مراجعة</button>' : '<span class="muted">—</span>') +
        '</td></tr>';
    }).join("")
      : '<tr><td colspan="5" style="text-align:center;padding:24px" class="muted">لا طلبات معلّقة.</td></tr>';

    return '<div class="cp-card">' +
      '<div class="cp-head"><div><strong>حسابات بانتظار الاعتماد' +
      (list.length ? ' <span class="ac-pill">' + AR(list.length) + '</span>' : '') + '</strong>' +
      '<small>من سجّل دخوله ولا ملف له يبقى موقوفاً هنا حتى يعتمده مدير</small></div></div>' +
      '<div class="pt-wrap"><div class="pt-scroll"><table class="ptable">' +
      '<thead><tr><th>الاسم</th><th>البريد</th><th>الهوية</th><th>التسجيل</th><th></th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div></div>';
  }

  /* ==================================================================
     ٥) الحسابات اليتيمة
     ================================================================== */
  var ORPH = { data: null, loading: false, err: "" };

  window.acScan = function () {
    if (ORPH.loading) return;
    ORPH.loading = true; ORPH.err = ""; MNT();

    callFn("listOrphans").then(function (r) {
      ORPH.data = r; ORPH.loading = false; MNT();
    }).catch(function (e) {
      ORPH.loading = false; ORPH.err = e.message; MNT();
    });
  };

  window.acCleanDoc = function (uid) {
    if (!isAdmin()) return;
    callFn("deleteUserFully", { uid: uid }).then(function () {
      T("حُذف الحساب اليتيم", "success");
      window.acScan();
    }).catch(function (e) { T(e.message, "warn"); });
  };

  function orphanPanel() {
    var inner;

    if (ORPH.loading) {
      inner = '<div class="cp-hint"><span>جارٍ الفحص…</span></div>';
    } else if (ORPH.err) {
      inner = '<div class="cp-hint"><span>' + E(ORPH.err) + '</span></div>';
    } else if (!ORPH.data) {
      inner = '<div class="cp-hint"><span>الفحص يقارن حسابات الدخول بملفات المستخدمين ' +
              'ويكشف ما لا مقابل له في الجهتين.</span></div>';
    } else {
      var d = ORPH.data;
      var a = d.noDoc || [], b = d.noAuth || [];

      inner =
        '<div class="cp-hint"><span>حسابات الدخول: <strong>' + AR(d.totals.auth) + '</strong> · ' +
        'الملفات: <strong>' + AR(d.totals.docs) + '</strong></span></div>' +

        '<div class="ac-sec"><h4>' + IC("alert", 15) + ' حساب دخول بلا ملف (' + AR(a.length) + ')</h4>' +
        '<p class="muted">يستطيع تسجيل الدخول ولا دور له — يقع على شاشة «بانتظار الاعتماد» أو يُحذف.</p>' +
        (a.length ? '<div class="pt-wrap"><div class="pt-scroll"><table class="ptable">' +
          '<thead><tr><th>البريد</th><th>الجوال</th><th>أُنشئ</th><th>آخر دخول</th><th></th></tr></thead><tbody>' +
          a.map(function (x) {
            return '<tr><td dir="ltr" style="font-size:12px">' + E(x.email || "—") + '</td>' +
              '<td dir="ltr">' + E(x.phone || "—") + '</td>' +
              '<td style="font-size:11.5px">' + E(String(x.created).slice(0, 16)) + '</td>' +
              '<td style="font-size:11.5px">' + E(x.lastSignIn ? String(x.lastSignIn).slice(0, 16) : "لم يدخل") + '</td>' +
              '<td class="cp-acts"><button class="btn btn-ghost btn-sm cp-danger" ' +
              'onclick="window.acCleanDoc(\'' + E(x.uid) + '\')">حذف</button></td></tr>';
          }).join("") + '</tbody></table></div></div>'
          : '<p class="muted" style="padding:6px 0">لا يوجد ✓</p>') + '</div>' +

        '<div class="ac-sec"><h4>' + IC("alert", 15) + ' ملف بلا حساب دخول (' + AR(b.length) + ')</h4>' +
        '<p class="muted">يظهر في القوائم ولا يستطيع الدخول — أنشئ له حساباً أو احذف الملف.</p>' +
        (b.length ? '<div class="pt-wrap"><div class="pt-scroll"><table class="ptable">' +
          '<thead><tr><th>الاسم</th><th>الدور</th><th>الهوية</th><th>الحالة</th></tr></thead><tbody>' +
          b.map(function (x) {
            return '<tr><td><strong>' + E(x.name || "—") + '</strong></td>' +
              '<td>' + E(x.role || "—") + '</td>' +
              '<td dir="ltr" class="pt-num">' + E(x.username || "—") + '</td>' +
              '<td><span class="pt-badge ' + (x.active ? "on" : "off") + '">' +
              (x.active ? "فعال" : "موقوف") + '</span></td></tr>';
          }).join("") + '</tbody></table></div></div>'
          : '<p class="muted" style="padding:6px 0">لا يوجد ✓</p>') + '</div>';
    }

    return '<div class="cp-card">' +
      '<div class="cp-head"><div><strong>الحسابات اليتيمة</strong>' +
      '<small>حساب دخول بلا ملف · أو ملف بلا حساب دخول</small></div>' +
      '<button class="btn btn-primary btn-sm" onclick="window.acScan()">' +
      IC("refresh", 15) + ' فحص الآن</button></div>' + inner + '</div>';
  }

  /* ==================================================================
     الربط بصفحة المستخدمين
     ================================================================== */
  function panels() {
    if (!isAdmin() && (USER().role || "") !== "supervisor") return "";
    return pendingPanel() + (isAdmin() ? orphanPanel() : "");
  }

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function () {
      var html = "";
      try { html = orig.apply(this, arguments) || ""; } catch (e) { throw e; }
      try { return fn(html, arguments); } catch (e) { console.warn(name, e); return html; }
    };
    try {
      if (typeof PAGES !== "undefined") {
        Object.keys(PAGES).forEach(function (k) { if (PAGES[k] === orig) PAGES[k] = window[name]; });
      }
    } catch (e) {}
  }

  function boot() {
    ["adminUsers", "usersPage", "adminAccounts"].forEach(function (n) {
      wrap(n, function (html) { return html + panels(); });
    });

    /* الصفحة قد تُسجَّل في PAGES بدالة مجهولة — نلفّها من الخريطة مباشرة */
    try {
      if (typeof PAGES !== "undefined" && typeof PAGES["admin/users"] === "function"
          && PAGES["admin/users"].__ac !== true) {
        var o = PAGES["admin/users"];
        var w = function () { return (o.apply(this, arguments) || "") + panels(); };
        w.__ac = true;
        PAGES["admin/users"] = w;
      }
    } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
