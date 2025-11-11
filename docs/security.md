# eDentist.AI Security Hardening

تهدف هذه المرحلة إلى تلبية متطلبات HIPAA و SOC2 عبر ضبط عناصر الأمان الأساسية:

## تشفير البيانات

- **أثناء النقل**: يقوم العميل بالتحقق من البروتوكول وإعادة التوجيه تلقائيًا إلى HTTPS، ويوصى بالنشر خلف عاكس أو بوابة تدعم TLS 1.2+.
- **أثناء التخزين**: تم إضافة وحدة `server/security.ts` التي تعتمد `AES-256-GCM` لتشفير اللقطات الحساسة (مثل حالة التحليلات) باستخدام المفتاح:

```bash
EDENTIST_AES_KEY=<64-hex>
# أو
EDENTIST_AES_PASSPHRASE="strong passphrase value"
```

يتم تخزين الملفات المشفرة في `server/data/analytics-state.enc` بصلاحيات `600`.

## إدارة الهويات والجلسات

- تم إضافة خادم JWT مصغر عبر مسار `POST /api/auth/token` مع بيانات اعتماد تطبيقية (`EDENTIST_AUTH_CLIENT_ID` و `EDENTIST_AUTH_CLIENT_SECRET`).
- جميع نقاط `/api/analytics/*` و`/api/integrations/pms/*` تتطلب رمز Bearer صالحاً بخاصيات نطاق (`scope`) مناسبة.
- لتوليد الرموز يتم استخدام متغير `EDENTIST_JWT_SECRET` بطول لا يقل عن 32 محرفًا.

## تنظيف السجلات (Logs Scrubbing)

- كل النصوص التي تعالج في الواجهة أو تُرسل إلى محرك التحليلات تمر عبر `sanitizeSensitiveText` الذي يحجب البريد الإلكتروني، الهاتف، أرقام البطاقات، ويحاول إزالة أنماط الحقن (SQL/Command).
- تم منع تخزين البيانات الحساسة ضمن حالة الجلسات أو السجلات الصادرة.

## تشغيل الاختبارات الأمنية

تم إضافة اختبار Jest في `src/__tests__/security-sanitizer.test.ts` للتأكد من استمرار عمل آلية التنظيف.

```bash
npm test -- security-sanitizer.test.ts
```

## إعداد متغيرات البيئة

```bash
# JWT
EDENTIST_JWT_SECRET="change-me-please-change-me-please"
EDENTIST_AUTH_CLIENT_ID="ed-admin"
EDENTIST_AUTH_CLIENT_SECRET="super-secret-string"

# AES-256
EDENTIST_AES_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
# أو بديل passphrase
EDENTIST_AES_PASSPHRASE="edDentist secret passphrase"
```

> **ملاحظة**: يفضل تخزين هذه القيم في Vault أو Secret Manager وليس ضمن مستودع الشفرة.

