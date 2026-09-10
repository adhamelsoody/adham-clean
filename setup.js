/* =========================================================================
   تركيب.js — يعمل كل شيء دفعة واحدة
   -------------------------------------------------------------------------
   ١) يصلّح app2.js المفقود في كل صفحات HTML  ← هذا سبب «لم يتم تحميل app.js»
   ٢) يربط governance.css و governance.js بكل الصفحات
   ٣) يبصم رقم نسخة جديد على كل الوسوم (يستدعي bump.js إن وُجد)

   لا تشغّله يدوياً — انقر «تركيب.bat» مرتين.
   ========================================================================= */
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;

const SKIP = new Set(["node_modules", ".git", ".firebase", ".vscode", "quran"]);
const line = "─".repeat(58);

function htmlFiles(dir, out) {
  out = out || [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) htmlFiles(full, out);
    else if (name.toLowerCase().endsWith(".html")) out.push(full);
  }
  return out;
}

/* ملف نصي بلا BOM — الترميز مهم وإلا تلفت العربية في الصفحات */
const read  = f => fs.readFileSync(f, "utf8");
const write = (f, s) => fs.writeFileSync(f, s, "utf8");

console.log("\n" + line);
console.log("  تركيب تحديثات النظام");
console.log(line);

/* ---------- تحقّق أننا في جذر المشروع ---------- */
if (!fs.existsSync(path.join(ROOT, "firebase.json"))) {
  console.log("\n  ✗ هذا ليس مجلد المشروع.");
  console.log("    ضع هذا الملف بجوار firebase.json و app.js ثم أعد المحاولة.\n");
  process.exit(1);
}

const files = htmlFiles(ROOT);

/* =========================================================================
   الإضافات تُربط بما هو موجود في المجلد
   -------------------------------------------------------------------------
   كانت القائمة تفترض حزمةً واحدةً مدمجة (mirath-plus.js) وتنزع وسوم
   الملفات المنفصلة من كل صفحة. فإن غابت الحزمة — وهي غائبة — نُزعت
   الوسوم ولم يُربط بديلٌ عنها: تبقى الملفات في المجلد وقد انفصلت عن
   الصفحات، فلا يظهر أثر أي تعديل فيها مهما نُشر.

   الآن: يُربط ما هو موجود، ويُنزع وسم ما ليس موجوداً — لا أكثر.
   ========================================================================= */
const ALL_ADDONS = [
  { js: "mirath-plus.js",     css: "mirath-plus.css" },
  { js: "governance.js",      css: "governance.css" },
  { js: "crud-plus.js",       css: "crud-plus.css" },
  { js: "kpi-settings.js",    css: "kpi-settings.css" },
  { js: "exams-plus.js",      css: "exams-plus.css" },
  { js: "duty-plus.js",       css: "duty-plus.css" },
  { js: "facilities-plus.js", css: "facilities-plus.css" },
  { js: "manager-link.js",    css: "manager-link.css" },
  { js: "report-fix.js",      css: null },
  { js: "accounts.js",        css: null }
];

/* الحزمة المدمجة إن وُجدت أغنت عن أجزائها، وإلا رُبط كل جزءٍ بنفسه */
const BUNDLE = fs.existsSync(path.join(ROOT, "mirath-plus.js"));

const ADDONS = BUNDLE
  ? [{ js: "mirath-plus.js", css: "mirath-plus.css" }]
  : ALL_ADDONS.filter(a => a.js !== "mirath-plus.js" &&
                           fs.existsSync(path.join(ROOT, a.js)));

/* لا يُنزع وسمٌ إلا لملفٍ لن يُربط: إمّا لأنه دُمج، وإمّا لأنه غير موجود */
const KEEP   = ADDONS.map(a => a.js.replace(/\.js$/, ""));
const MERGED = ALL_ADDONS
  .map(a => a.js.replace(/\.js$/, ""))
  .filter(n => n !== "mirath-plus" && KEEP.indexOf(n) === -1)
  .concat("clean-boot");
console.log("\n  عدد صفحات HTML: " + files.length);

/* ================= ١) إصلاح app2.js ================= */
console.log("\n" + line);
console.log("  ١) إصلاح مسار ملف التطبيق");
console.log(line);

