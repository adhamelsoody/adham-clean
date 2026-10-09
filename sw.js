/* =========================================================================
   عامل الخدمة — النظام يفتح بلا إنترنت
   -------------------------------------------------------------------------
   Firestore يحفظ البيانات محلياً (enablePersistence)، فالقراءة والكتابة
   تعملان دون شبكة. لكنّ الملفات نفسها — app.js و styles.css وصفحات
   الإدارة وجداول المصحف — تُجلب من الشبكة في كلّ فتح. فمن فتح النظام في
   مسجدٍ بلا شبكة لم تُحمَّل له صفحةٌ أصلاً، ولم ينفعه أن البيانات محفوظة.

   هنا تُخزَّن الملفات في المتصفح، فيفتح النظام ويعمل كأنّ الشبكة موجودة.

   ثلاث سياسات بحسب طبيعة الملف:
     • ملفات النظام (js/css/html): من الشبكة أوّلاً لتصل التحديثات، ومن
       الكاش حين تعذّرت — فلا يُحبس المستخدم على نسخةٍ قديمة.
     • جداول المصحف: من الكاش أوّلاً — لا تتغيّر، وجلبها من الشبكة كلّ مرّة
       إهدارٌ محض.
     • Firebase وواجهات الشبكة: لا تُخزَّن — لها تخزينها الخاص، وخزنُها
       هنا يُفسد المزامنة.
   ========================================================================= */

/* v3: رفعُ الرقم يمحو كلَّ ما خزّنته v2 عند التفعيل (انظر activate
   أدناه)، فيتخلّص كلُّ عميلٍ من ملفاتٍ حُجزت في متصفّحه بإعداد
   التخزين القديم (سنةٌ كاملة) قبل تصحيحه في firebase.json. */
/* v5: يمحو كلَّ ما خزّنته v4. ورُفع لأنّ العملاءَ كانوا يُخدَمون ملفّاتٍ
   قديمةً بعد النشر — «تظهر الصفحةُ الجديدةُ ثمّ تختفي». */
/* v6: «نشرتُ ولا يظهر عندي شيء». الرفعُ وحدَه يمحو مخزونَ v5، لكنّ
   الصفحةَ المفتوحةَ تبقى عاملةً بملفّاتٍ حُمّلت قبل المحو — والتطبيقُ
   المثبَّتُ على الشاشة الرئيسية لا يُغلق أسبوعاً، فلا تُعاد أبداً.
   ورفعُ الرقم يمحو مخزونَ v5 كلَّه عند التفعيل، فلا يبقى على الجهاز ملفٌّ
   قديمٌ يُقدَّم. والمحوُ وحدَه هو المأمون: جُرّبت إعادةُ تحميلٍ قسريّةٌ من
   العامل عبر client.navigate فمنعت الصفحةَ من إتمام تحميلها — خطرُ دورةٍ
   لا تنتهي، فأُزيلت. يكفي أن تُفتح الصفحةُ بعد المحو لتُجلب من الشبكة.
   هذا الملفُّ لا يُخزَّن ألبتة (firebase.json و skip أدناه)، فهو الطريقُ
   الوحيدُ المضمونُ للوصول إلى جهازٍ حُبس على نسخةٍ قديمة. */
const SW_VERSION = "mirath-v6";
const SHELL_CACHE = SW_VERSION + "-shell";
const QURAN_CACHE = SW_VERSION + "-quran";

/* ما يُخزَّن عند التنصيب — الحدّ الأدنى لفتح النظام */
const SHELL = [
  "/", "/index.html", "/app.js", "/styles.css",
  "/auth.js", "/firebase-config.js", "/quran.js",
  "/topbar-dates.js",
  "/admin/shell.js", "/admin/dashboard.html", "/admin/soon.html",

  /* الملحقات: مربوطةٌ بكلّ صفحة، فتخزينُها يوفّر مئةَ كيلو في كلّ فتحة */
  "/clean-boot.js", "/clean-boot.css",
  "/governance.js", "/governance.css",
  "/duty-plus.js", "/duty-plus.css",
  "/facilities-plus.js", "/facilities-plus.css",
  "/manager-link.js", "/manager-link.css",

  /* الأصول: ٣٦٠ كيلو كانت تُحمَّل مع كلّ فتحة */
  /* hijri.js و update.js و logo-mark.png و favicon.png كانت هنا ولا وجودَ
     لها في المشروع — تُطلب في كلّ تنصيبٍ فتسقط. أُخرجت. */
  "/logo.svg", "/logo-mark.svg", "/icons/apple-touch-icon.png"
];

/* لا تُخزَّن: لها تخزينها الخاص أو تتغيّر بطبيعتها */
function skip(url) {
  return url.includes("firestore.googleapis.com") ||
         url.includes("firebaseio.com") ||
         url.includes("identitytoolkit") ||
         url.includes("securetoken") ||
         url.includes("aladhan.com") ||          /* مواقيت اليوم تُخزَّن في التطبيق */
         url.includes("wa.me") ||
         /* رقمُ البناء لا يُخزَّن ألبتة: به يُعرف أنّ ثمّة تحديثاً، فإن
            خُزِّن بقي العميلُ يقرأ رقماً قديماً ويظنّ نفسَه محدَّثاً. */
         /\/version\.json(\?|$)/.test(url) ||
         /* وعاملُ الخدمة نفسُه: تخزينُه يمنع تحديثَه */
         /\/sw\.js(\?|$)/.test(url);
}

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      /* addAll يفشل كلّه إن سقط ملف: تُجلب فرادى ليبقى ما نجح */
      .then(c => Promise.all(SHELL.map(u =>
        c.add(u).catch(() => null))))
      /* التبديلُ فوريّ: كان يُنتظر حتى تُغلق كلُّ نوافذ النظام، والتطبيقُ
         المثبَّت لا يُغلق شهراً — فيبقى العميلُ على عاملٍ قديمٍ ومخزونٍ
         قديم مهما نُشر. ولا يُخشى دورانُ الإعادة: الصفحةُ لا تُعيد نفسَها
         عند التبديل، بل يُعرض شريطُ تحديثٍ يضغطه صاحبُها متى فرغ. */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.indexOf(SW_VERSION) !== 0)
        .map(k => caches.delete(k))))       /* نسخٌ قديمة تُمحى */
      /* والسيطرةُ على الصفحات المفتوحة: بها يصل المحوُ إلى عميلٍ حُبس على
         مخزونٍ قديم دون أن يُغلق التطبيق. وأثرُها شريطُ تحديثٍ يُعرض له،
         لا إعادةَ تحميلٍ تُفاجئه. */
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = req.url;
  if (skip(url)) return;

  /* الصور والأصول: الكاش أوّلاً — لا تتغيّر إلا بتبديل اسمها */
  if (/\.(png|jpe?g|svg|ico|webp|woff2?)($|\?)/i.test(url) || url.includes("/quran/")) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(QURAN_CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || new Response("", { status: 504 })))
    );
    return;
  }

  /* ملفات النظام: الشبكة أوّلاً لتصل التحديثات، والكاش عند تعذّرها */
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req).then(hit => {
        if (hit) return hit;
        /* صفحةٌ لم تُخزَّن: تُعرض الرئيسية بدل خطأ المتصفح */
        if (req.mode === "navigate") return caches.match("/index.html");
        return new Response("", { status: 503, statusText: "غير متاح دون اتصال" });
      })
    )
  );
});

/* رسالة من التطبيق: تحديثٌ فوريّ بلا انتظار إغلاق التبويبات */
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});