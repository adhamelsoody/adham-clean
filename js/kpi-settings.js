/* =========================================================================
   kpi-settings.js — عتبات التقدير قابلة للضبط
   -------------------------------------------------------------------------
   شاشة «مؤشرات الإنجاز» كانت شرحاً بلا إعدادات، مكتوباً فيها حرفياً
   «لا توجد إعدادات» — بينما العتبات ٨٥ و ٧٠ و ٥٠ مكتوبة بخطّ اليد في
   أربعة مواضع من app.js تحسب تقدير الطالب في الخطة وفي ثلاثة تقارير.

   هذا الملف يعطي الشاشة إعداداتها، و setup.js يربط تلك المواضع الأربعة
   بها. فالرقم الذي تكتبه الإدارة هو الذي يحسب فعلاً، لا رقمٌ مدفون.

   لم أضِف «حد إعادة الواجب» رغم وجوده في الكود الميت: لا يوجد محرك إعادة
   يستهلكه، وإعدادٌ لا يفعل شيئاً هو أصل المشكلة التي نصلحها.
   ========================================================================= */
(function () {
  "use strict";

  var DEF = { kpiTop: 85, kpiGood: 70, kpiFair: 50 };

  function DBX()  { try { return DB; } catch (e) { return {}; } }
  function E(s)   { try { return esc(s); } catch (e) { return String(s == null ? "" : s); } }
  function T(m,t) { try { showToast(m, t); } catch (e) {} }
  function MNT()  { try { mount(); } catch (e) {} }

  function get(k) {
    var s = DBX().settings || {};
    var v = Number(s[k]);
    return isFinite(v) && v > 0 ? v : DEF[k];
  }

  /* التقدير المعروض — نفس منطق app.js بعد ربطه */
  window.kpiGrade = function (v) {
    if (v == null || v === "") return "—";
    v = Number(v);
    if (!isFinite(v)) return "—";
    return v >= get("kpiTop")  ? "ممتاز"
         : v >= get("kpiGood") ? "جيد جداً"
         : v >= get("kpiFair") ? "جيد" : "يحتاج متابعة";
  };

  /* ------------------------------------------------------------------
     الحفظ — مع تحقّق يمنع ترتيباً مقلوباً
     ------------------------------------------------------------------ */
  window.kpiSave = function () {
    var num = function (id) {
      var e = document.getElementById(id);
      return e ? Math.round(Number(e.value)) : NaN;
    };
    var top = num("kpi_top"), good = num("kpi_good"), fair = num("kpi_fair");

    if ([top, good, fair].some(function (x) { return !isFinite(x); })) {
      T("اكتب أرقاماً صحيحة", "warn"); return;
    }
    if ([top, good, fair].some(function (x) { return x < 1 || x > 100; })) {
      T("النسب بين ١ و ١٠٠", "warn"); return;
    }
    /* الترتيب شرط: «ممتاز» أعلى من «جيد جداً» أعلى من «جيد» */
    if (!(top > good && good > fair)) {
      T("الترتيب مقلوب: ممتاز > جيد جداً > جيد", "warn"); return;
    }

    var s = DBX().settings || (DBX().settings = {});
    s.kpiTop = top; s.kpiGood = good; s.kpiFair = fair;

    var rec = Object.assign({ id: "general" }, s);
    Promise.resolve(persistSet("settings", rec)).then(function (ok) {
      T(ok === false ? "تعذّر الحفظ" : "حُفظت العتبات — التقارير تحسب بها الآن",
        ok === false ? "warn" : "success");
      MNT();
    });
  };

  window.kpiReset = function () {
    var s = DBX().settings || (DBX().settings = {});
    s.kpiTop = DEF.kpiTop; s.kpiGood = DEF.kpiGood; s.kpiFair = DEF.kpiFair;
    Promise.resolve(persistSet("settings", Object.assign({ id: "general" }, s)))
      .then(function () { T("أُعيدت القيم الافتراضية", "success"); MNT(); });
  };

  /* معاينة حيّة أثناء الكتابة — بلا حفظ */
  window.kpiPreview = function () {
    var v = function (id) { var e = document.getElementById(id); return Math.round(Number(e && e.value)); };
    var top = v("kpi_top"), good = v("kpi_good"), fair = v("kpi_fair");
    var box = document.getElementById("kpiPrev");
    if (!box) return;

    var grade = function (n) {
      return n >= top ? "ممتاز" : n >= good ? "جيد جداً" : n >= fair ? "جيد" : "يحتاج متابعة";
    };
    var tint = function (n) {
      return n >= top ? "k-a" : n >= good ? "k-b" : n >= fair ? "k-c" : "k-d";
    };
    box.innerHTML = [95, 82, 74, 61, 44].map(function (n) {
      return '<span class="kpi-chip ' + tint(n) + '"><b>' + n + '%</b> ' + grade(n) + '</span>';
    }).join("");
  };

  /* ------------------------------------------------------------------
     اللوحة
     ------------------------------------------------------------------ */
  function panel() {
    var top = get("kpiTop"), good = get("kpiGood"), fair = get("kpiFair");
    var custom = (DBX().settings || {}).kpiTop != null;

    var f = function (id, label, v, hint) {
      return '<div class="kpi-f"><label for="' + id + '">' + E(label) + '</label>' +
        '<div class="kpi-in"><input id="' + id + '" type="number" min="1" max="100" value="' + v + '"' +
        ' oninput="window.kpiPreview()"><span>%</span></div>' +
        '<small>' + E(hint) + '</small></div>';
    };

    return '<div class="kpi-card">' +
      '<div class="kpi-head"><div><strong>عتبات التقدير</strong>' +
      '<small>النسبة التي عندها يصير التقدير «ممتاز» أو «جيد جداً» أو «جيد» — ' +
      'تُطبَّق على تقدير الطالب في الخطة وعلى ثلاثة تقارير</small></div>' +
      (custom ? '<span class="kpi-tag">مُعدّلة</span>' : '<span class="kpi-tag def">افتراضية</span>') +
      '</div>' +

      '<div class="kpi-fields">' +
        f("kpi_top",  "ممتاز من",     top,  "وما فوقها") +
        f("kpi_good", "جيد جداً من",  good, "حتى ما دون الممتاز") +
        f("kpi_fair", "جيد من",       fair, "وما دونها: يحتاج متابعة") +
      '</div>' +

      '<div class="kpi-prev"><span class="kpi-prev-t">معاينة:</span>' +
      '<div id="kpiPrev"></div></div>' +

      '<div class="kpi-acts">' +
        '<button class="btn btn-primary btn-sm" onclick="window.kpiSave()">حفظ العتبات</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="window.kpiReset()">القيم الافتراضية</button>' +
      '</div></div>';
  }

  /* ------------------------------------------------------------------
     الربط — تُوضع اللوحة أعلى الشرح لا أسفله
     ------------------------------------------------------------------ */
  function boot() {
    var orig = window.setPanelKpi;
    if (typeof orig !== "function") return;

    window.setPanelKpi = function () {
      var html = "";
      try { html = orig.apply(this, arguments) || ""; } catch (e) { throw e; }
      try {
        /* السطر القديم صار غير صحيح بعد إضافة الإعدادات */
        html = html.replace("آلية موحدة لاحتساب مؤشر الإنجاز على جميع المستويات — لا توجد إعدادات",
                            "آلية موحدة لاحتساب مؤشر الإنجاز على جميع المستويات");
        return panel() + html;
      } catch (e) { return html; }
    };

    /* تُرسم المعاينة بعد أول ظهور للوحة */
    var t = setInterval(function () {
      if (document.getElementById("kpiPrev")) {
        window.kpiPreview();
      }
    }, 700);
    setTimeout(function () { clearInterval(t); }, 600000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