const hasApp2 = fs.existsSync(path.join(ROOT, "app2.js"));
const hasApp  = fs.existsSync(path.join(ROOT, "app.js"));

let fixed = 0, fixedFiles = 0;

if (hasApp2) {
  console.log("\n  app2.js موجود — لا حاجة للإصلاح.");
} else if (!hasApp) {
  console.log("\n  ✗ لا app.js ولا app2.js في المجلد! تأكد أنك في المشروع الصحيح.");
  process.exit(1);
} else {
  for (const f of files) {
    const before = read(f);
    if (before.indexOf("app2.js") === -1) continue;
    let n = 0;
    const after = before.replace(/app2\.js/g, () => { n++; return "app.js"; });
    write(f, after);
    fixed += n; fixedFiles++;
    console.log("  ✓ " + path.relative(ROOT, f));
  }
  console.log(fixedFiles
    ? "\n  صُحّح " + fixed + " موضعاً في " + fixedFiles + " صفحة."
    : "\n  لا توجد إشارات إلى app2.js — سليم بالفعل.");
}

/* ================= ٢) ربط ملفات الحوكمة ================= */
console.log("\n" + line);
console.log("  ٢) ربط سجل العمليات وصلاحيات المعلمين");
console.log(line);

/* وسوم الملفات المنفصلة تُنزع أولاً، وإلا حُمّل الكود مرّتين */
(function () {
  let n = 0;
  for (const f of files) {
    let s = read(f), before = s;
    for (const m of MERGED) {
      s = s.replace(new RegExp('[ \\t]*<script src="[^"]*' + m + '\\.js[^"]*"><\\/script>\\r?\\n', 'g'), '');
      s = s.replace(new RegExp('[ \\t]*<link[^>]*href="[^"]*' + m + '\\.css[^"]*"[^>]*>\\r?\\n', 'g'), '');
    }
    s = s.replace(/[ \t]*<!-- (?:يمنع ظهور النسخة القديمة|الطبقة الرقابية)[^\n]*\r?\n/g, '');
    if (s !== before) { write(f, s); n++; }
  }
  if (n) console.log("  نُزعت وسوم " + MERGED.length + " ملفاً غير مربوط من " + n + " صفحة.");
})();


/* كل إضافة مستقلة: نقص واحدة لا يمنع ربط البقية.
   كان الشرط يتخطّى الخطوة كلها إن غاب governance.js وحده. */
const present = ADDONS.filter(a => fs.existsSync(path.join(ROOT, a.js)));
const absent  = ADDONS.filter(a => !fs.existsSync(path.join(ROOT, a.js)));

if (absent.length) {
  console.log("\n  ⚠ غير موجودة في المجلد (تُتخطّى):");
  absent.forEach(a => console.log("      " + a.js));
}

