// === NATIVE DETECTION ===
// Chạy trong app native (WKWebView iOS / Android WebView) hay trình duyệt thường?
// In-app WebView: iOS UA KHÔNG có "Safari", Android UA có "; wv)". Gắn class để CSS thu nhỏ
// float-btn riêng cho native (web giữ nguyên). Nếu app có gắn ?native=1 vào URL thì cũng nhận.
(function detectNative() {
  const ua = navigator.userAgent || '';
  const forced = /[?&]native=1\b/.test(location.search);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const iosInApp = isIOS && !/Safari/i.test(ua); // Safari thật có token "Safari"; WKWebView in-app thì không
  const androidWebView = /Android/i.test(ua) && /;\s*wv\)/i.test(ua);
  if (forced || iosInApp || androidWebView) {
    document.documentElement.classList.add('is-native-app');
  }
})();

// === DATA ===

let gifts = [];

// Gift data per tab (fallback demo khi chưa có data từ Cocos)
const GIFT_TABS_DATA = {
  'qua-tang': [
    { ID: 1, Name: 'Gấu bông', Amount: 400, emoji: '🧸' },
    { ID: 2, Name: 'Pháo hoa', Amount: 420, emoji: '🎉', isNew: true },
    { ID: 3, Name: 'Hoa hồng', Amount: 420, emoji: '🌹', isNew: true },
    { ID: 4, Name: 'Vương miện', Amount: 420, emoji: '👑' },
    { ID: 5, Name: 'Giày', Amount: 420, emoji: '👠' },
    { ID: 6, Name: 'Lâu đài', Amount: 420, emoji: '🏰' },
    { ID: 7, Name: 'Siêu xe', Amount: 420, emoji: '🚗' },
    { ID: 8, Name: 'Tên lửa', Amount: 420, emoji: '🚀' },
    { ID: 9, Name: 'Thả tim', Amount: 420, emoji: '🤞' },
    { ID: 10, Name: 'Okla', Amount: 420, emoji: '👌' },
    { ID: 11, Name: 'Ngón giữa', Amount: 420, emoji: '🖕' },
    { ID: 12, Name: 'Bó hoa', Amount: 420, emoji: '💐' },
  ],
  'tuong-tac': [],
  'doc-quyen': [],
};

let _activeGiftTab = 'qua-tang';
let _myCoins = 0;

let topIdolLive = [];
let topDonateData = { Day: [], Week: [], Month: [] };
let _activeTopTab = 'idol';
let _activeTopPeriod = 'Day';
let myRankData = null;

// Icon images for each panel
const PANEL_ICONS = {
  chat: 'assets/item_chat.png',
  gift: 'assets/item_rose.png',
  top: 'assets/item_cup.png',
};

// Panel config — chat only
const PANELS = {
  chat: { maxHeight: '220px' },
};

// Username colors (cycling)
const USER_COLORS = ['#fbbf24', '#38bdf8', '#f97316', '#a78bfa', '#34d399', '#fb7185'];

// === STATE ===
let activePanel = null; // 'chat' | 'gift' | 'top' | null
let selectedGift = null;
let colorMap = {};
let colorIdx = 0;
const myRank = 2000;
const myCoins = 0;
window.isNative = false;

// === DOM REFS ===
const elBalance = document.getElementById('balance');
const liveFrame = document.getElementById('live-frame');

// === SPLASH: che kín tới khi iframe game của đối tác tải xong ===
//
// Cocos KHÔNG che được webview (webview luôn nằm trên canvas — chính file này ở _setupWebLayer
// phải ép zIndex:-99 mới dìm được iframe xuống), nên lớp chờ bắt buộc nằm trong chính trang.
// Cocos giữ loading của nó tới lúc trang này hiện ra, splash ở đây tiếp quản — hai lớp nối
// nhau, không có khoảng hở màn trắng.
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
  // Van xả 15s: quá ngần này mà iframe.onload chưa bắn thì coi như trang đối tác hỏng hẳn
  // (chứ không phải chậm) → đẩy về lobby thay vì để quay spinner vĩnh viễn.
  // KHÁC với watchdog 5s ở dưới: cái đó lo việc Cocos không gửi URL, việc hoàn toàn khác.
  _splashTimer = setTimeout(function () {
    _splashTimer = null;
    console.warn('[splash] iframe game không load sau 15s → đóng về lobby');
    closeGame('timeout');
  }, 15000);
}

// Điểm DUY NHẤT được gán src cho iframe game. Gọi từ cả nhánh web lẫn native.
// Bên trong vẫn giữ nguyên phép so URL cũ/mới — nếu Cocos gửi lặp cùng một URL thì KHÔNG
// đụng gì hết, không bật splash: iframe không tải lại nên onload sẽ không bao giờ bắn,
// splash sẽ treo tới hết 15s rồi đá người chơi ra oan.
function setGameUrl(url) {
  if (!url || liveFrame.src === url) return;
  showSplash();
  liveFrame.src = url;
}

