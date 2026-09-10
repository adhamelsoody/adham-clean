/* =========================================================================
   functions/index.js — إدارة حسابات الدخول
   -------------------------------------------------------------------------
   خمس عمليات لا يستطيع المتصفح تنفيذها، لأن عميل Firebase لا يملك صلاحية
   على حسابات غير حسابه. كلها تتحقق من هوية المنادي وصلاحيته أولاً.

     deleteUserFully   حذف المستند وحساب الدخول معاً — كان الحساب يبقى
                       قادراً على الدخول بعد حذف المستخدم من النظام.
     updateUserLogin   تعديل البريد أو رقم الهوية في المستند وفي Authentication
                       معاً — كان المستخدم يجد نفسه يدخل بالبريد القديم.
     resetPasswordSMS  إعادة تعيين كلمة المرور بعد التحقق من الجوال برمز SMS.
     listOrphans       كشف الحسابات اليتيمة في الاتجاهين.
     approveUser       اعتماد حساب معلّق وتفعيله بدور محدَّد.

   يتطلب خطة Blaze. النشر:  firebase deploy --only functions
   ========================================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

const REGION = "europe-west1";
const opts = { region: REGION, cors: true };

/* ------------------------------------------------------------------
   أدوات مشتركة
   ------------------------------------------------------------------ */
async function profileOf(uid) {
  if (!uid) return null;
  const s = await db.doc(`users/${uid}`).get();
  return s.exists ? s.data() : null;
}

/** المنادي مدير فعّال؟ */
async function requireAdmin(req) {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "سجّل الدخول أولاً.");
  const p = await profileOf(uid);
  if (!p || p.active === false) throw new HttpsError("permission-denied", "حسابك موقوف.");
  if (p.role !== "admin" && p.role !== "owner") {
    throw new HttpsError("permission-denied", "هذه العملية للمدير وحده.");
  }
  return { uid, profile: p };
}

/** سجل تدقيق — يُكتب مع كل عملية حساسة */
async function audit(actorUid, actorName, action, target, detail) {
  try {
    const id = "a" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await db.doc(`auditLog/${id}`).set({
      id, ts: Date.now(),
      uid: actorUid, actor: actorName || "—", role: "admin",
      action: "update", coll: "users", collAr: "المستخدمون",
      docId: target, label: detail || action,
      changes: [{ k: action, kh: action, from: "—", to: detail || "—" }],
      via: "server"
    });
  } catch (e) { console.warn("audit:", e.message); }
}

/** توحيد صيغة الجوال إلى E.164 — الرقم المحلي يبدأ بصفر ويُستبدل برمز الدولة */
function e164(raw, cc) {
  let n = String(raw == null ? "" : raw).replace(/[^\d+]/g, "");
  if (!n) return "";
  if (n.startsWith("+")) return n;
  if (n.startsWith("00")) return "+" + n.slice(2);
  if (n.startsWith("0")) return "+" + (cc || "966") + n.slice(1);
  return n.length >= 11 ? "+" + n : "+" + (cc || "966") + n;
}

async function countryCode() {
  try {
    const s = await db.doc("settings/general").get();
    const d = s.exists ? s.data() : {};
    const cc = String(d.waCountryCode || d.countryCode || "").replace(/\D/g, "");
    return cc || "966";
  } catch (e) { return "966"; }
}

/* =========================================================================
   ١) حذف المستخدم كاملاً
   ========================================================================= */
