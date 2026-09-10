/* =========================================================================
   ترحيل الأدوار والنطاقات — يُشغَّل مرّةً واحدة قبل نشر firestore.rules
   -------------------------------------------------------------------------
   يعمل شيئين لا ثالث لهما:

     ١) يحوّل حسابات «مشرف» القائمة إلى مدير مجمّع أو مدير مسجد بحسب ما
        في ملفّها: من له complexId بلا mosqueId فمدير مجمّع، ومن له
        mosqueId فمدير مسجد. ومن لا نطاق له يُترك ويُذكر في التقرير —
        لأنّ تخمين نطاق حسابٍ إداريٍّ ليس من عمل سكربت.

     ٢) يبصم complexId و mosqueId على المستندات القديمة التي بلا نطاق،
        مشتقّاً إياهما من الحلقة أو المسجد المرتبط. القواعد الجديدة تشترط
        النطاق، والمستند بلا نطاق يصير غير قابلٍ للتعديل بعد النشر.

   ⚠ الترتيب لازم: شغّل هذا أوّلاً ثم انشر القواعد. العكس يقفل النظام على
     أصحابه — القواعد ترفض الكتابة، والسكربت يكتب.

   الاستعمال:
     node migrate-roles.js --check      فحصٌ بلا تعديل — ابدأ به دائماً
     node migrate-roles.js --apply      التنفيذ الفعليّ

   يحتاج ملفّ مفتاح الخدمة:
     Firebase Console ← Project Settings ← Service accounts ← Generate key
     احفظه باسم serviceAccountKey.json بجوار هذا الملفّ، ولا ترفعه إلى Git.
   ========================================================================= */
"use strict";

const path = require("path");
const APPLY = process.argv.indexOf("--apply") > -1;
const CHECK = process.argv.indexOf("--check") > -1;

if (!APPLY && !CHECK) {
  console.log("\nالاستعمال:  node migrate-roles.js --check   |   --apply\n");
  process.exit(1);
}

let admin, cred;
try {
  admin = require("firebase-admin");
  cred = require(path.join(__dirname, "serviceAccountKey.json"));
} catch (e) {
  console.error("\n✗ ينقص شيء: " + e.message);
  console.error("  ثبّت المكتبة:  npm install firebase-admin");
  console.error("  وضع مفتاح الخدمة في:  serviceAccountKey.json\n");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(cred) });
const db = admin.firestore();

/* المجموعات التي تحمل نطاقاً — الباقي عامٌّ بطبعه */
const SCOPED = [
  "mosques", "teachers", "circles", "students", "plans", "delays",
  "reviews", "workflow", "recitations", "attendance", "exams",
  "assignments", "admissions", "procLog", "pointsLog", "moveLog"
];

const log = [];
function note(s) { log.push(s); console.log(s); }

async function loadIndex() {
  const [mqSnap, cSnap] = await Promise.all([
    db.collection("mosques").get(),
    db.collection("circles").get()
  ]);
  const mosques = {}, circles = {};
  mqSnap.forEach(d => { mosques[d.id] = d.data() || {}; });
  cSnap.forEach(d => { circles[d.id] = d.data() || {}; });
  return { mosques, circles };
}

