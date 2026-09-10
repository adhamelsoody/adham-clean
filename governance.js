/* =========================================================================
   governance.js — الطبقة الرقابية
   -------------------------------------------------------------------------
   يُحمَّل بعد app2.js فيضيف ثلاثة أشياء دون تعديل app.js:

     ١) سجل العمليات (auditLog) — يلفّ persistSet و persistDelete و persistPlan
        فيوثّق كل كتابة: من · متى · ماذا تغيّر من قيمة إلى قيمة.
     ٢) مصفوفة صلاحيات المعلم — ١٢ صلاحية لكل معلم على حدة، ومنعٌ فعلي عند
        الكتابة لا إخفاءٌ للأزرار.
     ٣) صفحتان إداريتان: سجل العمليات · صلاحيات المعلمين
        (عبر soon.html?p=audit و soon.html?p=perms — بلا ملفات جديدة)

   ⚠ الحاجز الحقيقي هو firestore.rules. هذا الملف يمنع في المتصفح ويوثّق،
     والقواعد تمنع على الخادم. الاثنان معاً لا أحدهما.
   ========================================================================= */
(function () {
  "use strict";

  /* ==================================================================
     ١) تعريف الصلاحيات
     ================================================================== */
  var PERM_DEFS = [
    { k: "attend_late",  h: "التحضير بعد انتهاء الوقت" },
    { k: "attend_edit",  h: "تعديل التحضير بعد حفظه" },
    { k: "plan_edit",    h: "تعديل خطة الطالب" },
    { k: "plan_path",    h: "تغيير مسار الخطة" },
    { k: "mushaf_past",  h: "تعديل أخطاء المصحف السابقة" },
    { k: "recite_edit",  h: "تعديل تسميع محفوظ" },
    { k: "student_add",  h: "إضافة طالب للحلقة" },
    { k: "student_stop", h: "إيقاف طالب" },
    { k: "student_move", h: "نقل طالب بين الحلقات" },
    { k: "delay_manage", h: "إدارة المتأخرات والتعويض" },
    { k: "msg_send",     h: "مراسلة الطلاب وأولياء الأمور" },
    { k: "room_virtual", h: "فتح غرفة افتراضية" }
  ];

  /* الافتراضي لمعلّم بلا مصفوفة محفوظة — عمله اليومي مسموح، والاستثنائي لا */
  var PERM_DEFAULT = {
    attend_late: false, attend_edit: true,  plan_edit: true,   plan_path: false,
    mushaf_past: false, recite_edit: true,  student_add: false, student_stop: false,
    student_move: false, delay_manage: true, msg_send: true,   room_virtual: false
  };

  /* أي صلاحية تحرس أي كتابة — يُفحص للمعلّم وحده */
  var GUARD = {
    attendance:   { update: "attend_edit" },
    plans:        { update: "plan_edit", create: "plan_edit" },
    recitations:  { update: "recite_edit", delete: "recite_edit" },
    mushafMarks:  { update: "mushaf_past", delete: "mushaf_past" },
    delays:       { create: "delay_manage", update: "delay_manage", delete: "delay_manage" },
    students:     { create: "student_add", delete: "student_stop" },
    site_messages:{ create: "msg_send" }
  };

  /* ما يُوثَّق في السجل — استُبعد المتكرّر بلا قيمة رقابية */
  var AUDITED = [
    "attendance", "recitations", "plans", "delays", "students", "teachers",
    "circles", "mosques", "complexes", "exams", "rewards", "users", "settings",
    "workflow", "userRequests", "moveLog", "programs", "levels", "terms"
  ];

  var LABEL = {
    attendance: "الحضور", recitations: "التسميع", plans: "الخطط", delays: "المتأخرات",
    students: "الطلاب", teachers: "المعلمون", circles: "الحلقات", mosques: "المساجد",
    complexes: "المجمعات", exams: "الاختبارات", rewards: "المكافآت", users: "المستخدمون",
    settings: "الإعدادات", workflow: "اعتماد الجلسات", userRequests: "طلبات المستخدمين",
    moveLog: "سجل النقل", programs: "البرامج", levels: "المستويات", terms: "الفترات"
  };

  /* أسماء الحقول بالعربية — ما لم يُذكر يظهر باسمه الإنجليزي */
  var FIELD = {
    name: "الاسم", status: "الحالة", date: "التاريخ", grade: "الدرجة",
    score: "الدرجة", points: "النقاط", active: "مفعّل", role: "الدور",
    circle: "الحلقة", circleId: "الحلقة", teacher: "المعلم", teacherId: "المعلم",
    mosqueId: "المسجد", complexId: "المجمع", phone: "الجوال", level: "المستوى",
    program: "البرنامج", type: "النوع", from: "من", to: "إلى", note: "ملاحظة",
    perms: "الصلاحيات", pages: "الأوجه", lines: "الأسطر"
  };

  /* ==================================================================
     أدوات
     ================================================================== */
  function DBX()   { try { return DB; } catch (e) { return {}; } }
  function USER()  { try { return (STATE && STATE.user) || {}; } catch (e) { return {}; } }
  function FDB()   { return window.__db || null; }
  function E(s)    { try { return esc(s); } catch (e) { return String(s == null ? "" : s); } }
  function IC(n,s) { try { return ic(n, s); } catch (e) { return ""; } }
  function T(m,t)  { try { showToast(m, t); } catch (e) {} }
  function AR(n)   { try { return toArabicDigits(n); } catch (e) { return String(n); } }

  function short(v) {
    if (v === undefined || v === null) return "—";
    if (typeof v === "boolean") return v ? "نعم" : "لا";
    if (typeof v === "object") { try { v = JSON.stringify(v); } catch (e) { v = "[كائن]"; } }
    v = String(v);
    return v.length > 90 ? v.slice(0, 90) + "…" : v;
  }

  /* ==================================================================
     ٢) قراءة صلاحيات الحساب الحالي
     ------------------------------------------------------------------
     المعلّم لا يملك سرد users، لكنه يقرأ مستنده وحده — فتُقرأ منه مباشرة.
     ================================================================== */
  var MY_PERMS = null;

  function loadMyPerms() {
    var u = USER(), d = FDB();
    if (!d || !u.uid) return;
    d.collection("users").doc(String(u.uid)).get().then(function (s) {
      if (!s.exists) return;
      var p = s.data().perms;
      MY_PERMS = (p && typeof p === "object") ? p : {};
      try { STATE.user.perms = MY_PERMS; } catch (e) {}
    }).catch(function () { /* بلا صلاحية — تبقى الافتراضات */ });
  }

  /* هل يملك الحساب الحالي هذه الصلاحية؟ */
  window.can = function (key) {
    var r = USER().role || "";
    if (r === "admin" || r === "supervisor" || r === "owner" || r === "manager") return true;
    if (r !== "teacher") return false;
    var p = MY_PERMS || {};
    return p[key] === undefined ? !!PERM_DEFAULT[key] : p[key] === true;
  };

  window.PERM_DEFS = PERM_DEFS;

  /* ==================================================================
     ٣) البوابة: منع الكتابة غير المصرَّح بها + التوثيق
     ------------------------------------------------------------------
     persistSet و persistDelete و persistPlan معرَّفة بـ function في app.js
     فهي خصائص على window — لفّها هنا يعترض كل النداءات في المشروع.
     ================================================================== */
  var _set    = window.persistSet;
  var _delete = window.persistDelete;
  var _plan   = window.persistPlan;

  function findLocal(coll, id) {
    var arr = DBX()[coll];
    if (!Array.isArray(arr)) return null;
    for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i];
    return null;
  }

  function today() {
    try { return attDate(); } catch (e) { return ""; }
  }

  /* تعديل الماضي ليس كعمل اليوم — التمييز بينهما بحقل التاريخ في السجل */
  function isPast(rec) {
    var d = rec && rec.date;
    var t = today();
    return !!(d && t && String(d) !== String(t));
  }

  /* هل الكتابة مسموحة؟ يُرجع نصّ سبب المنع أو "" */
  function denyReason(coll, action, before, after) {
    if ((USER().role || "") !== "teacher") return "";

    var need = "";

    /* حالات تعتمد على محتوى السجل لا على المجموعة وحدها */
    if (coll === "attendance") {
      /* سجل دوام موظف لا تحرسه صلاحيات تحضير الطلاب */
      if ((after && after.staffId) || (before && before.staffId)) return "";
      if (action === "set" && !before && after && after.date && after.date !== today()) need = "attend_late";
      else if (before) need = "attend_edit";

    } else if (coll === "mushafMarks") {
      /* تأشير اليوم عملٌ عادي، وتعديل تأشير يوم مضى صلاحية خاصة */
      if (before && isPast(before)) need = "mushaf_past";

    } else if (coll === "students" && before && after) {
      if (before.active !== false && after.active === false) need = "student_stop";
      else if (String(before.circleId || "") !== String(after.circleId || "")) need = "student_move";

    } else {
      var g = GUARD[coll];
      if (!g) return "";
      var act = action === "set" ? (before ? "update" : "create") : action;
      need = g[act] || "";
    }

    if (!need || window.can(need)) return "";

    var def = PERM_DEFS.find(function (x) { return x.k === need; });
    return def ? def.h : need;
  }

  /* الفروق بين حالتين */
  function diffOf(before, after) {
    var out = [], keys = {}, k;
    for (k in (before || {})) keys[k] = 1;
    for (k in (after  || {})) keys[k] = 1;
    delete keys._o;

    Object.keys(keys).forEach(function (key) {
      var a = before ? before[key] : undefined;
      var b = after  ? after[key]  : undefined;
      var sa = typeof a === "object" ? JSON.stringify(a) : String(a);
      var sb = typeof b === "object" ? JSON.stringify(b) : String(b);
      if (sa === sb) return;
      if (out.length < 20) out.push({ k: key, kh: FIELD[key] || key, from: short(a), to: short(b) });
    });
    return out;
  }

  function labelOf(obj) {
    if (!obj) return "";
    return String(obj.name || obj.title || obj.student || obj.studentName || obj.id || "");
  }

  function writeAudit(action, coll, docId, label, changes) {
    if (AUDITED.indexOf(coll) === -1) return;
    var d = FDB(); if (!d) return;
    var u = USER();

    var rec = {
      id: "a" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      ts: Date.now(),
      uid: String(u.uid || ""),
      actor: String(u.name || u.email || "—"),
      role: String(u.role || ""),
      action: action,                       /* create · update · delete */
      coll: coll,
      collAr: LABEL[coll] || coll,
      docId: String(docId || ""),
      label: String(label || ""),
      changes: changes || []
    };

    /* لا تُكتب عبر persistSet وإلا استدعت نفسها */
    d.collection("auditLog").doc(rec.id).set(rec).catch(function (e) {
      console.warn("auditLog:", e && e.code);
    });
  }

  window.persistSet = function (coll, obj) {
    if (!obj) return _set.apply(this, arguments);
    var before = findLocal(coll, obj.id);

    var why = denyReason(coll, "set", before, obj);
    if (why) {
      T("ليست لديك صلاحية: " + why, "warn");
      return Promise.resolve(false);
    }

    var changes = diffOf(before, obj);
    var out = _set.apply(this, arguments);

    Promise.resolve(out).then(function (ok) {
      if (ok === false) return;             /* فشل الحفظ فلا يُوثَّق */
      writeAudit(before ? "update" : "create", coll, obj.id, labelOf(obj), changes);
    });
    return out;
  };

  window.persistDelete = function (coll, id) {
    var before = findLocal(coll, id);
    var why = denyReason(coll, "delete", before, null);
    if (why) { T("ليست لديك صلاحية: " + why, "warn"); return; }

    var out = _delete.apply(this, arguments);
    writeAudit("delete", coll, id, labelOf(before), []);
    return out;
  };

  window.persistPlan = function (id) {
    var before = findLocal("plans", id);
    var why = denyReason("plans", "set", before, before);
    if (why) { T("ليست لديك صلاحية: " + why, "warn"); return; }

    var out = _plan.apply(this, arguments);
    writeAudit(before ? "update" : "create", "plans", id, labelOf(before), []);
    return out;
  };

  /* ==================================================================
     ٤) صفحة سجل العمليات
     ================================================================== */
  var AUD = { rows: null, loading: false, q: "", coll: "", act: "", days: 7 };

  function auditLoad() {
    var d = FDB();
    if (!d || AUD.loading) return;
    AUD.loading = true;

    var since = Date.now() - AUD.days * 86400000;
    d.collection("auditLog").where("ts", ">=", since).get().then(function (snap) {
      var rows = [];
      snap.forEach(function (doc) { rows.push(doc.data()); });
      rows.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      AUD.rows = rows;
      AUD.loading = false;
      try { mount(); } catch (e) {}
    }).catch(function (e) {
      AUD.loading = false;
      AUD.rows = [];
      AUD.error = (e && e.code) === "permission-denied"
        ? "لا صلاحية لقراءة السجل — المدير والمشرف فقط."
        : "تعذّر تحميل السجل.";
      try { mount(); } catch (er) {}
    });
  }

  window.auditFilter = function (field, v) {
    AUD[field] = v;
    if (field === "days") { AUD.rows = null; auditLoad(); }
    try { mount(); } catch (e) {}
  };

  function auditRows() {
    var rows = AUD.rows || [];
    var q = String(AUD.q || "").trim();
    return rows.filter(function (r) {
      if (AUD.coll && r.coll !== AUD.coll) return false;
      if (AUD.act && r.action !== AUD.act) return false;
      if (q && String(r.actor).indexOf(q) === -1 && String(r.label).indexOf(q) === -1) return false;
      return true;
    });
  }

  function actBadge(a) {
    var m = { create: ["إضافة", "b-green"], update: ["تعديل", "b-amber"], delete: ["حذف", "b-red"] };
    var x = m[a] || ["—", "b-gray"];
    return '<span class="badge ' + x[1] + ' no-dot">' + x[0] + '</span>';
  }

  function auditPage() {
    if (AUD.rows === null && !AUD.loading) auditLoad();

    var body;
    if (AUD.loading || AUD.rows === null) {
      body = '<div class="soon-card"><p>جارٍ تحميل السجل…</p></div>';
    } else if (AUD.error) {
      body = '<div class="soon-card"><h4>تعذّر العرض</h4><p>' + E(AUD.error) + '</p></div>';
    } else {
      var rows = auditRows();
      body = '<div class="pt-wrap"><div class="pt-scroll"><table class="ptable">' +
        '<thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>القسم</th>' +
        '<th>السجل</th><th>التغييرات</th></tr></thead><tbody>' +
        (rows.length ? rows.slice(0, 400).map(function (r) {
          var t = new Date(r.ts || 0);
          var when = t.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" }) + " · " +
                     t.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          var ch = (r.changes || []).length
            ? (r.changes || []).map(function (c) {
                return '<div class="aud-ch"><b>' + E(c.kh) + '</b>: <s>' + E(c.from) + '</s> ← ' + E(c.to) + '</div>';
              }).join("")
            : '<span class="muted">—</span>';
          return '<tr><td dir="ltr" class="pt-num">' + E(when) + '</td>' +
            '<td>' + E(r.actor) + '<div class="muted" style="font-size:11px">' + E(r.role) + '</div></td>' +
            '<td>' + actBadge(r.action) + '</td>' +
            '<td>' + E(r.collAr || r.coll) + '</td>' +
            '<td>' + E(r.label || r.docId) + '</td>' +
            '<td class="aud-cell">' + ch + '</td></tr>';
          }).join("")
          : '<tr><td colspan="6" style="text-align:center;padding:28px" class="muted">لا توجد عمليات في هذه الفترة.</td></tr>') +
        '</tbody></table></div></div>';
    }

    var colls = {};
    (AUD.rows || []).forEach(function (r) { colls[r.coll] = r.collAr || r.coll; });

    var filters = '<div class="aud-bar">' +
      '<input class="aud-in" placeholder="بحث باسم المستخدم أو السجل" value="' + E(AUD.q) + '"' +
      ' oninput="window.auditFilter(\'q\', this.value)">' +
      '<select class="aud-in" onchange="window.auditFilter(\'coll\', this.value)"><option value="">كل الأقسام</option>' +
      Object.keys(colls).map(function (k) {
        return '<option value="' + E(k) + '"' + (AUD.coll === k ? " selected" : "") + '>' + E(colls[k]) + '</option>';
      }).join("") + '</select>' +
      '<select class="aud-in" onchange="window.auditFilter(\'act\', this.value)"><option value="">كل الإجراءات</option>' +
      [["create", "إضافة"], ["update", "تعديل"], ["delete", "حذف"]].map(function (x) {
        return '<option value="' + x[0] + '"' + (AUD.act === x[0] ? " selected" : "") + '>' + x[1] + '</option>';
      }).join("") + '</select>' +
      '<select class="aud-in" onchange="window.auditFilter(\'days\', +this.value)">' +
      [[1, "اليوم"], [7, "آخر ٧ أيام"], [30, "آخر ٣٠ يوماً"], [90, "آخر ٩٠ يوماً"]].map(function (x) {
        return '<option value="' + x[0] + '"' + (AUD.days === x[0] ? " selected" : "") + '>' + x[1] + '</option>';
      }).join("") + '</select></div>';

    try { setDocTitle("سجل العمليات"); } catch (e) {}
    return '<div class="page">' + pageHead("سجل العمليات",
      "توثيق لا يُعدَّل ولا يُحذف — كل كتابة بمن نفّذها ووقتها بالثانية") +
      filters + body + '</div>';
  }

  /* ==================================================================
     ٥) صفحة مصفوفة الصلاحيات
     ================================================================== */
  window.permToggle = function (uid, key, on) {
    var users = SCOPED("users", DBX().users);
    var u = null;
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].uid || users[i].id) === String(uid)) { u = users[i]; break; }
    }
    if (!u) { T("تعذّر العثور على المستخدم", "warn"); return; }

    if (!u.perms || typeof u.perms !== "object") u.perms = {};
    u.perms[key] = !!on;

    Promise.resolve(window.persistSet("users", u)).then(function (ok) {
      T(ok === false ? "تعذّر الحفظ" : "حُفظت الصلاحية", ok === false ? "warn" : "success");
    });
  };

  window.permAll = function (uid, on) {
    var users = SCOPED("users", DBX().users);
    var u = null;
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].uid || users[i].id) === String(uid)) { u = users[i]; break; }
    }
    if (!u) return;
    u.perms = u.perms || {};
    PERM_DEFS.forEach(function (p) { u.perms[p.k] = !!on; });
    Promise.resolve(window.persistSet("users", u)).then(function () {
      T(on ? "مُنحت كل الصلاحيات" : "سُحبت كل الصلاحيات", "success");
      try { mount(); } catch (e) {}
    });
  };

  function permsPage() {
    var role = USER().role || "";
    if (role !== "admin" && role !== "owner") {
      return '<div class="page">' + pageHead("صلاحيات المعلمين", "") +
        '<div class="soon-card"><h4>لا صلاحية</h4><p>هذه الشاشة للمدير وحده.</p></div></div>';
    }

    var teachers = SCOPED("users", DBX().users).filter(function (u) {
      return u && u.role === "teacher" && u.active !== false;
    }).sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || ""), "ar"); });

    var head = '<thead><tr><th class="pm-name">المعلم</th>' +
      PERM_DEFS.map(function (p) { return '<th class="pm-h"><span>' + E(p.h) + '</span></th>'; }).join("") +
      '<th>الكل</th></tr></thead>';

    var body = teachers.length ? teachers.map(function (u) {
      var uid = String(u.uid || u.id);
      var p = u.perms || {};
      return '<tr><td class="pm-name"><strong>' + E(u.name || "—") + '</strong>' +
        '<div class="muted" style="font-size:11px">' + E(u.email || u.username || "") + '</div></td>' +
        PERM_DEFS.map(function (d) {
          var on = p[d.k] === undefined ? !!PERM_DEFAULT[d.k] : p[d.k] === true;
          return '<td class="pm-c"><label class="pm-sw" title="' + E(d.h) + '">' +
            '<input type="checkbox"' + (on ? " checked" : "") +
            ' onchange="window.permToggle(\'' + E(uid) + '\',\'' + d.k + '\',this.checked)"><i></i></label></td>';
        }).join("") +
        '<td class="pm-c"><button class="btn btn-ghost btn-sm" onclick="window.permAll(\'' + E(uid) + '\',true)">منح</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="window.permAll(\'' + E(uid) + '\',false)">سحب</button></td></tr>';
    }).join("")
      : '<tr><td colspan="' + (PERM_DEFS.length + 2) + '" style="text-align:center;padding:28px" class="muted">لا يوجد معلمون مفعّلون.</td></tr>';

    try { setDocTitle("صلاحيات المعلمين"); } catch (e) {}
    return '<div class="page">' + pageHead("صلاحيات المعلمين",
      "المنع فعلي عند الكتابة، لا إخفاءً للأزرار — والقواعد تمنعه على الخادم أيضاً") +
      '<div class="pt-wrap"><div class="pt-scroll"><table class="ptable pm-table">' +
      head + '<tbody>' + body + '</tbody></table></div></div>' +
      '<div class="soon-card" style="margin-top:14px"><p>الافتراضي لمعلّم بلا مصفوفة محفوظة: ' +
      'عمله اليومي مسموح (تحضير · خطط · تسميع · مراسلة)، والاستثنائي ممنوع ' +
      '(التحضير بعد الوقت · تعديل أخطاء المصحف السابقة · إضافة أو إيقاف أو نقل طالب).</p></div></div>';
  }

  /* ==================================================================
     ٦) التسجيل في الصفحات والقائمة
     ================================================================== */
  function register() {
    if (typeof PAGES === "undefined") return;

    var origSoon = PAGES["admin/soon"];
    PAGES["admin/soon"] = function () {
      var key = "";
      try { key = subParam("p"); } catch (e) {}
      if (key === "audit") return auditPage();
      if (key === "perms") return permsPage();
      return origSoon ? origSoon() : "";
    };
  }

  /* رابطان في القائمة الجانبية.
     shell.js الحديث يعرضهما ضمن مجموعة «الرقابة والصلاحيات»، فلا نكرّرهما.
     الحقن هنا لصفحات لم تُحدَّث نسخة shell.js عندها بعد. */
  function injectNav() {
    var nav = document.getElementById("nav");
    if (!nav || nav.querySelector("[data-gov]")) return;
    if (nav.querySelector('a[href*="p=audit"]')) return;   /* موجود في القائمة أصلاً */
    var role = USER().role || "";
    if (role !== "admin" && role !== "supervisor" && role !== "owner") return;

    var here = location.pathname + location.search;
    var mk = function (href, label, icon) {
      var on = here.indexOf(href) > -1 ? " active" : "";
      return '<a class="nav-item' + on + '" data-gov="1" href="' + href + '">' +
             IC(icon, 18) + '<span>' + label + '</span></a>';
    };

    var box = document.createElement("div");
    box.innerHTML = mk("soon.html?p=audit", "سجل العمليات", "doc") +
                    (role === "admin" || role === "owner"
                      ? mk("soon.html?p=perms", "صلاحيات المعلمين", "shield") : "");
    while (box.firstChild) nav.appendChild(box.firstChild);
  }

  /* ==================================================================
     الإقلاع
     ================================================================== */
  function boot() {
    register();
    loadMyPerms();

    /* القائمة تُرسم بعد المصادقة، فتُحقن عند ظهورها */
    var n = 0;
    var t = setInterval(function () {
      injectNav();
      if (++n > 40 || document.querySelector("[data-gov]")) clearInterval(t);
    }, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

  /* القراءة المرشَّحة بنطاق صاحب الجلسة — الكتابة تبقى على DB نفسه.
     cur تُرجع الكامل لمن لا نطاق له، فلا يتغيّر شيء عند المالك والمدير. */
  function SCOPED(coll, fallback) {
    try { if (typeof cur === "function") return cur(coll) || []; } catch (e) {}
    return Array.isArray(fallback) ? fallback : [];
  }