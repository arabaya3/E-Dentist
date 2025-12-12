# 🦷 دليل الإعداد - E-Dentist Realtime

دليل شامل لإعداد وتشغيل برنامج E-Dentist على جهاز جديد

---

## ⚡ البدء السريع (Quick Start)

إذا كنت تريد البدء بسرعة، إليك الخطوات الأساسية:

1. ✅ تثبيت Node.js 18+ و MySQL 8.0+
2. ✅ نسخ المشروع إلى جهازك
3. ✅ تشغيل `npm install`
4. ✅ إنشاء ملف `.env` مع إعدادات قاعدة البيانات و Gemini API Key
5. ✅ تشغيل `npx prisma migrate deploy` و `npx prisma db seed`
6. ✅ تشغيل `npm run build:mcp`
7. ✅ فتح Terminalين: الأول `npm run start:backend` والثاني `npm start`

**لتفاصيل أكثر، راجع الأقسام أدناه.**

---

## 📋 المتطلبات الأساسية

قبل البدء، تأكد من تثبيت الأدوات التالية على جهازك:

### 1. Node.js و npm
- **Node.js** إصدار 18 أو أحدث
- **npm** يأتي عادة مع Node.js

**للتحقق من التثبيت:**
```bash
node --version
npm --version
```

**إذا لم يكن مثبتاً:**
- زيارة [nodejs.org](https://nodejs.org) وتحميل الإصدار الموصى به

### 2. MySQL Database
- **MySQL** إصدار 8.0 أو أحدث

**للتحقق من التثبيت:**
```bash
mysql --version
```

**إذا لم يكن مثبتاً:**
- تحميل MySQL من [mysql.com](https://www.mysql.com/downloads/)

### 3. Gemini API Key
- مفتاح API من Google AI Studio
- زيارة [aistudio.google.com](https://aistudio.google.com) للحصول على المفتاح

---

## 🚀 خطوات الإعداد

### الخطوة 1: نسخ المشروع

إذا كان المشروع على GitHub:
```bash
git clone https://github.com/arabaya3/E-Dentist.git
cd E-Dentist-final-version
```

أو إذا كان المشروع في مجلد:
- انسخ المجلد `E-Dentist-final-version` إلى الجهاز الجديد

### الخطوة 2: تثبيت المكتبات المطلوبة

افتح Terminal/PowerShell في مجلد المشروع وقم بتنفيذ:

```bash
npm install
```

هذا الأمر سيقوم بتثبيت جميع المكتبات المطلوبة (قد يستغرق عدة دقائق).

### الخطوة 3: إعداد قاعدة البيانات

#### 3.1 إنشاء قاعدة بيانات جديدة في MySQL

افتح MySQL Command Line أو MySQL Workbench وأنشئ قاعدة بيانات جديدة:

```sql
CREATE DATABASE edentist CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 3.2 تكوين ملف البيئة (.env)

أنشئ ملف `.env` في المجلد الرئيسي للمشروع (`E-Dentist-final-version`) وأضف المحتوى التالي:

```ini
# Gemini API Configuration
GEMINI_API_KEY=ضع_مفتاح_الجيميني_هنا
REACT_APP_GEMINI_API_KEY=ضع_مفتاح_الجيميني_هنا

# Database Configuration
DATABASE_URL=mysql://اسم_المستخدم:كلمة_المرور@localhost:3306/edentist

# مثال:
# DATABASE_URL=mysql://root:password123@localhost:3306/edentist

# Authentication & Security (يمكنك توليد قيم عشوائية)
EDENTIST_AUTH_CLIENT_ID=client_id_example
EDENTIST_AUTH_CLIENT_SECRET=client_secret_example
EDENTIST_JWT_SECRET=jwt_secret_key_here
EDENTIST_AES_PASSPHRASE=aes_passphrase_here
EDENTIST_AES_KEY=aes_key_here

# Analytics (غير مفعّل في التطوير)
REACT_APP_ENABLE_ANALYTICS=false

# Server Configuration
PORT=5000
NODE_ENV=development
```

**ملاحظات مهمة:**
- استبدل `ضع_مفتاح_الجيميني_هنا` بمفتاح Gemini API الفعلي
- استبدل `اسم_المستخدم` و `كلمة_المرور` ببيانات MySQL الخاصة بك
- يمكنك توليد قيم عشوائية لمفاتيح الأمان (JWT, AES) أو استخدام قيم مناسبة

### الخطوة 4: إعداد قاعدة البيانات باستخدام Prisma

#### 4.1 إنشاء جداول قاعدة البيانات

```bash
npx prisma migrate deploy
```

هذا الأمر سيقوم بإنشاء جميع الجداول المطلوبة في قاعدة البيانات.

#### 4.2 ملء قاعدة البيانات ببيانات تجريبية

```bash
npx prisma db seed
```

هذا الأمر سيقوم بإضافة عيادات وأطباء وبيانات تجريبية أخرى.

### الخطوة 5: بناء MCP Server

```bash
npm run build:mcp
```

هذا الأمر يترجم ملفات TypeScript الخاصة بـ MCP Server إلى JavaScript.

### الخطوة 6: تشغيل البرنامج

يجب تشغيل خادمين منفصلين:

#### Terminal/PowerShell الأول - Backend Server

```bash
npm run start:backend
```

يجب أن ترى رسالة مثل:
```
Server running on port 5000
```

#### Terminal/PowerShell الثاني - Frontend (React)

```bash
npm start
```

سيتم فتح المتصفح تلقائياً على العنوان:
```
http://localhost:3000
```

---

## ✅ التحقق من نجاح الإعداد

### 1. التحقق من Backend
- تأكد من ظهور رسالة "Server running on port 5000" في Terminal الأول
- لا توجد أخطاء في الاتصال بقاعدة البيانات

### 2. التحقق من Frontend
- يجب أن يفتح المتصفح على `http://localhost:3000`
- يجب أن ترى واجهة E-Dentist بدون أخطاء

### 3. التحقق من قاعدة البيانات
```bash
npx prisma studio
```

هذا الأمر سيفتح واجهة رسومية لعرض بيانات قاعدة البيانات.

---

## 🐛 حل المشاكل الشائعة

### مشكلة: خطأ في الاتصال بقاعدة البيانات

**الحل:**
1. تأكد من تشغيل MySQL
2. تحقق من صحة `DATABASE_URL` في ملف `.env`
3. تأكد من أن قاعدة البيانات `edentist` موجودة

### مشكلة: MCP server not found

**الحل:**
```bash
npm run build:mcp
```

### مشكلة: Module not found

**الحل:**
```bash
npm install
```

### مشكلة: Port already in use

**الحل:**
- غيّر رقم المنفذ في ملف `.env` (مثلاً من 5000 إلى 5001)
- أو أوقف البرنامج الذي يستخدم المنفذ

### مشكلة: Microphone not working

**الحل:**
- تأكد من منح المتصفح صلاحيات الميكروفون
- استخدم HTTPS أو localhost (المتصفح يتطلب ذلك للوصول للميكروفون)

### مشكلة: Gemini API Key غير صحيح

**الحل:**
- تأكد من نسخ المفتاح بشكل صحيح في ملف `.env`
- تأكد من تفعيل المفتاح في Google AI Studio

---

## 📝 ملاحظات إضافية

### التطوير vs الإنتاج

- في بيئة التطوير (`NODE_ENV=development`): Analytics غير مفعّلة
- في بيئة الإنتاج (`NODE_ENV=production`): يجب تفعيل Analytics وضبط مفاتيح الأمان بشكل صحيح

### الأمان

- **لا تشارك ملف `.env`** مع أي شخص
- احتفظ بنسخة احتياطية من مفاتيح API والأمان
- استخدم كلمات مرور قوية لقاعدة البيانات

### التحديثات

عند تحديث المشروع:
```bash
git pull
npm install
npx prisma migrate deploy
npm run build:mcp
```

---

## 📞 الدعم

إذا واجهت أي مشاكل:
1. راجع قسم "حل المشاكل الشائعة" أعلاه
2. تحقق من سجلات الأخطاء في Terminal
3. افتح issue على GitHub repository

---

## 📚 روابط مفيدة

- [Node.js Documentation](https://nodejs.org/docs)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Gemini API Documentation](https://ai.google.dev/docs)

---

**تم إعداد هذا الدليل لمساعدة المستخدمين الجدد في إعداد البرنامج بسهولة. نتمنى لك تجربة ممتعة! 🦷✨**

