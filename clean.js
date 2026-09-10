/* =========================================================================
   تنظيف.js — إصلاح أسماء الملفات المشوّهة وحذف المكرر
   -------------------------------------------------------------------------
   المتصفح يحفظ الملف باسم «governance·JS» بدل «governance.js» — نقطة
   وسطية بدل النقطة، وامتداد بحرف كبير. النتيجة أن setup.js لا يجده،
   فيبقى الملف في المجلد بلا أثر ويظنّ صاحبه أنه ركّبه.

   يعيد التسمية إلى الصحيح، وينقل ملف الدوال إلى مجلده، ويحذف ما لا لزوم له.
   ينسخ الأحدث عند وجود نسختين، ولا يحذف إلا بعد نجاح النسخ.

   شغّله من جذر المشروع:  node تنظيف.js
   ========================================================================= */
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;

const line = "─".repeat(58);
console.log("\n" + line + "\n  تنظيف الملفات\n" + line + "\n");

if (!fs.existsSync(path.join(ROOT, "firebase.json"))) {
  console.log("  ✗ هذا ليس مجلد المشروع.\n");
  process.exit(1);
}

/* الاسم المشوّه ← الاسم الصحيح */
const RENAME = {
  "governance·JS":            "governance.js",
  "governance·CSS":           "governance.css",
  "crud plus·JS":             "crud-plus.js",
  "crud plus·css":            "crud-plus.css",
  "crud plus .css":           "crud-plus.css",
  "accounts·JS":              "accounts.js",
  "reset·HTML":               "reset.html",
  "setup·JS":                 "setup.js",
  "firestore-rules.txt":      "firestore.rules",
  "firestore·RULES":          "firestore.rules"
};

/* ملفات لم تعد لها حاجة — أُدمجت داخل setup.js */
const DROP = [
  "Install governance·JS", "install-governance.js",
  "fix app2·JS", "fix-app2.js",
  "setup. js", "setup .js"
];

let renamed = 0, dropped = 0, moved = 0;

/* ---------- ١) إعادة التسمية ---------- */
for (const [bad, good] of Object.entries(RENAME)) {
  const from = path.join(ROOT, bad);
  if (!fs.existsSync(from)) continue;

  const to = path.join(ROOT, good);
  const sFrom = fs.statSync(from).size;

  if (fs.existsSync(to)) {
    const sTo = fs.statSync(to).size;
    /* الأكبر عادةً الأحدث — والفرق بينهما تعديلات لاحقة */
    if (sFrom > sTo) {
      fs.copyFileSync(from, to);
      console.log(`  ✓ ${bad}  ←  استبدل ${good} (${sTo} ← ${sFrom} بايت)`);
    } else {
      console.log(`  · ${bad}  ←  ${good} الموجود أحدث، حُذف المشوّه`);
    }
    fs.unlinkSync(from);
  } else {
    fs.renameSync(from, to);
    console.log(`  ✓ ${bad}  ←  ${good}`);
  }
  renamed++;
}

/* ---------- ٢) ملف الدوال إلى مجلده ---------- */
const fnDir = path.join(ROOT, "functions");
for (const name of ["Index.js", "index·JS", "Index·JS"]) {
  const src = path.join(ROOT, name);
  if (!fs.existsSync(src)) continue;

  /* index.js في الجذر بحرف صغير قد يكون ملفاً آخر — لا نلمسه */
  if (!fs.existsSync(fnDir)) fs.mkdirSync(fnDir);
  const dst = path.join(fnDir, "index.js");

  if (fs.existsSync(dst) && fs.statSync(dst).size >= fs.statSync(src).size) {
    fs.unlinkSync(src);
    console.log(`  · ${name}  ←  functions/index.js الموجود أحدث`);
  } else {
    fs.copyFileSync(src, dst);
    fs.unlinkSync(src);
    console.log(`  ✓ ${name}  ←  functions/index.js`);
  }
  moved++;
}

for (const name of ["package.json"]) {
  const src = path.join(ROOT, name);
  const dst = path.join(fnDir, name);
  /* package.json في الجذر ليس بالضرورة ملف الدوال — يُنقل فقط إن ذكر
     firebase-functions ولم يكن في مجلدها نسخة */
  if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
  const txt = fs.readFileSync(src, "utf8");
  if (txt.indexOf("firebase-functions") === -1) continue;
  if (!fs.existsSync(fnDir)) fs.mkdirSync(fnDir);
  fs.copyFileSync(src, dst);
  fs.unlinkSync(src);
  console.log("  ✓ package.json  ←  functions/package.json");
  moved++;
}

/* ---------- ٣) حذف ما لا لزوم له ---------- */
for (const name of DROP) {
  const f = path.join(ROOT, name);
  if (!fs.existsSync(f)) continue;
  fs.unlinkSync(f);
  console.log("  ✗ حُذف: " + name);
  dropped++;
}

/* ---------- ٤) تقرير الحالة ---------- */
console.log("\n" + line + "\n  الحالة بعد التنظيف\n" + line + "\n");

const NEED = [
  ["setup.js",        "أداة التركيب"],
  ["governance.js",   "سجل العمليات"],
  ["governance.css",  "تنسيقاته"],
  ["crud-plus.js",    "المستويات والحذف"],
  ["crud-plus.css",   "تنسيقاته"],
  ["accounts.js",     "إدارة الحسابات"],
  ["reset.html",      "استعادة كلمة المرور"],
  ["app.js",          "قلب النظام"],
  ["firestore.rules", "قواعد الأمان"],
  ["admin/shell.js",  "غلاف الإدارة"],
  ["functions/index.js",   "دوال الخادم"],
  ["functions/package.json", "تبعياتها"]
];

let missing = [];
for (const [f, what] of NEED) {
  const ok = fs.existsSync(path.join(ROOT, f));
  const size = ok ? fs.statSync(path.join(ROOT, f)).size : 0;
  console.log(`  ${ok && size ? "✓" : "✗"} ${f.padEnd(24)} ${what}` +
              (ok && !size ? "  ⚠ فارغ!" : ""));
  if (!ok || !size) missing.push(f);
}

/* أي أسماء مشوّهة باقية */
const left = fs.readdirSync(ROOT).filter(n => n.indexOf("·") > -1);
if (left.length) {
  console.log("\n  ⚠ أسماء مشوّهة لم أعرفها:");
  left.forEach(n => console.log("      " + n));
  console.log("    أعد تسميتها يدوياً أو أخبرني بها.");
}

console.log("\n" + line);
if (missing.length) {
  console.log("  ملفات ناقصة — نزّلها وانسخها هنا:");
  missing.forEach(f => console.log("      " + f));
} else {
  console.log("  كل الملفات مكتملة.");
}
console.log("\n  الخطوة التالية:  انقر «تركيب.bat» مرتين\n");