// iframe.onload bắn cả khi cross-origin (không đọc được nội dung nhưng biết lúc tải xong),
// nên không cần trang của đối tác hợp tác gì.
if (liveFrame) {
  liveFrame.addEventListener('load', function () {
    if (!liveFrame.src) return; // bỏ qua lần onload của việc xoá src lúc đóng game
    hideSplash();
  });
}
const panelWrapper = document.getElementById('panel-wrapper');
const panelChat = document.getElementById('panel-chat');
const chatMessages = document.getElementById('chat-messages');
const topSheet = document.getElementById('top-sheet');
const topList = document.getElementById('top-list');
const giftScrollRow = document.getElementById('gift-scroll-row');
const btnPanelClose = document.getElementById('btn-panel-close');
// const panelOverlay = document.getElementById('panel-overlay');
const toolbarInput = document.getElementById('toolbar-input');
const btnSend = document.getElementById('btn-send');
const btnHonor = document.getElementById('toolbar-btn-honor');
const btnRose = document.getElementById('toolbar-btn-rose');
const btnGift = document.getElementById('toolbar-btn-gift');
const btnShare = document.getElementById('toolbar-btn-share');

// === PANEL OPEN / CLOSE ===

/**
 * Opens the given panel. Clicking the same active panel closes it.
 * @param {string} key - 'chat' | 'gift' | 'top'
 */
function openPanel(key) {
  if (activePanel === key) {
    closePanel();
    return;
  }
  activePanel = key;
  applyToolbarState();
}

function closePanel() {
  activePanel = null;
  applyToolbarState();
}

// === TOOLBAR STATE ===
function applyToolbarState() {
  syncChatFloat();
  panelChat.classList.remove('active');

  if (!activePanel) {
    panelWrapper.style.maxHeight = '0';
    return;
  }

  panelChat.classList.add('active');
  panelWrapper.style.maxHeight = PANELS['chat'].maxHeight;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// === TOP SHEET ===
function openTopSheet() {
  topSheet.classList.add('open');
  renderTopList();
  if (!window.isNative) {
    sendToCocos('GET_TOP_IDOL', {});
  } else {
    window.location.href = 'cc://get_top_idol';
  }
}

function closeTopSheet() {
  topSheet.classList.remove('open');
}

document.getElementById('top-sheet-backdrop').addEventListener('click', closeTopSheet);

// === EVENTS ===

btnHonor.addEventListener('click', openTopSheet);
btnRose.addEventListener('click', () => sendGiftById(15));
btnGift.addEventListener('click', () => openGiftPopup());
btnPanelClose.addEventListener('click', closePanel);
// panelOverlay.addEventListener('click', closePanel);

// Ngăn input mất focus khi click btn-send (không đóng panel chat)
btnSend.addEventListener('pointerdown', (e) => e.preventDefault());
btnSend.addEventListener('click', handleSend);
toolbarInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSend();
});

// === AUTO OPEN CHAT ON FOCUS ===
let panelBeforeFocus = null;
toolbarInput.addEventListener('focus', () => {
  // window.scrollTo(0, 0);
  panelBeforeFocus = activePanel;
  if (activePanel !== 'chat') openPanel('chat');
  // Báo Cocos lock WebView frame
  // if (window.isNative) window.location.href = 'cc://keyboard_show';
});
toolbarInput.addEventListener('blur', () => {
  if (panelBeforeFocus !== 'chat') closePanel();
  panelBeforeFocus = null;
  // Báo Cocos unlock WebView frame
  // if (window.isNative) window.location.href = 'cc://keyboard_hide';
});

function handleSend() {
  sendChat();
}

// === CHAT ===

/** Get or assign a color to a username */
function getUserColor(username) {
  if (!colorMap[username]) {
    colorMap[username] = USER_COLORS[colorIdx % USER_COLORS.length];
    colorIdx++;
  }
  return colorMap[username];
}

/** Append a chat message to the message list */
function addChatMsg(user, text, customData) {
  const color = getUserColor(user);
  const div = document.createElement('div');
  div.className = 'chat-msg';

  const cd = customData || {};
  const vipLevel = cd.VipLevel || 0;
  const donateRank = cd.DonateRank || 0;
  const isAdmin = cd.IsAdmin || false;

  const giftImg = cd.GiftImg || '';
  const quantity = cd.Quantity || 0;

  let badges = '';
  if (giftImg) {
    badges += `<span class="chat-gift-wrap"><img class="chat-gift-img" src="assets/gift/${escapeAttr(String(giftImg))}.png" alt=""><span class="chat-gift-qty">${quantity}</span></span>`;
  }
  // if (donateRank > 0) badges += `<span class="chat-badge chat-badge-rank">Hạng ${donateRank}</span>`;
  if (isAdmin) badges += `<span class="chat-badge chat-badge-admin">Admin</span>`;
  if (vipLevel > 0)
    badges += `<span class="chat-vip-badge"><img class="chat-vip-bg" src="assets/bg_vip_donate.png" alt=""><img class="chat-vip-icon" src="assets/vip/vp_${vipLevel}.png" alt=""><span class="chat-vip-level">${vipLevel}</span></span>`;

  div.innerHTML = `${badges}<span class="chat-user" style="color:${color}">${escapeHtml(user)}</span><span class="chat-colon">:</span> ${escapeHtml(text)}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  queueFloatMsg(user, text, color, cd);
}

function sendChat() {
  const text = toolbarInput.value.trim();
  if (!text) return;

  // Show message locally
  // addChatMsg('Bạn', text);

  if (!window.isNative) {
    sendToCocos('SEND_CHAT', { message: text });
  } else {
    window.location.href = `cc://send_chat?message=${encodeURIComponent(text)}`;
  }
  toolbarInput.value = '';

  // // Open chat panel so user sees their message
  // if (!activePanel) openPanel('chat');
}

