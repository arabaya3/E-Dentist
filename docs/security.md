# eDentist.AI Security Hardening

تهدف هذه المرحلة إلى تلبية متطلبات HIPAA و SOC2 عبر ضبط عناصر الأمان الأساسية:

## تشفير البيانات

- **أثناء النقل**: يقوم العميل بالتحقق من البروتوكول وإعادة التوجيه تلقائيًا إلى HTTPS، ويوصى بالنشر خلف عاكس أو بوابة تدعم TLS 1.2+.
- **أثناء التخزين (تطبيق)**: تم إضافة وحدة `server/security.ts` التي تعتمد `AES-256-GCM` لتشفير اللقطات الحساسة (مثل حالة التحليلات) باستخدام المفتاح:

```bash
EDENTIST_AES_KEY=<64-hex>
# أو
EDENTIST_AES_PASSPHRASE="strong passphrase value"
```

يتم تخزين الملفات المشفرة في `server/data/analytics-state.enc` بصلاحيات `600`.
- **قواعد البيانات والنسخ الاحتياطية**: ينصح باستخدام CloudSQL/AlloyDB مع Transparent Data Encryption ونسخ احتياطية تلقائية مشفرة. في حالة PostgreSQL محلي، يمكن تفعيل تشفير القرص (dm-crypt) أو استخدام خدمات سحابية تدعم التشفير المدمج. نسخ GCS/Backups تقيم على bucket ذو إعداد `Uniform bucket-level access` وتفعيل `Bucket Lock`.

## إدارة الهويات والجلسات

- تم إضافة خادم JWT مصغر عبر مسار `POST /api/auth/token` مع بيانات اعتماد تطبيقية (`EDENTIST_AUTH_CLIENT_ID` و `EDENTIST_AUTH_CLIENT_SECRET`).
- جميع نقاط `/api/analytics/*` و`/api/integrations/pms/*` تتطلب رمز Bearer صالحاً بخاصيات نطاق (`scope`) مناسبة.
- لتوليد الرموز يتم استخدام متغير `EDENTIST_JWT_SECRET` بطول لا يقل عن 32 محرفًا.

## تنظيف السجلات (Logs Scrubbing)

- كل النصوص التي تعالج في الواجهة أو تُرسل إلى محرك التحليلات تمر عبر `sanitizeSensitiveText` الذي يحجب البريد الإلكتروني، الهاتف، أرقام البطاقات، ويحاول إزالة أنماط الحقن (SQL/Command).
- تم منع تخزين البيانات الحساسة ضمن حالة الجلسات أو السجلات الصادرة.

## سجلات التدقيق (Audit Logging)

- تمت إضافة وحدة `server/audit-logger.ts` التي تسجّل الأحداث الحساسة (إصدار الرموز، الوصول للتحليلات، طلبات الـ PMS) كسجلات مشفّرة `audit-log.ndjson` داخل `server/data` بصلاحيات `600`.
- كل سجل يُخزَّن كحمولة `AES-256-GCM` تحتوي على الحد الأدنى من metadata (نوع العملية، الحالة، الممثل، عنوان الـ IP، المعرفات).
- يمكن تصدير السجلات لأغراض التدقيق عبر استدعاء `exportDecryptedAuditEvents` أو بقراءة الملف وفك التشفير باستخدام نفس المفتاح السرّي.

## خطة الاستجابة للحوادث

- تم نشر خطة مفصلة في `docs/runbooks/voice-agent-failover.md` تغطي التصنيف، أدوات التشخيص، إجراءات التحويل، وقوالب التواصل.
- يلتزم الفريق بتمارين دورية (ربع سنوية) لمحاكاة فشل المنطقة أو قاعدة البيانات، وتوثيق النتائج ضمن مستند الأدلة.

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

## أدلة الالتزام

- وثيقة `docs/high-availability.md` تعرض الهيكلية الموزعة وخطوات الـ DR.
- `docs/runbooks/voice-agent-failover.md` تُفصّل إجراءات SEV1/SEV2.
- `docs/compliance-evidence.md` تجمع قائمة بالسياسات والاختبارات ومتطلبات HIPAA/SOC2 لتسهيل عمليات التدقيق.

