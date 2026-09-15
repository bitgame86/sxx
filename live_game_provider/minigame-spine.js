/* ═══════════════════════════════════════════════════════════════════════════════════════
   MGSpine — lớp bọc mỏng quanh runtime Spine.

   VÌ SAO CÓ FILE NÀY: `tron_tx` và `WIN_TX` là Spine 3.8 thật (61 và 30 vùng atlas, toàn lớp
   hạt/tia ghép lại) — không có cách nào tái hiện bằng CSS. Muốn chạy đúng thì PHẢI có runtime
   chính thức của Esoteric.

   Runtime cần là gói PLAYER bản 3.8 (`spine-player.js` + `spine-player.css`) — khớp version
   trong file .json, và phải là gói player vì lớp này dùng spine.SpinePlayer, thứ không có
   trong spine-webgl. Thả vào cùng thư mục và khai trong index.html TRƯỚC minigame.js.

   Chưa có runtime thì mọi hàm ở đây trả false, và minigame.js tự rơi về hiệu ứng dự phòng —
   trang vẫn chạy, chỉ là không có hiệu ứng đẹp. Không bao giờ để thiếu runtime thành lỗi chặn.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var DIR = './assets/dice_mini/spines/';

  /** Cỡ skeleton, đọc từ khối "skeleton" trong chính file .json của mỗi spine. */
  var SIZE = { tron_tx: 423.35, WIN_TX: 200, mini_game_bt: 132 };

  /** Runtime có mặt không. Kiểm bằng thứ THỰC SỰ dùng, không chỉ kiểm `window.spine` tồn tại. */
  function hasRuntime() {
    var sp = window.spine;
    return !!(sp && sp.SpinePlayer);
  }

  /**
   * TẮT MÀN CHỜ CỦA SPINE-PLAYER (logo Spine + vòng xoay).
   *
   * Config `showLoading` chỉ có từ spine-player 4.x — bản 3.8 ta dùng KHÔNG đọc nó, và
   * SpinePlayer.drawFrame gọi `loadingScreen.draw()` vô điều kiện mỗi frame. Nên đường duy
   * nhất là dập thẳng hàm draw.
   *
   * Dập ở tầng PROTOTYPE chứ không từng instance: LoadingScreen được dựng ngay trong
   * constructor SpinePlayer, không có chỗ nào chen vào sau khi `new` để vá riêng lẻ.
   *
   * Phải tắt cả vì nó không chỉ hiện lúc tải: tải xong rồi nó còn fade out thêm
   * LoadingScreen.FADE_SECONDS = 1 giây, chồng lên chính animation vừa bắt đầu chạy.
   * Nền canvas đã được drawFrame xoá về backgroundColor trong suốt trước đó, nên bỏ hẳn
   * draw() không để lại vệt gì.
   */
  var _lsKilled = false;

  function killLoadingScreen() {
    if (_lsKilled) return;
    var w = window.spine && window.spine.webgl;
    if (!w || !w.LoadingScreen) return;
    _lsKilled = true;
    w.LoadingScreen.prototype.draw = function () {};
  }

  /**
   * Gắn một spine vào node cho trước.
   *
   * @param host    node chứa (spine sẽ lấp đầy node này)
   * @param name    tên file, không đuôi — 'tron_tx' hoặc 'WIN_TX'
   * @param opts    { loop, onEnd, onReady }
   *                onReady bắn khi khung hình ĐẦU TIÊN đã vẽ được — dùng để đổi giao diện
   *                từ bản dự phòng sang bản spine đúng lúc, không sớm hơn.
   * @return handle có .dispose(), hoặc null nếu không chạy được
   */
  /**
   * HỒ CHỨA PLAYER, theo tên spine.
   *
   * Vì sao cần: SpinePlayer KHÔNG có hàm dispose (kiểm trên chính đối tượng lúc chạy: prototype
   * chỉ có 17 hàm, không có cái nào tên dispose). Bản trước gọi `player.dispose &&` nên không
   * bao giờ chạy — mỗi lần mount để lại một WebGL context sống và một vòng requestAnimationFrame
   * chạy mãi. Đo được: sau 5 lần mount rồi "dispose", cả 5 context vẫn `isContextLost() === false`.
   *
   * Mà WIN_TX được mount lại MỖI PHIÊN trả thưởng, tron_tx mỗi pha đặt cược — tức mỗi phút thêm
   * một context. Safari iOS cho khoảng 16 context, cộng của Cocos và của game hãng trong iframe
   * thì chỉ vài phút là chạm trần rồi bị hệ điều hành giết.
   *
   * Nên: dựng MỘT player cho mỗi tên, sau đó chỉ ẩn/hiện và dời chỗ. Vừa hết rò, vừa khỏi tải
   * lại .json + .atlas mỗi phiên (log mạng cho thấy chúng nạp lại đủ 6 lần cho 6 lần mount).
   */
  var _ho = {};

  function mount(host, name, opts) {
    if (!host || !hasRuntime()) return null;
    opts = opts || {};
    killLoadingScreen();

    // ĐÃ CÓ SẴN → dùng lại, không dựng mới.
    var cu = _ho[name];
    if (cu && cu.player) {
      // Dời thẻ sang node chứa mới. Di chuyển canvas giữa các cha KHÔNG làm mất WebGL context,
      // nên WIN_TX đổi từ cửa Tài sang cửa Xỉu vẫn dùng chung một player.
      host.appendChild(cu.el);
      try {
        // Đặt lại animation về đầu — không thì hiệu ứng chạy tiếp từ giữa chừng của phiên trước.
        cu.player.animationState.setAnimation(0, 'animation', !!opts.loop);
        cu.player.play();
      } catch (e) {}
      if (opts.onReady) opts.onReady();
      return taoHandle(name);
    }

    // SpinePlayer tự dựng canvas và tự lo vòng vẽ. Dùng nó thay vì tự viết vòng render:
    // ít code hơn hẳn, và nó xử lý sẵn mất/khôi phục WebGL context — thứ hay xảy ra đúng trên
    // dòng máy Android yếu mà cả dự án này đang phải chiều.
    var el = document.createElement('div');
    el.className = 'mg-spine';
    host.appendChild(el);

    var player = null;
    try {
      player = new window.spine.SpinePlayer(el, {
        jsonUrl: DIR + name + '.json',
        // Cocos đặt tên atlas là .atlas.txt khi import — giữ nguyên, đừng đổi tên file.
        atlasUrl: DIR + name + '.atlas.txt',
        animation: 'animation',
        premultipliedAlpha: false,
        alpha: true,
        backgroundColor: '#00000000',
        showControls: false,
        // KHÔNG khai `showLoading` ở đây — bản 3.8 không đọc option đó (nó chỉ có từ 4.x), khai
        // vào chỉ khiến người đọc sau tưởng màn chờ đã tắt. Việc tắt do killLoadingScreen() lo.
        // GHIM khung nhìn theo cỡ skeleton, không để SpinePlayer tự tính.
        //
        // Mặc định nó lấy bounding box của cả animation — mà hai spine này có hạt bay ra rất
        // xa tâm, nên khung phình to và hình chính bị thu nhỏ lại giữa canvas. Ghim đúng cỡ
        // skeleton thì vòng lửa mới phủ kín ô tròn của bàn như bản Cocos.
        viewport: {
          x: -SIZE[name] / 2,
          y: -SIZE[name] / 2,
          width: SIZE[name],
          height: SIZE[name],
          padLeft: '0%',
          padRight: '0%',
          padTop: '0%',
          padBottom: '0%',
        },
        success: function (p) {
          try {
            p.animationState.setAnimation(0, 'animation', !!opts.loop);
            // Báo sẵn sàng NGAY TRONG success, không hẹn qua requestAnimationFrame: app ẩn thì
            // rAF treo hẳn, nút sẽ kẹt ở bản dự phòng cho tới khi người chơi quay lại. Gọi thẳng
            // ở đây vẫn không hở frame nào — success chạy bên trong chính lượt drawFrame sẽ vẽ
            // khung hình đầu tiên (spine-player.js: success() rồi mới `this.loaded = true`),
            // nên việc hiện canvas và việc vẽ rơi vào cùng một nhịp cập nhật màn hình.
            if (opts.onReady) opts.onReady();
            if (opts.onEnd && !opts.loop) {
              p.animationState.addListener({
                complete: function () {
                  opts.onEnd();
                },
              });
            }
          } catch (e) {
            console.warn('[mg-spine] không đặt được animation:', e);
            if (opts.onEnd) opts.onEnd();
          }
        },
        error: function (p, msg) {
          console.warn('[mg-spine] tải spine hỏng:', name, msg);
          // Hỏng lúc tải cũng phải gọi onEnd, không thì luồng kết quả treo vĩnh viễn ở pha chờ.
          if (opts.onEnd) opts.onEnd();
        },
      });
    } catch (e) {
      console.warn('[mg-spine] dựng SpinePlayer thất bại:', e);
      if (el.parentNode) el.parentNode.removeChild(el);
      if (opts.onEnd) opts.onEnd();
      return null;
    }

    _ho[name] = { el: el, player: player };
    return taoHandle(name);
  }

  /**
   * Handle trả cho nơi gọi. `dispose()` ở đây nghĩa là CẤT ĐI, không phải huỷ:
   * dừng animation và gỡ thẻ khỏi màn, nhưng giữ nguyên player và WebGL context để lần sau
   * dùng lại. Muốn trả context thật thì gọi MGSpine.destroyAll().
   */
  function taoHandle(name) {
    return {
      dispose: function () {
        var m = _ho[name];
        if (!m) return;
        try {
          if (m.player && m.player.pause) m.player.pause();
        } catch (e) {}
        if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
      },
    };
  }

  /**
   * HUỶ THẬT mọi player — gọi khi đóng hẳn bảng Tài Xỉu hoặc rời trang.
   *
   * stopRendering() là MỘT CHIỀU: nó chỉ bật cờ stopRequestAnimationFrame, mà play() không tắt
   * cờ đó. Gọi rồi là player chết hẳn, không hồi lại được — nên tuyệt đối không dùng nó cho
   * việc ẩn tạm.
   *
   * Gọi thêm WEBGL_lose_context để trả context ngay, không chờ trình duyệt tự thu hồi.
   */
  function destroyAll() {
    for (var name in _ho) {
      if (Object.prototype.hasOwnProperty.call(_ho, name)) destroy(name);
    }
    _ho = {};
  }

  /**
   * Huỷ MỘT spine và trả lại bộ nhớ của nó.
   *
   * Đáng giá hơn vẻ ngoài: tron_tx và WIN_TX đều là atlas 2048×2048, mỗi cái chiếm 16MB bộ nhớ
   * GPU sau khi giải nén — hai cái là 32MB. Đóng bảng Tài Xỉu mà vẫn giữ thì đúng lúc người
   * chơi quay lại game của hãng (lúc bộ nhớ căng nhất) mình vẫn ôm khư khư 32MB không dùng tới.
   * Trên iPhone đó là phần đáng kể trong hạn mức mà iOS cấp cho một tiến trình web.
   */
  function destroy(name) {
    var m = _ho[name];
    if (!m) return;
    try {
      if (m.player && m.player.stopRendering) m.player.stopRendering();
    } catch (e) {}
    try {
      var c = m.el && m.el.querySelector('canvas');
      var gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
      var ext = gl && gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch (e) {}
    if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
    delete _ho[name];
  }

  window.MGSpine = {
    available: hasRuntime,
    mount: mount,
    destroy: destroy,
    destroyAll: destroyAll,
  };
})();