// Pre-populate with sample messages
// [
//   { user: 'Player_001', msg: 'Tắt tay được chưa' },
//   { user: 'Chi_all_in2002', msg: 'Lo quá các bác ạ' },
//   { user: 'Chi_all_in2002', msg: 'Lo quá các bác ạ' },
//   { user: 'hoclamgiau2012', msg: 'Các anh cho e xin cái code 10k' },
//   { user: 'hoclamgiau2012', msg: 'Các anh cho e xin cái code 10k' },
//   { user: 'hoclamgiau2012', msg: 'Các anh cho e xin cái code 10k' },
//   { user: 'hoclamgiau2012', msg: 'Các anh cho e xin cái code 10k' },
//   { user: 'hoclamgiau2012', msg: 'Các anh cho e xin cái code 10k' },
//   { user: 'hoclamgiau2012', msg: 'Các anh cho e xin cái code 10k' },
// ].forEach(({ user, msg }) => addChatMsg(user, msg));

// === GIFT POPUP ===

const giftPopup = document.getElementById('gift-popup');
const giftGrid = document.getElementById('gift-grid');

function openGiftPopup() {
  giftPopup.classList.add('open');
  document.body.classList.add('gift-popup-open');
  renderGiftGrid(_activeGiftTab);
}

function closeGiftPopup() {
  giftPopup.classList.remove('open');
  document.body.classList.remove('gift-popup-open');
  selectedGift = null;
}

document.getElementById('gift-popup-backdrop').addEventListener('click', closeGiftPopup);

// Tab switching
document.querySelectorAll('.gift-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.gift-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    _activeGiftTab = tab.dataset.tab;
    selectedGift = null;
    renderGiftGrid(_activeGiftTab);
  });
});

function renderGiftGrid(tab) {
  giftGrid.innerHTML = '';
  // Ưu tiên data từ Cocos nếu có, fallback về demo
  const list = gifts.length > 0 ? gifts : GIFT_TABS_DATA[tab] || [];
  if (list.length === 0) {
    // 1/-1 chứ không phải span 4: số cột giờ do auto-fill quyết định theo bề ngang màn,
    // span 4 sẽ hụt trên màn ngang (8 cột) làm dòng báo trống lệch sang trái.
    giftGrid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:13px;padding:24px;text-align:center;grid-column:1/-1">Chưa có quà</p>';
    return;
  }
  list.forEach((gift) => {
    const el = document.createElement('div');
    el.className = 'gift-item';
    const isSelected = selectedGift && selectedGift.ID === gift.ID;
    if (isSelected) el.classList.add('selected');

    const imgHtml = gift.ID ? `<img class="gift-item-img" src="assets/gift/${gift.ID}.png" alt="">` : `<span class="gift-item-emoji">${gift.emoji || '🎁'}</span>`;

    el.innerHTML = `
      ${gift.isNew ? '<span class="gift-item-badge">NEW</span>' : ''}
      ${imgHtml}
      <span class="gift-item-name">${escapeHtml(gift.Name)}</span>
      <span class="gift-item-coin">
        <img class="coin-icon" src="assets/item_coin.png" alt="">
        ${gift.Amount.toLocaleString('vi-VN')}
      </span>
      ${isSelected ? '<button class="gift-item-send">Gửi</button>' : ''}
    `;

    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('gift-item-send')) {
        sendGift();
        return;
      }
      selectedGift = gift;
      renderGiftGrid(_activeGiftTab);
    });

    giftGrid.appendChild(el);
  });
}

function sendGift() {
  if (!selectedGift) return;
  sendGiftById(selectedGift.ID);
}

function sendGiftById(giftId) {
  if (!window.isNative) {
    sendToCocos('SEND_GIFT', { giftId });
  } else {
    window.location.href = `cc://send_gift?giftId=${encodeURIComponent(giftId)}`;
  }
}

function respondToSendGift(data, nikName, balance) {
  console.log('balance :', balance);
  showGiftNotif({
    user: nikName,
    avatar: data.avatar,
    name: data.Name,
    giftType: data.ID,
  });
  elBalance.textContent = Number(balance).toLocaleString('vi-VN');
  updateGiftCoins(balance);
}

function renderGifts() {
  // Called when Cocos sends GIFT_LIST — re-render current popup if open
  if (giftPopup.classList.contains('open')) renderGiftGrid(_activeGiftTab);
}

function updateGiftCoins(amount) {
  if (amount == null) return;
  _myCoins = amount;
  const el = document.getElementById('gift-coin-amount');
  if (el) el.textContent = Number(amount).toLocaleString('vi-VN');
}

// === TOP DONATE ===

