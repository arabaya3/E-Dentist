# eDentist.AI – مساعد العيادات السنيّة

منصة محادثة صوتية/نصية ثنائية اللغة (عربي/إنجليزي) تساعد المرضى على حجز المواعيد، تعديلها أو إلغائها، والاطلاع على معلومات الخدمات الطبية. تعتمد المنظومة على Gemini Live API، Prisma، وقاعدة بيانات PostgreSQL مع تكاملات اختيارية مع أنظمة الـPMS/CRM.

>.

---

## المتطلبات المسبقة

| المكون | الإصدار الموصى به |
|--------|-------------------|
| Node.js | ≥ 18.x |
| npm     | يأتي مع Node.js |
| PostgreSQL | ≥ 14 |
| حساب Google Gemini API | مفتاح فعّال |
| (اختياري) تكامل PMS/CRM | مفاتيح GoHighLevel أو Salesforce أو HubSpot |

تأكد أيضًا من تثبيت `git`, ويفضَّل إعداد `psql` للعمل مع قاعدة البيانات.

---

## 1. استنساخ المشروع وتجهيز الفرع

```bash
git clone https://github.com/Moh-abufurha/E-Dentist.git
cd E-Dentist
git checkout V4_Ayed
```

---

## 2. إعداد متغيرات البيئة

أنشئ ملف `.env` في جذر المشروع (لا يُرفع إلى Git). القيم التالية نموذج يوضح أهم المفاتيح:

```bash
# مفاتيح Gemini (مكررة مع React لأن الواجهة تبنى في المتصفح)
GEMINI_API_KEY=your_server_side_key
REACT_APP_GEMINI_API_KEY=your_browser_key

PROJECT_ID=your-google-cloud-project
REACT_APP_PROJECT_ID=your-google-cloud-project

GEMINI_MODEL=gemini-2.5-audio
REACT_APP_GEMINI_MODEL=gemini-2.5-audio
LIVE_MODEL=models/gemini-2.0-flash-exp
REACT_APP_LIVE_MODEL=models/gemini-2.0-flash-exp

API_URL=https://generativelanguage.googleapis.com/v1beta/models
REACT_APP_API_URL=https://generativelanguage.googleapis.com/v1beta/models

# سلسلة الاتصال بقاعدة البيانات (عدّل البيانات لتناسب إعدادك)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/edentist?schema=public"


> راجع `docs/pms-integration.md`, `docs/voice-engine.md`, و `docs/security.md` لمزيد من التفاصيل حول المفاتيح وحماية البيانات.

---

## 3. تثبيت الحزم

```bash
npm install
```

> في الأنظمة التي تتطلب شهادات HTTPS محلية (مثل Windows)، استخدم `npm run start-https` لاحقًا لتشغيل CRA بنمط HTTPS.

---

## 4. تجهيز قاعدة البيانات PostgreSQL

1. **إنشاء قاعدة بيانات فارغة** (مرة واحدة):
   ```bash
   createdb edentist
   ```
   أو عبر PgAdmin/واجهة أخرى.

2. **تشغيل مخططات Prisma**:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   # أو في بيئة تطوير جديدة:
   # npx prisma migrate dev --name init
   ```

3. **إدخال بيانات أولية** (أطباء + قوالب ردود). افتح `psql`:
   ```bash
   psql postgresql://postgres:postgres@localhost:5432/edentist
   ```

   ثم شغّل الأوامر التالية أو عدلها حسب احتياجاتك:
   ```sql
   INSERT INTO doctors (name, specialty, branch, work_start, work_end, available_days)
   VALUES
     ('Dr. Ayed Al-Harbi', 'تقويم الأسنان', 'Riyadh - Olaya', '09:00', '17:00', ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday']),
     ('Dr. Lina Samir', 'تبييض الأسنان', 'Riyadh - Malqa', '12:00', '20:00', ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday']);

   INSERT INTO clinic_content (slug, locale, content, tags)
   VALUES
     ('booking.confirmed', 'ar', 'تم حجز موعدك مع الدكتور {{doctor_name}} في فرع {{clinic_branch}} يوم {{appointment_date}} الساعة {{appointment_time}}.', ARRAY['booking']),
     ('booking.confirmed', 'en', 'Your appointment with Dr. {{doctor_name}} at {{clinic_branch}} is booked for {{appointment_date}} at {{appointment_time}}.', ARRAY['booking']),
     ('booking.rescheduled', 'ar', 'تم تعديل موعدك ليكون يوم {{appointment_date}} الساعة {{appointment_time}}.', ARRAY['booking']),
     ('booking.rescheduled', 'en', 'Your appointment has been rescheduled to {{appointment_date}} at {{appointment_time}}.', ARRAY['booking']),
     ('booking.missing_fields', 'ar', 'لإتمام الحجز أحتاج إلى: {{missing_fields}}.', ARRAY['booking']),
     ('booking.missing_fields', 'en', 'To complete the booking I still need: {{missing_fields}}.', ARRAY['booking']),
     ('booking.cancelled', 'ar', 'تم إلغاء الموعد بنجاح. نأمل نراك قريباً!', ARRAY['booking']),
     ('booking.cancelled', 'en', 'Your appointment has been cancelled successfully. We hope to see you soon!', ARRAY['booking']),
     ('inquiry.general', 'ar', 'يسرّنا الرد على استفساراتك حول خدمات العيادة مثل التنظيف، التقويم، الزراعة أو التبييض. كيف يمكنني المساعدة؟', ARRAY['inquiry']),
     ('inquiry.general', 'en', 'I’m happy to help with questions about cleaning, orthodontics, implants, or whitening. How can I assist you today?', ARRAY['inquiry']);
   ```

   يمكنك إضافة المزيد من الأطباء أو المحتوى بنفس البنية متى احتجت.

