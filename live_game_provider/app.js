window.isNative = false;

const liveFrame = document.getElementById('live-frame');

// === SPLASH: che kín tới khi iframe game của hãng tải xong ===
//
// Cocos KHÔNG che được webview (webview luôn nằm trên canvas — xem WebviewABGItem phải ép
// zIndex:-99 mới dìm được iframe xuống), nên lớp chờ bắt buộc phải nằm trong chính trang này.
// Cocos giữ loading của nó tới lúc trang này hiện ra, rồi splash ở đây tiếp quản — hai lớp
// nối nhau, không có khoảng hở màn trắng.

const splashEl = document.getElementById('splash');
let _splashTimer = null;

function hideSplash() {
  if (_splashTimer) {
    clearTimeout(_splashTimer);
    _splashTimer = null;
  }
  if (!splashEl) return;
  splashEl.classList.add('hiding');
  setTimeout(function () {
    splashEl.classList.remove('visible', 'hiding');
  }, 300);
}

function showSplash() {
  if (!splashEl) return;
  splashEl.classList.remove('hiding');
  splashEl.classList.add('visible');
  if (_splashTimer) clearTimeout(_splashTimer);
  // Van xả 15s: quá ngần này mà iframe.onload chưa bắn thì coi như trang hãng hỏng hẳn
  // (chứ không phải chậm) → đẩy người chơi về lobby thay vì để quay spinner vĩnh viễn.
  _splashTimer = setTimeout(function () {
    _splashTimer = null;
    console.warn('[splash] iframe game không load sau 15s → đóng về lobby');
    closeGame('timeout');
  }, 15000);
}

// Điểm DUY NHẤT được gán src cho iframe game — cả nhánh web lẫn native đều đi qua đây để
// splash và van xả không bao giờ bị bỏ sót.
// Url game đang mở. Nhớ riêng chứ không đọc liveFrame.src: trình duyệt trả về dạng TUYỆT ĐỐI
// (thêm scheme, bỏ ./, chuẩn hoá dấu /), nên so với chuỗi Cocos gửi xuống là lệch dù cùng trang.
let _urlDangMo = '';

/**
 * Mở game của hãng trong iframe.
 *
 * BỎ QUA NẾU ĐANG Ở ĐÚNG URL ĐÓ — đây là chỗ cắt một vòng lặp reload:
 *
 *   iframe tải xong → WebView bắn 'loaded' → Cocos gửi lại gói URL → gán liveFrame.src
 *   → iframe TẢI LẠI → 'loaded' lại bắn → …
 *
 * Sự kiện 'loaded' của cc.WebView không chỉ bắn cho trang bọc; trên WKWebView và Android nó
 * bắn cho MỌI lần điều hướng bên trong, mà iframe game chính là một trong số đó. Game nào có
 * chuyển trang nội bộ (redirect đăng nhập, đổi ngôn ngữ) là vòng lặp chạy — nên lỗi chỉ xuất
 * hiện với vài game, đúng kiểu "thi thoảng tự reload".
 *
 * Gán src bằng đúng giá trị đang có VẪN làm iframe tải lại, nên phải tự chặn ở đây.
 */
function setGameUrl(url) {
  if (!url) return;
  if (url === _urlDangMo) return;
  _urlDangMo = url;
  showSplash();
  liveFrame.src = url;
}

// iframe.onload bắn cả khi cross-origin (không đọc được nội dung nhưng biết lúc tải xong),
// nên không cần trang của hãng hợp tác gì.
if (liveFrame) {
  liveFrame.addEventListener('load', function () {
    // Bỏ qua lần onload của việc xoá src lúc đóng game.
    if (!liveFrame.src) return;
    hideSplash();
  });
}

// reason: 'timeout' = đóng do lỗi tải, Cocos sẽ hiện toast báo. Bỏ trống = người chơi tự bấm.
function closeGame(reason) {
  if (_splashTimer) {
    clearTimeout(_splashTimer);
    _splashTimer = null;
  }
  liveFrame.src = '';
  // Quên url vừa đóng, không thì mở LẠI ĐÚNG game đó lần sau sẽ bị setGameUrl bỏ qua vì
  // tưởng đang mở sẵn.
  _urlDangMo = '';
  if (!window.isNative) {
    window.parent.postMessage({ type: 'CLOSE_GAME', payload: { reason: reason || '' } }, '*');
  } else {
    window.location.href = 'cc://close' + (reason ? '?reason=' + reason : '');
  }
}