exports.deleteUserFully = onCall(opts, async (req) => {
  const me = await requireAdmin(req);
  const uid = String((req.data && req.data.uid) || "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "معرّف المستخدم مطلوب.");
  if (uid === me.uid) throw new HttpsError("failed-precondition", "لا تحذف حسابك أنت.");

  const target = await profileOf(uid);

  /* آخر مدير لا يُحذف — وإلا بقي النظام بلا مالك */
  if (target && (target.role === "admin" || target.role === "owner")) {
    const admins = await db.collection("users")
      .where("role", "==", "admin").where("active", "==", true).limit(3).get();
    if (admins.size <= 1) {
      throw new HttpsError("failed-precondition", "هذا آخر مدير فعّال — عيّن مديراً غيره أولاً.");
    }
  }

  let authDeleted = false;
  try { await auth.deleteUser(uid); authDeleted = true; }
  catch (e) { if (e.code !== "auth/user-not-found") throw new HttpsError("internal", e.message); }

  await db.doc(`users/${uid}`).delete().catch(() => {});
  await audit(me.uid, me.profile.name, "حذف حساب",
              uid, (target && target.name) || uid);

  return { ok: true, authDeleted, name: (target && target.name) || "" };
});

/* =========================================================================
   ٢) تعديل بيانات الدخول — للمدير أو لصاحب الحساب
   ========================================================================= */
exports.updateUserLogin = onCall(opts, async (req) => {
  const callerUid = req.auth && req.auth.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "سجّل الدخول أولاً.");

  const uid = String((req.data && req.data.uid) || callerUid).trim();
  const caller = await profileOf(callerUid);
  if (!caller || caller.active === false) throw new HttpsError("permission-denied", "حسابك موقوف.");

  const isAdmin = caller.role === "admin" || caller.role === "owner";
  const isSelf  = callerUid === uid;
  if (!isAdmin && !isSelf) {
    throw new HttpsError("permission-denied", "لا تعدّل بيانات دخول غيرك.");
  }

  const target = await profileOf(uid);
  if (!target) throw new HttpsError("not-found", "المستخدم غير موجود.");

  let email    = String((req.data && req.data.email) || "").trim().toLowerCase();
  let username = String((req.data && req.data.username) || "").replace(/\D/g, "");

  if (!email && !username) throw new HttpsError("invalid-argument", "لا جديد للحفظ.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "صيغة البريد غير صحيحة.");
  }
  if (username && username.length !== 10) {
    throw new HttpsError("invalid-argument", "رقم الهوية عشرة أرقام.");
  }

  /* لا تكرار في رقم الهوية */
  if (username && username !== target.username) {
    const dup = await db.collection("users").where("username", "==", username).limit(1).get();
    if (!dup.empty && dup.docs[0].id !== uid) {
      throw new HttpsError("already-exists", "رقم الهوية مسجَّل لمستخدم آخر.");
    }
  }

  /* بريد الدخول: الحقيقي إن وُجد، وإلا الاصطناعي من رقم الهوية */
  const newUsername = username || target.username || "";
  const loginEmail  = email || (newUsername ? newUsername + "@mirath.id" : target.loginEmail);

  if (loginEmail) {
    try {
      await auth.updateUser(uid, { email: loginEmail, emailVerified: false });
    } catch (e) {
      if (e.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "هذا البريد مستعمل في حساب آخر.");
      }
      if (e.code !== "auth/user-not-found") throw new HttpsError("internal", e.message);
    }
  }

  const patch = { loginEmail };
  if (email)    patch.email = email;
  if (username) patch.username = username;
  await db.doc(`users/${uid}`).set(patch, { merge: true });

  await audit(callerUid, caller.name, "تعديل بيانات الدخول", uid,
              (target.name || uid) + " ← " + loginEmail);

  return { ok: true, loginEmail };
});

/* =========================================================================
   ٣) إعادة تعيين كلمة المرور برمز جوال
   -------------------------------------------------------------------------
   المنادي هنا جلسةُ هاتفٍ موثَّقة أنشأها المتصفح عبر Firebase Phone Auth،
   فرقم الجوال في رمزه محقَّق من فايربيس نفسه لا من كلامنا. نطابقه بالرقم
   المسجَّل في ملف المستخدم، فلا يُعيد أحدٌ كلمة مرور غيره.
   ========================================================================= */