4. **اختبر الجداول**:
   ```bash
   npx prisma studio
   ```
   افتح المتصفح على العنوان الذي يظهر للتأكد من البيانات.

---

## 5. تشغيل النظام محليًا

1. **تشغيل واجهة التطوير (CRA + HTTPS)**:
   ```bash
   npm run start-https
   ```
   - سيفتح المتصفح على `https://localhost:3000`.
   - قم بالموافقة على الشهادة الذاتية لمرة واحدة.

2. **الحوار الصوتي/النصي**:
   - استخدم اللوحة الجانبية لإرسال رسائل نصية.
   - يمكن تفعيل الميكروفون أو مشاركة الشاشة عبر أزرار `ControlTray`.

3. **اختبارات صوتية سريعة** (اختياري):
   ```bash
   npm run test:audio         # إرسال ملف WAV قصير والحصول على رد مسموع
   npm run test:voice-engine  # اختبار التحويلات الصوتية ثنائية اللغة
   npm run demo:conversation  # سكربت محادثة نصية تجريبية (Node.js)
   ```

> جميع هذه الأوامر تعتمد على ضبط مفاتيح Gemini بشكل صحيح في `.env`.

---

## 6. تكاملات الـPMS/CRM (اختياري)

- فعّل المتغيرات الخاصة بكل موفّر داخل `.env` كما هو موضح في `docs/pms-integration.md`.
- نقاط النهاية المحلية متاحة عبر البروكسي (`/api/integrations/pms/...`) أثناء تشغيل CRA.
- يمكن استخدام لوحة التحليلات لدفع تقارير الأداء مباشرة لأنظمة الطرف الثالث.

---

## 7. بنية المجلدات المهمة

| المسار | الوصف |
|--------|-------|
| `src/services/conversation_manager.ts` | منطق المحادثة وتدفق الحجوزات |
| `server/dbBookingIntegration.ts` | عمليات Prisma المباشرة على جدول الحجوزات |
| `docs/voice-engine.md` | إعداد مسارات STT/TTS |
| `scripts/*` | سكربتات تشغيل واختبار سريعة |
| `prisma/migrations` | تعريف مخطط قاعدة البيانات |

---

## 8. نشر النسخة أو مشاركة المشروع

1. اضبط مفاتيح البيئة على الخادم (سواء باستخدام Docker أو خدمة CI/CD).
2. شغّل `npm run build` للحصول على نسخة إنتاجية.
3. قم بتشغيل الـ backend (إذا كنت ستفصل الكود إلى طبقة Node مستقلة) أو استخدم خدمات استضافة CRA.
4. تأكد من إنشاء قاعدة بيانات Prod وتشغيل `npx prisma migrate deploy` عليها قبل نشر الواجهة.

---

## 9. الدعم والتوثيق الإضافي

- **الأمان والالتزام**: راجع `docs/security.md`.
- **طبقة الصوت**: راجع `docs/voice-engine.md`.
- **التكاملات الخارجية**: راجع `docs/pms-integration.md`.
- **البنية عالية التوافر**: راجع `docs/high-availability.md`.
- **تشغيل الأعطال والفشل**: راجع `docs/runbooks/voice-agent-failover.md`.
- **أدلة الالتزام HIPAA/SOC2**: راجع `docs/compliance-evidence.md`.
- **اختبارات الأمان**: شغّل `npm test` لقراءة اختبارات Jest في `src/__tests__/security-sanitizer.test.ts`.

لأي استفسار إضافي أو مساهمة، يرجى فتح تذكرة جديدة (Issue) داخل المستودع. بالتوفيق! 🎧🦷
---

## Clinic content templates / ????? ???? ???????

- ??? ????? ????? ???? `clinic_content` ???? ?? ?????? `20251112153000_create_clinic_content` ???? ???????? ???? ???? ?? ??? `ConversationManager` ?????? ???? ?????? ???????? ???????? ?????? ??? ?????? ??????.
- ?????? ?? ?????? ??????? ???? ????? Prisma ??????? ??? ??? ?????????:
  ```bash
  npx prisma migrate deploy
  npx prisma db seed
  ```
- ???? ????? ??????? ??? ??? ??? `psql` ?? Prisma Studio ?????? ?? ????? ???? ????? ??? `slug` (??? `booking.confirmed`) ?????? (`ar` ?? `en`). ???? ?????? ???????? ??? `{{doctor_name}}`, `{{appointment_date}}`, ??????.
