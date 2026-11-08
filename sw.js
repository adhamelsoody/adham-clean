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
const SW_VERSION = "mirath-v7";
const SHELL_CACHE = SW_VERSION + "-shell";
const QURAN_CACHE = SW_VERSION + "-quran";

/* ما يُخزَّن عند التنصيب — الحدّ الأدنى لفتح النظام */
const SHELL = [
  "/", "/index.html", "/js/app.js", "/css/styles.css",
  "/js/auth.js", "/js/firebase-config.js", "/js/quran.js",
  "/js/topbar-dates.js",
  "/admin/shell.js", "/admin/dashboard.html", "/admin/soon.html",

  /* الملحقات: مربوطةٌ بكلّ صفحة، فتخزينُها يوفّر مئةَ كيلو في كلّ فتحة */
  "/js/clean-boot.js", "/css/clean-boot.css",
  /* governance · duty-plus · facilities-plus · manager-link لا تحمّلها أيُّ صفحة —
     أُخرجت من التخزين فلا تُنزَّل مع كلّ تنصيب (٤٢٩). الملفّاتُ باقيةٌ لم تُحذف. */

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
  const net = () => fetch(req).then(res => {
    if (res && res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then(c => c.put(req, copy));
    }
    return res;
  });
  e.respondWith(
    net()
      /* (٦٦٣) «This site can't be reached · ERR_FAILED» مرّتين: انقطاعٌ لحظيٌّ في
         الشبكة (أو أثناء تبديل النشر) يُسقط الجلبَ، ثم يُبحث في الكاش فلا يوجد
         — وكان الجوابُ حينها undefined، والمتصفّحُ يعرض لـ respondWith بلا
         جوابٍ صفحةَ ERR_FAILED ولو عادت الشبكةُ بعد لحظة. فصار:
           ١) محاولةٌ ثانيةٌ بعد ثانيةٍ واحدة،
           ٢) ثمّ الكاش (والصفحةُ بلا ?v=…)، ثمّ الرئيسيةُ المخزّنة،
           ٣) ثمّ صفحةٌ عربيةٌ صغيرة تعيد المحاولة وحدَها — لا شاشةُ خطأ المتصفح. */
      .catch(() => new Promise(r => setTimeout(r, 1000)).then(net))
      .catch(() =>
        caches.match(req).then(hit => hit || caches.match(req, { ignoreSearch: true })).then(hit => {
          if (hit) return hit;
          if (req.mode !== "navigate") return new Response("", { status: 503, statusText: "غير متاح دون اتصال" });
          return caches.match("/index.html").then(home => home || new Response(OFFLINE_HTML,
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }));
        })
      )
  );
});

/* (٦٦٣) آخرُ ملجأٍ للصفحة حين لا شبكةَ ولا نسخةَ مخزّنة: تعيد المحاولةَ كلَّ ٥ ثوانٍ */
const OFFLINE_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ذات القرآنية</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,Tahoma,sans-serif;background:#f4f8f8;color:#0f3b3d}
.b{text-align:center;padding:28px;max-width:360px}h1{font-size:20px;margin:0 0 8px}p{color:#5b7576;margin:0 0 18px;line-height:1.7}
button{background:#0f6f72;color:#fff;border:0;border-radius:12px;padding:12px 26px;font:inherit;font-weight:700;cursor:pointer}</style></head>
<body><div class="b"><h1>تعذّر الاتصال مؤقّتاً</h1><p>تُعاد المحاولة تلقائياً خلال ثوانٍ…</p>
<button onclick="location.reload()">إعادة المحاولة الآن</button></div>
<script>setTimeout(function(){location.reload()},5000);addEventListener("online",function(){location.reload()});</script></body></html>`;

/* رسالة من التطبيق: تحديثٌ فوريّ بلا انتظار إغلاق التبويبات */
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});