exports.resetPasswordSMS = onCall(opts, async (req) => {
  const t = req.auth && req.auth.token;
  const phoneVerified = t && t.phone_number;
  if (!phoneVerified) {
    throw new HttpsError("unauthenticated", "لم يُتحقّق من الجوال.");
  }

  const username = String((req.data && req.data.username) || "").replace(/\D/g, "");
  const password = String((req.data && req.data.password) || "");

  if (!username) throw new HttpsError("invalid-argument", "رقم الهوية مطلوب.");
  if (password.length < 8) throw new HttpsError("invalid-argument", "كلمة المرور ثمانية أحرف على الأقل.");

  const q = await db.collection("users").where("username", "==", username).limit(1).get();
  if (q.empty) throw new HttpsError("not-found", "لا حساب بهذا الرقم.");

  const doc = q.docs[0];
  const u = doc.data();
  if (u.active === false) throw new HttpsError("permission-denied", "الحساب موقوف — راجع الإدارة.");

  const cc = await countryCode();
  const stored = e164(u.phone, cc);
  if (!stored) throw new HttpsError("failed-precondition", "لا جوال مسجَّل لهذا الحساب — راجع الإدارة.");
  if (stored !== phoneVerified) {
    throw new HttpsError("permission-denied", "الجوال لا يطابق المسجَّل لهذا الحساب.");
  }

  const targetUid = String(u.uid || doc.id);
  await auth.updateUser(targetUid, { password });

  /* إبطال الجلسات القائمة — من سرق كلمة المرور القديمة يخرج فوراً */
  await auth.revokeRefreshTokens(targetUid).catch(() => {});
  await audit(targetUid, u.name, "إعادة تعيين كلمة المرور بالجوال", targetUid, u.name || "");

  return { ok: true, name: u.name || "" };
});

/* =========================================================================
   ٤) كشف الحسابات اليتيمة
   ========================================================================= */
exports.listOrphans = onCall(opts, async (req) => {
  const me = await requireAdmin(req);

  /* حسابات الدخول */
  const authUsers = [];
  let page;
  do {
    const res = await auth.listUsers(1000, page);
    res.users.forEach(u => authUsers.push({
      uid: u.uid,
      email: u.email || "",
      phone: u.phoneNumber || "",
      disabled: u.disabled,
      created: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime || ""
    }));
    page = res.pageToken;
  } while (page);

  /* المستندات */
  const snap = await db.collection("users").get();
  const docs = {};
  snap.forEach(d => { docs[d.id] = d.data(); });

  const noDoc = authUsers.filter(a => !docs[a.uid]);
  const noAuth = Object.keys(docs)
    .filter(id => !authUsers.some(a => a.uid === id))
    .map(id => ({
      uid: id,
      name: docs[id].name || "",
      role: docs[id].role || "",
      username: docs[id].username || "",
      email: docs[id].email || docs[id].loginEmail || "",
      active: docs[id].active !== false
    }));

  await audit(me.uid, me.profile.name, "كشف الحسابات اليتيمة", "—",
              noDoc.length + " بلا ملف · " + noAuth.length + " بلا حساب");

  return {
    ok: true,
    totals: { auth: authUsers.length, docs: Object.keys(docs).length },
    noDoc, noAuth
  };
});

/* =========================================================================
   ٥) اعتماد حساب معلّق
   ========================================================================= */
exports.approveUser = onCall(opts, async (req) => {
  const me = await requireAdmin(req);
  const uid = String((req.data && req.data.uid) || "").trim();
  const role = String((req.data && req.data.role) || "teacher");
  const reject = !!(req.data && req.data.reject);

  if (!uid) throw new HttpsError("invalid-argument", "معرّف المستخدم مطلوب.");
  if (["teacher", "parent", "student", "supervisor"].indexOf(role) === -1) {
    throw new HttpsError("invalid-argument", "دور غير مسموح.");
  }

  const target = await profileOf(uid);
  if (!target) throw new HttpsError("not-found", "الطلب غير موجود.");

  if (reject) {
    try { await auth.deleteUser(uid); } catch (e) {}
    await db.doc(`users/${uid}`).delete().catch(() => {});
    await audit(me.uid, me.profile.name, "رفض طلب حساب", uid, target.name || uid);
    return { ok: true, rejected: true };
  }

  await db.doc(`users/${uid}`).set(
    { role, active: true, pending: false, approvedBy: me.profile.name || "", approvedAt: Date.now() },
    { merge: true }
  );
  await audit(me.uid, me.profile.name, "اعتماد حساب", uid, (target.name || uid) + " ← " + role);

  return { ok: true, role };
});