// Tab switching for top panel
document.querySelectorAll('.top-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.top-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    _activeTopTab = tab.dataset.top;
    document.getElementById('top-donate-subtabs').style.display = _activeTopTab === 'donate' ? 'flex' : 'none';
    renderTopList();
  });
});

document.querySelectorAll('.top-sub-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.top-sub-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    _activeTopPeriod = tab.dataset.period;
    renderTopList();
  });
});

const BADGE_CLASSES = ['gold', 'silver', 'bronze'];

function _medalSvg(rank) {
  const cfg = [
    { bg1: '#fde68a', bg2: '#d97706', bg3: '#92400e', ring: '#f59e0b', crown: '#fff8dc' },
    { bg1: '#e2e8f0', bg2: '#94a3b8', bg3: '#334155', ring: '#94a3b8', crown: '#f1f5f9' },
    { bg1: '#fcd9a0', bg2: '#c2773a', bg3: '#5c2a0c', ring: '#cd853f', crown: '#fff0d4' },
  ][rank - 1];
  const id = `mg${rank}`;
  return `<svg class="top-medal-svg" viewBox="0 0 56 68" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${cfg.bg1}"/>
        <stop offset="100%" stop-color="${cfg.bg3}"/>
      </linearGradient>
    </defs>
    <!-- laurel left -->
    <ellipse cx="10" cy="46" rx="7" ry="3.5" fill="${cfg.bg2}" opacity="0.7" transform="rotate(-30,10,46)"/>
    <ellipse cx="7" cy="52" rx="7" ry="3.5" fill="${cfg.bg2}" opacity="0.6" transform="rotate(-20,7,52)"/>
    <ellipse cx="6" cy="58" rx="6" ry="3" fill="${cfg.bg2}" opacity="0.5" transform="rotate(-10,6,58)"/>
    <!-- laurel right -->
    <ellipse cx="46" cy="46" rx="7" ry="3.5" fill="${cfg.bg2}" opacity="0.7" transform="rotate(30,46,46)"/>
    <ellipse cx="49" cy="52" rx="7" ry="3.5" fill="${cfg.bg2}" opacity="0.6" transform="rotate(20,49,52)"/>
    <ellipse cx="50" cy="58" rx="6" ry="3" fill="${cfg.bg2}" opacity="0.5" transform="rotate(10,50,58)"/>
    <!-- shield body -->
    <path d="M28 4 L50 14 L50 38 Q50 58 28 65 Q6 58 6 38 L6 14 Z" fill="url(#${id})" stroke="${cfg.ring}" stroke-width="2.5"/>
    <!-- crown -->
    <text x="28" y="22" text-anchor="middle" font-size="13" fill="${cfg.crown}">♛</text>
    <!-- number -->
    <text x="28" y="50" text-anchor="middle" font-size="24" font-weight="900" fill="#fff" font-family="Arial,sans-serif" stroke="${cfg.bg3}" stroke-width="1">${rank}</text>
  </svg>`;
}

function _buildTopItem(rank, name, amount, avatar) {
  const div = document.createElement('div');
  div.className = `top-item ${rank <= 3 ? `rank-${rank}` : 'rank-other'}`;
  div.style.animationDelay = `${Math.min(rank - 1, 6) * 0.05}s`;

  const avatarSrc = avatar || 'assets/ic_ava_nikname_demo.png';
  const amountFmt = Number(amount).toLocaleString('vi-VN');

  if (rank <= 3) {
    div.innerHTML = `
      <img class="top-item-avatar" src="${escapeAttr(avatarSrc)}" alt="">
      <span class="top-item-name">${escapeHtml(name)}</span>
      <span class="top-item-amount">${amountFmt}</span>
    `;
  } else {
    div.innerHTML = `
      <span class="top-item-badge num">${rank}</span>
      <img class="top-item-avatar" src="${escapeAttr(avatarSrc)}" alt="">
      <span class="top-item-name">${escapeHtml(name)}</span>
      <span class="top-item-amount">${amountFmt}</span>
    `;
  }
  return div;
}

