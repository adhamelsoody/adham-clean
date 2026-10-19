/* =========================================================================
   clean-boot.js — لا تعرض القديم ثم الجديد
   -------------------------------------------------------------------------
   app.js يرسم من الكاش المحلي أولاً ثم يعيد الرسم ببيانات السيرفر، بتعليق
   مكتوب فيه: «الرسم لا ينتظر الشبكة». فيرى المستخدم لحظةً الشكل القديم
   بأزراره القديمة ثم يتبدّل أمامه — وهو أسوأ ما يظهر في عرضٍ أو تسليم.

   هنا نمنع رسمة الكاش ونُبقي شاشة التحميل حتى ترد الشبكة، فأول ما يراه
   المستخدم هو النهائي.

   المقابل: الفتح أبطأ بقدر بطء الشبكة. ولئلا تعلق الشاشة إلى الأبد إن
   انقطع الاتصال، هناك مهلة قصوى تسقط بعدها على الكاش مع إشعار صريح.

   يُحمَّل بعد app.js وقبل auth.js — أو في أي موضع بعد app.js، فهو يلفّ
   الدالة ولا ينفّذ شيئاً حتى تُستدعى.
   ========================================================================= */
(function () {
  "use strict";

  /* أقصى انتظار قبل السقوط على الكاش — شبكة أبطأ من هذا تعني عطلاً */
  var MAX_WAIT = 12000;

  var orig = window.loadDataFast;
  if (typeof orig !== "function") return;

  window.loadDataFast = function (onData) {
    var done = false;      /* رُسمت الشاشة نهائياً */
    var fellBack = false;  /* اضطررنا للكاش */

    /* شبكة معطّلة: لا نترك المستخدم أمام شاشة تحميل بلا نهاية */
    var timer = setTimeout(function () {
      if (done) return;
      fellBack = true;
      try {
        if (onData) onData(true);
        note("تعذّر الوصول للخادم — تُعرض آخر بيانات محفوظة على هذا الجهاز.");
      } catch (e) { console.warn(e); }
    }, MAX_WAIT);

    return orig.call(this, function (fromCache) {
      /* رسمة الكاش المبكّرة تُتجاهل — هي سبب ظهور القديم ثم الجديد */
      if (fromCache && !fellBack) return;

      done = true;
      clearTimeout(timer);
      if (onData) onData(fromCache);
    });
  };

  /* إشعار خفيف لا يعتمد على دوال app.js فقد لا تكون جاهزة بعد */
  function note(text) {
    try {
      if (typeof showToast === "function") { showToast(text, "warn"); return; }
    } catch (e) {}

    var el = document.createElement("div");
    el.className = "cb-note";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("out"); }, 6000);
    setTimeout(function () { el.remove(); }, 6600);
  }
})();
