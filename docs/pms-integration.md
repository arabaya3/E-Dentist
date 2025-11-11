# PMS/CRM Integrations Layer

تضيف وحدة **pmsIntegration** طبقة تكامل آمنة بين eDentist.AI وأنظمة إدارة العيادات أو أنظمة الـCRM مثل GoHighLevel وSalesforce وHubSpot.

## المتطلبات البيئية

قم بتعريف متغيرات البيئة التالية داخل `.env` (أو خدمة سكرتية آمنة):

```bash
# GoHighLevel
PMS_GHL_BASE_URL=https://rest.gohighlevel.com/v1
PMS_GHL_API_KEY=ghl_xxx
PMS_GHL_LOCATION_ID=location_xxx
PMS_GHL_CALENDAR_ID=calendar_xxx

# Salesforce
PMS_SALESFORCE_BASE_URL=https://your-instance.my.salesforce.com
PMS_SALESFORCE_TOKEN=00Dxx!AQE...
PMS_SALESFORCE_OWNER_ID=005xx00000123ABC
PMS_SALESFORCE_EVENT_RECORD_TYPE=012xx0000000XYZ

# HubSpot
PMS_HUBSPOT_BASE_URL=https://api.hubapi.com
PMS_HUBSPOT_PRIVATE_APP_TOKEN=pat-eDentist-xxx
PMS_HUBSPOT_PIPELINE_ID=default
PMS_HUBSPOT_STAGE_ID=appointmentscheduled
```

- إن لم يكن أحد المتغيرات موجودًا، يتم تعطيل الموفر تلقائيًا.
- يمكن تعديل أزمنة المهلة عبر `PMS_*_TIMEOUT_MS`.

## نقاط النهاية المحلية

خلال التطوير (via CRA proxy) يتم توفير النقاط التالية:

| Endpoint | الوصف |
| --- | --- |
| `GET /api/integrations/pms/providers` | قائمة الموفرين وحالة التهيئة |
| `POST /api/integrations/pms/:provider/book` | إنشاء حجز جديد |
| `PATCH /api/integrations/pms/:provider/booking/:id` | تحديث الحجز |
| `DELETE /api/integrations/pms/:provider/booking/:id` | إلغاء الحجز |
| `POST /api/integrations/pms/:provider/performance` | إرسال تقرير الأداء إلى النظام الخارجي |

> الإرسال إلى `/performance` يستهلك تقرير التحليلات الحالي تلقائيًا إذا لم يتم تمرير حقل `report` في الـpayload.

## استخدام الواجهة البرمجية داخل الواجهة

يوفّر الملف `src/services/pmsIntegration.ts` دوالًا جاهزة:

```ts
import {
  bookAppointment,
  updateAppointment,
  cancelAppointment,
  pushPerformanceReport,
} from "@/services/pmsIntegration";
```

- يقوم `ConversationManager` باستدعاء هذه الدوال لمزامنة الحجوزات بناءً على نية المستخدم.
- تسمح لوحة التحليلات بدفع التقارير إلى النظام المفضل مباشرة من واجهة المستخدم.

## ملاحظات الأمان

- المفاتيح الحساسة يجب تخزينها في مدير أسرار أو متغيرات بيئة خاصة بالخادم.
- جميع الطلبات الخارجة تمر عبر طبقة تحقق تُعيد أخطاء تفصيلية بدون كشف البيانات السرية.
- يدعم النظام إعادة تحميل الإعدادات دون إعادة التشغيل (`pmsIntegration.reload()`).

