'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('credentialsForm');
  const usernameInput = document.getElementById('usernameInput');
  const passwordInput = document.getElementById('passwordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusBadge = document.getElementById('statusBadge');
  const feedbackMsg = document.getElementById('feedbackMsg');

  function setStatus(isSaved) {
    if (isSaved) {
      statusBadge.textContent = 'وضعیت: اطلاعات ورود ذخیره شده است';
      statusBadge.className = 'badge badge-saved';
    } else {
      statusBadge.textContent = 'وضعیت: اطلاعات ورود ثبت نشده است';
      statusBadge.className = 'badge badge-empty';
    }
  }

  function showFeedback(text, isError = false) {
    feedbackMsg.textContent = text;
    feedbackMsg.className = isError ? 'feedback feedback-error' : 'feedback feedback-success';
  }

  // بارگذاری مقادیر ذخیره‌شده هنگام باز شدن پنجره افزونه
  chrome.storage.local.get(['aut_username', 'aut_password'], (result) => {
    const savedUser = result.aut_username || '';
    const savedPass = result.aut_password || '';

    usernameInput.value = savedUser;
    passwordInput.value = savedPass;
    setStatus(Boolean(savedUser && savedPass));
  });

  // تغییر حالت نمایش/مخفی کردن رمز عبور
  togglePasswordBtn.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePasswordBtn.textContent = isHidden ? 'مخفی' : 'نمایش';
  });

  // ذخیره نام کاربری و رمز عبور
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showFeedback('لطفاً نام کاربری و رمز عبور را کامل وارد کنید.', true);
      return;
    }

    chrome.storage.local.set(
      {
        aut_username: username,
        aut_password: password,
      },
      () => {
        setStatus(true);
        showFeedback('اطلاعات با موفقیت ذخیره شد.');
      }
    );
  });

  // پاک کردن اطلاعات ذخیره‌شده
  clearBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['aut_username', 'aut_password'], () => {
      usernameInput.value = '';
      passwordInput.value = '';
      passwordInput.type = 'password';
      togglePasswordBtn.textContent = 'نمایش';
      setStatus(false);
      showFeedback('اطلاعات ذخیره شده حذف گردید.');
    });
  });
});
