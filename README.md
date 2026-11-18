# منظومة الشاشات الدعائية: المرحلة 1

ربط شاشات أندرويد من الهاتف، متابعة حالتها، وإعادة تحميلها عن بُعد.

## إعداد Supabase

1. في **Authentication** فعّل **Anonymous Sign-Ins**.
2. في **SQL Editor** شغّل ملفات `supabase/migrations` بالترتيب.
3. في **Realtime > Settings** عطّل **Allow public access**.
4. في **Authentication > URL Configuration** اجعل Site URL رابط الموقع، وأضف `https://موقعك/auth/callback` إلى Redirect URLs.

## النشر

1. استورد المستودع من GitHub في منصة تدعم Next.js.
2. أضف المتغيرين الموجودين في `.env.example`، وقيمهما من Supabase > Project Settings > API Keys.
3. انشر المشروع، ثم افتح `/login` واطلب رمز الدخول إلى بريدك. أول حساب يدخل ينشئ الشركة.

## تجهيز شاشة أندرويد

1. حدّث Chrome، وافتح `https://موقعك/play`.
2. من قائمة Chrome اختر **Add to Home screen** أو **Install app**، ثم افتح المشغّل من أيقونته.
3. من هاتفك اضغط **ربط شاشة** وأدخل الرمز الظاهر.
4. اضغط **تعريف الشاشة**. يجب أن تتحول الشاشة للأصفر وتصدر نغمة.
5. راجع صفحة الشاشة في اللوحة. إن ظهر أن الصوت يحتاج لمسة، المس الشاشة مرة ثم أعد الاختبار.

للتشغيل الدائم في مكان عام استخدم تطبيق Kiosk مثل Fully Kiosk Browser: اضبط Start URL على رابط `/play`، وفعّل Autoplay Audio وLaunch on Boot.

## التطوير المحلي

```bash
cp .env.example .env.local
npm install
npm run dev
```
