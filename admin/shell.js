window.SHELL_MODE = true;
/* =========================================================
   admin/shell.js — الغلاف المشترك لصفحات الإدارة (نسخة مقاومة للأعطال)
   ذات القرآنية — نظام إدارة الحلقات القرآنية
   ---------------------------------------------------------
   مبدأ العمل الجديد:
   • ترسم القائمة والمحتوى فوراً (قبل انتظار البيانات) => لا صفحة بيضاء.
   • تحمّل بيانات Firestore في الخلفية ثم تُحدّث العرض.
   • أي خطأ يظهر كرسالة واضحة داخل الصفحة بدل الفراغ.
   ---------------------------------------------------------
   سجل التعديلات المطبَّقة على هذا الملف
   ---------------------------------------------------------
   1) NAV_LABELS — أسماء القائمة الجانبية في كتلة واحدة أعلى الملف،
      تُعدَّل من مكان واحد وتنعكس على كل صفحات الإدارة.

   2) CHROME_WIRED — حارس يمنع ربط أزرار الشريط العلوي أكثر من مرة.
      السبب: onAuthStateChanged قد تُستدعى مرتين (تجديد الرمز)، فكان
      التوجّل يُنفَّذ مرتين ويبدو زر القائمة في الموبايل معطّلاً.

   3) BOOTED — حارس يمنع إعادة بناء الواجهة بالكامل عند تكرار
      onAuthStateChanged؛ الاستدعاء المتكرر يحدّث الشريط العلوي فقط.

   4) renderComplexSelect() — تُستدعى عند الإقلاع وبعد تحميل البيانات،
      فتظهر المجمعات الحقيقية في القائمة المنسدلة العلوية بدل قيم ثابتة.

   5) أُزيل التحميل المكرّر لـ ../topbar-dates.js — كان يُحمَّل هنا وفي
      وسم <script> داخل كل صفحة، فتُسجَّل مستمعات مكرّرة.

   ملاحظة مهمة: كل صفحة إدارة يجب أن تحتوي هذا السطر قبل app.js
                <script>window.__DEFER_INIT = true;</script>
                وإلا اشتغل app.js و shell.js معاً وتعطّل زر القائمة.
   ========================================================= */
"use strict";

