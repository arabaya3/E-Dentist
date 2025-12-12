# 🔧 دليل تشغيل سريع (AR)

## المتطلبات
- Node.js 18+ و npm
- MySQL شغّال
- ملف `.env` في جذر المشروع يحوي على الأقل:
```
EDENTIST_API_BASE_URL=https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1
AGENT_API_BASE_URL=<رابط الـ OTP/Auth>
GEMINI_API_KEY=<المفتاح>
REACT_APP_GEMINI_API_KEY=<المفتاح>
DATABASE_URL=mysql://user:pass@localhost:3306/edentist
```

## الخطوات
1) تثبيت الحزم من الجذر: `npm install`
2) إعداد Prisma وبناء MCP (من `mcp-server/`):
```
npm install
npx prisma generate
npm run build
```
3) تشغيل MCP: `node dist/index.js`
4) تشغيل Backend: من `server/` → `npm start`
5) تشغيل الواجهة: من الجذر → `npm start`

## التحقق السريع
- افتح `http://localhost:3000`
- تأكد أن الصوت والـ Agent يعملان بدون أخطاء console

## ملاحظات
- إنشاء موعد يتطلب `userId` موجود فعلياً وساعة متاحة في `free_slots` وإلا قد يرجع 400 "user not found" أو 500 "SLOT_UNAVAILABLE".
