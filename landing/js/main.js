/* Hiệu ứng xuất hiện khi cuộn trang */
(function () {
  var items = document.querySelectorAll('.panel, .feat, .stage__img, .brands img');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  items.forEach(function (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'opacity .55s ease, transform .55s ease';
  });

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.opacity = '1';
        e.target.style.transform = 'none';
        io.unobserve(e.target);
      });
    },
    { threshold: 0.15 },
  );

  items.forEach(function (el) {
    io.observe(el);
  });
})();

function detectMobileOS() {
  const ua = navigator.userAgent || '';

  const uaData = navigator.userAgentData;
  if (uaData && uaData.platform) {
    const p = uaData.platform.toLowerCase();
    if (p === 'android') return 'android';
    if (p === 'ios') return 'ios';
  }

  if (/android/i.test(ua)) return 'android';

  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';

  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';

  return 'other';
}

function isMobile() {
  return detectMobileOS() !== 'other';
}

// const btnDownload = document.getElementById('btn-download');
const btnPlay = document.getElementById('btn-play');
// const btnGold = document.getElementById('btn-gold');
const btnPanelRight = document.getElementById('panel--right');

const os = detectMobileOS();

if (os === 'android') {
  btnPlay.style.backgroundImage = "url('assets/img/btn-android.png')";
  btnPlay.href = 'https://download.thst90.boutique/BETXXX.apk';
} else if (os === 'ios') {
  btnPlay.style.backgroundImage = "url('assets/img/btn-ios.png')";
  btnPlay.href = 'itms-services://?action=download-manifest&url=https://dl.signv4.com/temp/Sxx-Betcom.sxx.ios/plist.plist';
} else {
  btnPlay.style.backgroundImage = "url('assets/img/btnPlayWeb.png')";
  btnPlay.href = 'https://sxxmandoc.meliodas79.uk/production/';
}

btnPanelRight.addEventListener('click', function () {
  window.open('http://1.1.1.1', '_blank');
});




// btnPlay.href = 'https://sxxmandoc.meliodas79.uk/production';
// btnDownload.href = 'itms-services://?action=download-manifest&url=https://dl.signv4.com/temp/Sxx-Betcom.sxx.ios/plist.plist';
// btnGold.href = 'https://download.thst90.boutique/sxxbet.apk';