function renderTopList() {
  topList.innerHTML = '';

  let list = [];
  if (_activeTopTab === 'idol') {
    list = [...topIdolLive]
      .sort((a, b) => a.Rank - b.Rank)
      .map((item) => ({
        rank: item.Rank,
        name: item.IdolName,
        amount: item.TotalDonation,
        avatar: item.Avatar || '',
      }));
  } else {
    list = (topDonateData[_activeTopPeriod] || [])
      .slice()
      .sort((a, b) => a.Rank - b.Rank)
      .map((item) => ({
        rank: item.Rank,
        name: item.Nickname,
        amount: item.TotalAmount,
        avatar: item.Avatar || '',
      }));
  }

  if (list.length === 0) {
    // Lời nhắn khác nhau theo tab: "chưa có dữ liệu" chung chung không nói cho người
    // chơi biết phải làm gì để bảng có tên.
    const empty =
      _activeTopTab === 'idol'
        ? { title: 'Bảng xếp hạng đang trống', sub: 'Chưa idol nào nhận được quà hôm nay. Tặng quà để đưa idol bạn thích lên top nhé!' }
        : { title: 'Chưa có ai trong top donate', sub: 'Tặng quà cho idol để ghi tên mình lên bảng xếp hạng.' };
    topList.innerHTML =
      '<div class="top-empty">' +
      '<span class="top-empty-icon">🏆</span>' +
      '<span class="top-empty-title">' +
      empty.title +
      '</span>' +
      '<span class="top-empty-sub">' +
      empty.sub +
      '</span>' +
      '</div>';
  } else {
    list.forEach((item) => topList.appendChild(_buildTopItem(item.rank, item.name, item.amount, item.avatar)));
  }

  // My rank sticky bar
  const myRankEl = document.getElementById('top-my-rank');
  if (myRankData) {
    document.getElementById('top-my-rank-avatar').src = myRankData.avatar || 'assets/ic_ava_nikname_demo.png';
    document.getElementById('top-my-rank-name').textContent = myRankData.name || '-';
    document.getElementById('top-my-rank-pos').textContent = myRankData.rank ? `#${myRankData.rank}` : '-';
    const sub = myRankData.gapToNext > 0 ? `Cần ${Number(myRankData.gapToNext).toLocaleString('vi-VN')} để thăng hạng` : myRankData.sub || '';
    document.getElementById('top-my-rank-sub').textContent = sub;
    myRankEl.style.display = 'flex';
  } else {
    myRankEl.style.display = 'none';
  }
}

// === HELPERS ===

/**
 * Send a message to Cocos Creator via postMessage.
 * Works on: Cocos native WebView (iOS/Android) and iframe context.
 * Skipped when running standalone in a browser (window.parent === window).
 * @param {string} type
 * @param {object} payload
 */
function sendToCocos(type, payload) {
  try {
    // Cocos native WebView intercepts window.parent.postMessage via its bridge.
    // In a real browser iframe, this reaches the parent frame normally.
    console.log('Sending message to Cocos:', { type, payload });
    window.parent.postMessage({ type, payload }, '*');
  } catch (e) {
    console.warn('[sendToCocos] postMessage failed:', e);
  }
}

