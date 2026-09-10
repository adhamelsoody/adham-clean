/* =========================================================================
   duty-plus.js — الدوام والنقل
   -------------------------------------------------------------------------
   شاشات الدوام الأربع تقرأ من attendance سجلاً بحقول staffId و in و out —
   ولا يكتبها أحد في المشروع كله. تسع مواضع تقرأ staffId وصفرٌ يكتبه، فكانت
   الأرقام أصفاراً بنيويةً لا عطلاً.

   هذا الملف يكتب ذلك السجل بالشكل نفسه، فتضيء الشاشات القائمة بلا تعديلها:
     • زر حضور وانصراف للمعلم والمشرف
     • وحدات دوام كاملة: وقت البداية والنهاية وسماح التأخير وقيمة الخصم
     • تعيين الوحدة والأجر لكل موظف من الإدارة
     • حساب التأخير والخصم تلقائياً عند الحضور
     • تراجع عن النقل يعيد كل طالب إلى حلقته السابقة

   السجل يحمل status و studentId فارغاً عمداً: قواعد Firestore تشترطهما
   في attendance، وبدونهما يُرفض تسجيل المعلّم لحضوره على الخادم.
   ========================================================================= */
(function () {
  "use strict";

  function DBX()  { try { return DB; } catch (e) { return {}; } }
  function USER() { try { return (STATE && STATE.user) || {}; } catch (e) { return {}; } }
  function E(s)   { try { return esc(s); } catch (e) { return String(s == null ? "" : s); } }
  function IC(n,s){ try { return ic(n, s); } catch (e) { return ""; } }
  function T(m,t) { try { showToast(m, t); } catch (e) {} }
  function AR(n)  { try { return toArabicDigits(n); } catch (e) { return String(n); } }
  function CUR(c) { try { return cur(c) || []; } catch (e) { return DBX()[c] || []; } }
  function MNT()  { try { mount(); } catch (e) {} }

  function role()   { return USER().role || ""; }
  function isAdmin(){ var r = role(); return r === "admin" || r === "owner"; }
  function isBoss() { var r = role(); return isAdmin() || r === "supervisor" || r === "manager"; }
  function isStaff(){ var r = role(); return r === "teacher" || r === "supervisor"; }

  function today() { return new Date().toISOString().slice(0, 10); }
  function hhmm(d) {
    d = d || new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function mins(t) {
    var m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function dur(a, b) {
    var x = mins(a), y = mins(b);
    if (x == null || y == null) return "";
    var d = y - x; if (d < 0) d += 1440;
    return AR(Math.floor(d / 60)) + "س " + AR(d % 60) + "د";
  }

  /* ==================================================================
     ١) الموظفون — المعلمون والمشرفون
     ================================================================== */
  function staffList() {
    var out = [];
    CUR("teachers").forEach(function (t) {
      out.push({ id: String(t.id), uid: String(t.uid || t.id), name: t.name || "—",
                 role: "معلم", unitId: t.unitId || "", wage: Number(t.wage) || 0, rec: t, coll: "teachers" });
    });
    SCOPED("users", DBX().users).forEach(function (u) {
      if (u.role !== "supervisor" || u.active === false) return;
      if (out.some(function (x) { return x.uid === String(u.uid || u.id); })) return;
      out.push({ id: String(u.uid || u.id), uid: String(u.uid || u.id), name: u.name || "—",
                 role: "مشرف", unitId: u.unitId || "", wage: Number(u.wage) || 0, rec: u, coll: "users" });
    });
    return out;
  }

  /* ربط الحساب بسجل الموظف: بالمعرّف، ثم البريد، ثم الاسم.
     الاسم آخر الحيل لأن سجلات كثيرة قديمة بلا uid. */
  function meAsStaff() {
    var u = USER();
    var uid  = String(u.uid || u.id || "");
    var mail = String(u.email || "").toLowerCase();
    var name = String(u.name || "").trim();
    var list = staffList();

    return list.find(function (s) { return s.uid === uid || s.id === uid; })
        || (mail ? list.find(function (s) {
             var r = s.rec || {};
             return String(r.email || r.username || "").toLowerCase() === mail;
           }) : null)
        || (name ? list.find(function (s) { return String(s.name).trim() === name; }) : null)
        || null;
  }

  function unitOf(id) {
    return (DBX().dutyTypes || []).find(function (x) { return String(x.id) === String(id); }) || null;
  }

  /* ==================================================================
     ٢) سجل الدوام
     ================================================================== */
  function dutyId(staffId, date) { return "dt__" + date + "__" + staffId; }

  function dutyRec(staffId, date) {
    return (DBX().attendance || []).find(function (a) {
      return String(a.id) === dutyId(staffId, date);
    }) || null;
  }

  function dutyOfDate(date) {
    return (DBX().attendance || []).filter(function (a) {
      return a.staffId && String(a.date) === String(date);
    });
  }

  /* التأخير بعد سماح الوحدة، والخصم بقيمة الدقيقة المقرَّرة فيها */
  function calcLate(unit, inTime) {
    if (!unit || !unit.start) return { lateMin: 0, deduction: 0 };
    var start = mins(unit.start), got = mins(inTime);
    if (start == null || got == null) return { lateMin: 0, deduction: 0 };

    var grace = Number(unit.grace) || 0;
    var late = got - (start + grace);
    if (late <= 0) return { lateMin: 0, deduction: 0 };

    var per = Number(unit.deductPerMin) || 0;
    return { lateMin: late, deduction: Math.round(late * per * 100) / 100 };
  }

  /* ------------------------------------------------------------------
     الحضور والانصراف
     ------------------------------------------------------------------ */
  window.dutyPunch = function (kind, staffId) {
    var me = staffId ? staffList().find(function (s) { return s.id === String(staffId); }) : meAsStaff();
    if (!me) { T("حسابك غير مرتبط بسجل موظف — راجع الإدارة", "warn"); return; }
    if (staffId && !isBoss()) { T("تسجيل دوام غيرك للإدارة", "warn"); return; }

    var date = today(), now = hhmm();
    var unit = unitOf(me.unitId);
    var rec = dutyRec(me.id, date);
    var u = USER();

    if (kind === "in") {
      if (rec && rec.in) { T("سُجّل حضورك اليوم " + rec.in, "info"); return; }
      var c = calcLate(unit, now);
      rec = {
        id: dutyId(me.id, date),
        /* القواعد تشترط هذين الحقلين في attendance */
        status: c.lateMin ? "متأخر" : "حاضر",
        studentId: "",
        date: date,
        staffId: me.id, staffUid: me.uid, staffName: me.name, staffRole: me.role,
        unitId: me.unitId || "", unitName: unit ? (unit.name || "") : "",
        start: unit ? (unit.start || "") : "",
        "in": now, out: "",
        lateMin: c.lateMin, deduction: c.deduction,
        wage: me.wage || 0,
        by: u.name || u.email || "", ts: Date.now()
      };
    } else {
      if (!rec || !rec.in) { T("سجّل حضورك أولاً", "warn"); return; }
      if (rec.out) { T("سُجّل انصرافك اليوم " + rec.out, "info"); return; }
      rec.out = now;
      /* الخروج قبل نهاية الوحدة يُرصد — تقرير الموظف يعدّه «خروج مبكر» */
      var endM = unit ? mins(unit.end) : null, outM = mins(now);
      rec.early = !!(endM != null && outM != null && outM < endM);
      rec.earlyMin = rec.early ? endM - outM : 0;
      rec.ts = Date.now();
    }

    if (!Array.isArray(DBX().attendance)) DBX().attendance = [];
    var arr = DBX().attendance;
    var i = arr.findIndex(function (a) { return String(a.id) === rec.id; });
    if (i > -1) arr[i] = rec; else arr.push(rec);

    Promise.resolve(persistSet("attendance", rec)).then(function (ok) {
      if (ok === false) { T("تعذّر الحفظ — تحقّق من الاتصال", "warn"); return; }
      if (kind === "in") {
        T(rec.lateMin
          ? "سُجّل حضورك " + now + " — تأخير " + AR(rec.lateMin) + " دقيقة" +
            (rec.deduction ? " · خصم " + AR(rec.deduction) : "")
          : "سُجّل حضورك " + now, rec.lateMin ? "warn" : "success");
      } else {
        T("سُجّل انصرافك " + now + " — مدة الدوام " + dur(rec["in"], now), "success");
      }
      MNT();
    });
  };

  /* ------------------------------------------------------------------
     تعليم الحالة: تأخير · استئذان · غياب
     ------------------------------------------------------------------
     الحقول هي نفسها التي يقرؤها «تقرير الموظف» في app.js:
       status: حاضر · متأخر · غائب · مستأذن
       excuse: عذرٌ معتمَد — به يصير الغياب «غياب بعذر»
       early:  خروج مبكر
     فلا نخترع شكلاً جديداً ولا نلمس الشاشات القائمة.
     ------------------------------------------------------------------ */
  function baseRec(me, date, unit) {
    var u = USER();
    return {
      id: dutyId(me.id, date), studentId: "", date: date,
      staffId: me.id, staffUid: me.uid, staffName: me.name, staffRole: me.role,
      unitId: me.unitId || "", unitName: unit ? (unit.name || "") : "",
      start: unit ? (unit.start || "") : "", kind: "fixed",
      "in": "", out: "", lateMin: 0, deduction: 0,
      wage: me.wage || 0, by: u.name || u.email || "", ts: Date.now()
    };
  }

  function saveRec(rec, msg, tone) {
    if (!Array.isArray(DBX().attendance)) DBX().attendance = [];
    var arr = DBX().attendance;
    var i = arr.findIndex(function (a) { return String(a.id) === rec.id; });
    if (i > -1) arr[i] = rec; else arr.push(rec);

    return Promise.resolve(persistSet("attendance", rec)).then(function (ok) {
      if (ok === false) { T("تعذّر الحفظ — تحقّق من الاتصال", "warn"); return false; }
      if (msg) T(msg, tone || "success");
      MNT();
      return true;
    });
  }

  /* الإدارة تعلّم حالة موظف في يوم */
  window.dutyMark = function (staffId, kind) {
    if (!isBoss()) { T("هذا الإجراء للإدارة", "warn"); return; }
    var me = staffList().find(function (s) { return s.id === String(staffId); });
    if (!me) return;

    var date = today(), unit = unitOf(me.unitId);
    var rec = dutyRec(me.id, date) || baseRec(me, date, unit);
    var u = USER();

    var titles = { late: "تعليم تأخير", permit: "تسجيل استئذان", absent: "تسجيل غياب" };
    var reasons = {
      late:   ["ظرف طارئ", "زحام مروري", "عذر صحي", "سبب آخر"],
      permit: ["استئذان لظرف عائلي", "موعد طبي", "مهمة عمل", "سبب آخر"],
      absent: ["غياب بلا إشعار", "مرض", "إجازة", "سبب آخر"]
    };

    openModal(titles[kind] || "تعليم الحالة", me.name + " — " + date,
      '<div class="form-grid">' +
        (kind === "late"
          ? '<div class="field"><label>وقت الحضور الفعلي</label>' +
            '<input id="dm_time" type="time" value="' + E(rec["in"] || hhmm()) + '"></div>'
          : "") +
        '<div class="field' + (kind === "late" ? '' : ' full') + '"><label>السبب</label>' +
        '<select id="dm_r">' + (reasons[kind] || ["—"]).map(function (r) {
          return '<option>' + r + '</option>'; }).join("") + '</select></div>' +
        '<div class="field full"><label>تفصيل</label>' +
        '<input id="dm_n" value="' + E(rec.excuseNote || "") + '" placeholder="اختياري"></div>' +
        (kind !== "late"
          ? '<div class="field full"><div class="toggle-row"><div class="tr-text">' +
            '<strong>عذر مقبول</strong><small>يُحتسب «بعذر» ويُلغى الخصم</small></div>' +
            '<label class="switch"><input type="checkbox" id="dm_ok" checked>' +
            '<span class="slider"></span></label></div></div>'
          : '<div class="field full"><div class="toggle-row"><div class="tr-text">' +
            '<strong>إعفاء من الخصم</strong><small>تأخير بعذر مقبول</small></div>' +
            '<label class="switch"><input type="checkbox" id="dm_ok">' +
            '<span class="slider"></span></label></div></div>') +
      '</div>',
      '<button class="btn btn-primary" id="dmGo">حفظ</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    var b = document.getElementById("dmGo");
    if (b) b.onclick = function () {
      var g = function (i) { var e = document.getElementById(i); return e ? e.value : ""; };
      var ok = !!(document.getElementById("dm_ok") || {}).checked;
      var reason = g("dm_r"), note = g("dm_n");

      if (kind === "late") {
        var tm = g("dm_time") || hhmm();
        var c = calcLate(unit, tm);
        rec["in"] = tm;
        rec.status = "متأخر";
        rec.lateMin = c.lateMin;
        rec.deduction = ok ? 0 : c.deduction;
      } else if (kind === "permit") {
        rec.status = "مستأذن";
        rec.deduction = 0;
      } else {
        rec.status = "غائب";
        rec.deduction = ok ? 0 : rec.deduction;
      }

      /* excuse يعني عذراً معتمداً — وبه يفرّق التقرير بين «مستأذن» و«بعذر» */
      if (ok) { rec.excuse = reason; rec.excuseStatus = "approved"; }
      else    { rec.excuse = ""; rec.excuseStatus = "rejected"; }
      rec.excuseNote = note;
      rec.excuseBy = u.name || "—";
      rec.ts = Date.now();

      saveRec(rec, "حُفظت حالة " + me.name).then(function () {
        try { closeModal(); } catch (e) {}
      });
    };
  };

  /* الموظف يقدّم استئذاناً — يبقى معلّقاً حتى تعتمده الإدارة */
  window.dutyExcuse = function () {
    var me = meAsStaff();
    if (!me) { T("حسابك غير مرتبط بسجل موظف", "warn"); return; }

    var date = today(), unit = unitOf(me.unitId);
    var rec = dutyRec(me.id, date);

    openModal("طلب استئذان", "يُرسل للإدارة للاعتماد",
      '<div class="form-grid">' +
        '<div class="field full"><label>نوع الطلب</label><select id="ex_k">' +
        '<option value="late">تأخير عن الدوام</option>' +
        '<option value="early">انصراف مبكر</option>' +
        '<option value="absent">غياب اليوم</option>' +
        '</select></div>' +
        '<div class="field full"><label>السبب <span class="req">*</span></label>' +
        '<input id="ex_r" placeholder="اكتب سبب الاستئذان"></div>' +
      '</div>' +
      (rec && rec.lateMin
        ? '<div class="note-card" style="margin-top:10px"><p>تأخيرك اليوم ' +
          AR(rec.lateMin) + ' دقيقة' + (rec.deduction ? ' وخصمه ' + AR(rec.deduction) : '') +
          '. اعتماد العذر يُلغي الخصم.</p></div>'
        : ''),
      '<button class="btn btn-primary" id="exGo">إرسال</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    var b = document.getElementById("exGo");
    if (b) b.onclick = function () {
      var reason = String((document.getElementById("ex_r") || {}).value || "").trim();
      if (!reason) { T("اكتب السبب", "warn"); return; }
      var k = (document.getElementById("ex_k") || {}).value;

      var r = rec || baseRec(me, date, unit);
      if (k === "absent") r.status = "مستأذن";
      else if (k === "early") r.early = true;
      /* التأخير يبقى «متأخر» والعذر معلّق حتى الاعتماد */
      if (!r.status) r.status = k === "late" ? "متأخر" : "مستأذن";

      /* لا يُكتب excuse إلا بعد الاعتماد — فيبقى معلّقاً في التقرير */
      r.excuse = "";
      r.excuseStatus = "pending";
      r.excuseKind = k;
      r.excuseNote = reason;
      r.excuseAt = Date.now();
      r.ts = Date.now();

      saveRec(r, "أُرسل الطلب — بانتظار اعتماد الإدارة", "info").then(function () {
        try { closeModal(); } catch (e) {}
      });
    };
  };

  /* الإدارة تعتمد أو ترفض */
  window.dutyExcuseAct = function (recId, approve) {
    if (!isBoss()) return;
    var r = (DBX().attendance || []).find(function (a) { return String(a.id) === String(recId); });
    if (!r) return;
    var u = USER();

    if (approve) {
      r.excuse = r.excuseNote || "عذر مقبول";
      r.excuseStatus = "approved";
      r.deduction = 0;
    } else {
      r.excuse = "";
      r.excuseStatus = "rejected";
      /* يعود الخصم كما كان قبل الطلب */
      var unit = unitOf(r.unitId);
      if (r["in"]) { var c = calcLate(unit, r["in"]); r.deduction = c.deduction; }
    }
    r.excuseBy = u.name || "—";
    r.ts = Date.now();

    saveRec(r, approve ? "اعتُمد العذر وأُلغي الخصم" : "رُفض العذر", approve ? "success" : "info");
  };

  function excusePanel() {
    if (!isBoss()) return "";
    var pend = SCOPED("attendance", DBX().attendance).filter(function (a) {
      return a.staffId && a.excuseStatus === "pending";
    }).sort(function (a, b) { return (b.excuseAt || 0) - (a.excuseAt || 0); });

    if (!pend.length) return "";

    var KIND = { late: "تأخير", early: "انصراف مبكر", absent: "غياب" };
    var body = pend.map(function (r) {
      return '<tr><td><strong>' + E(r.staffName) + '</strong>' +
        '<div class="muted" style="font-size:11.5px">' + E(r.staffRole || "") + '</div></td>' +
        '<td>' + E(r.date) + '</td>' +
        '<td>' + E(KIND[r.excuseKind] || "—") + '</td>' +
        '<td>' + E(r.excuseNote || "—") + '</td>' +
        '<td>' + (r.lateMin ? AR(r.lateMin) + ' د' + (r.deduction ? ' · خصم ' + AR(r.deduction) : '') : '—') + '</td>' +
        '<td class="cp-acts">' +
          '<button class="btn btn-primary btn-sm" onclick="window.dutyExcuseAct(\'' + E(r.id) + '\',true)">اعتماد</button>' +
          '<button class="btn btn-ghost btn-sm cp-danger" onclick="window.dutyExcuseAct(\'' + E(r.id) + '\',false)">رفض</button>' +
        '</td></tr>';
    }).join("");

    return '<div class="cp-card"><div class="cp-head">' +
      '<div><strong>طلبات الاستئذان <span class="ac-pill">' + AR(pend.length) + '</span></strong>' +
      '<small>اعتماد العذر يُلغي خصم التأخير ويحتسبه «بعذر» في التقرير</small></div></div>' +
      '<div class="pt-wrap"><div class="pt-scroll"><table class="ptable">' +
      '<thead><tr><th>الموظف</th><th>التاريخ</th><th>النوع</th><th>السبب</th><th>التأخير</th><th></th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div></div>';
  }

  /* بطاقة الحضور في واجهة الموظف */
  function punchCard() {
    if (!isStaff()) return "";

    var me = meAsStaff();
    /* كانت تختفي بصمت فيظنّ المعلّم أن الزر غير موجود — الآن تشرح السبب */
    if (!me) {
      return '<div class="dp-card dp-warn">' +
        '<div class="dp-l"><div class="dp-t"><strong>دوامي اليوم</strong>' +
        '<small>حسابك غير مرتبط بسجل معلّم في النظام</small></div>' +
        '<div class="dp-s">لن يظهر زر الحضور حتى تربط الإدارة حسابك بسجلك. ' +
        'أبلغ الإدارة بأن اسم حسابك لا يطابق اسمك في صفحة المعلمين.</div></div></div>';
    }

    var rec = dutyRec(me.id, today());
    var unit = unitOf(me.unitId);
    var inT = rec && rec["in"], outT = rec && rec.out;

    var state = !inT ? "لم تسجّل حضورك بعد"
              : !outT ? "أنت على رأس العمل منذ " + inT
              : "انتهى دوامك: " + inT + " ← " + outT + " (" + dur(inT, outT) + ")";

    return '<div class="dp-card">' +
      '<div class="dp-l">' +
        '<div class="dp-t"><strong>دوامي اليوم</strong>' +
        '<small>' + E(unit ? unit.name + " · من " + unit.start + " إلى " + unit.end
                          : "لم تُحدَّد لك وحدة دوام — راجع الإدارة") + '</small></div>' +
        '<div class="dp-s">' + E(state) + '</div>' +
        (rec && rec.lateMin
          ? '<div class="dp-late">تأخير ' + AR(rec.lateMin) + ' دقيقة' +
            (rec.deduction ? ' · خصم ' + AR(rec.deduction) : ' · بعذر معتمد') + '</div>' : '') +
        (rec && rec.excuseStatus === "pending"
          ? '<div class="dp-pend">طلب استئذانك قيد المراجعة</div>' : '') +
        (rec && rec.excuseStatus === "approved"
          ? '<div class="dp-okx">اعتُمد عذرك: ' + E(rec.excuse) + '</div>' : '') +
      '</div>' +
      '<div class="dp-b">' +
        '<button class="dp-in" ' + (inT ? "disabled" : "") +
          ' onclick="window.dutyPunch(\'in\')">' + IC("check", 17) + ' حضور</button>' +
        '<button class="dp-out" ' + (!inT || outT ? "disabled" : "") +
          ' onclick="window.dutyPunch(\'out\')">' + IC("clock", 17) + ' انصراف</button>' +
        '<button class="dp-ex" onclick="window.dutyExcuse()">' + IC("doc", 17) + ' استئذان</button>' +
      '</div></div>';
  }

  /* ==================================================================
     ٣) وحدات الدوام — شاشة كاملة
     ================================================================== */
  window.dtuForm = function (id) {
    var u = id ? unitOf(id) : null;
    openModal(u ? "تعديل وحدة الدوام" : "وحدة دوام جديدة", "",
      '<div class="form-grid">' +
        '<div class="field full"><label>اسم الوحدة <span class="req">*</span></label>' +
        '<input id="du_name" value="' + E(u ? u.name : "") + '" placeholder="مثال: الفترة المسائية"></div>' +
        '<div class="field"><label>بداية الدوام</label>' +
        '<input id="du_start" type="time" value="' + E(u ? (u.start || "16:00") : "16:00") + '"></div>' +
        '<div class="field"><label>نهاية الدوام</label>' +
        '<input id="du_end" type="time" value="' + E(u ? (u.end || "18:00") : "18:00") + '"></div>' +
        '<div class="field"><label>سماح التأخير (دقيقة)</label>' +
        '<input id="du_grace" type="number" min="0" value="' + E(u ? (u.grace || 0) : 10) + '"></div>' +
        '<div class="field"><label>خصم الدقيقة</label>' +
        '<input id="du_ded" type="number" min="0" step="0.25" value="' + E(u ? (u.deductPerMin || 0) : 0) + '"></div>' +
      '</div>' +
      '<div class="note-card" style="margin-top:10px"><p>التأخير يُحسب بعد السماح: ' +
      'من حضر بعد البداية بأقلّ من مدة السماح لا يُعدّ متأخراً ولا يُخصم منه.</p></div>',
      '<button class="btn btn-primary" id="duGo">حفظ</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    var b = document.getElementById("duGo");
    if (b) b.onclick = function () {
      var g = function (i) { var e = document.getElementById(i); return e ? String(e.value).trim() : ""; };
      var name = g("du_name");
      if (!name) { T("اسم الوحدة مطلوب", "warn"); return; }
      var st = g("du_start"), en = g("du_end");
      if (mins(st) == null || mins(en) == null) { T("أوقات غير صحيحة", "warn"); return; }

      var rec = Object.assign({}, u || {}, {
        id: (u && u.id) || "du" + Date.now(),
        name: name, start: st, end: en,
        grace: Number(g("du_grace")) || 0,
        deductPerMin: Number(g("du_ded")) || 0,
        active: true
      });
      if (!Array.isArray(DBX().dutyTypes)) DBX().dutyTypes = [];
      var i = DBX().dutyTypes.findIndex(function (x) { return String(x.id) === String(rec.id); });
      if (i > -1) DBX().dutyTypes[i] = rec; else DBX().dutyTypes.push(rec);

      Promise.resolve(persistSet("dutyTypes", rec)).then(function (ok) {
        if (ok === false) { T("تعذّر الحفظ", "warn"); return; }
        try { closeModal(); } catch (e) {}
        T(u ? "حُدّثت الوحدة" : "أُضيفت الوحدة", "success"); MNT();
      });
    };
  };

  window.dtuDel = function (id) {
    var u = unitOf(id); if (!u) return;
    var n = staffList().filter(function (s) { return String(s.unitId) === String(id); }).length;

    openModal("حذف وحدة الدوام", "",
      '<div class="note-card"><p>ستُحذف <strong>' + E(u.name) + '</strong> نهائياً.' +
      (n ? ' ويرتبط بها <strong>' + AR(n) + '</strong> موظفاً سيصيرون بلا وحدة، فلا يُحسب تأخيرهم.' : '') +
      '</p></div>',
      '<button class="btn btn-danger" id="duDelGo">حذف</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    var b = document.getElementById("duDelGo");
    if (b) b.onclick = function () {
      var arr = DBX().dutyTypes || [];
      var i = arr.findIndex(function (x) { return String(x.id) === String(id); });
      if (i > -1) arr.splice(i, 1);
      try { persistDelete("dutyTypes", id); } catch (e) {}
      try { closeModal(); } catch (e) {}
      T("حُذفت الوحدة", "success"); MNT();
    };
  };

  function unitsPanel() {
    if (!isBoss()) return "";
    var rows = CUR("dutyTypes");

    var body = rows.length ? rows.map(function (u) {
      var n = staffList().filter(function (s) { return String(s.unitId) === String(u.id); }).length;
      return '<tr><td><strong>' + E(u.name) + '</strong></td>' +
        '<td dir="ltr" class="pt-num">' + E(u.start || "—") + ' → ' + E(u.end || "—") + '</td>' +
        '<td>' + AR(u.grace || 0) + ' د</td>' +
        '<td>' + (u.deductPerMin ? AR(u.deductPerMin) + " / دقيقة" : '<span class="muted">لا خصم</span>') + '</td>' +
        '<td class="pt-num">' + AR(n) + '</td>' +
        '<td class="cp-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="window.dtuForm(\'' + E(u.id) + '\')">تعديل</button>' +
          (isAdmin() ? '<button class="btn btn-ghost btn-sm cp-danger" onclick="window.dtuDel(\'' + E(u.id) + '\')">حذف</button>' : '') +
        '</td></tr>';
    }).join("")
      : '<tr><td colspan="6" style="text-align:center;padding:24px" class="muted">لا وحدات دوام — أضِف واحدة ليُحسب التأخير.</td></tr>';

    return '<div class="cp-card"><div class="cp-head">' +
      '<div><strong>وحدات الدوام</strong>' +
      '<small>وقت البداية والنهاية وسماح التأخير وقيمة خصم الدقيقة</small></div>' +
      (isBoss() ? '<button class="btn btn-primary btn-sm" onclick="window.dtuForm()">' + IC("plus", 15) + ' وحدة</button>' : '') +
      '</div><div class="pt-wrap"><div class="pt-scroll"><table class="ptable">' +
      '<thead><tr><th>الوحدة</th><th>الوقت</th><th>السماح</th><th>الخصم</th><th>الموظفون</th><th></th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div></div>';
  }

  /* ==================================================================
     ٤) تعيين الوحدة والأجر لكل موظف
     ================================================================== */
  window.dtaSet = function (staffId) {
    var s = staffList().find(function (x) { return x.id === String(staffId); });
    if (!s) return;
    var units = CUR("dutyTypes");

    openModal("دوام " + s.name, s.role,
      '<div class="form-grid">' +
        '<div class="field full"><label>وحدة الدوام</label><select id="da_unit">' +
        '<option value="">— بلا وحدة —</option>' +
        units.map(function (u) {
          return '<option value="' + E(u.id) + '"' + (String(s.unitId) === String(u.id) ? " selected" : "") + '>' +
            E(u.name) + ' (' + E(u.start) + '–' + E(u.end) + ')</option>';
        }).join("") + '</select></div>' +
        '<div class="field full"><label>الأجر اليومي</label>' +
        '<input id="da_wage" type="number" min="0" step="1" value="' + E(s.wage || 0) + '"></div>' +
      '</div>' +
      '<div class="note-card" style="margin-top:10px"><p>الأجر يُعرض في تقرير الدوام ' +
      'ويُطرح منه خصم التأخير المحسوب من الوحدة.</p></div>',
      '<button class="btn btn-primary" id="daGo">حفظ</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    var b = document.getElementById("daGo");
    if (b) b.onclick = function () {
      var unit = (document.getElementById("da_unit") || {}).value || "";
      var wage = Number((document.getElementById("da_wage") || {}).value) || 0;
      s.rec.unitId = unit;
      s.rec.wage = wage;

      Promise.resolve(persistSet(s.coll, s.rec)).then(function (ok) {
        if (ok === false) { T("تعذّر الحفظ", "warn"); return; }
        try { closeModal(); } catch (e) {}
        T("حُفظ دوام " + s.name, "success"); MNT();
      });
    };
  };

  function assignPanel() {
    if (!isBoss()) return "";
    var list = staffList();

    var body = list.length ? list.map(function (s) {
      var u = unitOf(s.unitId);
      var r = dutyRec(s.id, today());
      return '<tr><td><strong>' + E(s.name) + '</strong>' +
        '<div class="muted" style="font-size:11.5px">' + E(s.role) + '</div></td>' +
        '<td>' + (u ? E(u.name) + ' <span class="muted" dir="ltr">(' + E(u.start) + '–' + E(u.end) + ')</span>'
                    : '<span class="muted">بلا وحدة</span>') + '</td>' +
        '<td class="pt-num">' + (s.wage ? AR(s.wage) : '—') + '</td>' +
        '<td>' + (r && r["in"]
          ? '<span class="pt-badge ' + (r.lateMin ? "off" : "on") + '">' + E(r["in"]) +
            (r.out ? " ← " + E(r.out) : "") + '</span>' +
            (r.excuseStatus === "pending" ? ' <span class="dp-dot" title="طلب استئذان معلّق"></span>' : '')
          : (r && r.status && r.status !== "حاضر"
              ? '<span class="pt-badge off">' + E(r.status) + (r.excuse ? " بعذر" : "") + '</span>'
              : '<span class="muted">لم يحضر</span>')) + '</td>' +
        '<td class="cp-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="window.dtaSet(\'' + E(s.id) + '\')">تحديد الدوام</button>' +
          (r && r["in"] && !r.out
            ? '<button class="btn btn-ghost btn-sm" onclick="window.dutyPunch(\'out\',\'' + E(s.id) + '\')">انصراف</button>'
            : (!r || !r["in"]
              ? '<button class="btn btn-ghost btn-sm" onclick="window.dutyPunch(\'in\',\'' + E(s.id) + '\')">تحضير</button>'
              : '')) +
          '<button class="btn btn-ghost btn-sm" onclick="window.dutyMark(\'' + E(s.id) + '\',\'late\')">تأخير</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.dutyMark(\'' + E(s.id) + '\',\'permit\')">استئذان</button>' +
          '<button class="btn btn-ghost btn-sm cp-danger" onclick="window.dutyMark(\'' + E(s.id) + '\',\'absent\')">غياب</button>' +
        '</td></tr>';
    }).join("")
      : '<tr><td colspan="5" style="text-align:center;padding:24px" class="muted">لا موظفون.</td></tr>';

    return '<div class="cp-card"><div class="cp-head">' +
      '<div><strong>دوام الموظفين</strong>' +
      '<small>الإدارة تحدّد وحدة الدوام والأجر لكل معلم ومشرف — وتستطيع تسجيل حضوره نيابةً عنه</small></div></div>' +
      '<div class="pt-wrap"><div class="pt-scroll"><table class="ptable">' +
      '<thead><tr><th>الموظف</th><th>وحدة الدوام</th><th>الأجر</th><th>اليوم</th><th></th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div></div>';
  }

  /* ==================================================================
     ٥) تقرير الدوام والخصومات
     ================================================================== */
  var DR = { days: 30 };
  window.dtrRange = function (v) { DR.days = Number(v) || 30; MNT(); };

  function reportPanel() {
    if (!isBoss()) return "";
    var since = new Date(Date.now() - DR.days * 86400000).toISOString().slice(0, 10);
    var recs = SCOPED("attendance", DBX().attendance).filter(function (a) {
      return a.staffId && String(a.date) >= since;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var byStaff = {};
    recs.forEach(function (r) {
      var k = String(r.staffId);
      if (!byStaff[k]) byStaff[k] = { name: r.staffName, role: r.staffRole, days: 0, late: 0, lateMin: 0, ded: 0 };
      byStaff[k].days++;
      if (r.lateMin) { byStaff[k].late++; byStaff[k].lateMin += Number(r.lateMin) || 0; }
      byStaff[k].ded += Number(r.deduction) || 0;
    });

    var sum = Object.keys(byStaff).map(function (k) { return byStaff[k]; })
      .sort(function (a, b) { return b.ded - a.ded; });

    var body = sum.length ? sum.map(function (s) {
      return '<tr><td><strong>' + E(s.name) + '</strong>' +
        '<div class="muted" style="font-size:11.5px">' + E(s.role || "") + '</div></td>' +
        '<td class="pt-num">' + AR(s.days) + '</td>' +
        '<td class="pt-num">' + AR(s.late) + '</td>' +
        '<td class="pt-num">' + AR(s.lateMin) + ' د</td>' +
        '<td class="pt-num">' + (s.ded ? '<strong style="color:#b3261e">' + AR(Math.round(s.ded * 100) / 100) + '</strong>' : '—') + '</td>' +
        '</tr>';
    }).join("")
      : '<tr><td colspan="5" style="text-align:center;padding:24px" class="muted">لا سجلات دوام في هذه الفترة.</td></tr>';

    var totalDed = sum.reduce(function (a, s) { return a + s.ded; }, 0);

    return '<div class="cp-card"><div class="cp-head">' +
      '<div><strong>مسيّر التأخير والخصومات</strong>' +
      '<small>محسوب من سجلات الحضور الفعلية — لا أرقاماً ثابتة</small></div>' +
      '<div class="cp-tools">' +
      '<select class="aud-in" onchange="window.dtrRange(this.value)">' +
      [[7, "آخر ٧ أيام"], [30, "آخر ٣٠ يوماً"], [90, "آخر ٩٠ يوماً"]].map(function (x) {
        return '<option value="' + x[0] + '"' + (DR.days === x[0] ? " selected" : "") + '>' + x[1] + '</option>';
      }).join("") + '</select>' +
      (totalDed ? '<span class="dp-tot">إجمالي الخصم: ' + AR(Math.round(totalDed * 100) / 100) + '</span>' : '') +
      '</div></div>' +
      '<div class="pt-wrap"><div class="pt-scroll"><table class="ptable">' +
      '<thead><tr><th>الموظف</th><th>أيام الحضور</th><th>مرات التأخير</th><th>مجموع التأخير</th><th>الخصم</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div></div>';
  }

  /* ==================================================================
     ٦) التراجع عن النقل
     ------------------------------------------------------------------
     سجل النقل كان يحفظ الأسماء فقط، فلا يمكن إرجاع كل طالب إلى حلقته.
     نلتقط الحالة قبل النقل ونضيفها إلى السجل نفسه.
     ================================================================== */
  function snapshotStudents(ids) {
    var out = [];
    SCOPED("students", DBX().students).forEach(function (s) {
      if (ids.indexOf(String(s.id)) === -1) return;
      out.push({ id: String(s.id), name: s.name || "",
                 circleId: s.circleId || "", mosqueId: s.mosqueId || "", complexId: s.complexId || "",
                 points: s.points || 0, balance: s.balance || 0 });
    });
    return out;
  }

  window.mvUndo = function (logId) {
    var log = (DBX().moveLog || []).find(function (x) { return String(x.id) === String(logId); });
    if (!log || !Array.isArray(log.items) || !log.items.length) {
      T("هذه العملية قديمة ولا تحمل تفاصيل تكفي للتراجع", "warn"); return;
    }

    openModal("التراجع عن النقل", "",
      '<div class="note-card"><p>سيعود <strong>' + AR(log.items.length) + '</strong> طالباً ' +
      'إلى حلقاتهم السابقة، وتُستعاد نقاطهم وأرصدتهم كما كانت قبل النقل.</p>' +
      '<p style="margin-top:8px">تُسجَّل العملية في السجل بوصفها <strong>تصحيحاً</strong> لا نقلاً جديداً.</p></div>',
      '<button class="btn btn-primary" id="mvUndoGo">تأكيد التراجع</button>' +
      '<button class="btn btn-ghost" data-action="close-modal">إلغاء</button>');

    var b = document.getElementById("mvUndoGo");
    if (b) b.onclick = function () {
      var n = 0;
      log.items.forEach(function (it) {
        var s = (DBX().students || []).find(function (x) { return String(x.id) === String(it.id); });
        if (!s) return;
        s.circleId = it.circleId; s.mosqueId = it.mosqueId; s.complexId = it.complexId;
        s.points = it.points; s.balance = it.balance;
        persistSet("students", s);
        n++;
      });

      var u = USER();
      var undo = { id: "mv" + Date.now(), kind: log.kind || "students", ts: Date.now(),
                   from: log.to, to: log.from, count: n, undoOf: log.id,
                   correction: true, by: u.name || "—",
                   names: log.items.map(function (x) { return x.name; }).slice(0, 50) };
      if (!Array.isArray(DBX().moveLog)) DBX().moveLog = [];
      DBX().moveLog.push(undo);
      persistSet("moveLog", undo);

      log.undone = true; persistSet("moveLog", log);

      try { closeModal(); } catch (e) {}
      T("رجع " + AR(n) + " طالباً إلى حلقاتهم السابقة", "success");
      MNT();
    };
  };

  /* ==================================================================
     الربط
     ================================================================== */
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
    /* بطاقة الحضور في كل صفحات المعلّم — لا صفحتين فقط، فالمعلّم قد
       يفتح النظام على أي صفحة وينسى تسجيل حضوره. */
    try {
      if (typeof PAGES !== "undefined") {
        Object.keys(PAGES).forEach(function (k) {
          if (k.indexOf("teacher/") !== 0) return;
          var orig = PAGES[k];
          if (typeof orig !== "function" || orig.__duty) return;
          var w = function () {
            var html = "";
            try { html = orig.apply(this, arguments) || ""; } catch (e) { throw e; }
            try { return punchCard() + html; } catch (e) { return html; }
          };
          w.__duty = true;
          PAGES[k] = w;
        });
      }
    } catch (e) {}

    /* واجهات لا تمرّ بـ PAGES */
    ["teacherDashboard", "teacherToday"].forEach(function (n) {
      var f = window[n];
      if (typeof f === "function" && !f.__duty) {
        wrap(n, function (html) { return punchCard() + html; });
        if (window[n]) window[n].__duty = true;
      }
    });
    wrap("adminDashboard", function (html) {
      return (role() === "supervisor" ? punchCard() : "") + html;
    });

    /* شاشات الدوام */
    wrap("adminDutyHome",  function (html) { return html + excusePanel() + unitsPanel() + assignPanel(); });
    wrap("adminDutyReport", function (html) { return html + excusePanel() + reportPanel(); });
    wrap("adminStaffReport", function (html) { return html + excusePanel() + assignPanel(); });
    wrap("adminStaffOne",   function (html) { return html + excusePanel(); });
    wrap("adminDutyApprovals", function (html) { return excusePanel() + html; });

    /* التقاط حالة الطلاب قبل النقل */
    var origMove = window.mvsMove;
    if (typeof origMove === "function") {
      window.mvsMove = function () {
        var ids = [];
        try { ids = Object.keys((typeof MVS !== "undefined" && MVS.sel) || {})
                 .filter(function (k) { return MVS.sel[k]; }); } catch (e) {}
        var before = snapshotStudents(ids);

        var out = origMove.apply(this, arguments);

        try {
          var logs = DBX().moveLog || [];
          var last = logs[logs.length - 1];
          if (last && !last.items) {
            last.items = before;
            last.by = USER().name || "—";
            persistSet("moveLog", last);
          }
        } catch (e) {}
        return out;
      };
    }

    /* زر التراجع داخل سجل النقل */
    var origHist = window.mvsHistory;
    if (typeof origHist === "function") {
      window.mvsHistory = function () {
        origHist.apply(this, arguments);
        try { addUndoButtons(); } catch (e) {}
      };
    }
  }

  function addUndoButtons() {
    var tbl = document.querySelector("#modalRoot table.ptable");
    if (!tbl) return;
    var logs = (DBX().moveLog || []).slice().sort(function (a, b) { return b.ts - a.ts; });

    var head = tbl.querySelector("thead tr");
    if (head && !head.querySelector("[data-undo-h]")) {
      var th = document.createElement("th");
      th.setAttribute("data-undo-h", "1");
      th.textContent = "";
      head.appendChild(th);
    }

    var rows = tbl.querySelectorAll("tbody tr");
    for (var i = 0; i < rows.length; i++) {
      var log = logs[i];
      if (!log || rows[i].querySelector("[data-undo]")) continue;
      var td = document.createElement("td");
      td.className = "cp-acts";
      if (log.undone) {
        td.innerHTML = '<span class="muted" style="font-size:11.5px">جرى التراجع عنها</span>';
      } else if (log.correction) {
        td.innerHTML = '<span class="pt-badge on">تصحيح</span>';
      } else if (Array.isArray(log.items) && log.items.length && isBoss()) {
        td.innerHTML = '<button data-undo class="btn btn-ghost btn-sm cp-danger" ' +
                       'onclick="window.mvUndo(\'' + E(log.id) + '\')">تراجع</button>';
      } else {
        td.innerHTML = '<span class="muted" style="font-size:11.5px">—</span>';
      }
      rows[i].appendChild(td);
    }
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