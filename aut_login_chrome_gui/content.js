/**
 * AUT Ultimate Login — Content Script
 * ورود خودکار به سامانه‌های دانشگاه با استفاده از SSO دانشگاه
 */

'use strict';

// ============================================================
// تنظیمات
// ============================================================

const CREDENTIALS = {
  username: null,
  password: null,
};

const LOGIN_HOST_PATTERNS = ['accounts.aut.ac.ir', 'internet.aut.ac.ir', 'webmail.aut.ac.ir'];

// سایت‌های مختلف از نام فیلدهای متفاوتی استفاده می‌کنند (مثلاً SnappyMail
// در webmail.aut.ac.ir از name="Email"/name="Password" استفاده می‌کند،
// نه username/password). هر مجموعه به ترتیب امتحان می‌شود تا اولین
// مجموعه‌ای که در صفحه پیدا شود انتخاب گردد.
const LOGIN_FIELD_SELECTOR_SETS = [
  { user: 'input[name="username"]', pass: 'input[name="password"]' },
  { user: 'input[name="Email"]', pass: 'input[name="Password"]' },
  { user: 'input[type="email"]', pass: 'input[type="password"]' },
];

const LOGIN_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  '.btn-primary',
  '#login-btn',
  '.buttonLogin',
];

const SSO_LINK_SELECTOR = 'a[href*="sso"], a[href*="Sso"], a[href*="cas"]';
const SSO_BUTTON_KEYWORDS = ['ورود از درگاه','ورود به سامانه'];
const SPECIAL_SITE = ['internet.aut.ac.ir','accounts.aut.ac.ir','webmail.aut.ac.ir']; // دامنه سایت استثنا
const SPECIAL_KEYWORD = 'ورود';  // کلیدواژه مخصوص همین سایت
const RETRY_DELAYS_MS = [2000, 4000];
const CLICK_DELAY_MS = 500;

// ============================================================
// بارگذاری اطلاعات ورود از حافظه محلی افزونه
// ============================================================

function loadCredentialsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aut_username', 'aut_password'], (result) => {
      CREDENTIALS.username = result.aut_username || null;
      CREDENTIALS.password = result.aut_password || null;
      resolve();
    });
  });
}

// ============================================================
// توابع کمکی DOM
// ============================================================

/**
 * مقدار یک input را طوری ست می‌کند که فریم‌ورک‌های فرانت‌اند (React/Vue و مشابه)
 * هم متوجه تغییر بشوند. ست کردن ساده‌ی el.value معمولاً توسط این فریم‌ورک‌ها
 * نادیده گرفته می‌شود، چون آن‌ها روی setter اصلی پروتوتایپ گوش می‌دهند، نه روی
 * مقداردهی مستقیم به instance.
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 * @param {string} value
 */
function setNativeValue(el, value) {
  if (!el) return;

  el.focus();

  // تلاش اول: insertText از طریق execCommand، که دقیقاً شبیه تایپ واقعی
  // کاربر عمل می‌کند و بهترین سازگاری را با binding هایی مثل
  // Knockout's textInput یا React's onChange دارد.
  el.select?.();
  const insertedViaCommand =
    document.execCommand && document.execCommand('insertText', false, value);

  if (!insertedViaCommand || el.value !== value) {
    // تلاش دوم (fallback): ست کردن مستقیم از طریق native setter پروتوتایپ،
    // برای زمانی که execCommand در دسترس نباشد یا کار نکند.
    const proto =
      el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(el, value);
  }

  // شبیه‌سازی رویداد ورودی واقعی به‌جای Event ساده، چون خیلی از فریم‌ورک‌ها
  // (از جمله Knockout's textInput binding) به input گوش می‌دهند نه change
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

/**
 * تلاش برای کلیک روی یک عنصر با چند لایه‌ی مختلف، برای اطمینان از
 * اینکه event handlerهای گوناگون (native click یا مدیریت‌شده توسط
 * فریم‌ورک) واکنش نشان دهند.
 *
 * توجه مهم: عمداً از form.submit() استفاده نمی‌کنیم. این متد یک
 * native form submission انجام می‌دهد که کاملاً از فریم‌ورک‌هایی مثل
 * Knockout/React عبور می‌کند (event های submit آن‌ها را trigger
 * نمی‌کند) و می‌تواند باعث یک ریلود خام و ناموفق صفحه بشود، چون منطق
 * واقعی لاگین (که داخل فریم‌ورک است) هرگز اجرا نمی‌شود.
 * @param {Element|null} el
 */
function superClick(el) {
  if (!el) return;

  console.log('در حال تلاش برای کلیک روی:', el);

  // لایه ۱: کلیک استاندارد
  el.click();

  // لایه ۲: شبیه‌سازی رویدادهای موس، برای فریم‌ورک‌هایی که مستقیم به
  // mousedown/mouseup/click گوش می‌دهند نه فقط به click ساده
  ['mousedown', 'mouseup', 'click'].forEach((type) => {
    el.dispatchEvent(
      new MouseEvent(type, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      })
    );
  });
}

/**
 * اولین عنصر منطبق با یکی از سلکتورهای داده‌شده را برمی‌گرداند.
 * @param {string[]} selectors
 * @returns {Element|null}
 */
