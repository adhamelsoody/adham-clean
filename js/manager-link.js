/* =========================================================================
   manager-link.js — اسم المدير رابط يفتح بياناته
   -------------------------------------------------------------------------
   اسم المدير يُعرض نصاً جامداً في بطاقة المنشأة وفي صفحة تفاصيلها، فمن أراد
   تعديل بياناته رجع إلى صفحة المدراء وبحث عنه بالاسم.

   الاسم مخزَّن نصاً في سجل المنشأة (item.manager) لا مرتبطاً بسجل شخص،
   ولذلك يُلتمس صاحبه على ثلاث مراحل: بـ managerId إن وُجد، ثم بمطابقة
   الاسم في المعلمين، ثم في المستخدمين. فإن لم يُعثر عليه فالنقر يشرح
   السبب بدل أن يصمت.

   الفتح يمرّ بـ data-action="edit-teacher" وهو الإجراء القائم في app.js،
   فلا نافذة جديدة ولا منطق مكرَّر.
   ========================================================================= */
(function () {
  "use strict";

  function DBX() { try { return DB; } catch (e) { return {}; } }

  /* القراءة المرشَّحة بنطاق صاحب الجلسة — الكتابة تبقى على DB */
  function SCOPED(coll, fallback) {
    try { if (typeof cur === "function") return cur(coll) || []; } catch (e) {}
    return Array.isArray(fallback) ? fallback : [];
  }
  function E(s)  { try { return esc(s); } catch (e) { return String(s == null ? "" : s); } }
  function T(m,t){ try { showToast(m, t); } catch (e) {} }
  function CUR(c){ try { return cur(c) || []; } catch (e) { return DBX()[c] || []; } }

  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/^(الشيخ|الأستاذ|أ\.|د\.)\s+/, "")
      .replace(/\s+/g, " ").trim();
  }

  /* صاحب الاسم: بالمعرّف، ثم بمطابقة الاسم في المعلمين، ثم في المستخدمين */
  function findPerson(name, id) {
    if (id) {
      var byId = CUR("teachers").find(function (t) { return String(t.id) === String(id); });
      if (byId) return { id: byId.id, name: byId.name, where: "teachers" };
    }

    var n = norm(name);
    if (!n) return null;

    var t2 = CUR("teachers").find(function (t) { return norm(t.name) === n; });
    if (t2) return { id: t2.id, name: t2.name, where: "teachers" };

    var u = SCOPED("users", DBX().users).find(function (x) {
      return x && x.active !== false && norm(x.name) === n;
    });
    if (u) return { id: u.uid || u.id, name: u.name, where: "users" };

    return null;
  }

  /* زر بدل النص الجامد */
  function link(name, id, facColl, facId) {
    var raw = String(name == null ? "" : name).trim();
    if (!raw || raw === "—") {
      return '<button class="mg-link empty" onclick="window.mgrNone(\'' +
             E(facColl || "") + '\',\'' + E(facId || "") + '\')">' +
             'لم يُعيَّن <span>تعيين</span></button>';
    }

    var p = findPerson(raw, id);
    if (p) {
      return '<button class="mg-link" data-action="edit-teacher" data-id="' + E(p.id) + '"' +
             ' title="فتح بيانات ' + E(p.name) + ' للتعديل">' + E(raw) +
             '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"' +
             ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
             '<path d="M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></svg></button>';
    }

    /* اسم بلا سجل: النقر يشرح ولا يصمت */
    return '<button class="mg-link ghost" onclick="window.mgrMissing(\'' + E(raw) + '\')"' +
           ' title="لا سجل مرتبط بهذا الاسم">' + E(raw) +
           '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"' +
           ' stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/>' +
           '<path d="M12 8v5M12 16.5v.01"/></svg></button>';
  }

  window.mgrMissing = function (name) {
    openModal("لا سجل لهذا المدير", E(name),
      '<div class="note-card"><p>الاسم <strong>' + E(name) + '</strong> مكتوب في بيانات المنشأة، ' +
      'ولا يقابله سجل في المدراء — فلا بيانات تُفتح للتعديل.</p>' +
      '<p style="margin-top:8px">أضِفه من صفحة المدراء بالاسم نفسه، فيرتبط تلقائياً.</p></div>',
      '<button class="btn btn-primary" data-action="modal-teacher">إضافة مدير</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إغلاق</button>');
  };

  window.mgrNone = function (coll, id) {
    var single = coll === "mosques" ? "mosque" : "complex";
    openModal("لم يُعيَّن مدير", "",
      '<div class="note-card"><p>لا مدير مسجَّل لهذه المنشأة. عيّنه من بيانات المنشأة، ' +
      'أو أضِفه أولاً في صفحة المدراء ثم اكتب اسمه هنا.</p></div>',
      (id ? '<button class="btn btn-primary" data-action="edit-' + single + '" data-id="' + E(id) + '">' +
            'تعديل بيانات المنشأة</button>' : '') +
      '<button class="btn btn-ghost" data-action="modal-teacher">إضافة مدير</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إغلاق</button>');
  };

  /* ==================================================================
     الربط
     ================================================================== */
  function boot() {
    /* ---------- بطاقة المنشأة ---------- */
    var origRows = window.facRows;
    if (typeof origRows === "function") {
      window.facRows = function (item, coll) {
        var html = "";
        try { html = origRows.apply(this, arguments) || ""; } catch (e) { throw e; }
        try {
          return html.replace(
            /(<span class="fac-lbl">(?:المدير|المشرف)<\/span>\s*<span class="fac-val">)([^<]*)(<\/span>)/,
            function (m, a, name, b) {
              return a + link(name, item && item.managerId, coll, item && item.id) + b;
            });
        } catch (e) { return html; }
      };
    }

    /* ---------- صفحة تفاصيل المنشأة ---------- */
    var origDetail = window.facilityDetail;
    if (typeof origDetail === "function") {
      window.facilityDetail = function (coll, id) {
        var html = "";
        try { html = origDetail.apply(this, arguments) || ""; } catch (e) { throw e; }
        try {
          var list = coll === "mosques" ? SCOPED("mosques", DBX().mosques)
                              : SCOPED("complexes", DBX().complexes);
          var item = list.find(function (x) { return String(x.id) === String(id); }) || {};
          return html.replace(
            /(<div class="kv"><span>المدير<\/span><strong>)([^<]*)(<\/strong><\/div>)/,
            function (m, a, name, b) {
              return a + link(name, item.managerId, coll, id) + b;
            });
        } catch (e) { return html; }
      };
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();