(function () {
  const PAGE = window.ADMIN_PAGE || "dashboard";

  /* ═══════════════════════════════════════════════════════════════
     أسماء القائمة الجانبية — غيّر أي اسم من هنا فقط
     ───────────────────────────────────────────────────────────────
     • عدّل النص بين علامتَي التنصيص واحفظ الملف — يتغيّر في كل الصفحات.
     • لا تغيّر الكلمة التي على يسار النقطتين (dashboard, mosques …)
       لأنها اسم الصفحة الحقيقي في المشروع.
     • لإخفاء عنصر من القائمة: ضع "" بدل الاسم.
     ═══════════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════════
     أسماء القائمة الجانبية — غيّر أي اسم من هنا فقط
     ───────────────────────────────────────────────────────────────
     • عدّل النص بين علامتَي التنصيص واحفظ — يتغيّر في كل الصفحات.
     • لا تغيّر الكلمة التي على يسار النقطتين (اسم الصفحة الحقيقي).
     ═══════════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════════
     أسماء القائمة الجانبية — غيّر أي اسم من هنا فقط
     لا تغيّر الكلمة التي على يسار النقطتين (اسم الصفحة الحقيقي).
     ═══════════════════════════════════════════════════════════════ */
  const NAV_LABELS = {
    dashboard:   "لوحة التحكم",
    complexes:   "المنشآت التعليمية",
    mosques:     "المساجد",
    teachers:    "مدراء المنشآت",
    supervisors: "المشرفين / ات",

    reports:       "التقارير",
    repFacilities: "تقارير المنشآت",
    repStudents:   "تقارير الطلاب / ات",
    repCircles:    "تقارير الحلقات",
    repRecitation: "سجل التسميع",

    stats:        "الإحصائيات الشاملة",
    statsAll:     "الإحصائيات الشاملة",
    statsFac:     "إحصائيات المنشآت",
    statsCircles: "إحصائيات الحلقات",

    exams:        "الاختبارات",
    examsHome:    "لوحة التحكم",
    examsRecord:  "رصد الاختبارات",
    examsSheet:   "كشف اختبارات الطلاب / ات",
    examsLog:     "سجل اختبارات الطلاب / ات",
    examsRewards: "كشوف المكافآت",
    examsSettings:"إعدادات الاختبارات",

    move:         "إعادة التنقل والتسجيل",
    moveStudents: "نقل الطلاب",
    moveCircles:  "نقل الحلقات",
    moveRequests: "طلبات إضافة مستخدم",
    dutyApprovals: "اعتماد الواجبات",

    duty:         "إدارة الدوام",
    dutyHome:     "لوحة التحكم",
    dutyReport:   "تقرير الدوام",
    dutyStaff:    "تقرير الموظفين",
    dutyStaffOne: "تقرير الموظف",


    points:   "الإعدادات",
    users:    "المستخدمون والحسابات",
    settings: "إعدادات المرونة وسير العمل",

    /* غرف بُنيت ولا باب لها في القائمة: يُفتح لها هنا */
    ptsHome: "النقاط والتحفيز",
    store: "متجر الجوائز",
    payroll: "مسيّرات الرواتب",
    procEdu: "الإجراءات التعليمية",
    procAdm: "الإجراءات الإدارية",
    procReport: "كفاءة معالجة الإجراءات",
    motivation: "التحفيز والمكافآت",
    finance: "الشؤون المالية",
    procs: "الإجراءات والمتابعة",
    /* خمس صفحات أساسية موجودة ومسجّلة ولا باب لها في القائمة:
       الخطط والطلاب والحلقات والتحضير والبرامج — وهي صميم العمل اليومي. */
    plansPage:  "الخطط القرآنية",
    studentsPage: "الطلاب / ات",
    circlesPage: "الحلقات",
    attendPage: "التحضير اليومي",
    programsPage: "البرامج والمناهج",
    library: "مكتبة الخطط",
    daily: "العمل اليومي",

    bulk:       "إدارة العمليات الجماعية",
    bulkPlans:  "تعديل خطط التسميع",
    bulkMoveLv: "نقل وتعديل المستوى",
    bulkMove:   "نقل الطلاب",
    bulkLevels: "تعديل المستويات",

    audit: "سجل العمليات",
    outbox: "رسائل أولياء الأمور",
    admissions: "القبول والتسجيل"
  };

  /* الترتيب مطابق للنموذج المرجعي. الصفحات الباقية موزّعة داخل
     المجموعتين الأخيرتين حتى لا يفقد النظام أي صفحة. */
  const NAV_ADMIN = [
    { id: "dashboard",   file: "dashboard.html",   label: NAV_LABELS.dashboard,   icon: "pie" },
    { id: "complexes",   file: "complexes.html",   label: NAV_LABELS.complexes,   icon: "building", coll: "complexes" },
    /* المساجد كانت تبويباً داخل «المنشآت التعليمية». وعادت عنصراً مستقلاً
       لأن قائمة مدير المجمّع تبدأ بها، والملفُّ mosques.html قائمٌ أصلاً. */
    { id: "mosques",     file: "mosques.html",     label: NAV_LABELS.mosques,     icon: "mosque", coll: "mosques" },
    { id: "supervisors", file: "supervisors.html", label: NAV_LABELS.supervisors, icon: "person" },

    /* صفحاتٌ كانت داخل مجموعة «العمل اليومي» وحدها. صارت عناصرَ مستقلّةً
       لأن قوائم مدير المجمّع ومدير المسجد تعرضها في المستوى الأول.
       وهي باقيةٌ داخل المجموعة أيضاً لمن لا قائمةَ لدوره. */
    { id: "students",    file: "students.html",    label: NAV_LABELS.studentsPage, icon: "users",  coll: "students" },
    { id: "circles",     file: "circles.html",     label: NAV_LABELS.circlesPage,  icon: "book",   coll: "circles" },
    { id: "teachers",    file: "teachers.html",    label: NAV_LABELS.teachers,    icon: "person", coll: "teachers" },
    { id: "admissions",  file: "soon.html?p=admissions", label: NAV_LABELS.admissions, icon: "doc" },
    { id: "programs",    file: "programs.html",    label: NAV_LABELS.programsPage, icon: "program" },

    /* العمل اليومي: أكثر الصفحات استعمالاً — تُقدَّم على التقارير */
    { group: "daily", label: NAV_LABELS.daily, icon: "book", children: [
      { file: "attendance.html", label: NAV_LABELS.attendPage },
      { file: "students.html",   label: NAV_LABELS.studentsPage },
      { file: "soon.html?p=admissions", label: NAV_LABELS.admissions },
      { file: "circles.html",    label: NAV_LABELS.circlesPage },
      { file: "plans.html",      label: NAV_LABELS.plansPage },
      { file: "soon.html?p=library", label: NAV_LABELS.library },
      { file: "programs.html",   label: NAV_LABELS.programsPage }
    ]},

    { group: "reports", label: NAV_LABELS.reports, icon: "doc", children: [
      { file: "reports.html?r=facilities", label: NAV_LABELS.repFacilities },
      { file: "reports.html?r=students",   label: NAV_LABELS.repStudents },
      { file: "reports.html?r=circles",    label: NAV_LABELS.repCircles },
      { file: "reports.html?r=recitation", label: NAV_LABELS.repRecitation }
    ]},

    { group: "stats", label: NAV_LABELS.stats, icon: "bars", children: [
      { file: "statistics.html?s=all",        label: NAV_LABELS.statsAll },
      { file: "statistics.html?s=facilities", label: NAV_LABELS.statsFac },
      { file: "statistics.html?s=circles",    label: NAV_LABELS.statsCircles }
    ]},

    { group: "exams", label: NAV_LABELS.exams, icon: "exam", children: [
      { file: "soon.html?p=exams-home",     label: NAV_LABELS.examsHome },
      { file: "soon.html?p=exams-record",   label: NAV_LABELS.examsRecord },
      { file: "soon.html?p=exams-sheet",    label: NAV_LABELS.examsSheet },
      { file: "soon.html?p=exams-log",      label: NAV_LABELS.examsLog },
      { file: "soon.html?p=exams-rewards",  label: NAV_LABELS.examsRewards },
      { file: "soon.html?p=exams-settings", label: NAV_LABELS.examsSettings }
    ]},

    { group: "move", label: NAV_LABELS.move, icon: "swap", children: [
      { file: "soon.html?p=move-students", label: NAV_LABELS.moveStudents },
      { file: "soon.html?p=move-circles",  label: NAV_LABELS.moveCircles },
      { file: "soon.html?p=move-requests", label: NAV_LABELS.moveRequests },
      { file: "soon.html?p=duty-approvals", label: NAV_LABELS.dutyApprovals }
    ]},

    /* إدارةُ العمليات الجماعية: تعديلُ عشراتِ الطلاب في شاشةٍ واحدةٍ بدل
       فتح ملفِّ كلِّ طالبٍ على حدة. كانت معرّفةً في بنيةٍ قديمةٍ لا تُقرأ،
       فلم تظهر في أيّ قائمة. */
    { group: "bulk", label: NAV_LABELS.bulk, icon: "swap", children: [
      { file: "soon.html?p=bulk-plans",     label: NAV_LABELS.bulkPlans },
      { file: "soon.html?p=bulk-movelevel", label: NAV_LABELS.bulkMoveLv },
      { file: "soon.html?p=bulk-move",      label: NAV_LABELS.bulkMove },
      { file: "soon.html?p=bulk-levels",    label: NAV_LABELS.bulkLevels }
    ]},

    { group: "duty", label: NAV_LABELS.duty, icon: "clock", children: [
      { file: "soon.html?p=duty-home",     label: NAV_LABELS.dutyHome },
      { file: "soon.html?p=duty-report",   label: NAV_LABELS.dutyReport },
      { file: "soon.html?p=duty-staff",    label: NAV_LABELS.dutyStaff },
      { file: "soon.html?p=duty-staff-one",label: NAV_LABELS.dutyStaffOne }
    ]},

    /* الإجراءات التدرّجية: بطاقات التعثّر ومتابعة معالجتها */
    { group: "procs", label: NAV_LABELS.procs, icon: "flag", children: [
      { file: "soon.html?p=proc-edu",    label: NAV_LABELS.procEdu },
      { file: "soon.html?p=proc-adm",    label: NAV_LABELS.procAdm },
      { file: "soon.html?p=proc-report", label: NAV_LABELS.procReport },
      { file: "soon.html?p=audit",       label: NAV_LABELS.audit },
      { file: "soon.html?p=outbox",      label: NAV_LABELS.outbox }
    ]},

    /* التحفيز: نقاط الطلاب ومتجر الجوائز — شأنٌ تربويّ */
    { group: "motivation", label: NAV_LABELS.motivation, icon: "gift", children: [
      { file: "soon.html?p=points", label: NAV_LABELS.ptsHome }
    ]},

    /* الشؤون المالية: مفصولةٌ عن التحفيز — رواتبُ موظّفين لا مكافآتُ طلاب،
       ولها صلاحيّتها: يراها المدير ويُمنع منها المعلّم والمشرف. */
    { group: "finance", label: NAV_LABELS.finance, icon: "bank", children: [
      { file: "soon.html?p=payroll", label: NAV_LABELS.payroll }
    ]},

    /* «المستخدمون والحسابات» كانت متاحة من داخل الإعدادات فقط، فكان حساب
       بدور «معلم» لا يظهر في أي صفحة من القائمة الجانبية ويبدو مفقوداً. */
    { id: "users", file: "users.html", label: NAV_LABELS.users, icon: "person" },
    { id: "settings", file: "settings.html", label: NAV_LABELS.points, icon: "settings" }
  ];

  /* رسالة خطأ مرئية داخل الصفحة بدل الفراغ */
  function showFatal(title, detail) {
    const c = document.getElementById("pageContent");
    if (!c) { alert(title + "\n" + (detail || "")); return; }
    c.innerHTML =
      '<div style="max-width:520px;margin:60px auto;padding:28px;border:1px solid #f0d4d0;' +
      'background:#fdf5f4;border-radius:14px;text-align:center;font-family:system-ui,sans-serif">' +
      '<div style="font-size:34px;margin-bottom:8px">⚠️</div>' +
      '<h2 style="color:#b3261e;margin:0 0 8px;font-size:18px">' + title + '</h2>' +
      '<p style="color:#555;font-size:13.5px;line-height:1.7;margin:0">' + (detail || "") + '</p>' +
      '<p style="color:#999;font-size:12px;margin-top:14px">افتح أدوات المطور (F12) ← تبويب Console لرؤية التفاصيل.</p>' +
      '</div>';
  }

  /* تحقق أن app.js حُمِّل فعلاً */
  function appReady() {
    return typeof STATE !== "undefined" &&
           typeof mount === "function" &&
           typeof loadAllData === "function" &&
           typeof ic === "function";
  }

  function safe(fn) { try { return fn(); } catch (e) { console.error(e); } }

  /* المعامل الفرعي الحالي (?r= أو ?s=) لتحديد العنصر الفرعي النشط */
  function subKey() {
    var q = location.search;
    var m = q.match(/[?&](?:r|s|p)=([\w-]+)/);
    return m ? m[1] : "";
  }

  /* مسارٌ مطلق لروابط القائمة والشريط السفليّ.
     كانت الروابطُ نسبيّةً (complexes.html)، وهي تُحلّ بالنسبة إلى عنوان
     الصفحة الحالية. فإن كان العنوانُ جذرَ الموقع — كما يحدث حين يقدّم
     عاملُ الخدمة صفحةً محفوظةً عند انقطاع الشبكة، أو حين يُفتح النظام من
     اختصارٍ على الشاشة الرئيسية — حُلّ الرابطُ إلى /complexes.html ولا
     ملفَّ هناك، فتظهر صفحةُ Firebase «Page Not Found».
     صفحاتُ الإدارة كلُّها في /admin/ فيُصرَّح بالمجلّد ولا يُترك للتخمين. */
  function absFile(f) {
    var v = String(f || "");
    return /^(\/|https?:|#)/.test(v) ? v : "/admin/" + v;
  }

  function navChevron() {
    return '<svg class="nav-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
           'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M6 9l6 6 6-6"/></svg>';
  }

  function countOf(it) {
    if (!it.coll) return "";
    /* الرقمُ من cur() لا من DB مباشرةً: cur هي بوابةُ القراءة الوحيدة في
       app.js وتطبّق حصرَ النطاق — ومنه المنشأةُ التي دخلها المستخدم. فكان
       الشريطُ يعرض أرقامَ النظام كلِّه في مسجدٍ جديدٍ فارغ، ويقول «١٠ طلاب»
       والصفحةُ تحته صفر. والآن رقمُ الشريط هو رقمُ الصفحة نفسِه. */
    var arr = null;
    if (typeof window.cur === "function") {
      try { arr = window.cur(it.coll); } catch (e) { arr = null; }
    }
    if (!Array.isArray(arr)) {
      if (typeof DB === "undefined" || !Array.isArray(DB[it.coll])) return "";
      arr = DB[it.coll];
    }
    /* «مدراء المنشآت» يعرض المدراء وحدهم لمدير النظام، فيجب أن يعدّهم
       وحدهم. كان يعدّ سجلّ الكادر كلّه فيقول ٧ والصفحة تحته تعرض واحداً. */
    if (it.id === "teachers") {
      var r = myRole();
      /* عند مدير النظام: العددُ عددُ حسابات المدراء، وهو ما تعرضه
         الصفحةُ نفسُها — كان يعدّ سجلّات الكادر فيقول صفراً وللمساجد
         مدراء، أو يعدّ المعلّمين فيقول رقماً لا يطابق ما تحته. */
      if (typeof window.staffNavCount === "function") {
        var n = window.staffNavCount();
        if (n != null) return '<span class="nav-count">' + n + '</span>';
      }
    }
    return '<span class="nav-count">' + arr.length + '</span>';
  }

  function isChildActive(ch) {
    /* الصفحة الأساسية تُشتقّ من اسم الملف، والتمييز بين الفروع بالمعامل. */
    var base = ch.file.split("?")[0].replace(/\.html$/, "");
    if (base !== PAGE) return false;
    var want = (ch.file.match(/[?&](?:r|s|p)=([\w-]+)/) || [])[1] || "";
    var have = subKey();
    return want ? want === have : !have;
  }

  /* ═══════════════════════════════════════════════════════════════
     أبواب القائمة بحسب الدور
     ───────────────────────────────────────────────────────────────
     كانت القائمة واحدةً للجميع: يرى مديرُ المسجد «المنشآت التعليمية»
     و«المستخدمون» فيضغطها فيُردّ. الآن لا يُعرض إلا ما هو له.

     المفاتيح: id للعناصر المفردة، و group للمجموعات، وأسماءُ الملفات
     أو قيمةُ p للأبناء داخل المجموعة.

     ⚠ هذا إخفاءٌ لا حماية. الحمايةُ في canDo داخل app.js وفي
        firestore.rules على الخادم — ولا يُكتفى بهذا وحده أبداً.
     ═══════════════════════════════════════════════════════════════ */
  var NAV_ROLE = {
    /* مدير النظام: ستة أبوابٍ بطلب الإدارة. البقيّةُ إمّا عملُ منشأةٍ
       بعينها فمكانُها عند مديرها، وإمّا شاشاتٌ لا يفتحها من يدير النظام.
       والصفحاتُ المحجوبة تبقى قائمةً تُفتح بمسارها المباشر عند الحاجة —
       هذا إخفاءٌ من القائمة لا إلغاءٌ للصلاحية. */
    /* «طلبات إضافة مستخدم» أُضيفت وحدها من مجموعة move: اعتمادُ الحسابات
       يكتب في users، وقواعدُ Firestore تقصر الكتابة فيها على مدير النظام.
       فلو لم تظهر له لم يعتمدْها أحد. وبقيّةُ المجموعة تبقى مخفيّةً عنه. */
    admin: { top: ["dashboard", "complexes", "teachers", "settings"],
             groups: { reports: "*", stats: "*", move: ["move-requests"] } },
    owner: { top: ["dashboard", "complexes", "teachers", "settings"],
             groups: { reports: "*", stats: "*", move: ["move-requests"] } },

    complexManager: {
      top: ["dashboard", "mosques", "supervisors", "admissions", "programs", "settings"],
      /* اسمُ الصفحة يختلف باختلاف من ينظر إليها: صفحةُ المشرفين نفسُها
         هي «مدراء المساجد» في عين مدير المجمّع. */
      labels: { supervisors: "مدراء المساجد" },
      groups: {
        reports: "*", stats: "*", exams: "*",
        move:    "*", bulk: "*", duty: "*", finance: "*"
      }
    },
    /* المشرف: عملُه على الطلاب والحلقات والمعلّمين في مسجده — إجراءاتٌ
       تعليميةٌ وإدارية، ونقاطُ تحفيزٍ وخصمُها، وتعديلُ خطط التسميع ونقلُ
       الطلاب. ولا حسابات ولا مالٌ ولا إعدادات: تلك شأنُ من فوقه. */
    supervisor: {
      top: ["dashboard", "students", "circles", "teachers"],
      labels: { teachers: "المعلمين" },
      groups: {
        procs: "*",
        motivation: "*",
        bulk: ["bulk-plans", "bulk-move"]
      }
    },

    mosqueManager: {
      /* «المستخدمون والحسابات» أُزيل: إدارةُ الحسابات ليست من عمل مدير
         المسجد. و«تقارير المنشآت» و«إحصائيات المنشآت» أُزيلتا كذلك —
         شأنُ من يشرف على أكثر من منشأة، ومديرُ المسجد له منشأةٌ واحدة. */
      top: ["dashboard", "students", "circles", "teachers", "programs", "settings"],
      labels: { teachers: "المعلمين والمشرفين" },
      groups: {
        reports: ["reports-students", "reports-circles", "reports-recitation"],
        stats:   ["statistics-all", "statistics-circles"],
        exams: "*", move: "*", bulk: "*", duty: "*", procs: "*", motivation: "*", finance: "*"
      }
    }
  };

  /* مفتاحُ الابن: قيمة p إن كان يمرّ بالموزّع، وإلا اسمُ الملف بلا امتداد */
  function childKey(file) {
    var q = String(file || "").split("?");
    var base = q[0].replace(/\.html$/, "");
    var pm = (q[1] || "").match(/(?:^|&)p=([^&]+)/);
    if (pm) return decodeURIComponent(pm[1]);
    /* فروعُ التقارير والإحصاءات تتمايز بالمعامل r= و s= لا بالملف —
       وكان المفتاحُ اسمَ الملف وحده، فالأربعةُ مفتاحٌ واحد ولا يمكن
       السماحُ بواحدٍ دون أخيه. */
    var rs = (q[1] || "").match(/(?:^|&)[rs]=([^&]+)/);
    if (rs) return base + "-" + decodeURIComponent(rs[1]);
    return base;
  }

  function myRole() {
    try {
      var u = (window.STATE && window.STATE.user) || {};
      return String(u.role || "");
    } catch (e) { return ""; }
  }

  /* يُرجع NAV_ADMIN مرشَّحاً بدور صاحب الجلسة — أو كما هو لمن لا قائمة له */
  function navForRole() {
    var conf = NAV_ROLE[myRole()];
    if (!conf) return NAV_ADMIN;

    var out = [];
    NAV_ADMIN.forEach(function (it) {
      if (it.children) {
        var allow = conf.groups[it.group];
        if (!allow) return;
        if (allow === "*") { out.push(it); return; }
        var kids = it.children.filter(function (c) {
          return allow.indexOf(childKey(c.file)) > -1;
        });
        if (kids.length) {
          /* نسخةٌ جديدة: تعديلُ الأصل يُفسد القائمة عند إعادة البناء */
          var copy = {};
          Object.keys(it).forEach(function (k) { copy[k] = it[k]; });
          copy.children = kids;
          out.push(copy);
        }
        return;
      }
      if (conf.top.indexOf(it.id) > -1) {
        /* اسمٌ خاصٌّ بالدور إن وُجد — نسخةٌ جديدة لئلّا يُغيَّر الأصل
           فيتسرّب الاسمُ إلى بقيّة الأدوار عند إعادة البناء. */
        var lbl = conf.labels && conf.labels[it.id];
        if (lbl) {
          var c2 = {};
          Object.keys(it).forEach(function (k) { c2[k] = it[k]; });
          c2.label = lbl;
          out.push(c2);
        } else out.push(it);
      }
    });
    return out;
  }

  /* ═══════════════════════════════════════════════════════════════
     قائمةُ المنشأة — تحلّ محلَّ قائمة النظام بعد الدخول إلى مسجدٍ أو مجمّع
     ───────────────────────────────────────────────────────────────
     الداخلُ إلى منشأةٍ يعمل داخلها لا في النظام كلِّه، فتُبدَّل القائمةُ
     بأقسامها هي: لوحتُها وطلابُها ومعلّموها ومشرفوها وحلقاتها وأرقامُها.
     وأوّلُ عنصرٍ رجوعٌ إلى القائمة العامّة كي لا يُحبس فيها.
     الأقسامُ تُقرأ من FAC_SECTIONS في app.js فلا تُكتب مرّتين.
     ═══════════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════════
     نوافذُ المنشأة — قائمةُ مديرها يراها مديرُ النظام بعد الدخول إليها
     ───────────────────────────────────────────────────────────────
     الداخلُ إلى مجمّعٍ ينظر فيه بعينِ مدير المجمّع، والداخلُ إلى مسجدٍ
     بعينِ مدير المسجد. فلا قائمةَ ثالثةٌ تُكتب وتُصان: تُعاد قائمةُ الدور
     نفسِها من NAV_ROLE، فما يُغيَّر هناك يظهر هنا بلا تكرار.

     ولا تظهر إلا لمدير النظام: مديرُ المنشأة يرى قائمتَه أصلاً في كلّ
     صفحة، فتبديلُها له تكرارٌ بلا معنى.

     السياقُ يُحفظ في الجلسة لأن STATE يبدأ من جديد مع كلّ صفحة، فتبقى
     القائمةُ ثابتةً ما دام المستخدمُ داخل المنشأة، ويُمحى عند «رجوع».
     ═══════════════════════════════════════════════════════════════ */
  var FAC_CTX_KEY = "__facCtx";

  function facCtx() {
    try {
      var raw = sessionStorage.getItem(FAC_CTX_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function isTopAdmin() {
    var r = myRole();
    return r === "admin" || r === "owner";
  }

  /* أسماءٌ خاصّةٌ بنافذة المنشأة — بطلب الإدارة */
  var FAC_LABELS = {
    complexes: { supervisors: "مدراء المساجد" },
    mosques:   { teachers: "المعلمين والمشرفين" }
  };

  /* «المستخدمون والحسابات» في قائمة مدير المسجد لا في نافذة المسجد:
     مديرُ النظام يبلغها من قائمته هو، ونافذةُ المنشأة لعمل المنشأة. */
  var FAC_HIDE = { mosques: ["users"], complexes: [] };

  function facilityNavHTML() {
    var ctx = facCtx();
    if (!ctx || !isTopAdmin()) return "";

    var roleKey = ctx.coll === "complexes" ? "complexManager" : "mosqueManager";
    var conf = NAV_ROLE[roleKey];
    if (!conf) return "";

    var over = FAC_LABELS[ctx.coll] || {};
    /* اسمُ المنشأة في رأس القائمة: كان الدليلُ الوحيدُ على أنّك داخلها
       زرَّ الرجوع، فيظنّ مديرُ النظام أنه في القائمة العامّة ويستغرب
       نقصانَ الأرقام — وهي أرقامُ منشأةٍ واحدةٍ لا أرقامُ النظام. */
    var arr = (ctx.coll === "complexes" ? DB.complexes : DB.mosques) || [];
    var rec = arr.filter(function (x) { return String(x.id) === String(ctx.id); })[0] || {};
    var head = '<div class="nav-fachead">' +
                 '<span class="nav-fachead-kind">' +
                   (ctx.coll === "complexes" ? "مجمّع" : "مسجد") + "</span>" +
                 '<strong>' + (rec.name || "—") + "</strong>" +
               "</div>";

    var back = head +
               '<button type="button" class="nav-item" data-action="fac-back">' +
               ic("arrowLeft", 19) + "<span>رجوع للقائمة</span></button>" +
               '<div class="nav-sep"></div>';

    var out = [];
    NAV_ADMIN.forEach(function (it) {
      if (it.children) {
        var allow = conf.groups[it.group];
        if (!allow) return;
        var kids = allow === "*" ? it.children : it.children.filter(function (c) {
          return allow.indexOf(childKey(c.file)) > -1;
        });
        if (!kids.length) return;
        out.push('<div class="nav-group" data-group="' + it.group + '">' +
                   '<button type="button" class="nav-item nav-toggle">' +
                     ic(it.icon, 19) + "<span>" + it.label + "</span>" + navChevron() +
                   "</button>" +
                   '<div class="nav-sublist"><div class="nav-sublist-in">' +
                     kids.map(function (ch) {
                       return '<a class="nav-sub" href="' + absFile(ch.file) + '"><span>' + ch.label + "</span></a>";
                     }).join("") +
                   "</div></div></div>");
        return;
      }
      if (conf.top.indexOf(it.id) < 0) return;
      if ((FAC_HIDE[ctx.coll] || []).indexOf(it.id) > -1) return;
      var label = over[it.id] || (conf.labels && conf.labels[it.id]) || it.label;
      var active = it.id === PAGE ? " active" : "";
      out.push('<a class="nav-item' + active + '" href="' + absFile(it.file) + '">' +
               ic(it.icon, 19) + "<span>" + label + "</span>" + countOf(it) + "</a>");
    });

    return back + out.join("");
  }

  /* طيُّ مجموعات نافذة المنشأة — واحدةٌ مفتوحةٌ لا غير */
  function wireFacilityGroups(nav) {
    nav.querySelectorAll(".nav-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var g = btn.closest(".nav-group");
        var willOpen = !g.classList.contains("open");
        nav.querySelectorAll(".nav-group.open").forEach(function (x) {
          if (x !== g) x.classList.remove("open");
        });
        g.classList.toggle("open", willOpen);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     شريطُ التنقّل السفليّ في صفحات الإدارة
     ───────────────────────────────────────────────────────────────
     الشريطُ موجودٌ في كلّ صفحة (nav#tabbar) ومنسَّقٌ في styles.css، لكنّه
     كان يبقى فارغاً أبداً في الإدارة لسببين: TABBAR في app.js لا مدخلَ
     فيها لواجهة admin، و renderTabBar لا تُستدعى إلا من renderNav — وهي
     مستبدَلةٌ هنا بـ buildSidebarNav. فكان درجُ القائمة هو السبيلَ
     الوحيد للتنقّل على الهاتف: ضغطتان لكلّ انتقال.

     يُبنى من بنود الدور نفسِها (أو من نافذة المنشأة إن كنّا داخلها)،
     فلا قائمةَ ثانيةٌ تُصان، ولا يظهر للمستخدم بابٌ ليس له.
     ═══════════════════════════════════════════════════════════════ */
  function buildTabBar() {
    var el = document.getElementById("tabbar");
    if (!el) return;

    var ctx = facCtx();
    var items = [];

    if (ctx && isTopAdmin()) {
      /* داخل منشأة: أوّلُ بنود نافذتها */
      var roleKey = ctx.coll === "complexes" ? "complexManager" : "mosqueManager";
      var conf = NAV_ROLE[roleKey];
      if (conf) {
        NAV_ADMIN.forEach(function (it) {
          if (!it.children && conf.top.indexOf(it.id) > -1) items.push(it);
        });
      }
    } else {
      navForRole().forEach(function (it) { if (!it.children) items.push(it); });
    }

    /* أربعةٌ لا أكثر: الإبهامُ لا يصيب أكثرَ من ذلك في عرض الهاتف */
    items = items.slice(0, 4);
    if (items.length < 2) { el.innerHTML = ""; el.style.display = "none"; return; }

    el.style.display = "";
    el.innerHTML = items.map(function (it) {
      return '<a class="tb-item' + (it.id === PAGE ? " on" : "") + '" href="' + absFile(it.file) + '">' +
             ic(it.icon, 21) + "<span>" + it.label + "</span></a>";
    }).join("");
  }

  function buildSidebarNav() {
    const nav = document.getElementById("nav");
    if (!nav) return;

    /* داخل منشأة: نافذتُها هي المعروضة */
    var facHTML = facilityNavHTML();
    if (facHTML) {
      nav.innerHTML = facHTML;
      wireFacilityGroups(nav);
      buildTabBar();
      return;
    }

    nav.innerHTML = navForRole().map(function (it) {
      /* ---- مجموعة قابلة للطي ---- */
      if (it.children) {
        /* واحدةٌ مفتوحةٌ لا غير: كانت كلُّ مجموعةٍ تفتح على حدة فتطول
           القائمةُ حتى يضيع المرءُ فيها. */
        var anyActive = it.children.some(isChildActive);
        var open = anyActive || localStorage.getItem("nav_open_one") === it.group;
        var kids = it.children.map(function (ch) {
          return '<a class="nav-sub' + (isChildActive(ch) ? " active" : "") + '" href="' + absFile(ch.file) + '">' +
                 '<span>' + ch.label + '</span></a>';
        }).join("");
        return '<div class="nav-group' + (open ? " open" : "") + '" data-group="' + it.group + '">' +
                 '<button type="button" class="nav-item nav-toggle' + (anyActive ? " has-active" : "") + '">' +
                   ic(it.icon, 19) + '<span>' + it.label + '</span>' + navChevron() +
                 '</button>' +
                 '<div class="nav-sublist"><div class="nav-sublist-in">' + kids + '</div></div>' +
               '</div>';
      }
      /* ---- عنصر عادي ---- */
      var active = it.id === PAGE ? "active" : "";
      return '<a class="nav-item ' + active + '" href="' + absFile(it.file) + '">' + ic(it.icon, 19) +
             '<span>' + it.label + '</span>' + countOf(it) + '</a>';
    }).join("");

    buildTabBar();

    /* فتح وطي المجموعات مع حفظ الحالة */
    nav.querySelectorAll(".nav-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var g = btn.closest(".nav-group");
        var willOpen = !g.classList.contains("open");
        nav.querySelectorAll(".nav-group.open").forEach(function (x) {
          if (x !== g) x.classList.remove("open");
        });
        g.classList.toggle("open", willOpen);
        try { localStorage.setItem("nav_open_one", willOpen ? g.dataset.group : ""); } catch (e) {}
      });
    });
  }

  function ensureCollections() {
    if (typeof COLLECTIONS === "undefined" || typeof DB === "undefined") return;
    COLLECTIONS.forEach(function (c) { if (!Array.isArray(DB[c])) DB[c] = []; });
  }

  function renderPage() {
    safe(function () {
      try { mount(); }
      catch (e) { console.error("mount error:", e); showFatal("تعذّر عرض محتوى الصفحة", "خطأ برمجي أثناء الرسم: " + (e.message || e)); }
    });
    if (typeof window.ADMIN_PAGE_INIT === "function") safe(window.ADMIN_PAGE_INIT);
  }

  function setTopbar(profile) {
    const nameEl = document.getElementById("userName");
    const roleEl = document.getElementById("userRole");
    const avEl = document.querySelector(".avatar");
    if (nameEl) nameEl.textContent = profile.name || profile.email || "—";
    /* كان كلُّ من ليس «مشرفاً» يُسمّى «مدير النظام» — فيقرأ مديرُ المسجد
       عن نفسه أنه مدير النظام. الاسم الآن من الدور نفسه. */
    var ROLE_AR = {
      owner: "مالك النظام", admin: "مدير النظام",
      complexManager: "مدير المجمّع", mosqueManager: "مدير المسجد",
      supervisor: "مشرف", donor: "داعم", teacher: "معلّم"
    };
    if (roleEl) roleEl.textContent = ROLE_AR[profile.role] || "مدير النظام";
    if (avEl && typeof initials === "function") avEl.textContent = initials(profile.name || profile.email || "?");
  }

  var CHROME_WIRED = false;
  function wireChrome() {
    /* onAuthStateChanged قد يُستدعى أكثر من مرة (تجديد الرمز مثلاً)،
       فلو ربطنا الأزرار كل مرة يتنفّذ التوجّل مرتين ويبدو الزر معطّلاً. */
    if (CHROME_WIRED) return;
    CHROME_WIRED = true;
    const menu = document.getElementById("menuToggle");
    const overlay = document.getElementById("overlay");
    const sidebar = document.getElementById("sidebar");
    if (menu) menu.addEventListener("click", function () { sidebar.classList.toggle("open"); overlay.classList.toggle("show"); });
    if (overlay) overlay.addEventListener("click", function () { sidebar.classList.remove("open"); overlay.classList.remove("show"); });

    const btnRefresh = document.getElementById("btnRefresh");
    if (btnRefresh) btnRefresh.addEventListener("click", function () {
      if (typeof showToast === "function") showToast("جارٍ تحديث البيانات…", "info");
      loadData(true);
    });
    const btnNotif = document.getElementById("btnNotif");
    if (btnNotif) btnNotif.addEventListener("click", function () { if (typeof openNotifPanel === "function") openNotifPanel(); });
    const btnMsg = document.getElementById("btnMsg");
    if (btnMsg) btnMsg.addEventListener("click", function () { if (typeof openMsgPanel === "function") openMsgPanel(); });
    // التواريخ قابلة للتعديل بالنقر
    document.querySelectorAll(".filter-date").forEach(function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", function () { if (typeof openDatePicker === "function") openDatePicker(el); });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (typeof closeModal === "function") closeModal(); if (typeof closePanel === "function") closePanel(); }
    });
    ensureLogoutButton();
  }

  function ensureLogoutButton() {
    if (document.getElementById("logoutBtn")) return;
    const foot = document.querySelector(".sidebar-foot");
    if (!foot) return;
    const btn = document.createElement("button");
    btn.id = "logoutBtn"; btn.type = "button"; btn.textContent = "تسجيل الخروج";
    btn.style.cssText =
      "width:100%;margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.25);" +
      "background:rgba(255,255,255,.08);color:#fff;border-radius:10px;cursor:pointer;font-family:inherit;font-size:13px;";
    btn.addEventListener("click", async function () {
      /* الخروج المتعمَّد يعود إلى صفحة الترحيب */
      if (window.__auth) { try { await window.__auth.signOut(); } catch (e) {} }
      try { sessionStorage.removeItem("__nav"); } catch (e) {}
      /* كان يعود إلى /landing.html وهي غير موجودة في المشروع،
         فكلُّ خروجٍ ينتهي بصفحة Page Not Found من Firebase. */
      location.href = "/login.html";
    });
    foot.appendChild(btn);
  }

  /* تحميل البيانات في الخلفية ثم تحديث العرض (لا يحجب الرسم) */
  function killVeil() {
    // إزالة أي طبقة تحميل حاجبة قد تمنع الضغط على الأزرار
    var v = document.getElementById("loadingVeil");
    if (v) v.remove();
    if (typeof showLoading === "function") { try { showLoading(false); } catch (e) {} }
  }

  function loadData(isRefresh) {
    // لا نعرض طبقة تحميل تحجب الشاشة؛ نحمّل في الخلفية والمحتوى ظاهر وقابل للضغط
    killVeil();

    /* إعادة الرسم بعد كل دفعة بيانات (الكاش أولاً ثم السيرفر) */
    function apply() {
      killVeil();
      ensureCollections();
      if (typeof updateConnBadge === "function") updateConnBadge();
      if (typeof renderComplexSelect === "function") safe(renderComplexSelect);
      buildSidebarNav();
      renderPage();
    }

    /* زر «تحديث» يتجاوز الكاش ويقرأ من السيرفر مباشرة، أما التحميل العادي
       فيرسم من الكاش المحلي فوراً ثم يحدّث من السيرفر في الخلفية. */
    var job = (!isRefresh && typeof loadDataFast === "function")
      ? loadDataFast(apply)
      : Promise.resolve()
          .then(function () { return loadAllData("server"); })
          .catch(function (e) { console.warn("Firestore load failed:", e); })
          .then(apply);

    job.then(function () {
      if (isRefresh && typeof showToast === "function") showToast("تم تحديث البيانات");
    }).catch(function (e) { console.error(e); killVeil(); });

    // أمان إضافي: أزل الطبقة بعد 6 ثوانٍ مهما حدث
    setTimeout(killVeil, 6000);
  }

  /* الرسم الفوري ثم التحميل */
  var BOOTED = false;
  function boot(profile) {
    /* نطاق الرؤية — يجب أن يُضبط قبل أي رسم.
       cur() في app.js هي البوابة الوحيدة لقراءة البيانات، وهي تستدعي
       scopeOf() التي تقرأ STATE.user. وبما أن STATE.user لم يكن يُضبط في أي
       مكان، كانت scopeOf() تُرجع null دائماً فلا يُطبَّق أي حصر، ويرى
       المشرفُ المرتبطُ بمسجد أو مجمع بياناتِ النظام كلَّها.
       يُضبط خارج حارس BOOTED ليُحدَّث أيضاً عند تجديد رمز المصادقة. */
    if (typeof STATE !== "undefined") {
      STATE.user = {
        uid:       profile.uid || "",
        name:      profile.name || "",
        email:     profile.email || "",
        role:      profile.role || "",
        mosqueId:  profile.mosqueId || "",
        complexId: profile.complexId || "",
        /* scopeIds كان يسقط هنا: من أُسنِد إليه مسجدان يعود إلى الأول
           وحده في صفحات الإدارة، فيختفي عنه نصفُ عمله بلا سبب ظاهر.
           وهو المصدر الذي يقرأه userScopeOf في الترشيح كلّه. */
        scopeIds:  Array.isArray(profile.scopeIds) ? profile.scopeIds : [],
        circleIds: Array.isArray(profile.circleIds) ? profile.circleIds : [],
        teacherId: profile.teacherId || "",
        studentId: profile.studentId || "",
        studentIds: Array.isArray(profile.studentIds) ? profile.studentIds : [],
        active:    profile.active !== false
      };
    }

    /* إعادة الاستدعاء تُحدّث الشريط العلوي فقط، ولا تعيد بناء كل شيء. */
    if (BOOTED) { setTopbar(profile); return; }
    BOOTED = true;
    if (typeof STATE !== "undefined") { STATE.iface = "admin"; STATE.page = PAGE; STATE.planId = null; }
    setTopbar(profile);
    if (typeof loadCache === "function") { try { loadCache(); } catch (e) {} }
    ensureCollections();
    if (typeof renderComplexSelect === "function") safe(renderComplexSelect);
    buildSidebarNav();                 // القائمة تظهر فوراً
    if (typeof updateConnBadge === "function") updateConnBadge();
    renderPage();                      // المحتوى يظهر فوراً (ببيانات فارغة إن لزم)
    wireChrome();
    killVeil();                        // تأكيد عدم وجود طبقة حاجبة
    loadData(false);                   // ثم نجلب البيانات ونحدّث
  }

  /* نُبدّل renderNav العام حتى تبقى الروابط بعد أي إعادة تحميل داخلي */
  document.addEventListener("DOMContentLoaded", function () {
    if (!appReady()) {
      showFatal("لم يتم تحميل app.js",
        "تأكد أن ملف app.js موجود في الجذر وأن المسار «../app.js» صحيح، وأنك تفتح الموقع عبر خادم (وليس file://).");
      return;
    }
    try { renderNav = buildSidebarNav; } catch (e) { /* تجاهل */ }

    /* حارس التحويل — يكسر دورة إعادة التوجيه بين صفحات الحراسة */
    function safeGo(url, why) {
      try {
        var now = Date.now();
        var raw = sessionStorage.getItem("__nav") || "";
        var arr = raw ? raw.split(",").map(Number).filter(function (t) { return now - t < 10000; }) : [];
        arr.push(now);
        sessionStorage.setItem("__nav", arr.join(","));
        if (arr.length > 4) { navStop(why); return; }
      } catch (e) {}
      location.href = url;
    }

    function navStop(msg) {
      document.body.style.cssText =
        "margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
        "background:#01343a;font-family:Tajawal,system-ui,sans-serif;padding:24px";
      document.body.innerHTML =
        '<div style="max-width:440px;background:#fff;border-radius:20px;padding:32px 28px;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.4)">' +
          '<h2 style="font-size:19px;color:#01343a;margin:0 0 10px">تعذّر إكمال تسجيل الدخول</h2>' +
          '<p style="color:#5d6b74;font-size:14px;line-height:1.9;margin:0 0 8px">' + (msg || "تعذّر تحديد صلاحيات حسابك") + '.</p>' +
          '<p style="color:#8e9aa2;font-size:12.5px;line-height:1.8;margin:0 0 22px">راجع إدارة النظام للتأكد من تفعيل حسابك وربطه بمنشأتك.</p>' +
          '<a href="/login.html" style="display:block;padding:13px;border-radius:11px;background:#0b7f83;color:#fff;text-decoration:none;font-weight:700;font-size:15px">العودة لتسجيل الدخول</a>' +
        '</div>';
      try { sessionStorage.removeItem("__nav"); } catch (e) {}
    }

    const auth = window.__auth;
    if (!auth) { safeGo("/login.html", "خدمة المصادقة غير مهيّأة"); return; }

    auth.onAuthStateChanged(async function (user) {
      if (!user) { safeGo("/login.html", "لم يُسجَّل الدخول"); return; }
      try {
        const db = window.__db;
        const snap = db ? await db.collection("users").doc(user.uid).get() : null;
        /* لا ملف مستخدم = لا صلاحية.
           كان هنا منطق يمنح دور admin تلقائياً لأي حساب بلا ملف — أي أن فتح
           رابط لوحة الإدارة مباشرةً كان يكفي ليصير صاحبه مدير نظام. أُزيل.
           الملفات تُنشأ من login.html أو من صفحة «المستخدمون والحسابات». */
        if (!snap || !snap.exists) {
          safeGo("/login.html", "لا يوجد ملف مستخدم لحسابك");
          return;
        }
        const d = snap.data() || {};
        /* الأدوار الإدارية الأربعة — كانت البوابة تعرف دورين فيُطرد
           مديرُ المجمّع ومديرُ المسجد إلى index.html بلا سبب ظاهر. */
        var ADMIN_ROLES = ["admin", "owner", "supervisor", "complexManager", "mosqueManager"];
        const isAdmin = d.active !== false && ADMIN_ROLES.indexOf(d.role) > -1;
        if (!isAdmin) { safeGo("/index.html", "حسابك ليس إدارياً"); return; }
        /* mosqueId و complexId يمرَّران ليعمل حصر النطاق في cur() */
        try { sessionStorage.removeItem("__nav"); } catch (e) {}
        boot({
          uid: user.uid, name: d.name || user.email, email: user.email, role: d.role,
          mosqueId: d.mosqueId || "", complexId: d.complexId || "",
          /* scopeIds هي مصدر الحصر في cur() — كانت تسقط هنا فيُقرأ الحقلُ
             المفرد وحده، ومن أُسنِد إلى مسجدين يرى واحداً. */
          scopeIds: Array.isArray(d.scopeIds) ? d.scopeIds : [],
          /* كانا مفقودين هنا فلا يصلان إلى STATE.user ولا تعمل myCircles() */
          circleIds: d.circleIds || [], studentId: d.studentId || "",
          studentIds: Array.isArray(d.studentIds) ? d.studentIds : [],
          teacherId: d.teacherId || "", active: d.active !== false
        });
      } catch (e) {
        console.error(e);
        showFatal("تعذّر التحقق من الحساب", (e && e.message) || "خطأ غير معروف.");
      }
    });
  });

  /* خريطة معرّف الصفحة -> ملفها، ليعرف app.js أين ينتقل */
  window.__adminFiles = (function () {
    var m = {};
    /* من القائمة الكاملة لا المرشّحة: الخريطة تُبنى مرّةً عند الإقلاع
       وقد يُفتح المسارُ من بطاقةٍ لا من القائمة. */
    NAV_ADMIN.forEach(function (it) {
      if (it.children) it.children.forEach(function (c) {
        /* الشاشات التي تعمل عبر موزّع: soon.html?p=exams-record
           كانت تُسجَّل بمفتاح "soon" — الجزء قبل علامة الاستفهام — فتكتب
           الشاشات بعضها فوق بعض ولا تبقى إلا الأخيرة، ويفشل الانتقال إلى
           البقية لأن go() تبحث عن ملف باسمها فلا تجده.
           المفتاح الآن قيمة p إن وُجدت، وإلا اسم الملف. */
        var base = c.file.split("?")[0].replace(/\.html$/, "");
        var q = c.file.split("?")[1] || "";
        var pm = q.match(/(?:^|&)p=([^&]+)/);
        m[pm ? decodeURIComponent(pm[1]) : base] = c.file;
        if (pm && !m[base]) m[base] = base + ".html";
      });
      else if (it.file) m[it.id] = it.file;
    });
    /* صفحات موجودة لكنها غير مدرجة في القائمة الجانبية — تُفتح من بطاقات
       لوحة التحكم، فنثبّتها هنا بدل الاعتماد على الافتراض في go() */
    m.users      = m.users      || "users.html";
    m.circles    = m.circles    || "circles.html";
    m.students   = m.students   || "students.html";
    m.programs   = m.programs   || "programs.html";
    m.plans      = m.plans      || "plans.html";
    m.attendance = m.attendance || "attendance.html";
    /* أسماء بديلة تُستعمل داخل app.js */
    m.facilities = m.complexes || "complexes.html";
    m.managers   = m.teachers  || "teachers.html";
    m.mosques    = m.mosques   || "mosques.html";
    return m;
  })();

  window.__adminBuildNav = buildSidebarNav;
  /* ملاحظة: topbar-dates.js يُحمَّل من وسم <script> في كل صفحة إدارة.
     كان يُحمَّل هنا مرة ثانية فيُسجّل مستمعات مكرّرة — أُزيل التحميل المكرّر. */
})();

/* =========================================================================
   مساعد التمرير في القائمة الجانبية
   -------------------------------------------------------------------------
   زر دائري صغير يظهر أسفل القائمة حين تبقى عناصر تحت حدّ الشاشة، ويختفي
   عند الوصول إلى القاع. مستقل تماماً عن بقية shell.js: يراقب #nav بـ
   MutationObserver فيعمل مع أي إعادة بناء للقائمة بلا ربط بدوالها.
   ========================================================================= */
(function () {
  "use strict";

  var STEP = 0.8;   /* نسبة من ارتفاع القائمة في كل نقرة */
  var EDGE = 24;    /* بقاء أقل من هذا بالبكسل = وصلنا القاع */

  function init() {
    var sidebar = document.getElementById("sidebar");
    var nav = document.getElementById("nav");
    if (!sidebar || !nav || document.getElementById("navScrollDown")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "navScrollDown";
    btn.className = "nav-scroll-down";
    btn.setAttribute("aria-label", "النزول إلى بقية عناصر القائمة");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
      'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    sidebar.appendChild(btn);

    function update() {
      var foot = sidebar.querySelector(".sidebar-foot");
      btn.style.bottom = ((foot ? foot.offsetHeight : 60) + 12) + "px";
      var remaining = nav.scrollHeight - nav.scrollTop - nav.clientHeight;
      if (remaining > EDGE) btn.classList.add("show");
      else btn.classList.remove("show");
    }

    btn.addEventListener("click", function () {
      var step = Math.max(120, nav.clientHeight * STEP);
      if (typeof nav.scrollBy === "function") {
        nav.scrollBy({ top: step, behavior: "smooth" });
      } else {
        nav.scrollTop += step;
      }
    });

    try { nav.addEventListener("scroll", update, { passive: true }); }
    catch (e) { nav.addEventListener("scroll", update); }
    window.addEventListener("resize", update);

    /* القائمة تُبنى وتُعاد بناؤها من buildSidebarNav، والمراقب يغنينا عن
       تعديل تلك الدالة أو انتظارها. */
    if (typeof MutationObserver === "function") {
      new MutationObserver(update).observe(nav, { childList: true, subtree: true });
    }

    update();
    setTimeout(update, 500);   /* بعد وصول البيانات وبناء القائمة كاملة */
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();