function findFirstMatch(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * اولین مجموعه از سلکتورهای فیلد یوزرنیم/پسورد که واقعاً در صفحه
 * موجود باشد را پیدا می‌کند (چون سایت‌های مختلف نام فیلد متفاوتی دارند).
 * @returns {{userField: Element, passField: Element}|null}
 */
function findLoginFields() {
  for (const { user, pass } of LOGIN_FIELD_SELECTOR_SETS) {
    const userField = document.querySelector(user);
    const passField = document.querySelector(pass);
    if (userField && passField) {
      return { userField, passField };
    }
  }
  return null;
}

// ============================================================
// منطق صفحه‌ی لاگین
// ============================================================

/**
 * آیا URL فعلی متعلق به یکی از صفحات لاگین دانشگاه است؟
 * @param {string} url
 * @returns {boolean}
 */
function isLoginPage(url) {
  return LOGIN_HOST_PATTERNS.some((host) => url.includes(host));
}

let loginAttempted = false;

/**
 * فیلدهای یوزرنیم و پسورد را پر کرده و دکمه‌ی ورود را کلیک می‌کند.
 * فقط یک‌بار در طول عمر صفحه این کار را انجام می‌دهد؛ چون runAutomation
 * چند بار (برای اطمینان از لود کامل) صدا زده می‌شود، بدون این محافظ
 * ممکن است چند بار پشت‌سرهم روی دکمه‌ی ورود کلیک شود و باعث رفتار
 * غیرمنتظره (مثل ریلود ناخواسته) بشود.
 */
function fillLoginForm() {
  if (loginAttempted) return;

  if (!CREDENTIALS.username || !CREDENTIALS.password) {
    console.log('نام کاربری یا رمز عبور هنوز در تنظیمات افزونه وارد نشده است.');
    return;
  }

  const fields = findLoginFields();
  const loginBtn = findFirstMatch(LOGIN_BUTTON_SELECTORS);

  if (!fields) {
    console.log('فیلدهای ورود پیدا نشد؛ شاید صفحه هنوز کامل لود نشده.');
    return;
  }

  loginAttempted = true;

  const { userField, passField } = fields;

  if (userField.value === '') {
    // فوکوس روی فیلد قبل از پر کردن، چون بعضی فریم‌ورک‌ها eventهای focus/blur را
    // هم برای validation چک می‌کنند
    userField.focus();
    setNativeValue(userField, CREDENTIALS.username);
    userField.blur();

    passField.focus();
    setNativeValue(passField, CREDENTIALS.password);
    passField.blur();
  }

  setTimeout(() => superClick(loginBtn), CLICK_DELAY_MS);
}

// ============================================================
// منطق صفحات پورتال (انتخاب دکمه‌ی ورود یکپارچه)
// ============================================================

/**
 * لینک ورود یکپارچه (SSO) را بر اساس href پیدا می‌کند.
 * @returns {Element|null}
 */
function findSsoLink() {
  return document.querySelector(SSO_LINK_SELECTOR);
}

/**
 * دکمه‌ی ورود یکپارچه را بر اساس متن نمایشی پیدا می‌کند.
 * @returns {Element|null}
 */
function findSsoButtonByText() {
  const candidates = document.querySelectorAll('a, button, input[type="button"]');
  const isSpecialSite = window.location.hostname.includes(SPECIAL_SITE);
  for (const btn of candidates) {
    const text = (btn.innerText || btn.value || '').replace(/\s+/g, ' ').trim();
    if (!isSpecialSite && SSO_BUTTON_KEYWORDS.some((keyword) => text.includes(keyword))) {
      return btn;
    }
    if (isSpecialSite && text.includes(SPECIAL_KEYWORD)) {
      return btn;
    }
  }

  return null;
}

/**
 * روی دکمه/لینک ورود یکپارچه‌ی پورتال کلیک می‌کند.
 */
function clickPortalSsoEntry() {
  const ssoLink = findSsoLink();
  if (ssoLink) {
    superClick(ssoLink);
    return;
  }

  const ssoButton = findSsoButtonByText();
  if (ssoButton) {
    superClick(ssoButton);
  }
}

// ============================================================
// نقطه‌ی ورود
// ============================================================

function runAutomation() {
  const url = window.location.href;

  if (isLoginPage(url)) {
    fillLoginForm();
  } else {
    clickPortalSsoEntry();
  }
}

async function initAutomation() {
  await loadCredentialsFromStorage();
  runAutomation();

  // چک کردن مجدد (برای سایت‌هایی مثل سامانه دروس که المان‌ها را دیر لود می‌کنند)
  RETRY_DELAYS_MS.forEach((delay) => setTimeout(runAutomation, delay));
}

// اگر کاربر هنگام باز بودن صفحه ورود، اطلاعات را در GUI افزونه ذخیره کند، بلافاصله اعمال شود
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.aut_username) {
    CREDENTIALS.username = changes.aut_username.newValue || null;
  }
  if (changes.aut_password) {
    CREDENTIALS.password = changes.aut_password.newValue || null;
  }

  if (CREDENTIALS.username && CREDENTIALS.password && isLoginPage(window.location.href)) {
    loginAttempted = false;
    fillLoginForm();
  }
});

// اجرا در چند مرحله برای اطمینان از لود شدن کامل المان‌های سنگین
if (document.readyState === 'complete') {
  initAutomation();
} else {
  window.addEventListener('load', initAutomation);
}