// Kéo thả + bám mép cho nút nổi. Trước đây viết thẳng cho float-btn; tách ra thành hàm để
// nút minigame dùng CHUNG — hai nút cùng loại mà hai bản code là kiểu gì cũng lệch hành vi.
// onTap chỉ chạy khi người chơi BẤM (không kéo) — ngưỡng 5px phân biệt bấm với kéo.
window.initDragButton = function (id, onTap) {
  const btn = document.getElementById(id);
  if (!btn) return;

  let dragging = false;
  let moved = false;
  let startX, startY, initLeft, initTop;

  btn.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = btn.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;
    btn.setPointerCapture(e.pointerId);
    // Tắt pulse khi đang chạm/kéo. Bỏ class lúc thả → animation dựng lại từ 0, nên sau mỗi
    // lần tương tác luôn được trọn 10s im lặng (không phải thả ra là nháy ngay).
    btn.classList.add('dragging');
    btn.style.transition = 'opacity 0.2s, transform 0.15s';
    e.preventDefault();
  });

  btn.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;

    const maxLeft = window.innerWidth - btn.offsetWidth;
    const maxTop = window.innerHeight - btn.offsetHeight;
    btn.style.left = Math.max(0, Math.min(initLeft + dx, maxLeft)) + 'px';
    btn.style.top = Math.max(0, Math.min(initTop + dy, maxTop)) + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  });

  btn.addEventListener('pointercancel', () => {
    dragging = false;
    btn.classList.remove('dragging');
  });

  btn.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    btn.classList.remove('dragging');

    if (!moved) {
      if (onTap) onTap();
      return;
    }

    btn.style.transition = 'left 0.22s ease, top 0.22s ease, opacity 0.2s, transform 0.15s';
    const rect = btn.getBoundingClientRect();
    const snapMargin = 10;
    const midX = rect.left + rect.width / 2;
    if (midX < window.innerWidth / 2) {
      btn.style.left = snapMargin + 'px';
    } else {
      btn.style.left = window.innerWidth - btn.offsetWidth - snapMargin + 'px';
    }
    // Đã đặt left tuyệt đối thì phải bỏ right, không thì hai thuộc tính đá nhau (mini-btn neo
    // bằng right trong CSS).
    btn.style.right = 'auto';
  });
};

initDragButton('float-btn', function () {
  closeGame();
});

//  === POSTMESSAGE (from Cocos Creator / iframe) ===

window.addEventListener('message', (event) => {
  console.log('Received message from parent:', event.data);
  const { type, payload } = event.data || {};
  // Minigame tự khai loại tin của nó. app.js KHÔNG cần biết có những loại nào — thêm tin mới
  // không phải đụng vào đây. Xoá minigame.js là móc này tự tắt.
  if (window.Minigame && window.Minigame.handle(type, payload)) return;
  switch (type) {
    case 'URL':
      setGameUrl(payload.url);
      break;
    case 'SHOW_TOAST':
      showToast(payload.message);
      break;
    default:
      break;
  }
});

// === TOAST ===

let _toastTimer = null;

/**
 * Show a toast message for 3 seconds then auto-hide.
 * @param {string} message
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    _toastTimer = null;
  }, 3000);
}

function receiveDataFromCocos(data) {
  console.log('Received data from Cocos 123:', JSON.stringify(data));
  const { type, payload } = data || {};
  if (window.Minigame && window.Minigame.handle(type, payload)) return;
  switch (type) {
    case 'URL':
      setGameUrl(payload.url);
      if (payload.isNative) {
        window.isNative = payload.isNative;
        // Cocos báo đang chạy native → gắn class để CSS thu nhỏ float-btn (40×40); web giữ 70×70.
        document.documentElement.classList.add('is-native-app');
      }
      break;
    case 'SHOW_TOAST':
      showToast(payload.message);
      break;
    default:
      break;
  }
}