/** Escape HTML entities to prevent XSS */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/** Escape for use inside HTML attribute values */
function escapeAttr(text) {
  return String(text).replace(/"/g, '&quot;');
}

// === WATCHDOG: nếu trang bị reload mà Cocos không gửi lại URL trong 5s → đóng về lobby ===
let _initDataReceived = false;
const _initWatchdog = setTimeout(() => {
  if (!_initDataReceived) {
    console.warn('[watchdog] Không nhận được data từ Cocos sau 5s, đóng webview về lobby');
    if (window.isNative) {
      window.location.href = 'cc://close';
    } else {
      window.parent.postMessage({ type: 'CLOSE_GAME' }, '*');
    }
  }
}, 5000);

//  === POSTMESSAGE (from Cocos Creator / iframe) ===

window.addEventListener('message', (event) => {
  console.log('Received message from parent:', event.data);
  const { type, payload } = event.data || {};
  switch (type) {
    case 'URL':
      _initDataReceived = true;
      clearTimeout(_initWatchdog);
      // Chỉ set khi URL THỰC SỰ đổi — tránh reload lại iframe video khi Cocos gửi lặp cùng 1
      // URL (reconnect / callbackLoaded bắn lại) gây giật/"refresh". Phép so đó nay nằm TRONG
      // setGameUrl, cùng chỗ với việc bật splash, để hai thứ không bao giờ lệch nhau.
      if (payload) setGameUrl(payload.url);
      elBalance.textContent = Number(payload.balance).toLocaleString('vi-VN');
      updateGiftCoins(payload.balance);

      break;
    case 'NEW_CHAT': {
      const msg = payload.message || payload;
      const cd = msg.CustomData || {};
      const content = msg.Content || '';
      const nickname = msg.Nickname || '';
      if (cd.MsgType === 'system_donate' || cd.GiftImg) {
        queueFloatMsg(nickname, content, getUserColor(nickname), cd);
      } else if (!isNotChatUser(cd)) {
        addChatMsg(nickname, content, cd);
      }
      break;
    }
    case 'RESPON_GET_TOP_IDOL':
      if (Array.isArray(payload.idols)) topIdolLive = payload.idols;
      if (payload.donate) topDonateData = payload.donate;
      if (payload.myRank) myRankData = payload.myRank;
      if (topSheet.classList.contains('open')) renderTopList();
      break;
    case 'GIFT_LIST':
      gifts = payload.gifts || [];
      renderGifts();
      break;
    case 'RESPON_SEND_GIFT':
      respondToSendGift(payload.msg, payload.nikName, payload.balance);

      break;
    case 'SHOW_TOAST':
      showToast(payload.message);
      break;
    case 'BALANCE':
      elBalance.textContent = Number(payload.balance).toLocaleString('vi-VN');
      updateGiftCoins(payload.balance);
      break;
    default:
      break;
  }
});

function receiveDataFromCocos(data) {
  console.log('Received data from Cocos 123:', JSON.stringify(data));
  const { type, payload } = data || {};
  switch (type) {
    case 'URL':
      _initDataReceived = true;
      clearTimeout(_initWatchdog);
      if (payload) setGameUrl(payload.url);
      if (payload.isNative) {
        window.isNative = payload.isNative;
      }
      elBalance.textContent = Number(payload.balance).toLocaleString('vi-VN');
      updateGiftCoins(payload.balance);
      break;
    case 'NEW_CHAT': {
      const msg = payload.message || payload;
      const cd = msg.CustomData || {};
      const content = msg.Content || '';
      const nickname = msg.Nickname || '';
      if (cd.MsgType === 'system_donate' || cd.GiftImg) {
        queueFloatMsg(nickname, content, getUserColor(nickname), cd);
      } else if (!isNotChatUser(cd)) {
        addChatMsg(nickname, content, cd);
      }
      break;
    }
    case 'RESPON_GET_TOP_IDOL':
      if (Array.isArray(payload.idols)) topIdolLive = payload.idols;
      if (payload.donate) topDonateData = payload.donate;
      if (payload.myRank) myRankData = payload.myRank;
      if (topSheet.classList.contains('open')) renderTopList();
      break;
    case 'GIFT_LIST':
      gifts = payload.gifts || [];
      renderGifts();
      break;
    case 'RESPON_SEND_GIFT':
      respondToSendGift(payload.msg, payload.nikName, payload.balance);
      break;
    case 'SHOW_TOAST':
      showToast(payload.message);
      break;
    case 'BALANCE':
      elBalance.textContent = Number(payload.balance).toLocaleString('vi-VN');
      updateGiftCoins(payload.balance);
      break;
    default:
      break;
  }
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isNotChatUser(data) {
  return data.MsgType == 'system_join' || data.MsgType == 'system_donate';
}

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

// === FLOATING BUTTON ===

let bottomUIVisible = true;

/**
 * Toggle the bottom toolbar visibility (slide in/out).
 * If hiding while a panel is open, close the panel first.
 */
function toggleBottomUI() {
  //===CLOSE PANEL CHAT===
  // const ui = document.getElementById('bottom-ui');
  // const btn = document.getElementById('float-btn');
  // bottomUIVisible = !bottomUIVisible;
  // ui.style.transform = bottomUIVisible ? 'translateY(0)' : 'translateY(100%)';
  // btn.classList.toggle('ui-hidden', !bottomUIVisible);
  // if (!bottomUIVisible && activePanel) closePanel();
  //==== CLOSE GAME ===
  closeGame();
}

/**
 * Đóng game về lobby.
 * @param {string} [reason] 'timeout' = đóng do lỗi tải, Cocos sẽ hiện toast báo.
 *                          Bỏ trống = người chơi tự bấm thoát, đóng im lặng.
 */
function closeGame(reason) {
  if (_splashTimer) {
    clearTimeout(_splashTimer);
    _splashTimer = null;
  }
  liveFrame.src = '';
  if (!window.isNative) {
    window.parent.postMessage({ type: 'CLOSE_GAME', payload: { reason: reason || '' } }, '*');
  } else {
    window.location.href = 'cc://close' + (reason ? '?reason=' + reason : '');
  }
}

/**
 * Initialise drag-and-snap behaviour for the floating button.
 * - Drag: free movement, clamped inside viewport.
 * - Release: snaps to the nearest left/right edge.
 * - Tap (no significant movement): triggers toggleBottomUI().
 */
function initFloatBtn() {
  const btn = document.getElementById('float-btn');
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
    // Disable CSS transition while dragging for immediate response
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
      // Tap — toggle bottom UI
      console.log('Floating button tapped');
      toggleBottomUI();
      return;
    }

    // Snap to nearest horizontal edge with animation
    btn.style.transition = 'left 0.22s ease, top 0.22s ease, opacity 0.2s, transform 0.15s';
    const rect = btn.getBoundingClientRect();
    const snapMargin = 10;
    const midX = rect.left + rect.width / 2;
    if (midX < window.innerWidth / 2) {
      btn.style.left = snapMargin + 'px';
    } else {
      btn.style.left = window.innerWidth - btn.offsetWidth - snapMargin + 'px';
    }
  });
}

