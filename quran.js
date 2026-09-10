/* =========================================================================
   محرّك القرآن — الأساس الذي يقوم عليه المصحف التفاعلي ومقادير الخطط
   -------------------------------------------------------------------------
   البيانات في مجلد quran/ :
     surahs.json    فهرس السور (114)
     locate.json    سورة:آية -> [صفحة، جزء، حزب، ثمن]
     pagemeta.json  حدود كل صفحة من 604
     pages/N.json   آيات الصفحة مقسّمة كلمة كلمة (تُحمَّل عند الطلب فقط)

   لا يُحمَّل المصحف كاملاً أبداً — الصفحة الواحدة ١.٨ كيلوبايت وسطياً.
   ========================================================================= */
"use strict";

window.Quran = (function () {

  const CACHE = { pages: {}, surahs: null, locate: null, pagemeta: null };
  const base = () => (location.pathname.indexOf("/admin/") > -1 ? "../" : "") + "quran/";

  async function grab(file, key) {
    if (CACHE[key]) return CACHE[key];
    const r = await fetch(base() + file, { cache: "force-cache" });
    if (!r.ok) throw new Error("تعذّر تحميل " + file);
    CACHE[key] = await r.json();
    return CACHE[key];
  }

  /* ---------- الفهارس ---------- */
  const surahs   = () => grab("surahs.json", "surahs");
  const locateDB = () => grab("locate.json", "locate");
  const pageMeta = () => grab("pagemeta.json", "pagemeta");

  /* ---------- صفحة واحدة ---------- */
  async function page(n) {
    n = Number(n);
    if (n < 1 || n > 604) throw new Error("رقم صفحة خارج المدى: " + n);
    if (CACHE.pages[n]) return CACHE.pages[n];
    const r = await fetch(base() + "pages/" + n + ".json", { cache: "force-cache" });
    if (!r.ok) throw new Error("تعذّر تحميل الصفحة " + n);
    return (CACHE.pages[n] = await r.json());
  }

  /* ---------- موضع آية ---------- */
  async function locate(surah, ayah) {
    const db = await locateDB();
    const v = db[surah + ":" + ayah];
    if (!v) return null;
    return { page: v[0], juz: v[1], hizb: v[2], quarter: v[3] };
  }

  /* ---------- اسم السورة ---------- */
  async function surahName(id) {
    const list = await surahs();
    const s = list.find(x => x.i === Number(id));
    return s ? s.n : "";
  }

  /* ---------- عدد آيات سورة ---------- */
  async function ayahCount(id) {
    const list = await surahs();
    const s = list.find(x => x.i === Number(id));
    return s ? s.a : 0;
  }

  /* ---------- مقارنة موضعين ---------- */
  function before(aS, aA, bS, bA) {
    return Number(aS) < Number(bS) || (Number(aS) === Number(bS) && Number(aA) <= Number(bA));
  }

  /* ---------- كل آيات مدى (واجب الطالب) ---------- */
  async function range(fromS, fromA, toS, toA) {
    const a = await locate(fromS, fromA), b = await locate(toS, toA);
    if (!a || !b) return [];
    const out = [];
    for (let p = a.page; p <= b.page; p++) {
      const rows = await page(p);
      rows.forEach(v => {
        if (before(fromS, fromA, v.s, v.a) && before(v.s, v.a, toS, toA)) {
          out.push(Object.assign({ page: p }, v));
        }
      });
    }
    return out;
  }

  /* ---------- مقادير: الأوجه والأثمان والأجزاء في مدى ---------- */
  async function measure(fromS, fromA, toS, toA) {
    const a = await locate(fromS, fromA), b = await locate(toS, toA);
    if (!a || !b) return null;
    const rows = await range(fromS, fromA, toS, toA);
    const uniq = k => new Set(rows.map(v => v[k])).size;
    return {
      ayahs:    rows.length,
      words:    rows.reduce((n, v) => n + v.w.length, 0),
      faces:    b.page - a.page + 1,          // الوجه = الصفحة
      quarters: uniq("q"),                    // الأثمان
      hizbs:    uniq("h"),
      juzs:     uniq("j"),
      from: { page: a.page, juz: a.juz, hizb: a.hizb, quarter: a.quarter },
      to:   { page: b.page, juz: b.juz, hizb: b.hizb, quarter: b.quarter }
    };
  }

  /* ---------- التقدّم بمقدار (لتوليد واجب الغد) ----------
     unit: "face" وجه · "quarter" ثمن · "hizb" حزب · "juz" جزء · "ayah" آية
     dir : 1 تصاعدي (البقرة → الناس) · -1 تنازلي (الناس → البقرة)      */
  async function advance(fromS, fromA, amount, unit, dir) {
    dir = dir === -1 ? -1 : 1;
    const start = await locate(fromS, fromA);
    if (!start) return null;

    if (unit === "ayah") {
      let s = Number(fromS), a = Number(fromA), left = Number(amount) - 1;
      while (left > 0) {
        const cnt = await ayahCount(s);
        if (dir === 1) {
          if (a < cnt) { a++; } else if (s < 114) { s++; a = 1; } else break;
        } else {
          if (a > 1) { a--; } else if (s > 1) { s--; a = await ayahCount(s); } else break;
        }
        left--;
      }
      return { surah: s, ayah: a };
    }

    const per = { face: 1, quarter: 0, hizb: 0, juz: 0 };
    let targetPage = start.page;
    if (unit === "face") {
      targetPage = start.page + dir * (Number(amount) - 1);
    } else {
      const key = unit === "quarter" ? "quarter" : unit === "hizb" ? "hizb" : "juz";
      const want = start[key] + dir * Number(amount);
      const pm = await pageMeta();
      /* ابحث عن أول صفحة تحمل الوحدة المطلوبة */
      for (const row of (dir === 1 ? pm : pm.slice().reverse())) {
        const rows = await page(row.p);
        if (rows.some(v => (key === "quarter" ? v.q : key === "hizb" ? v.h : v.j) === want)) {
          targetPage = row.p; break;
        }
      }
    }
    targetPage = Math.max(1, Math.min(604, targetPage));
    const pm = await pageMeta();
    const row = pm.find(x => x.p === targetPage);
    const end = dir === 1 ? row.l : row.f;
    return { surah: end[0], ayah: end[1], page: targetPage };
  }

  /* ---------- تطبيع النص العربي ----------
     يحذف التشكيل وعلامات الوقف ورموز مصحف حفص، ويوحّد الألف والهمزة
     والتاء المربوطة والياء، حتى يعمل البحث مهما اختلفت كتابة المستخدم. */
  function norm(t) {
    return String(t || "")
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g, "")
      .replace(/[\u0622\u0623\u0625\u0671\u0672\u0673]/g, "\u0627")
      .replace(/\u0629/g, "\u0647")
      .replace(/[\u0649\u064A]/g, "\u064A")
      .replace(/\u0624/g, "\u0648")
      .replace(/\u0626/g, "\u064A")
      .replace(/\u0640/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ---------- بحث بالنص ---------- */
  async function search(q, limit) {
    const needle = norm(q);
    if (needle.length < 3) return [];
    const out = [];
    const strip = norm;
    for (let p = 1; p <= 604 && out.length < (limit || 25); p++) {
      const rows = await page(p);
      for (const v of rows) {
        if (strip(v.w.join(" ")).indexOf(needle) > -1) {
          out.push({ surah: v.s, ayah: v.a, page: p, text: v.w.join(" ") });
          if (out.length >= (limit || 25)) break;
        }
      }
    }
    return out;
  }

  return { surahs, page, locate, surahName, ayahCount, range, measure, advance, search, before, norm,
           _cache: CACHE };
})();