/* ------------------------------ ١) الأدوار ------------------------------ */
async function migrateRoles() {
  note("\n── الحسابات ──");
  const snap = await db.collection("users").where("role", "==", "supervisor").get();
  if (snap.empty) { note("  لا حسابات بدور «مشرف»."); return; }

  let toCx = 0, toMq = 0, skipped = 0;
  const batch = db.batch();

  snap.forEach(doc => {
    const u = doc.data() || {};
    const mq = String(u.mosqueId || "");
    const cx = String(u.complexId || "");
    const scopeIds = Array.isArray(u.scopeIds) ? u.scopeIds : [];
    const hasMq = mq || scopeIds.some(k => String(k).indexOf("mosque:") === 0);
    const hasCx = cx || scopeIds.some(k => String(k).indexOf("complex:") === 0);

    let role = null;
    if (hasMq) role = "mosqueManager";
    else if (hasCx) role = "complexManager";

    if (!role) {
      skipped++;
      note("  ⚠ بلا نطاق — يُترك: " + (u.name || doc.id) + "  (" + doc.id + ")");
      return;
    }

    if (role === "complexManager") toCx++; else toMq++;
    note("  · " + (u.name || doc.id) + " → " +
         (role === "complexManager" ? "مدير مجمّع" : "مدير مسجد"));
    if (APPLY) batch.update(doc.ref, { role: role, roleBefore: "supervisor" });
  });

  if (APPLY && (toCx + toMq)) await batch.commit();
  note("  المجموع: " + toCx + " مدير مجمّع · " + toMq + " مدير مسجد · " +
       skipped + " بلا نطاق");
  if (skipped) {
    note("  ⚠ الحسابات بلا نطاق تبقى «مشرف» وتعمل كما كانت.");
    note("    أسنِد لكلٍّ مسجدَه أو مجمّعَه من صفحة المستخدمين ثم أعد التشغيل.");
  }
}

/* ------------------------------ ٢) النطاقات ----------------------------- */
async function migrateScopes(idx) {
  note("\n── المستندات بلا نطاق ──");
  let totalFixed = 0, totalStuck = 0;

  for (const coll of SCOPED) {
    const snap = await db.collection(coll).get();
    if (snap.empty) continue;

    let fixed = 0, stuck = 0;
    let batch = db.batch(), n = 0;

    for (const doc of snap.docs) {
      const d = doc.data() || {};
      if (d.complexId && (coll === "mosques" || d.mosqueId)) continue;

      const patch = {};

      /* المسجد يُشتقّ من الحلقة */
      let mqId = String(d.mosqueId || "");
      if (!mqId && d.circleId) {
        const c = idx.circles[String(d.circleId)];
        if (c && c.mosqueId) { mqId = String(c.mosqueId); patch.mosqueId = mqId; }
      }
      /* والمجمّع من المسجد */
      if (!d.complexId) {
        if (coll === "mosques") { /* المسجد نفسه: نطاقه complexId وحده */ }
        else if (mqId && idx.mosques[mqId] && idx.mosques[mqId].complexId) {
          patch.complexId = String(idx.mosques[mqId].complexId);
        }
      }

      if (!Object.keys(patch).length) { stuck++; continue; }

      fixed++;
      if (APPLY) {
        batch.update(doc.ref, patch);
        if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
      }
    }
    if (APPLY && n) await batch.commit();

    if (fixed || stuck) {
      note("  " + coll.padEnd(14) + " أُصلح " + fixed +
           (stuck ? "  ·  تعذّر " + stuck : ""));
    }
    totalFixed += fixed; totalStuck += stuck;
  }

  note("  المجموع: " + totalFixed + " مستنداً أُصلح، " + totalStuck + " تعذّر");
  if (totalStuck) {
    note("  ⚠ ما تعذّر لا رابط له بمسجدٍ ولا حلقة — يبقى للمالك والمدير وحدهما.");
  }
}

(async function () {
  console.log(APPLY ? "\n▶ التنفيذ الفعليّ\n" : "\n▶ فحصٌ بلا تعديل\n");
  try {
    const idx = await loadIndex();
    await migrateRoles();
    await migrateScopes(idx);
    console.log(APPLY
      ? "\n✓ تمّ. انشر الآن:  firebase deploy --only firestore:rules\n"
      : "\n▶ فحصٌ فقط — لم يتغيّر شيء. للتنفيذ:  node migrate-roles.js --apply\n");
    process.exit(0);
  } catch (e) {
    console.error("\n✗ فشل الترحيل: " + (e.message || e));
    console.error("  لم يُنشر شيء. لا تنشر القواعد قبل نجاح الترحيل.\n");
    process.exit(1);
  }
})();