// === KEYBOARD + LAYOUT: đặt live-container.bottom = chiều cao bottom-ui, và đẩy bottom-ui
// lên trên bàn phím khi gõ ===
(function initLayout() {
  const bottomUiEl = document.getElementById('bottom-ui');
  const liveContainerEl = document.getElementById('live-container');
  if (!bottomUiEl || !liveContainerEl) return;

  function getKeyboardH() {
    // visualViewport KHÔNG chắc có trên native WebView → không có thì coi như không bàn phím.
    if (!window.visualViewport) return 0;
    return Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
  }

  // live-container.bottom = chiều cao THỰC của bottom-ui (đo khi không có transform).
  function syncLiveBottom() {
    const keyboardH = getKeyboardH();
    bottomUiEl.style.transform = '';
    liveContainerEl.style.bottom = bottomUiEl.offsetHeight + 'px';
    bottomUiEl.style.transform = keyboardH > 0 ? `translateY(-${keyboardH}px)` : '';
  }

  // BUG cũ trên native: cả hàm return sớm nếu thiếu visualViewport → live-container.bottom
  // KHÔNG BAO GIỜ được set → live-frame không lấp đúng vùng → nhìn như "phình to phần bottom".
  // Và syncLiveBottom chỉ chạy MỘT lần lúc init (ResizeObserver bị comment) → đo lúc ảnh/layout
  // của toolbar chưa xong (native WebView hay chạy JS sớm) → chiều cao sai, không sửa lại.
  // Nay: KHÔNG gate visualViewport cho phần bottom, và đo LẠI nhiều lần cho chắc.
  syncLiveBottom();

  // Đo lại khi trang load xong (ảnh toolbar về → chiều cao chuẩn) và khi cửa sổ đổi kích thước.
  window.addEventListener('load', syncLiveBottom);
  window.addEventListener('resize', syncLiveBottom);
  window.addEventListener('orientationchange', function () {
    setTimeout(syncLiveBottom, 100);
  });

  // Bottom-ui đổi kích thước (font/ảnh về muộn, safe-area áp sau...) → đồng bộ ngay.
  if (window.ResizeObserver) {
    new ResizeObserver(syncLiveBottom).observe(bottomUiEl);
  }

  // Bàn phím: chỉ khi có visualViewport (đẩy bottom-ui lên trên bàn phím).
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncLiveBottom);
  }

  // WebView resume: khi user thoát app rồi quay lại, iOS/Android có thể không fire resize.
  // visibilitychange bắt được moment trang active lại → re-sync layout.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      syncLiveBottom();
      setTimeout(syncLiveBottom, 300);
    }
  });
})();

// === GIFT NOTIFICATION ===

const giftNotifContainer = document.getElementById('gift-notif-container');
const GIFT_NOTIF_MAX = 3;

// Combo tracking: key = "user|giftType" → { card, count, hideTimer, comboTimer }
const _giftCombos = new Map();

function showGiftNotif({ user, avatar, name, giftType }) {
  const comboKey = `${user}|${giftType}`;
  const existing = _giftCombos.get(comboKey);

  if (existing && existing.card.parentNode) {
    // Tăng combo trên card cũ
    existing.count++;
    clearTimeout(existing.hideTimer);
    clearTimeout(existing.comboTimer);

    const countEl = existing.card.querySelector('.gift-notif-count');
    if (countEl) {
      countEl.classList.remove('hidden');
      countEl.textContent = `x${existing.count}`;
      countEl.classList.remove('bump');
      void countEl.offsetWidth; // restart animation
      countEl.classList.add('bump');
    }

    // Reset 2s combo timer — nếu không có click mới thì xoá combo
    existing.comboTimer = setTimeout(() => _giftCombos.delete(comboKey), 2000);
    // Reset auto-hide 3s
    existing.hideTimer = setTimeout(() => {
      _removeGiftNotif(existing.card);
      _giftCombos.delete(comboKey);
    }, 3000);
    return;
  }

  // Tạo card mới
  while (giftNotifContainer.children.length >= GIFT_NOTIF_MAX) {
    _removeGiftNotif(giftNotifContainer.firstElementChild, true);
  }

  const card = document.createElement('div');
  card.className = 'gift-notif';

  const avatarHtml = avatar ? `<img class="gift-notif-avatar" src="${escapeAttr(avatar)}" alt="">` : `<img class="gift-notif-avatar" src="assets/ic_ava_nikname_demo.png" alt="">`;

  const giftVisual = giftType ? `<img class="gift-notif-img" src="./assets/gift/${giftType}.png" alt="">` : `<span class="gift-notif-emoji">🎁</span>`;

  card.innerHTML = `
    ${avatarHtml}
    <div class="gift-notif-info">
      <span class="gift-notif-user">${escapeHtml(user)}</span>
      <span class="gift-notif-text">Sent ${escapeHtml(name)}</span>
    </div>
    <div class="gift-notif-right">
      ${giftVisual}
    </div>
    <span class="gift-notif-count hidden">x1</span>
  `;

  giftNotifContainer.appendChild(card);

  const comboTimer = setTimeout(() => _giftCombos.delete(comboKey), 2000);
  const hideTimer = setTimeout(() => {
    _removeGiftNotif(card);
    _giftCombos.delete(comboKey);
  }, 3000);

  _giftCombos.set(comboKey, { card, count: 1, hideTimer, comboTimer });
}

function _removeGiftNotif(card, immediate = false) {
  if (!card || !card.parentNode) return;
  if (immediate) {
    card.remove();
    return;
  }
  card.classList.add('hiding');
  card.addEventListener('animationend', () => card.remove(), { once: true });
}

// === FLOATING CHAT OVERLAY ===
const chatFloat = document.getElementById('chat-float');

// Queue-based rate-limited float: gom 3s → pick 2 → show từng tin 1.5s
const _floatQueue = [];
let _floatCollectTimer = null;
let _floatBusy = false;

function syncChatFloat() {
  if (activePanel === 'chat') {
    chatFloat.classList.add('hidden');
  }
}

function queueFloatMsg(user, text, color, customData) {
  if (activePanel === 'chat') return;
  _floatQueue.push({ user, text, color, customData: customData || {} });
  if (!_floatCollectTimer && !_floatBusy) {
    _floatCollectTimer = setTimeout(_flushFloatQueue, 1500);
  }
}