if (!present.length) {
  console.log("\n  لا إضافات لربطها.");
} else {
  let added = 0, already = 0;
  for (const f of files) {
    const base = path.basename(f).toLowerCase();
    if (["login.html", "404.html", "signup.html", "check.html",
         "migrate-ids.html", "ابدأ-هنا.html"].indexOf(base) > -1) continue;

    let s = read(f);
    if (s.indexOf("app.js") === -1) continue;

    const prefix = path.dirname(path.relative(ROOT, f)) === "." ? "" : "../";
    let touched = false;

    for (const add of present) {
      if (s.indexOf(add.js) > -1) continue;

      if (add.css && fs.existsSync(path.join(ROOT, add.css))) {
        const mc = s.match(new RegExp('[ \\t]*<link[^>]*href="' + prefix + 'styles\\.css[^>]*>\\r?\\n'));
        if (mc) {
          const at = s.indexOf(mc[0]) + mc[0].length;
          s = s.slice(0, at) + '  <link rel="stylesheet" href="' + prefix + add.css + '" />\r\n' + s.slice(at);
        }
      }

      const tags = [...s.matchAll(/[ \t]*<script src="[^"]+"><\/script>\r?\n/g)];
      if (!tags.length) continue;
      const last = tags[tags.length - 1];
      const at2 = last.index + last[0].length;
      s = s.slice(0, at2) + '  <script src="' + prefix + add.js + '"></script>\r\n' + s.slice(at2);
      touched = true;
    }

    if (!touched) { already++; continue; }
    write(f, s);
    added++;
    console.log("  ✓ " + path.relative(ROOT, f));
  }
  console.log("\n  رُبطت " + present.length + " إضافة في " + added + " صفحة" +
              (already ? " · مربوطة مسبقاً في " + already : ""));
}

/* ============ ٢٫٤) تنظيف بقايا العرض القديم ============ */
console.log("\n" + line);
console.log("  ٣) تنظيف بقايا العرض القديم");
console.log(line + "\n");

(function () {
  var n = 0, hits = [];

  for (const f of files) {
    let s = read(f), before = s;

    /* اسم شخص بعينه مكتوب في الصفحة: يلمع قبل تحميل الحساب،
       ويراه أي زائر في مصدر الصفحة. auth.js يملؤه بعد الدخول. */
    s = s.replace(/(<strong id="userName">)[^<]+(<\/strong>)/g,
                  function (m, a, b) { hits.push("اسم محفور"); return a + b; });
    s = s.replace(/(<small id="userRole">)[^<]+(<\/small>)/g, "$1$2");
    s = s.replace(/<div class="avatar">[^<]{1,4}<\/div>/g,
                  '<div class="avatar" id="userAvatar"></div>');

    /* بطاقة مرحلة تطوير قديمة، مخفية بـ display:none */
    s = s.replace(/[ \t]*<div class="foot-card"[\s\S]{0,400}?<\/div>\s*<\/div>\r?\n/g,
                  function () { hits.push("بطاقة قديمة"); return ""; });

    /* أيقونة آبل تشير إلى ملف غير موجود */
    if (!fs.existsSync(path.join(ROOT, "logo.png")) &&
        fs.existsSync(path.join(ROOT, "logo-mark.png"))) {
      s = s.replace(/href="((?:\.\.\/)?)logo\.png"/g,
                    function (m, p1) { hits.push("أيقونة مفقودة"); return 'href="' + p1 + 'logo-mark.png"'; });
    }

    if (s !== before) { write(f, s); n++; console.log("  ✓ " + path.relative(ROOT, f)); }
  }

  if (!n) console.log("  · لا بقايا — نظيف بالفعل.");
  else {
    var uniq = {};
    hits.forEach(function (h) { uniq[h] = (uniq[h] || 0) + 1; });
    console.log("\n  نُظّفت " + n + " صفحة: " +
      Object.keys(uniq).map(function (k) { return k + " (" + uniq[k] + ")"; }).join(" · "));
  }
})();

/* ============ ٢٫٥) منع ظهور النسخة القديمة عند التحميل ============ */
console.log("\n" + line);
console.log("  ٤) منع ظهور النسخة القديمة عند التحميل");
console.log(line + "\n");

(function () {
  if (!fs.existsSync(path.join(ROOT, "clean-boot.js"))) {
    console.log("  ⚠ clean-boot.js غير موجود — تخطّي.");
    return;
  }
  var n = 0;
  for (const f of files) {
    let s = read(f);
    if (s.indexOf("clean-boot.js") > -1) continue;
    /* لا بدّ أن يسبق auth.js، فيُدرج مباشرة بعد app.js */
    const m = s.match(/[ \t]*<script src="([^"]*app\.js[^"]*)"><\/script>\r?\n/);
    if (!m) continue;
    const prefix = path.dirname(path.relative(ROOT, f)) === "." ? "" : "../";
    const at = s.indexOf(m[0]) + m[0].length;
    s = s.slice(0, at) +
        '  <!-- يمنع ظهور النسخة القديمة من الكاش قبل وصول بيانات السيرفر -->\r\n' +
        '  <script src="' + prefix + 'clean-boot.js"></script>\r\n' + s.slice(at);

    if (fs.existsSync(path.join(ROOT, "clean-boot.css")) && s.indexOf("clean-boot.css") === -1) {
      const mc = s.match(new RegExp('[ \\t]*<link[^>]*href="' + prefix + 'styles\\.css[^>]*>\\r?\\n'));
      if (mc) {
        const at2 = s.indexOf(mc[0]) + mc[0].length;
        s = s.slice(0, at2) + '  <link rel="stylesheet" href="' + prefix + 'clean-boot.css" />\r\n' + s.slice(at2);
      }
    }
    write(f, s); n++;
  }
  console.log("  ✓ أُضيف في " + n + " صفحة");
})();

/* ================= ٤) ربط عتبات التقدير ================= */
console.log("\n" + line);
console.log("  ٥) ربط عتبات التقدير بالإعدادات");
console.log(line);

(function () {
  var appFile = fs.existsSync(path.join(ROOT, "app.js")) ? "app.js"
              : fs.existsSync(path.join(ROOT, "app2.js")) ? "app2.js" : "";
  if (!appFile) { console.log("\n  ⚠ لم أجد app.js — تخطّي."); return; }

  var f = path.join(ROOT, appFile);
  var src = read(f);

  if (src.indexOf("function kpiGrade(") > -1) {
    console.log("\n  · مربوط مسبقاً.");
    return;
  }

  /* التعبير المكتوب بخطّ اليد في أربعة مواضع */
  var HARD = /(\w+) == null \? "—" : \1 >= 85 \? "ممتاز" : \1 >= 70 \? "جيد جداً" : \1 >= 50 \? "جيد" : "يحتاج متابعة"/g;
  var hits = (src.match(HARD) || []).length;

  if (!hits) {
    console.log("\n  ⚠ لم أجد العتبات الثابتة — ربما تغيّر الكود. تخطّي بأمان.");
    return;
  }

  /* نسخة احتياطية مرة واحدة */
  var bak = f + ".before-kpi";
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, src, "utf8");

  src = src.replace(HARD, "kpiGrade($1)");

  /* الدالة تُحقن بعد progressRow — موضع مضمون قرب أعلى الملف */
  var anchor = "function toggleRow(";
  var at = src.indexOf(anchor);
  if (at === -1) { console.log("\n  ⚠ لم أجد موضع الإدراج. تخطّي."); return; }

  var helper =
    "/* عتبات التقدير — كانت ٨٥ و ٧٠ و ٥٠ مكتوبة في أربعة مواضع،\n" +
    "   فلا تستطيع الإدارة تغييرها. صارت تُقرأ من الإعدادات. */\n" +
    "function kpiThreshold(k, d) {\n" +
    "  var v = (typeof DB !== \"undefined\" && DB.settings) ? Number(DB.settings[k]) : NaN;\n" +
    "  return isFinite(v) && v > 0 && v <= 100 ? v : d;\n" +
    "}\n" +
    "function kpiGrade(v) {\n" +
    "  if (v == null || v === \"\") return \"—\";\n" +
    "  v = Number(v);\n" +
    "  if (!isFinite(v)) return \"—\";\n" +
    "  return v >= kpiThreshold(\"kpiTop\", 85)  ? \"ممتاز\"\n" +
    "       : v >= kpiThreshold(\"kpiGood\", 70) ? \"جيد جداً\"\n" +
    "       : v >= kpiThreshold(\"kpiFair\", 50) ? \"جيد\" : \"يحتاج متابعة\";\n" +
    "}\n\n";

  src = src.slice(0, at) + helper + src.slice(at);
  write(f, src);
  console.log("\n  ✓ رُبط " + hits + " موضعاً في " + appFile + " بعتبات الإعدادات.");
  console.log("    نسخة أصلية محفوظة: " + appFile + ".before-kpi");
})();

/* ================= ٤) بصم رقم النسخة ================= */
console.log("\n" + line);
console.log("  ٦) بصم رقم النسخة");
console.log(line + "\n");

if (fs.existsSync(path.join(ROOT, "bump.js"))) {
  try {
    require(path.join(ROOT, "bump.js"));
  } catch (e) {
    console.log("  ⚠ تعذّر تشغيل bump.js: " + e.message);
  }
} else {
  console.log("  ⚠ bump.js غير موجود — تخطّي البصم.");
}

/* ================= الخلاصة ================= */
console.log("\n" + line);
console.log("  تم. الخطوة الأخيرة: انشر");
console.log(line);
console.log("\n     انقر «نشر.bat» مرتين");
console.log("     أو نفّذ:  firebase deploy --only hosting");
console.log("\n  ثم افتح الموقع واضغط Ctrl+Shift+R مرة واحدة.\n");