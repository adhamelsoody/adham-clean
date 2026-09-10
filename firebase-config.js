/* =========================================================
   إعدادات Firebase — مشروع mirath-72e2f
   تُهيّئ Firestore وتعرّض window.__db لاستخدامه في app.js
   ---------------------------------------------------------
   ملاحظة: تأكّد أن هذه القيم مطابقة تماماً لما في
   Firebase Console ← Project settings ← Your apps.
   (نُسخت من لقطة الشاشة، فإن اختلف أي حرف بدّله من الكونسول.)
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyBheSJcU1sUnW8p96DR3Q9tQ88MP4YMPAY",
  authDomain: "mirath-72e2f.firebaseapp.com",
  projectId: "mirath-72e2f",
  storageBucket: "mirath-72e2f.firebasestorage.app",
  messagingSenderId: "617547647870",
  appId: "1:617547647870:web:64f7fa325eb6a5c2c9812f",
  measurementId: "G-01W60LD97Z"
};

window.__db = null;
try {
  if (typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    window.__db = firebase.firestore();
    window.__auth = firebase.auth();
    // يُحسّن الأداء عند تعدّد التبويبات ويتيح العمل دون اتصال مؤقتاً
    try { window.__db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* تجاهل */ }
    console.log("Firestore جاهز — mirath-72e2f");
  } else {
    console.warn("لم يتم تحميل Firebase SDK — سيعمل النظام بوضع محلي.");
  }
} catch (e) {
  console.warn("تعذّر تهيئة Firebase — سيعمل النظام بوضع محلي:", e);
  window.__db = null;
}