function _flushFloatQueue() {
  _floatCollectTimer = null;
  if (activePanel === 'chat' || _floatQueue.length === 0) {
    _floatBusy = false;
    return;
  }
  _floatBusy = true;
  // Pick 2 most recent messages, discard rest
  const batch = _floatQueue.splice(Math.max(0, _floatQueue.length - 2), 2);
  _floatQueue.length = 0;
  _showFloatSequence(batch, 0);
}

function _showFloatSequence(msgs, idx) {
  if (idx >= msgs.length || activePanel === 'chat') {
    chatFloat.classList.add('hidden');
    chatFloat.innerHTML = '';
    _floatBusy = false;
    // If more messages queued while we were showing, start next batch
    if (_floatQueue.length > 0 && !_floatCollectTimer) {
      _floatCollectTimer = setTimeout(_flushFloatQueue, 3000);
    }
    return;
  }
  const { user, text, color, customData: cd } = msgs[idx];
  const vipLevel = cd.VipLevel || 0;
  const isAdmin = cd.IsAdmin || false;
  const giftImg = cd.GiftImg || '';
  const quantity = cd.Quantity || 0;

  let floatBadges = '';
  if (isAdmin) floatBadges += `<span class="chat-badge chat-badge-admin">Admin</span>`;
  if (vipLevel > 0)
    floatBadges += `<span class="chat-vip-badge"><img class="chat-vip-bg" src="assets/bg_vip_donate.png" alt=""><img class="chat-vip-icon" src="assets/vip/vp_${vipLevel}.png" alt=""><span class="chat-vip-level">${vipLevel}</span></span>`;

  let floatContent = '';
  if (giftImg) {
    floatContent = `đã gửi ${escapeHtml(
      text
        .replace(/^đã gửi\s*/, '')
        .replace(/\s*x\s*\d+\s*$/, '')
        .trim(),
    )} <img class="cf-gift-img" src="assets/gift/${escapeAttr(String(giftImg))}.png" alt=""> x ${quantity}`;
  } else {
    floatContent = escapeHtml(text);
  }

  chatFloat.innerHTML = `<div class="cf-msg">${floatBadges}<span class="cf-user" style="color:${color}">${escapeHtml(user)}</span>: ${floatContent}</div>`;
  chatFloat.classList.remove('hidden');
  setTimeout(() => _showFloatSequence(msgs, idx + 1), 1500);
}

// === DEMO CHAT ===
// const demoMsgs = [
//   { user: 'Player_001', text: 'Tắt tay được chưa các bác 😂' },
//   { user: 'Chi_all_in2002', text: 'Lo quá trời ơi' },
//   { user: 'hoclamgiau2012', text: 'Các anh cho e xin cái code 10k' },
//   { user: 'BigWin_Nguyen', text: 'Vừa ăn 5 ván liên tiếp 🔥🔥' },
//   { user: 'Lucky_Star88', text: 'Banker hay Player vậy mọi người?' },
//   { user: 'Pro_Gambler99', text: 'Cược theo tao, tao đang hot tay' },
//   { user: 'NewBie_2024', text: 'Mới vào chơi lần đầu, hên xui nha 😅' },
//   { user: 'VIP_Member_Gold', text: 'Bàn này hay đấy, mình chốt Player' },
//   { user: 'TigerKing_VN', text: 'Tie rồi cháy túi luôn 😭' },
//   { user: 'SxxBet_Fan', text: 'Anh em cùng cược Banker đi, tỉ lệ cao' },
// ];
// let _demoIdx = 0;
// function runDemoChat() {
//   if (_demoIdx >= demoMsgs.length) return;
//   const { user, text } = demoMsgs[_demoIdx++];
//   addChatMsg(user, text);
//   if (_demoIdx < demoMsgs.length) setTimeout(runDemoChat, 900 + Math.random() * 800);
// }
// setTimeout(runDemoChat, 600);

// document.addEventListener(
//   'scroll',
//   function (e) {
//     e.preventDefault();
//     e.stopPropagation();
//     window.scrollTo(0, 0);
//   },
//   { passive: false },
// );

// // Khi input focus, ngăn viewport thay đổi
// document.addEventListener('focusin', function (e) {
//   if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
//     e.preventDefault();
//     window.scrollTo(0, 0);
//   }
// });

// document.addEventListener('focusout', function () {
//   window.scrollTo(0, 0);
// });

// Chặn pull-to-refresh / rubber-band trên iOS cũ & máy màn nhỏ (không hỗ trợ overscroll-behavior).
// preventDefault mọi touchmove TRỪ khi ngón đang cuộn trong panel thực sự cuộn được → trang không kéo/reload.
document.addEventListener(
  'touchmove',
  function (e) {
    var el = e.target;
    while (el && el !== document.body) {
      var oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return; // để panel cuộn
      el = el.parentElement;
    }
    if (e.cancelable) e.preventDefault();
  },
  { passive: false },
);

// === INIT ===
applyToolbarState(); // apply default (no panel) state
initFloatBtn();
