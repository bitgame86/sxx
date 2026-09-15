/* =========================================================
   SXXBET landing – đăng ký + chuyển màn tải app
   ========================================================= */

/* ---------- phát hiện hệ điều hành ---------- */
function detectMobileOS() {
  const ua = navigator.userAgent || '';
  const uaData = navigator.userAgentData;

  if (uaData && uaData.platform) {
    const p = uaData.platform.toLowerCase();
    if (p.includes('android')) return 'android';
    if (p.includes('ios')) return 'ios';
  }
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  return 'other';
}

const LINKS = {
  web: 'https://sxxmandoc.meliodas79.uk/game/',
  android: 'https://download.thst90.boutique/BETXXX.apk',
  ios: 'itms-services://?action=download-manifest&url=https://dl.signv4.com/temp/Sxx-Betcom.sxx.ios/plist.plist',
};

const os = detectMobileOS();

/* ---------- nút ở màn thành công ---------- */
const btnPlayWeb = document.getElementById('btn-play-web');
const btnInstall = document.getElementById('btn-install');

if (btnPlayWeb) btnPlayWeb.href = LINKS.web;
if (btnInstall) {
  btnInstall.href = os === 'ios' ? LINKS.ios : LINKS.android;
}

/* ---------- chuyển giữa 2 màn ---------- */
const viewRegister = document.getElementById('view-register');
const viewSuccess = document.getElementById('view-success');

function showDownloadView() {
  if (viewRegister) viewRegister.classList.add('is-hidden');
  if (viewSuccess) viewSuccess.classList.remove('is-hidden');
}
function showRegisterView() {
  if (viewSuccess) viewSuccess.classList.add('is-hidden');
  if (viewRegister) viewRegister.classList.remove('is-hidden');
}

const toDownload = document.getElementById('to-download');
if (toDownload) {
  toDownload.addEventListener('click', function (e) {
    e.preventDefault();
    showDownloadView();
  });
}

const toRegister = document.getElementById('to-register');
if (toRegister) {
  toRegister.addEventListener('click', function (e) {
    e.preventDefault();
    showRegisterView();
  });
}

/* ---------- hiện/ẩn mật khẩu ---------- */
document.querySelectorAll('.field__eye').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.classList.toggle('is-on', show);
    btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  });
});

/* ---------- form đăng ký ---------- */
const REGISTER_API_BASE = 'https://node.thst86.org';

const registerForm = document.getElementById('register-form');
if (registerForm) {
  const errorEl = document.getElementById('register-error');
  const submitBtn = document.getElementById('register-submit');
  const captchaRow = document.getElementById('captcha-row');
  const captchaImg = document.getElementById('captcha-image');
  const captchaInput = document.getElementById('reg-captcha');
  const captchaReloadBtn = document.getElementById('captcha-reload');
  const referralInput = document.getElementById('reg-referral');

  let captchaToken = '';
  let captchaTime = '';
  let captchaVisible = false;
  let captchaRetryCount = 0;

  const refFromUrl = new URLSearchParams(window.location.search).get('ref');
  if (refFromUrl) referralInput.value = refFromUrl.trim();

  function showMessage(message, isInfo) {
    errorEl.textContent = message;
    errorEl.classList.toggle('is-info', !!isInfo);
    errorEl.hidden = false;
  }
  function clearMessage() {
    errorEl.hidden = true;
    errorEl.textContent = '';
    errorEl.classList.remove('is-info');
  }

  function loadCaptcha() {
    captchaInput.value = '';
    fetch(REGISTER_API_BASE + '/landing/account/captcha')
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.success || !json.data) throw new Error('invalid_captcha_response');
        captchaImg.src = 'data:image/png;base64,' + json.data.image;
        captchaToken = json.data.token;
        captchaTime = json.data.time;
        captchaRetryCount = 0;
      })
      .catch(function () {
        if (captchaRetryCount < 1) {
          captchaRetryCount += 1;
          setTimeout(loadCaptcha, 1200);
          return;
        }
        showMessage('Không tải được mã xác nhận. Tắt trình chặn quảng cáo (nếu có) rồi bấm nút "↻" để thử lại.');
      });
  }

  function revealCaptcha() {
    if (captchaVisible) return;
    captchaVisible = true;
    captchaRow.hidden = false;
    loadCaptcha();
  }

  captchaImg.addEventListener('click', loadCaptcha);
  if (captchaReloadBtn) captchaReloadBtn.addEventListener('click', loadCaptcha);

  // Máy chủ báo cần captcha?
  function needsCaptcha(json) {
    if (!json) return false;
    if (json.requireCaptcha || json.needCaptcha || json.captchaRequired) return true;
    if (json.data && (json.data.requireCaptcha || json.data.needCaptcha || json.data.image)) return true;
    const code = String(json.code || json.errorCode || '').toUpperCase();
    if (code.indexOf('CAPTCHA') !== -1) return true;
    if (typeof json.message === 'string' && /captcha|mã xác nhận|xác minh/i.test(json.message)) return true;
    return false;
  }

  registerForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const username = registerForm.username.value.trim();
    const password = registerForm.password.value;
    const password2 = registerForm.password2.value;
    const referralCode = referralInput.value.trim();
    const captchaText = captchaInput.value.trim();

    clearMessage();

    if (!username || !password || !password2) {
      showMessage('Vui lòng điền đầy đủ thông tin.');
      return;
    }
    if (password.length < 6) {
      showMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== password2) {
      showMessage('Mật khẩu nhập lại không khớp.');
      return;
    }
    if (captchaVisible && !captchaText) {
      showMessage('Vui lòng nhập mã xác nhận.');
      return;
    }

    const payload = {
      username: username,
      password: password,
      confirmPassword: password2,
      referralCode: referralCode || null,
    };
    if (captchaVisible) {
      payload.captchaText = captchaText;
      payload.captchaToken = captchaToken;
      payload.captchaTime = captchaTime;
    }

    submitBtn.disabled = true;

    fetch(REGISTER_API_BASE + '/landing/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (json) { return { ok: res.ok, json: json }; });
      })
      .then(function (result) {
        const json = result.json;

        if (result.ok && json && json.success) {
          registerForm.reset();
          if (refFromUrl) referralInput.value = refFromUrl.trim();
          showDownloadView();
          return;
        }

        // Máy chủ yêu cầu captcha -> hiện ô captcha, chưa coi là lỗi
        if (needsCaptcha(json)) {
          const firstTime = !captchaVisible;
          revealCaptcha();
          if (json && json.data && json.data.image) {
            captchaImg.src = 'data:image/png;base64,' + json.data.image;
            captchaToken = json.data.token || captchaToken;
            captchaTime = json.data.time || captchaTime;
          } else if (!firstTime) {
            loadCaptcha();
          }
          showMessage(
            firstTime
              ? 'Vui lòng nhập mã xác nhận bên dưới để hoàn tất đăng ký.'
              : ((json && json.message) || 'Mã xác nhận không đúng, vui lòng thử lại.'),
            firstTime,
          );
          return;
        }

        showMessage((json && json.message) || 'Đăng ký thất bại, vui lòng thử lại.');
        if (captchaVisible) loadCaptcha();
      })
      .catch(function () {
        showMessage('Không thể kết nối tới máy chủ, vui lòng thử lại.');
        if (captchaVisible) loadCaptcha();
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
}
