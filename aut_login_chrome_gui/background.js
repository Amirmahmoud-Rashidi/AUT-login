chrome.runtime.onStartup.addListener(() => {
   // باز کردن صفحه در یک پنجره مجزا و کوچک شده
   chrome.windows.create({
       url: "https://internet.aut.ac.ir/",
       type: "normal",
       state: "minimized", // پنجره به نوار وظیفه می‌رود و جلوی چشم نمی‌آید
       focused: false      // مانع از پریدن فوکوس به پنجره جدید می‌شود
   }, (window) => {
       // بستن پنجره پس از ۷ ثانیه (فرصت کافی برای اجرای content.js)
       setTimeout(() => {
           if (window.id) {
               chrome.windows.remove(window.id);
           }
       }, 7000);
   });
});