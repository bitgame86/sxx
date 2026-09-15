/* ═══════════════════════════════════════════════════════════════════════════════════════
   MINIGAME — Tài Xỉu (DiceMini) chạy trong trang HTML, đè lên iframe game đối tác.

   VÌ SAO Ở ĐÂY: trên native, webview LUÔN nằm trên canvas Cocos. Tài Xỉu vẽ bên Cocos sẽ bị
   chính trang này che mất — nên phần NHÌN bắt buộc phải nằm trong trang.

   ĐÂY LÀ MÀN HÌNH CÂM. Không luật chơi, không tính tiền thắng, không tự chốt phiên. Chỉ vẽ
   cái Cocos đẩy xuống và gửi ý định lên. Bản thật vẫn là DiceMini trong Cocos — hai bản cùng
   logic là hai bản sẽ lệch nhau khi máy chủ đổi luật.

   PHỤ THUỘC app.js: showToast(), window.isNative. Nạp SAU app.js.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var ART = './assets/dice_mini/';

  /** Chờ spine nút nổi bao lâu trước khi bỏ cuộc và hiện bản dự phòng. Rộng tay hơn hẳn thời
      gian tải thật (1.35MB) để mạng chậm vẫn kịp — đây là van xả, không phải hạn chót. */
  var ART_WAIT_MS = 8000;

  // Cổng cược — khớp DiceKeyboard.onClickBoxBet bên Cocos: 1 = XỈU (SMALL), 2 = TÀI (BIG).
  var GATE_SMALL = 1;
  var GATE_BIG = 2;

  // Chữ mặc định trên hai nút cửa. Để một chỗ vì có hai nơi ghi vào nút: lúc dựng DOM và lúc
  // trả chữ về sau khi huỷ tiền — hai nơi lệch nhau là nút hiện sai chữ.
  var CHU_DAT_CUOC = 'ĐẶT CƯỢC';
  // Chữ mời trong ô đen của mỗi ô bạch thủ. Cùng lý do: có hai nơi ghi vào nó.
  var CHU_MOI_DAT = 'Đặt cược';

  // Khớp DiceGameState.ts
  var ST_NONE = 0;
  var ST_BETTING = 1;
  var ST_WAITING = 2;

  // Mệnh giá — dùng đúng bộ ảnh chip có sẵn trong atlas.
  var CHIPS = [
    { key: '1K', value: 1000 },
    { key: '10K', value: 10000 },
    { key: '100K', value: 100000 },
    { key: '500K', value: 500000 },
    { key: '1M', value: 1000000 },
    { key: '5M', value: 5000000 },
    { key: '10M', value: 10000000 },
  ];

  // ── Trạng thái hiển thị. TẤT CẢ đến từ Cocos, không tự suy ra. ───────────────────────
  var st = {
    open: false,
    session: 0,
    status: ST_NONE,
    timer: 0,
    balance: 0,
    dice: null, // [d1,d2,d3] khi có kết quả
    myBet: { SMALL: 0, BIG: 0 },
    history: [], // [{sum, big}] mới nhất ở cuối
    pickedGate: 0,
    // Đang kéo cụm đi. Phần thu-nhỏ-khi-không-dùng đọc cờ này để không đổi cỡ giữa cú kéo.
    dragging: false,
    stake: 0,
    sending: false,
    room: { jackpotBig: 0, jackpotSmall: 0, bigTotal: 0, smallTotal: 0, bigUsers: 0, smallUsers: 0 },
    btOpen: false,
    keysOpen: false,
    // Hai lưới của bảng soi cầu, lấy nguyên từ gói OVERLAY của server (xem DiceBridge).
    //   above = 6 HÀNG × tối đa 20 ô, giá trị là tổng điểm, 0 = ô trống
    //   under = mảng phẳng các tổng, xếp thành 20 cột × 6 hàng theo kiểu rắn bò
    overlay: { above: [], under: [] },
  };

  // BẠCH THỦ: cược đúng một TỔNG. Mã cổng gửi server = TỔNG + 1 (xem _bachThuSumKey bên
  // DiceGameView: 5 ứng với 'SUM_FOUR'). Khoá trong gói myBet cũng là 'SUM_*', không phải số.
  var BT_SUMS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  var BT_KEY = {
    4: 'SUM_FOUR',
    5: 'SUM_FIVE',
    6: 'SUM_SIX',
    7: 'SUM_SEVEN',
    8: 'SUM_EIGHT',
    9: 'SUM_NINE',
    10: 'SUM_TEN',
    11: 'SUM_ELEVEN',
    12: 'SUM_TWELVE',
    13: 'SUM_THIRTEEN',
    14: 'SUM_FOURTEEN',
    15: 'SUM_FIFTEEN',
    16: 'SUM_SIXTEEN',
    17: 'SUM_SEVENTEEN',
  };
  function btGate(sum) {
    return sum + 1;
  }

  var el = {};

  // ═══════════════════════════════════════════════════════════════════════════════════
  // DỰNG DOM
  // Dựng bằng JS thay vì viết sẵn trong index.html: xoá file này là trang sạch hoàn toàn,
  // không để lại đống thẻ mồ côi.
  // ═══════════════════════════════════════════════════════════════════════════════════

  function build() {
    var btn = document.createElement('button');
    btn.id = 'mini-btn';
    btn.className = 'float-btn mini-btn';
    btn.setAttribute('aria-label', 'Tài Xỉu');
    // Nhãn kết quả phiên vừa rồi, nổi NGAY TRÊN nút. Dành cho lúc bảng đang đóng — người chơi
    // vẫn theo được cầu mà không phải mở bàn ra xem.
    // #mini-art là chỗ gắn spine mini_game_bt; <span> chữ chỉ là dự phòng khi chưa có runtime.
    btn.innerHTML = '<b id="mini-rs" hidden></b><i id="mini-clock" hidden></i>' + '<em id="mini-art"></em><span>TÀI<br>XỈU</span>';
    document.body.appendChild(btn);

    // Nút dùng SPINE mini_game_bt thay cho hình tròn tự vẽ. Không có runtime thì giữ nguyên
    // nút cũ — trang vẫn chạy, chỉ là không có hoạt cảnh.
    //
    // GIẤU HẲN NÚT TỚI KHI SPINE VẼ ĐƯỢC. Texture nặng 1.35MB, mà nút có hai bộ mặt (bản dự
    // phòng nền tròn vàng + chữ TÀI XỈU, và bản spine) — để lộ bản dự phòng rồi mới đổi thì
    // người chơi thấy nút thay hình giữa chừng, khó chịu hơn là chờ thêm một nhịp.
    //
    // Đổi lại, trong quãng này KHÔNG có nút để bấm và badge đếm ngược cũng không hiện. Chấp
    // nhận được vì nó chỉ kéo dài đúng lúc mới vào game, khi chưa có gì để đếm.
    if (window.MGSpine && window.MGSpine.available()) {
      btn.classList.add('art-pending');

      // VAN XẢ. Quá ngần này mà spine chưa vẽ được thì hiện bản dự phòng — thà nút xấu còn hơn
      // mất hẳn đường mở bảng. Cần thật sự, không phải phòng xa: vòng vẽ của SpinePlayer chạy
      // bằng requestAnimationFrame, mà rAF TREO HẲN khi app ra nền — người chơi chuyển app đúng
      // lúc đang tải là onReady không bao giờ bắn cho tới khi họ quay lại.
      var pendTimer = setTimeout(function () {
        pendTimer = null;
        console.warn('[mg] spine nút nổi chưa sẵn sàng sau ' + ART_WAIT_MS + 'ms → dùng bản dự phòng');
        btn.classList.remove('art-pending');
      }, ART_WAIT_MS);

      window.MGSpine.mount(document.getElementById('mini-art'), 'mini_game_bt', {
        loop: true,
        // Spine về sau cả van xả vẫn được đổi sang — người chơi thấy nút dự phòng biến thành
        // spine, nhưng đó là ca hiếm (mạng rất chậm), và bỏ qua thì mất hẳn hoạt cảnh cả phiên.
        onReady: function () {
          if (pendTimer) {
            clearTimeout(pendTimer);
            pendTimer = null;
          }
          btn.classList.remove('art-pending');
          btn.classList.add('has-art');
        },
      });
    }

    var p = document.createElement('div');
    p.id = 'mg-panel';
    p.setAttribute('aria-hidden', 'true');
    p.innerHTML =
      // KHÔNG còn thanh trên: số dư bỏ hẳn (người chơi xem ở game chính), nút đóng chuyển
      // thành nút X tròn nằm ngay góc bàn như bàn gốc. Kéo thì đã kéo bằng cả mặt bàn rồi.
      '<div id="mg-body">' +
      // BỐ CỤC BÁM ĐÚNG BÀN GỐC:
      //   hàng jackpot → hàng số người + mã phiên → bàn (TÀI TRÁI, XỈU PHẢI, đếm ngược giữa)
      //   → thanh cầu → chip → nút.
      // TÀI ở TRÁI và XỈU ở PHẢI là theo bàn thật, KHÔNG theo số hiệu cổng (cổng 1 = XỈU,
      // cổng 2 = TÀI) — đừng suy vị trí từ số hiệu.
      '  <div id="mg-jp">' +
      '    <div class="mg-jp-bar" id="mg-jp1"><span class="bmnum"></span></div>' +
      '    <div class="mg-jp-bar" id="mg-jp2"><span class="bmnum"></span></div>' +
      '  </div>' +
      '  <div id="mg-table">' +
      '    <div id="mg-meta">' +
      '      <span class="mg-users" id="mg-users-big">0</span>' +
      '      <span id="mg-session">#--</span>' +
      '      <span class="mg-users" id="mg-users-small">0</span>' +
      '    </div>' +
      '    <div id="mg-center">' +
      '      <div id="mg-count">--</div>' +
      // Ba con xúc xắc kết quả xếp TAM GIÁC như prefab (xx1 trên, xx2 dưới-phải, xx3 dưới-trái),
      // không phải một hàng ngang. Mỗi con một lớp riêng để đặt đúng toạ độ.
      '      <div id="mg-dice">' +
      '        <img class="d1" alt=""><img class="d2" alt=""><img class="d3" alt="">' +
      '      </div>' +
      '    </div>' +
      // HOẠT CẢNH TUNG nằm thẳng trong bàn, không nhét trong ô giữa: prefab đặt node
      // animationDice theo toạ độ riêng trên mặt bàn, cỡ theo frame chứ không theo ô đếm ngược.
      '    <div id="mg-roll"></div>' +
      '    <div id="mg-ring"></div>' +
      // CÁI BÁT úp lên kết quả khi bật chế độ tự nặn. Kéo nó ra đủ xa thì mở.
      '    <div id="mg-bowl" hidden><img src="' +
      ART +
      'main/bow.png" alt=""></div>' +
      // Công tắc TỰ NẶN. Tắt (mặc định) = xúc xắc tung xong hiện kết quả luôn; bật = úp bát
      // lại, người chơi tự kéo bát ra mới thấy. Đúng cờ isHand của DiceGameView.
      '    <button id="mg-btn-hand" aria-label="Tự nặn"><img src="' +
      ART +
      'main/btnHand.png" alt="">' +
      '      <i class="mg-hand-off"></i></button>' +
      // Ô ĐẾM NGƯỢC NHỎ Ở GÓC. Giữa bàn lúc trả thưởng đang là ba con xúc xắc, nên đồng hồ
      // phải dời ra góc — không thì hết pha đặt cược là mất luôn dấu thời gian.
      '    <div id="mg-mini-timer" hidden><span>0</span></div>' +
      // HIỆU ỨNG THẮNG nằm NGOÀI hai cửa, là con trực tiếp của bàn. Nó phải hoà sáng (screen)
      // với mặt bàn để nền đen của atlas biến mất — mà .mg-side có z-index + transform nên tự
      // tạo stacking context, đặt bên trong thì blend chỉ quẩn trong cửa, không chạm tới bàn.
      '    <div class="mg-winfx" id="mg-winfx-big"></div>' +
      '    <div class="mg-winfx" id="mg-winfx-small"></div>' +
      '    <div class="mg-side" id="mg-side-big">' +
      '      <img class="mg-gate-img" src="' +
      ART +
      'main/gate2_vi.png" alt="Tài">' +
      '      <div class="mg-total bmnum" id="mg-total-big"></div>' +
      '      <button class="mg-betbtn" id="mg-gate-big"><span>ĐẶT CƯỢC</span></button>' +
      '      <div class="mg-mybet bmnum" id="mg-mybet-big"></div>' +
      '    </div>' +
      '    <div class="mg-side" id="mg-side-small">' +
      '      <img class="mg-gate-img" src="' +
      ART +
      'main/gate1_vi.png" alt="Xỉu">' +
      '      <div class="mg-total bmnum" id="mg-total-small"></div>' +
      '      <button class="mg-betbtn" id="mg-gate-small"><span>ĐẶT CƯỢC</span></button>' +
      '      <div class="mg-mybet bmnum" id="mg-mybet-small"></div>' +
      '    </div>' +
      // NÚT QUANH BÀN — bám vị trí bàn gốc: X ở góc trên-phải, cụm chức năng hai bên dưới.
      '    <button class="mg-rbtn" id="mg-btn-close" aria-label="Đóng">' +
      '      <img src="' +
      ART +
      'main/btnClose.png" alt=""></button>' +
      // NĂM NÚT QUANH BÀN, mỗi cái tự đặt chỗ bằng position:absolute trong CSS. Bỏ hai thẻ
      // bọc .mg-rcol cũ: chúng xếp nút theo cột flex nên chỉ chỉnh được cả cụm, muốn nhích
      // riêng một nút là không có đường nào.
      '      <button class="mg-rbtn" id="mg-btn-history" aria-label="Lịch sử">' +
      '        <img src="' +
      ART +
      'main/btnHistory.png" alt=""></button>' +
      '      <button class="mg-rbtn" id="mg-btn-honors" aria-label="Vinh danh">' +
      '        <img src="' +
      ART +
      'main/btnHonors.png" alt=""></button>' +
      '      <button class="mg-rbtn" id="mg-btn-soicau" aria-label="Soi cầu">' +
      '        <img src="' +
      ART +
      'main/btnSoiCau.png" alt=""></button>' +
      '      <button class="mg-rbtn" id="mg-btn-guide" aria-label="Hướng dẫn">' +
      '        <img src="' +
      ART +
      'main/btnGuide.png" alt=""></button>' +
      '      <button class="mg-rbtn" id="mg-btn-chat" aria-label="Trò chuyện">' +
      '        <img src="' +
      ART +
      'main/btnChat.png" alt=""></button>' +
      // LƯỚI BẠCH THỦ ĐÈ LÊN BÀN — nằm trong #mg-table và position:absolute, nên mở ra không
      // đẩy bàn xuống, cụm không cao thêm một dòng nào.
      '    <div id="mg-bachthu" hidden>' +
      '      <div id="mg-bt-grid"></div>' +
      '    </div>' +
      // CHỈ còn dòng tiền thắng. Bỏ "TÀI 12": ba con xúc xắc đã nằm ngay giữa bàn và cửa về
      // thì có spine sáng, viết lại bằng chữ là thừa. Tiền thắng thì khác — nhìn xúc xắc
      // không ra được.
      '    <div id="mg-result" hidden>' +
      '      <div id="mg-rs-win"></div>' +
      '    </div>' +
      // THANH CẦU NẰM TRONG BÀN. Trong prefab, historyBar (499×47) là con của cùng node với
      // bg_Main_TX (673×347) và đè lên đáy bàn — không phải một dải riêng nằm dưới bàn.
      '    <div id="mg-cau"></div>' +
      '  </div>' +
      // NÚT BẠCH THỦ nằm GIỮA bàn và chat.
      '  <div id="mg-bt-toggle-row">' +
      '    <button id="mg-bt-toggle"><img src="' +
      ART +
      'main/btnBachThu.png" alt="Bạch thủ"></button>' +
      '  </div>' +
      // KHAY CHỌN TIỀN nằm GIỮA bàn và chat. Ẩn cho tới khi chọn được một cửa — bàn gốc cũng
      // vậy, bàn phím nhập tiền chỉ bật lên sau khi bấm vào cửa.
      '  <div id="mg-tray" hidden>' +
      // Số tiền đang gõ nằm NGAY TRÊN hàng mệnh giá: hàng nút phía dưới đã đủ 4 nút, nhét thêm
      // ô tiền vào giữa thì nút nào cũng bị bóp lại.
      '    <div id="mg-chipbar">' +
      '      <div id="mg-chips"></div>' +
      // Bàn phím số của nút SỐ KHÁC. Thay chỗ hàng mệnh giá chứ không đẩy thêm hàng mới —
      // cụm đã cao 778px trên màn 812px, thêm hàng nữa là tràn.
      '      <div id="mg-keys" hidden></div>' +
      '    </div>' +
      '    <div id="mg-actions">' +
      '      <button class="mg-act" id="mg-cancel"><img src="' +
      ART +
      'main/btnCancle.png" alt="Huỷ"></button>' +
      '      <button class="mg-act" id="mg-accept"><img src="' +
      ART +
      'main/btnAccept.png" alt="Đặt"></button>' +
      '      <button class="mg-act" id="mg-other"><img src="' +
      ART +
      'main/btnSoKhac.png" alt="Số khác"></button>' +
      '      <button class="mg-act" id="mg-allin"><img src="' +
      ART +
      'main/TATTAY.png" alt="Tất tay"></button>' +
      '    </div>' +
      '  </div>' +
      // KHUNG CHAT — con của cụm, ngay dưới bàn. Nằm trong cụm nên kéo bàn là nó đi theo,
      // không phải tự tính lại vị trí.
      '  <div id="mg-chat" hidden>' +
      '    <div id="mg-chat-list"></div>' +
      '    <div id="mg-chat-bar">' +
      '      <input id="mg-chat-input" type="text" maxlength="40" placeholder="Nhập nội dung (tối đa 40 ký tự)">' +
      '      <button id="mg-chat-send" aria-label="Gửi"></button>' +
      '    </div>' +
      '  </div>' +
      // Nút bạch thủ và lưới của nó nằm NGOÀI khay đặt cược — bọc chung vào khay thì chúng
      // lọt vào giữa hàng mệnh giá và nút ĐỒNG Ý, nhìn như một phần của việc nhập tiền.
      '</div>' +
      '<div id="mg-loading"><div class="spinner"></div></div>';
    document.body.appendChild(p);

    // POPUP GẮN THẲNG VÀO BODY, không nằm trong cụm bàn.
    //
    // #mg-panel có transform (căn giữa / dời chỗ khi kéo), mà transform TẠO KHUNG THAM CHIẾU
    // MỚI cho position:fixed — popup nằm bên trong sẽ neo theo cụm chứ không theo màn hình, và
    // cụm thì nhỏ hơn popup rất nhiều.
    var pop = document.createElement('div');
    pop.id = 'mg-pop';
    pop.hidden = true;
    pop.innerHTML =
      // Nút đóng nằm TRONG thanh tiêu đề để căn giữa được theo chính thanh đó. Trước để ngoài
      // (phòng khi màn chat ẩn thanh tiêu đề), nhưng chat giờ là khối riêng dưới bàn, không
      // còn đi qua khung popup nữa.
      '<div id="mg-pop-head">' + '  <span id="mg-pop-title">--</span>' + '  <button id="mg-pop-close" aria-label="Đóng">✕</button>' + '</div>' + '<div id="mg-pop-body"></div>';
    document.body.appendChild(pop);

    // THÔNG BÁO GẮN VÀO BODY, không nằm trong cụm bàn.
    //
    // Nó phải nổi trên MỌI thứ, kể cả popup đang mở — báo "số dư không đủ" mà bị bảng soi cầu
    // che thì người chơi không thấy. Và cũng như popup: #mg-panel có transform nên position
    // fixed đặt trong đó sẽ neo theo cụm chứ không theo màn hình.
    var note = document.createElement('div');
    note.id = 'mg-note';
    document.body.appendChild(note);

    el.panel = p;
    el.session = document.getElementById('mg-session');
    el.balance = null; // số dư không hiện nữa — xem ghi chú ở phần dựng DOM
    el.count = document.getElementById('mg-count');
    el.miniTimer = document.getElementById('mg-mini-timer');
    el.miniRs = document.getElementById('mini-rs');
    el.miniClock = document.getElementById('mini-clock');
    el.bowl = document.getElementById('mg-bowl');
    el.btnHand = document.getElementById('mg-btn-hand');
    el.ring = document.getElementById('mg-ring');
    el.roll = document.getElementById('mg-roll');
    el.winfxBig = document.getElementById('mg-winfx-big');
    el.winfxSmall = document.getElementById('mg-winfx-small');
    el.dice = document.getElementById('mg-dice');
    el.jp1 = document.querySelector('#mg-jp1 span');
    el.jp2 = document.querySelector('#mg-jp2 span');
    el.usersBig = document.getElementById('mg-users-big');
    el.usersSmall = document.getElementById('mg-users-small');
    el.totalBig = document.getElementById('mg-total-big');
    el.totalSmall = document.getElementById('mg-total-small');
    // Vẽ ngay số 0 bằng bộ chữ ảnh. Không có dòng này thì tới khi server bắn gói đầu, hai ô
    // vẫn là chữ "0" thường của HTML — lệch hẳn kiểu so với lúc có số.
    bmText(el.totalBig, '0');
    bmText(el.totalSmall, '0');
    bmText(el.jp1, '0');
    bmText(el.jp2, '0');
    el.table = document.getElementById('mg-table');
    el.sideBig = document.getElementById('mg-side-big');
    el.sideSmall = document.getElementById('mg-side-small');
    el.diceImgs = el.dice.getElementsByTagName('img');
    el.gateSmall = document.getElementById('mg-gate-small');
    el.gateBig = document.getElementById('mg-gate-big');
    el.myBetSmall = document.getElementById('mg-mybet-small');
    el.myBetBig = document.getElementById('mg-mybet-big');
    // Vẽ sau khi đã lấy được hai ô này — trên kia chúng còn chưa tồn tại.
    bmText(el.myBetBig, '0');
    bmText(el.myBetSmall, '0');
    el.cau = document.getElementById('mg-cau');
    el.chips = document.getElementById('mg-chips');
    el.keys = document.getElementById('mg-keys');
    el.other = document.getElementById('mg-other');
    el.allin = document.getElementById('mg-allin');
    el.tray = document.getElementById('mg-tray');
    // Dòng "Đặt vào TÀI · 0" đã bỏ: số tiền giờ hiện thẳng trong ô đặt (nút cửa hoặc ô bạch
    // thủ), nói hai lần ở hai chỗ chỉ tổ rối mắt.
    el.accept = document.getElementById('mg-accept');
    el.cancel = document.getElementById('mg-cancel');
    el.note = document.getElementById('mg-note');
    el.pop = document.getElementById('mg-pop');
    el.popTitle = document.getElementById('mg-pop-title');
    el.popBody = document.getElementById('mg-pop-body');
    el.chat = document.getElementById('mg-chat');
    el.chatList = document.getElementById('mg-chat-list');
    el.chatInput = document.getElementById('mg-chat-input');
    el.result = document.getElementById('mg-result');
    el.rsWin = document.getElementById('mg-rs-win');
    el.btToggle = document.getElementById('mg-bt-toggle');
    el.btPanel = document.getElementById('mg-bachthu');
    el.btGrid = document.getElementById('mg-bt-grid');
    el.loading = document.getElementById('mg-loading');

    buildChips();
    buildKeys();
    wire();
  }

  function buildChips() {
    for (var i = 0; i < CHIPS.length; i++) {
      (function (c) {
        var b = document.createElement('button');
        b.className = 'mg-chip';
        // Chip TRÒN trong thư mục chip/ chứ không phải nút chữ nhật ở main/ — đúng bộ của bản
        // gốc, và thư mục đó có đủ 15 mệnh giá nếu sau này cần thêm mức.
        b.innerHTML = '<img src="' + ART + 'chip/' + c.key + '.png" alt="' + c.key + '">';
        b.addEventListener('click', function () {
          if (st.status !== ST_BETTING) return;
          // Bấm chip là CỘNG DỒN, giống bàn cược thật — không phải chọn một mức.
          setStake(st.stake + c.value);
        });
        el.chips.appendChild(b);
      })(CHIPS[i]);
    }
  }

  /**
   * Bàn phím "SỐ KHÁC" — gõ số tiền tự do thay vì cộng dồn mệnh giá.
   *
   * BACK là XOÁ MỘT KÝ TỰ (không phải xoá sạch), đúng như bàn gốc: gõ nhầm một số thì sửa
   * được, không phải nhập lại từ đầu.
   */
  var KEYS = ['BACK', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '000'];

  function buildKeys() {
    for (var i = 0; i < KEYS.length; i++) {
      (function (k) {
        var b = document.createElement('button');
        b.className = 'mg-key' + (k === 'BACK' ? ' back' : '');
        b.innerHTML = '<img src="' + ART + 'main/' + k + '.png" alt="' + k + '">';
        b.addEventListener('click', function () {
          if (st.status !== ST_BETTING) return;
          typeKey(k);
        });
        el.keys.appendChild(b);
      })(KEYS[i]);
    }
  }

  /** Giới hạn 12 chữ số: quá đó là số vượt ngưỡng an toàn của Number khi nhân lên. */
  var STAKE_MAX_DIGITS = 12;

  function typeKey(k) {
    var s = String(st.stake || 0);
    if (s === '0') s = '';
    if (k === 'BACK') {
      s = s.slice(0, -1);
    } else {
      if (s.length + k.length > STAKE_MAX_DIGITS) return;
      s += k;
    }
    setStake(parseInt(s || '0', 10));
  }

  function toggleKeys(on) {
    st.keysOpen = on;
    el.keys.hidden = !on;
    el.chips.hidden = on;
    el.other.classList.toggle('on', on);
  }

  function buildBachThu() {
    for (var i = 0; i < BT_SUMS.length; i++) {
      (function (sum) {
        var b = document.createElement('button');
        b.className = 'mg-bt-cell';
        b.dataset.sum = String(sum);
        // Ba phần rời nhau, đúng prefab: tiền đã đặt (trên) — số tổng (giữa) — ô đen mời đặt
        // (dưới). Tiền KHÔNG nằm đè trong ô đen.
        b.innerHTML = '<span class="mg-bt-val"></span><span class="mg-bt-num">' + sum + '</span><span class="mg-bt-money">' + CHU_MOI_DAT + '</span>';
        b.addEventListener('click', function () {
          pickGate(btGate(sum));
        });
        el.btGrid.appendChild(b);
      })(BT_SUMS[i]);
    }
  }

  function renderBachThu() {
    var cells = el.btGrid.children;
    var betting = st.status === ST_BETTING;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var sum = Number(c.dataset.sum);
      var v = Number(st.myBet[BT_KEY[sum]]) || 0;
      // Ô đen dưới luôn giữ chữ mời "Đặt cược"; tiền đã đặt hiện RIÊNG ở dải trên (moneyGate
      // của prefab), không đè lên chữ đó.
      c.querySelector('.mg-bt-val').textContent = v > 0 ? fmt(v) : '';
      c.classList.toggle('has', v > 0);
      c.classList.toggle('picked', st.pickedGate === btGate(sum));
      c.disabled = !betting;
    }
  }

  function wire() {
    document.getElementById('mg-btn-close').addEventListener('click', close);
    document.getElementById('mg-btn-honors').addEventListener('click', function () {
      openPop('top');
    });
    document.getElementById('mg-btn-history').addEventListener('click', function () {
      openPop('history');
    });
    document.getElementById('mg-btn-chat').addEventListener('click', toggleChat);
    document.getElementById('mg-btn-guide').addEventListener('click', function () {
      openPop('guide');
    });
    document.getElementById('mg-btn-soicau').addEventListener('click', function () {
      openPop('soicau');
    });
    // Hai thanh hũ trên đỉnh bàn: bấm vào để xem lịch sử nổ hũ.
    document.getElementById('mg-jp').addEventListener('click', function () {
      openPop('jackpot');
    });
    document.getElementById('mg-pop-close').addEventListener('click', closePop);

    document.getElementById('mg-chat-send').addEventListener('click', sendChat);
    // Enter cũng gửi — bàn phím ảo trên mobile hiện nút "Gửi"/"Go", nó bắn keydown Enter.
    el.chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChat();
      }
    });

    // Bấm cửa = CHỌN CỬA, chưa gửi gì. Chọn xong mới hiện khay mệnh giá; gõ tiền rồi bấm
    // ĐỒNG Ý mới thật sự đặt. Đây đúng luồng của bàn gốc (xem DiceKeyboard.onClickBoxBet mở
    // bàn phím, rồi onClickAccept mới sendRequest).
    el.gateSmall.addEventListener('click', function () {
      pickGate(GATE_SMALL);
    });
    el.gateBig.addEventListener('click', function () {
      pickGate(GATE_BIG);
    });

    // HUỶ = bỏ chọn cửa và đóng khay, KHÔNG huỷ cược đã đặt (cược đã lên server thì client
    // không rút lại được).
    el.cancel.addEventListener('click', closeTray);
    el.accept.addEventListener('click', doBet);
    el.allin.addEventListener('click', function () {
      if (st.status !== ST_BETTING) return;
      setStake(st.balance);
    });
    el.other.addEventListener('click', function () {
      if (st.status !== ST_BETTING) return;
      toggleKeys(!st.keysOpen);
    });

    el.btnHand.addEventListener('click', toggleHand);
    initBowlDrag();
    initShrink();
    initFit();

    el.btToggle.addEventListener('click', function () {
      st.btOpen = !st.btOpen;
      el.btPanel.hidden = !st.btOpen;
      refit(); // bảng bạch thủ bật/tắt → cụm đổi chiều cao
      el.btToggle.classList.toggle('on', st.btOpen);
      // Mở bảng bạch thủ thì bỏ chọn cửa Tài/Xỉu và ngược lại — không cho chọn hai kiểu cùng lúc,
      // vì lệnh cược chỉ mang MỘT mã cổng.
      if (st.btOpen) st.pickedGate = 0;
      render();
    });

    buildBachThu();

    initGrip();
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // KÉO CẢ CỤM ĐI
  //
  // Bàn nổi tự do trên game đối tác, không có lớp nền — nên nó che mất một phần game. Cho kéo
  // để người chơi tự dời sang chỗ không vướng, thay vì bắt họ đóng bảng mỗi lần muốn nhìn.
  //
  // Chỉ kéo bằng THANH TRÊN CÙNG. Cho kéo ở bất kỳ đâu thì mỗi cú bấm cửa cược cũng thành kéo.
  // ═══════════════════════════════════════════════════════════════════════════════════

  function initGrip() {
    if (!el.panel || !el.table) return;

    var dragging = false,
      armed = false;
    var startX = 0,
      startY = 0,
      baseX = 0,
      baseY = 0;

    // KÉO BẰNG CHÍNH CÁI BÀN, không phải thanh trên. Bàn là mảng to nhất và là chỗ tay hay
    // chạm vào nhất — bắt người chơi với lên đúng thanh mỏng phía trên là khó chịu.
    //
    // Đổi lại phải phân biệt KÉO với BẤM, vì trên bàn có hai nút ĐẶT CƯỢC. Hai lớp chặn:
    //   1. Chạm trúng nút thì bỏ qua hoàn toàn, không tính là kéo.
    //   2. Chưa đi quá 5px thì chưa coi là kéo — nhả tay trong ngưỡng đó thì nút vẫn nhận click.
    el.table.addEventListener('pointerdown', function (e) {
      // KÉO ĐƯỢC Ở KHẮP MẶT BÀN, kể cả trên chữ TÀI/XỈU và phần tổng cược.
      //
      // Chỉ chừa ra những thứ THẬT SỰ bấm được: nút ĐẶT CƯỢC và viên cầu. Ngưỡng 5px bên dưới
      // lo phần còn lại — chạm rồi nhả tại chỗ vẫn là một cú bấm.
      // closest: chạm vào chữ bên trong nút cũng phải tính là chạm nút.
      // #mg-bowl có phần kéo RIÊNG (kéo bát ra để mở kết quả) nên cũng phải chừa ra, không thì
      // chạm vào bát lại thành kéo cả cụm bàn đi.
      if (e.target.closest && e.target.closest('button, .mg-cau-dot, #mg-bowl')) return;
      armed = true;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      var r = el.panel.getBoundingClientRect();
      baseX = r.left;
      baseY = r.top;
      el.table.setPointerCapture(e.pointerId);
    });

    el.table.addEventListener('pointermove', function (e) {
      if (!armed) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; // vẫn còn là một cú bấm
        dragging = true;
        st.dragging = true;
        el.panel.classList.add('dragging');
      }
      moveTo(baseX + dx, baseY + dy);
    });

    function end() {
      if (!armed) return;
      armed = false;
      dragging = false;
      st.dragging = false;
      // Thả tay cũng tính là vừa dùng cụm — không thì vòng canh thu nhỏ ngay sau cú kéo.
      _lastIn = Date.now();
      el.panel.classList.remove('dragging');
    }
    el.table.addEventListener('pointerup', end);
    el.table.addEventListener('pointercancel', end);

    // Xoay máy / bàn phím ảo đóng mở → cụm có thể lọt hẳn ra ngoài màn hình và không kéo lại
    // được nữa. Ép về trong biên mỗi lần khung nhìn đổi.
    window.addEventListener('resize', function () {
      // CHỈ ép về trong biên khi cụm ĐÃ được kéo đi chỗ khác. Trước đây gọi moveTo vô điều
      // kiện, mà moveTo lại gắn class 'placed' — nên chỉ cần xoay máy hay bàn phím ảo bật lên
      // là cụm bị đóng đinh toạ độ, mất luôn phần tự căn giữa.
      if (!st.open || !el.panel.classList.contains('placed')) return;
      var r = el.panel.getBoundingClientRect();
      moveTo(r.left, r.top);
    });
  }

  /** Đặt cụm vào vị trí, luôn chừa lại một phần trong màn hình để còn kéo về được. */
  function moveTo(x, y) {
    // Đo bằng KHUNG THẬT chứ không offsetWidth: trên điện thoại cụm luôn có scale (0.7, hoặc
    // 0.49 khi thu nhỏ), mà offsetWidth trả về cỡ trước khi scale — lấy nó thì phần chừa lại
    // trong màn tính hụt và cụm kéo được ra ngoài gần hết.
    var r0 = el.panel.getBoundingClientRect();
    var w = r0.width;
    var h = r0.height;
    var keep = 80; // bề ngang tối thiểu còn nhìn thấy
    var nx = Math.max(keep - w, Math.min(x, window.innerWidth - keep));
    // Thanh kéo phải luôn với tới được → không cho đẩy lên quá mép trên.
    var ny = Math.max(0, Math.min(y, window.innerHeight - 44));
    // Gắn class TRƯỚC khi đặt toạ độ: nó bỏ phần căn giữa, mà nx/ny tính theo toạ độ màn hình
    // thật nên phải không còn phép dời đó mới đúng chỗ. applyTransform đọc chính class này.
    el.panel.classList.add('placed');
    applyTransform();
    el.panel.style.left = nx + 'px';
    el.panel.style.top = ny + 'px';
    el.panel.style.right = 'auto';
    el.panel.style.bottom = 'auto';
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // VINH DANH / LỊCH SỬ / CHAT — chung một khung popup
  // ═══════════════════════════════════════════════════════════════════════════════════

  var POP = {
    top: { title: 'Vinh danh', cmd: 'TOP', titleImg: 'top/txtVinhDanh.png' },
    history: { title: 'Lịch sử cược', cmd: 'HISTORY', titleImg: 'top/txtHistory.png' },
    // Chat KHÔNG nằm trong bảng POP: nó là một khối RIÊNG nằm ngay dưới bàn, bên trong cụm,
    // nên kéo bàn là nó đi theo. Ba màn kia vẫn là popup nổi giữa màn hình.
    guide: { title: 'Hướng dẫn', cmd: null, titleImg: 'top/txtGuide.png' },
    // Bấm vào hai thanh hũ trên đỉnh bàn.
    jackpot: { title: 'Lịch Sử Nổ Hũ', cmd: 'JACKPOT', titleImg: 'popup/txtHisJackpot.png' },
    // Bảng con của jackpot: người trúng của MỘT lần nổ. Không có cmd — dữ liệu đã nằm sẵn
    // trong bản ghi lần nổ đó, mở ra là vẽ, không hỏi server lần nữa.
    jackpotUsers: { title: 'Danh Sách Thắng', cmd: null, titleImg: 'popup/txtListWin.png' },
    // Soi cầu: vẽ NGAY bằng dữ liệu đã có trong tay, đồng thời xin lại hai lưới cho mới.
    soicau: { title: 'Soi Cầu', cmd: 'OVERLAY', titleImg: 'popup/txtSoiCau.png' },
    // Chi tiết một phiên. Không có cmd chung: lệnh phải kèm mã phiên nên openSessionDetail tự gửi.
    detail: { title: 'Chi Tiết Phiên', cmd: null, titleImg: 'popup/txtDetailsSession.png' },
  };

  var _popKind = '';
  var _chatOn = false;

  /**
   * Chat bật/tắt TẠI CHỖ, không đi qua khung popup nổi.
   *
   * Nó là khối con của cụm nên kéo bàn là nó đi theo — đó chính là lý do tách khỏi popup:
   * popup phải gắn ở body (transform của cụm phá position:fixed), mà gắn ở body thì nó đứng
   * yên trong khi người chơi kéo bàn đi.
   */
  function toggleChat() {
    _chatOn = !_chatOn;
    el.chat.hidden = !_chatOn;
    refit(); // khung chat cao 514 — bật lên là cụm cao gấp đôi
    if (_chatOn) {
      if (_popKind) closePop(); // hai khung đè nhau thì không đọc được gì
      send('CHAT_OPEN', {});
    } else {
      send('CHAT_CLOSE', {});
    }
  }

  function closeChat() {
    if (!_chatOn) return;
    _chatOn = false;
    el.chat.hidden = true;
    refit();
    send('CHAT_CLOSE', {});
  }

  function openPop(kind) {
    var cfg = POP[kind];
    if (!cfg) return;
    // Đang mở đúng cái đó thì bấm lần nữa = đóng. Nút nào cũng nên bật/tắt được bằng chính nó.
    if (_popKind === kind) {
      closePop();
      return;
    }

    // Mở màn khác thì đóng chat — kênh chat dùng chung với game Dice bên Cocos, giữ mở vô ích
    // là giữ luôn đăng ký phía server.
    closeChat();

    _popKind = kind;
    el.pop.hidden = false;
    // Bàn phím ảo bật/tắt cũng đổi chiều cao khung nhìn → tính lại ngay lúc mở cho chắc.
    applyPopFit();
    // Đánh dấu màn đang mở để CSS bố trí riêng — màn chi tiết phiên cần hai bảng co giãn
    // chia nhau chỗ trống, các màn khác vẫn xếp theo chiều cao nội dung.
    el.popBody.dataset.kind = kind;
    // Có ảnh chữ tiêu đề thì dùng ảnh, không thì chữ thường.
    el.popTitle.innerHTML = cfg.titleImg ? '<img class="mg-pop-titleimg" src="' + ART + cfg.titleImg + '" alt="' + cfg.title + '">' : esc(cfg.title);

    if (kind === 'guide') {
      el.popBody.innerHTML = guideHtml();
      return;
    }
    // Bảng người trúng: dữ liệu đi kèm lời gọi, không phải chờ mạng.
    if (kind === 'jackpotUsers') {
      el.popBody.innerHTML = jackpotUsersHtml(_jpPicked);
      return;
    }
    if (kind === 'detail') {
      renderDetail();
      // Gắn một lần cho cả thân popup — nội dung vẽ lại mỗi lần đổi phiên.
      el.popBody.addEventListener('click', onDetailNav);
      return;
    }
    // Đã có dữ liệu hũ trong tay (vd vừa từ bảng người trúng quay ra) thì vẽ ngay rồi mới hỏi
    // lại — không bắt người chơi nhìn "Đang tải…" cho thứ mình đang giữ sẵn.
    if (kind === 'jackpot' && _jpList.length) renderJackpot(_jpList);
    // Soi cầu luôn vẽ được ngay: hai lưới và bảng cầu đều đã nằm trong trạng thái hiện tại.
    else if (kind === 'soicau') renderSoiCau();
    else el.popBody.innerHTML = '<div class="mg-pop-loading">Đang tải…</div>';
    send(cfg.cmd, kind === 'history' ? { page: 1 } : {});
    _watchPopLoad(kind);
  }

  /**
   * Lệnh đi rồi mà không có gói nào về thì phải NÓI RA.
   *
   * Hàng đợi chỉ chờ ACK "Cocos đã nhận lệnh", không chờ dữ liệu — nên một lệnh Cocos nhận
   * nhưng không hiểu (bản build cũ) hoặc server im lặng sẽ để popup đứng ở "Đang tải…" vĩnh
   * viễn, người chơi tưởng máy treo.
   */
  var POP_LOAD_MS = 9000;
  var _popLoadTimer = null;

  function _watchPopLoad(kind) {
    if (_popLoadTimer) clearTimeout(_popLoadTimer);
    _popLoadTimer = setTimeout(function () {
      _popLoadTimer = null;
      // Vẫn đúng màn đó VÀ vẫn còn dòng "Đang tải…" mới coi là hỏng — dữ liệu về rồi thì
      // popBody đã bị thay nội dung.
      if (_popKind !== kind || !el.popBody.querySelector('.mg-pop-loading')) return;
      el.popBody.innerHTML = '<div class="mg-pop-empty">Không lấy được dữ liệu.<br><button class="mg-pop-retry">Thử lại</button></div>';
      var b = el.popBody.querySelector('.mg-pop-retry');
      if (b)
        b.addEventListener('click', function () {
          var k = _popKind;
          _popKind = ''; // để openPop không hiểu nhầm là bấm lần hai = đóng
          openPop(k);
        });
    }, POP_LOAD_MS);
  }

  function closePop() {
    // Trang chỉ có MỘT khung popup, nên bảng người trúng không đè lên bảng nổ hũ mà thay chỗ
    // nó. Đóng bảng con thì trả về bảng cha, không đóng sạch — người chơi xem một lần nổ rồi
    // phải mở lại từ đầu là phiền.
    if (_popKind === 'jackpotUsers') {
      _popKind = '';
      openPop('jackpot');
      return;
    }
    _popKind = '';
    el.pop.hidden = true;
  }

  /**
   * Hướng dẫn — dùng thẳng ẢNH GỐC hdtx.png, không viết lại bằng chữ.
   *
   * Ảnh đó là bản hướng dẫn chính thức của game: có công thức trả thưởng, luật nổ hũ, mức cược
   * tối thiểu. Gõ tay lại là chép sai sớm muộn, và mỗi lần đổi luật lại phải sửa hai nơi.
   */
  function guideHtml() {
    return '<img class="mg-guide-img" src="' + ART + 'hdtx.png" alt="Hướng dẫn Tài Xỉu">';
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // SOI CẦU
  //
  // Ba khối, bám đúng DiceStatiscalLeft + DiceStatiscalRight:
  //   1. Lưới SỐ  — overlay.above: 6 HÀNG, mỗi hàng tối đa 20 ô. 0 = ô trống.
  //                 Tổng > 10 là TÀI (chữ vàng), <= 10 là XỈU (chữ trắng, có vòng tròn).
  //   2. Lưới BI  — overlay.under: mảng phẳng, xếp 20 cột × 6 hàng theo kiểu RẮN BÒ
  //                 (cột lẻ đi xuống, cột chẵn đi lên) — đo từ toạ độ 120 ô trong prefab.
  //   3. Biểu đồ  — 40 phiên gần nhất: một đường tổng và ba đường xúc xắc.
  // ═══════════════════════════════════════════════════════════════════════════════════

  var SC_ROWS = 6;
  var SC_COLS = 20;

  function renderSoiCau() {
    if (_popKind !== 'soicau') return;
    var ov = st.overlay || { above: [], under: [] };
    el.popBody.innerHTML = scAboveHtml(ov.above) + scUnderHtml(ov.under) + scChartHtml();
    // Uỷ quyền một handler cho cả thân popup thay vì gắn từng nút — popup vẽ lại mỗi lần
    // server trả gói mới. addEventListener cùng hàm thì lần gắn thứ hai bị bỏ qua.
    el.popBody.addEventListener('click', onSoiCauToggle);
  }

  /** Uỷ quyền chung cho thân popup: nút mũi tên đổi phiên và hai nút sắp xếp cột. */
  function onDetailNav(e) {
    if (!e.target || !e.target.closest) return;

    var a = e.target.closest('.dt-arrow');
    if (a) {
      stepSession(a.classList.contains('next') ? 1 : -1);
      return;
    }

    var b = e.target.closest('.dt-sortbtn');
    if (b) sortDetail(b.dataset.side, b.dataset.s);
  }

  /**
   * Sắp xếp một cửa theo THỜI GIAN hoặc TIỀN CƯỢC, bấm lại thì đảo chiều — đúng bốn hàm
   * onClickSort* của bàn gốc. Mặc định là mới trước / lớn trước.
   */
  var _dtSort = { big: {}, small: {} };

  function sortDetail(side, key) {
    if (!_dtData || !Array.isArray(_dtData[side])) return;
    var st2 = _dtSort[side] || (_dtSort[side] = {});
    // Lần đầu bấm một cột là giảm dần; bấm tiếp thì lật.
    st2[key] = st2[key] === undefined ? false : !st2[key];
    var asc = st2[key];

    _dtData[side].sort(function (x, y) {
      var a = key === 'bet' ? Number(x.bet) || 0 : new Date(x.time).getTime();
      var b = key === 'bet' ? Number(y.bet) || 0 : new Date(y.time).getTime();
      return asc ? a - b : b - a;
    });
    renderDetail();
  }

  function onSoiCauToggle(e) {
    var b = e.target && e.target.closest ? e.target.closest('.sc-tg') : null;
    if (!b) return;
    var on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    var gs = el.popBody.querySelectorAll('.sc-chart svg g[data-k="' + b.dataset.k + '"]');
    for (var i = 0; i < gs.length; i++) gs[i].style.display = on ? '' : 'none';
  }

  /** Lưới số. Đếm Tài/Xỉu trên chính các ô có giá trị, đúng cách updateAbove làm. */
  function scAboveHtml(rows) {
    if (!Array.isArray(rows)) rows = [];
    var big = 0;
    var small = 0;
    var cells = '';
    for (var r = 0; r < SC_ROWS; r++) {
      var row = Array.isArray(rows[r]) ? rows[r] : [];
      for (var c = 0; c < SC_COLS; c++) {
        var v = Number(row[c]) || 0;
        if (v > 10) big++;
        else if (v > 0) small++;
        cells += v === 0 ? '<i class="sc-cell"></i>' : '<i class="sc-cell ' + (v > 10 ? 'b' : 's') + '">' + v + '</i>';
      }
    }
    return scHead(big, small) + '<div class="sc-grid sc-num">' + cells + '</div>';
  }

  /** Lưới bi. Ô cuối cùng được đánh dấu, giống cái khung focus của bàn gốc. */
  function scUnderHtml(list) {
    if (!Array.isArray(list)) list = [];
    var big = 0;
    var small = 0;
    for (var i = 0; i < list.length; i++) {
      if (Number(list[i]) > 10) big++;
      else small++;
    }

    // Đổ vào lưới theo kiểu rắn bò rồi mới đọc ra theo hàng — lưới CSS xếp theo hàng.
    var g = [];
    for (var r = 0; r < SC_ROWS; r++) g.push(new Array(SC_COLS));
    var n = Math.min(list.length, SC_ROWS * SC_COLS);
    for (var k = 0; k < n; k++) {
      var col = Math.floor(k / SC_ROWS);
      var pos = k % SC_ROWS;
      var row = col % 2 === 0 ? pos : SC_ROWS - 1 - pos;
      g[row][col] = { v: Number(list[k]) || 0, last: k === n - 1 };
    }

    var cells = '';
    for (var y = 0; y < SC_ROWS; y++) {
      for (var x = 0; x < SC_COLS; x++) {
        var it = g[y][x];
        if (!it) {
          cells += '<i class="sc-cell"></i>';
          continue;
        }
        cells += '<i class="sc-cell' + (it.last ? ' last' : '') + '"><img src="' + ART + 'main/' + (it.v > 10 ? 'h2' : 'h1') + '.png" alt=""></i>';
      }
    }
    return scHead(big, small) + '<div class="sc-grid sc-ball">' + cells + '</div>';
  }

  function scHead(big, small) {
    return '<div class="sc-head"><span class="b">TÀI: ' + big + '</span><span class="s">XỈU: ' + small + '</span></div>';
  }

  /**
   * Hai biểu đồ vẽ ĐÈ LÊN ảnh nền có sẵn (bgSoiCauTong / bgSoiCauLe) — lưới và nhãn trục đã nằm
   * trong ảnh, ở đây chỉ vẽ đường và điểm.
   *
   * Mọi con số dưới đây ĐO TỪ CHÍNH HAI ẢNH: quét các đường kẻ để lấy mốc trục, nên SVG phủ
   * đúng ô chứ không phải ước lượng. viewBox = kích thước ảnh, vậy co giãn kiểu gì cũng khớp.
   */
  /** Màu ba đường xúc sắc, lấy đúng màu của toggle_1/2/3 để đường và chấm cùng tông. */
  var SC_DICE_COLORS = ['#3fe0e0', '#ff7b7b', '#a98bff'];

  // Ảnh tổng 737×187: cột đầu 33.5, cột cuối 726 (19 khoảng); nhãn 3 ở y=171, 18 ở y=2.
  var SC_TONG = { w: 737, h: 187, x0: 33.5, dx: (726 - 33.5) / 19, yLo: 171, yHi: 2, vLo: 3, vHi: 18 };
  // Ảnh lẻ 733×187: cột đầu 30.5, cột cuối 723; nhãn 1 ở y=173, 6 ở y=4.
  var SC_LE = { w: 733, h: 187, x0: 30.5, dx: (723 - 30.5) / 19, yLo: 173, yHi: 4, vLo: 1, vHi: 6 };

  function scPos(cfg, i, v) {
    return {
      x: cfg.x0 + i * cfg.dx,
      y: cfg.yLo + ((v - cfg.vLo) / (cfg.vHi - cfg.vLo)) * (cfg.yHi - cfg.yLo),
    };
  }

  function scChartHtml() {
    var all = Array.isArray(st.history) ? st.history : [];
    var list = [];
    for (var i = 0; i < all.length; i++) {
      var h = all[i];
      if (h && Array.isArray(h.dice) && h.dice.length === 3) list.push(h);
    }
    // Ảnh nền chỉ có 20 cột nên vẽ 20 phiên gần nhất — bàn gốc cũng đúng 20 cột một màn.
    list = list.slice(-SC_COLS);
    if (!list.length) return '<div class="mg-pop-empty">Chưa có dữ liệu biểu đồ</div>';

    var last = list[list.length - 1];
    var lastSum = last.dice[0] + last.dice[1] + last.dice[2];
    var head =
      '<div class="sc-title">Phiên gần nhất(#' +
      esc(String(last.session || '')) +
      ') - <b class="' +
      (last.big ? 'b' : 's') +
      '">' +
      (last.big ? 'Tài' : 'Xỉu') +
      ' ' +
      lastSum +
      '</b> (' +
      last.dice.join('-') +
      ')</div>';

    // Bốn nút bật/tắt, đúng như onCheckToggle của bàn gốc: mỗi nút ẩn/hiện MỘT đường, độc lập
    // với ba nút kia — tắt ba cái là còn mình đường đang xem.
    var legend =
      '<div class="sc-legend">' +
      '<button class="sc-tg on" data-k="t"><i style="background:#f5c451"></i>Tổng</button>' +
      '<button class="sc-tg on" data-k="0"><i style="background:' +
      SC_DICE_COLORS[0] +
      '"></i>Xúc sắc 1</button>' +
      '<button class="sc-tg on" data-k="1"><i style="background:' +
      SC_DICE_COLORS[1] +
      '"></i>Xúc sắc 2</button>' +
      '<button class="sc-tg on" data-k="2"><i style="background:' +
      SC_DICE_COLORS[2] +
      '"></i>Xúc sắc 3</button>' +
      '</div>';

    return head + legend + scTongSvg(list) + scLeSvg(list);
  }

  /** Cỡ bi trong hệ toạ độ ảnh nền — đúng bằng cỡ ảnh gốc (sprites 33×33, toggle 23×23). */
  var SC_SUM_R = 33 / 2;
  var SC_DICE_R = 23 / 2;

  function scTongSvg(list) {
    var c = SC_TONG;
    var pts = [];
    var dots = '';
    for (var i = 0; i < list.length; i++) {
      var v = list[i].dice[0] + list[i].dice[1] + list[i].dice[2];
      var p = scPos(c, i, v);
      pts.push(p.x + ',' + p.y);
      // Bi có SẴN SỐ in trên mặt (Sprite/sprites: 3..18, trắng cho Xỉu, đen cho Tài) — đúng thứ
      // DiceStatiscalRight lấy qua spriteAtlas.getSpriteFrame(String(diceSum)). Không vẽ tay.
      dots +=
        '<image href="' + ART + 'soicau/sum_' + v + '.png" x="' + (p.x - SC_SUM_R) + '" y="' + (p.y - SC_SUM_R) + '" width="' + SC_SUM_R * 2 + '" height="' + SC_SUM_R * 2 + '"/>';
    }
    return scSvg('popup/bgSoiCauTong.png', c, '<g data-k="t"><polyline class="sc-pl" points="' + pts.join(' ') + '"/>' + dots + '</g>');
  }

  function scLeSvg(list) {
    var c = SC_LE;
    // Mỗi xúc sắc một nhóm riêng: đường vẽ trước, chấm vẽ sau trong CÙNG nhóm để bật/tắt là đi
    // cả cặp. toggle_1/2/3 chính là ba chấm màu của bàn gốc (listToggleSpf).
    var g = '';
    for (var d = 0; d < 3; d++) {
      var pts = [];
      var dots = '';
      for (var i = 0; i < list.length; i++) {
        var p = scPos(c, i, list[i].dice[d]);
        pts.push(p.x + ',' + p.y);
        dots +=
          '<image href="' +
          ART +
          'soicau/toggle_' +
          (d + 1) +
          '.png" x="' +
          (p.x - SC_DICE_R) +
          '" y="' +
          (p.y - SC_DICE_R) +
          '" width="' +
          SC_DICE_R * 2 +
          '" height="' +
          SC_DICE_R * 2 +
          '"/>';
      }
      g += '<g data-k="' + d + '"><polyline class="sc-pl" style="stroke:' + SC_DICE_COLORS[d] + '" points="' + pts.join(' ') + '"/>' + dots + '</g>';
    }
    return scSvg('popup/bgSoiCauLe.png', c, g);
  }

  function scSvg(bg, c, inner) {
    return (
      '<div class="sc-chart" style="background-image:url(' + ART + bg + ')">' + '<svg viewBox="0 0 ' + c.w + ' ' + c.h + '" preserveAspectRatio="none">' + inner + '</svg></div>'
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // CHI TIẾT PHIÊN
  //
  // Bấm một viên trên thanh cầu để mở. Bám DiceSessionDetail: LocationID 1 = XỈU, khác = TÀI;
  // mỗi bên một bảng THỜI GIAN | NGƯỜI CHƠI | CƯỢC | TRẢ LẠI, sắp mới trước; phần đầu mỗi bên
  // là tổng cược và tổng hoàn của bên đó.
  // ═══════════════════════════════════════════════════════════════════════════════════

  /** Phiên đang xem (bản ghi trong bảng cầu) và dữ liệu server trả cho phiên đó. */
  var _dtItem = null;
  var _dtData = null;
  var _dtLoading = false;

  function openSessionDetail(h) {
    if (!h || !h.session) {
      note('Phiên này chưa có mã, không xem được chi tiết', false);
      return;
    }
    _dtItem = h;
    _dtData = null;
    _dtLoading = true;
    // openPop coi mở lại cùng màn là ĐÓNG, mà ở đây đổi phiên vẫn là màn đó — xoá dấu trước.
    _popKind = '';
    openPop('detail');
    send('SESSION_DETAIL', { session: h.session });
  }

  /** Sang phiên liền trước / liền sau trong chính bảng cầu, như hai nút mũi tên của bàn gốc. */
  function stepSession(dir) {
    var list = Array.isArray(st.history) ? st.history : [];
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (_dtItem && list[k].session === _dtItem.session) {
        i = k;
        break;
      }
    }
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) {
      note('Không tìm thấy phiên', false);
      return;
    }
    openSessionDetail(list[j]);
  }

  function renderDetail() {
    if (_popKind !== 'detail') return;
    var h = _dtItem;
    if (!h) {
      el.popBody.innerHTML = '<div class="mg-pop-empty">Không có dữ liệu</div>';
      return;
    }
    var d = Array.isArray(h.dice) && h.dice.length === 3 ? h.dice : null;
    var sum = d ? d[0] + d[1] + d[2] : h.sum || 0;

    var dice = '';
    if (d) for (var i = 0; i < 3; i++) dice += '<img src="' + ART + 'main/dice_' + d[i] + '.png" alt="">';

    var top =
      '<div class="dt-top">' +
      // arr.png là mũi tên PHẢI của bàn gốc (prefab DiceDuBaiSessionDetail dùng đúng ảnh này cho
      // cả hai nút); nút lùi chỉ lật ngang lại.
      '<button class="dt-arrow prev" aria-label="Phiên trước"><img src="' +
      ART +
      'popup/arr.png" alt=""></button>' +
      '<span class="dt-dice">' +
      dice +
      '</span>' +
      '<b class="dt-sum">= ' +
      sum +
      '</b>' +
      '<button class="dt-arrow next" aria-label="Phiên sau"><img src="' +
      ART +
      'popup/arr.png" alt=""></button>' +
      '</div>' +
      '<div class="dt-ss">Phiên <b>#' +
      esc(String(h.session)) +
      '</b></div>';

    if (_dtLoading || !_dtData) return void (el.popBody.innerHTML = top + '<div class="mg-pop-loading">Đang tải…</div>');

    var v = _dtData;
    return void (el.popBody.innerHTML = top + dtSide('big', v.big, v.betBig, v.refundBig, v.me) + dtSide('small', v.small, v.betSmall, v.refundSmall, v.me));
  }

  function dtSide(side, rows, bet, refund, me) {
    rows = Array.isArray(rows) ? rows : [];
    // Tên cửa dùng ẢNH GỐC txtTai/txtXiu, dòng tổng đặt trên nền maskRs — đúng như prefab
    // (node txt_Tai / txt_Xiu nằm trên taiBg / xiuBg).
    var img = side === 'big' ? 'txtTai.png' : 'txtXiu.png';
    var mui = '<img class="dt-sort" src="' + ART + 'popup/dropdown.png" alt="">';
    var h =
      '<div class="dt-side">' +
      '<div class="dt-sum-row"><img class="dt-name" src="' +
      ART +
      'popup/' +
      img +
      '" alt="">' +
      '<span>Tổng(cược/hoàn)</span>' +
      '<i>' +
      fmtKMB(bet) +
      '</i><i>' +
      fmtKMB(refund) +
      '</i></div>' +
      // Bảng nằm trong khung cuộn RIÊNG: hai cửa lúc nào cũng thấy được cả hai, không phải
      // cuộn qua hết danh sách TÀI mới tới XỈU.
      '<div class="dt-scroll"><table class="dt-tb"><thead><tr>' +
      '<th><button class="dt-sortbtn" data-s="time" data-side="' +
      side +
      '">THỜI GIAN' +
      mui +
      '</button></th>' +
      '<th>NGƯỜI CHƠI</th>' +
      '<th><button class="dt-sortbtn" data-s="bet" data-side="' +
      side +
      '">CƯỢC' +
      mui +
      '</button></th>' +
      '<th>TRẢ LẠI</th>' +
      '</tr></thead><tbody>';
    if (!rows.length) {
      h += '<tr><td colspan="4" class="dt-empty">Chưa có ai đặt</td></tr>';
    } else {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        h +=
          '<tr>' +
          '<td>' +
          esc(hhmmss(r.time)) +
          '</td>' +
          '<td class="' +
          (me && r.name === me ? 'me' : '') +
          '">' +
          esc(r.name) +
          '</td>' +
          '<td class="gold">' +
          fmt(r.bet) +
          '</td>' +
          '<td>' +
          fmt(r.refund) +
          '</td>' +
          '</tr>';
      }
    }
    return h + '</tbody></table></div></div>';
  }

  /** Chỉ lấy giờ:phút:giây, như DateTimeUtils.formatTime bên Cocos. */
  function hhmmss(v) {
    if (v == null) return '';
    var t = new Date(typeof v === 'number' ? v : String(v));
    if (isNaN(t.getTime())) return String(v);
    function p(n) {
      return n < 10 ? '0' + n : String(n);
    }
    return p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds());
  }

  /** Rút gọn K/M/B, khớp StringUtils.formatMoneyKMB dùng ở dòng tổng. */
  function fmtKMB(n) {
    n = Number(n) || 0;
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(2).replace('.', ',') + 'K';
    return fmt(n);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // LỊCH SỬ NỔ HŨ
  // ═══════════════════════════════════════════════════════════════════════════════════

  /** Lần nổ đang xem danh sách người trúng. Giữ cả BẢN GHI chứ không chỉ chỉ số: danh sách hũ
      có thể được vẽ lại trong lúc bảng con đang mở, chỉ số sẽ trỏ nhầm mục. */
  var _jpPicked = null;
  /** Lần nổ gần nhất server trả về — nguồn duy nhất để vẽ lại bảng. */
  var _jpList = [];

  function renderJackpot(list) {
    _jpList = Array.isArray(list) ? list : [];
    if (_popKind !== 'jackpot') return;
    if (!_jpList.length) {
      el.popBody.innerHTML = '<div class="mg-pop-empty">Chưa có lần nổ hũ nào</div>';
      return;
    }

    // Tỉ lệ nổ Tài / nổ Xỉu, tính đúng cách của DiceJackpotHistory._renderStatistic:
    // đếm trên chính danh sách đang hiện, không phải số liệu riêng của server.
    var big = 0;
    for (var i = 0; i < _jpList.length; i++) if (_jpList[i].big) big++;
    var pBig = Math.round((big / _jpList.length) * 100);

    var h =
      // Mỗi bên bọc thành MỘT cụm: hàng có xuống dòng thì nhãn, xúc xắc và % của cùng một bên
      // luôn đi cùng nhau, không rơi cảnh "Nổ Xỉu" ở dòng trên còn 67% ở dòng dưới.
      '<div class="mg-jph-stat">' +
      '<span class="mg-jph-grp"><img class="mg-jph-side" src="' +
      ART +
      'popup/txtNoTai.png" alt="Nổ Tài">' +
      diceRow(6) +
      '<b>' +
      pBig +
      '%</b></span>' +
      '<span class="mg-jph-grp"><img class="mg-jph-side" src="' +
      ART +
      'popup/txtNoXiu.png" alt="Nổ Xỉu">' +
      diceRow(1) +
      '<b>' +
      (100 - pBig) +
      '%</b></span>' +
      '</div>';

    h += '<table class="mg-jph"><thead><tr>' + '<th>THỜI GIAN</th><th>KẾT QUẢ</th><th>TIỀN NỔ HŨ</th><th>DANH SÁCH</th>' + '</tr></thead><tbody>';
    for (var k = 0; k < _jpList.length; k++) {
      var it = _jpList[k];
      var tm = fmtTime(it.time).split(' ');
      var tmDate = tm[0] || '';
      var tmClock = tm[1] || '';
      h +=
        '<tr>' +
        // Ngày và giờ tách sẵn hai dòng, kết quả cũng vậy. Ở cỡ chữ bằng bảng Vinh danh, để
        // trình duyệt tự ngắt là nó bẻ giữa "NỔ" và "TÀI" thành ba dòng lệch lạc.
        '<td class="t">' +
        esc(tmDate) +
        '<i>' +
        esc(tmClock) +
        '</i></td>' +
        '<td class="rs"><b class="' +
        (it.big ? 'big' : 'small') +
        '">' +
        (it.big ? 'NỔ TÀI' : 'NỔ XỈU') +
        '</b><i class="acc">' +
        fmt(it.accounts) +
        '</i></td>' +
        '<td class="gold">' +
        fmt(it.prize) +
        '</td>' +
        '<td><button class="mg-jph-more" data-i="' +
        k +
        '">XEM THÊM</button></td>' +
        '</tr>';
    }
    h += '</tbody></table>';
    el.popBody.innerHTML = h;

    // Gắn một handler cho cả bảng thay vì mỗi nút một cái — bảng vẽ lại mỗi lần server trả,
    // gắn từng nút là mỗi lần lại rải thêm hàng chục handler.
    el.popBody.addEventListener('click', onJackpotMore);
  }

  function onJackpotMore(e) {
    var b = e.target && e.target.closest ? e.target.closest('.mg-jph-more') : null;
    if (!b) return;
    var it = _jpList[Number(b.dataset.i)];
    if (!it) return;
    _jpPicked = it;
    // openPop tự đóng cái đang mở: đây là hai màn khác nhau nên không rơi vào nhánh bật/tắt.
    openPop('jackpotUsers');
  }

  /** Ba viên xúc xắc cùng mặt — nhãn "nổ Tài" (3 mặt 6) / "nổ Xỉu" (3 mặt 1) của bàn gốc. */
  function diceRow(face) {
    var s = '<span class="mg-jph-dice">';
    for (var i = 0; i < 3; i++) s += '<img src="' + ART + 'main/dice_' + face + '.png" alt="">';
    return s + '</span>';
  }

  function jackpotUsersHtml(it) {
    if (!it) return '<div class="mg-pop-empty">Không có dữ liệu</div>';
    var h = '<div class="mg-jpu-head"><span>#' + esc(String(it.session)) + ' - ' + esc(fmtTime(it.time)) + '</span><b>' + fmt(it.prize) + '</b></div>';

    if (!it.users || !it.users.length) return h + '<div class="mg-pop-empty">Chưa có người trúng</div>';

    // DÙNG LẠI y nguyên khuôn của bảng Vinh danh (.mg-top-*): cùng cỡ chữ, cùng chiều cao
    // hàng, và quan trọng nhất là dùng đúng ẢNH NỀN bgItemTop1/2/3 cho ba hạng đầu thay vì
    // tô màu bằng CSS.
    h += '<div class="mg-top-head"><span>Top</span><span>Vinh Danh</span><span>Tiền Thắng</span></div>';
    for (var i = 0; i < it.users.length; i++) {
      var u = it.users[i];
      var ic = u.rank <= TOP_ICONS ? u.rank : TOP_ICONS;
      h +=
        '<div class="mg-top-row' +
        (u.rank <= 3 ? ' r' + u.rank : '') +
        '">' +
        '<span class="mg-top-rank">' +
        '<img src="' +
        ART +
        'top/icT' +
        ic +
        '.png" alt="">' +
        '<b>TOP ' +
        u.rank +
        '</b>' +
        '</span>' +
        '<span class="mg-top-name">' +
        esc(u.name) +
        '</span>' +
        '<span class="mg-top-money">' +
        fmt(u.prize) +
        '</span>' +
        '</div>';
    }
    return h;
  }

  /** Server trả mốc thời gian dạng ISO hoặc số ms. Hỏng thì trả nguyên chuỗi còn hơn hiện NaN. */
  function fmtTime(v) {
    if (v == null) return '';
    var d = new Date(typeof v === 'number' ? v : String(v));
    if (isNaN(d.getTime())) return String(v);
    function p(n) {
      return n < 10 ? '0' + n : String(n);
    }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function sendChat() {
    var t = (el.chatInput.value || '').trim();
    if (!t) return;
    send('CHAT_SEND', { text: t });
    el.chatInput.value = '';
  }

  // ── Vẽ nội dung popup ───────────────────────────────────────────────────────────────

  /**
   * Vinh danh — dùng ART SẴN CÓ trong assets/dice_mini/top/:
   *   icT1..icT7  huy hiệu theo hạng (hạng 8 trở đi dùng lại icT7)
   *   bgItemTop1..3  nền dòng có viền màu cho ba hạng đầu
   *   bgItem         nền dòng thường
   *
   * Bám đúng cách bản Cocos làm (DiceTopWinnerItem): huy hiệu lấy theo chỉ số hạng, hạng vượt
   * số ảnh thì dùng ảnh cuối; riêng ba hạng đầu mới có khung viền.
   */
  var TOP_ICONS = 7;

  function renderTop(list) {
    if (_popKind !== 'top') return;
    if (!list || !list.length) {
      el.popBody.innerHTML = empty('Chưa có ai trong bảng vinh danh');
      return;
    }
    var h = '<div class="mg-top-head">' + '<span>Hạng</span><span>Tên Người Chơi</span><span>Số Tiền</span>' + '</div>';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var r = it.rank;
      var ic = r <= TOP_ICONS ? r : TOP_ICONS;
      h +=
        '<div class="mg-top-row' +
        (r <= 3 ? ' r' + r : '') +
        '">' +
        '<span class="mg-top-rank">' +
        '<img src="' +
        ART +
        'top/icT' +
        ic +
        '.png" alt="">' +
        '<b>TOP ' +
        r +
        '</b>' +
        '</span>' +
        '<span class="mg-top-name">' +
        esc(it.name) +
        '</span>' +
        '<span class="mg-top-money">' +
        fmt(it.prize) +
        '</span>' +
        '</div>';
    }
    el.popBody.innerHTML = h;
  }

  /**
   * Lịch sử cược — BẢNG 7 CỘT, bám đúng bản Cocos (DiceHistoryItem.setData):
   *   THỜI GIAN | PHIÊN | CỬA | TIỀN ĐẶT | KẾT QUẢ | TRẢ LẠI | NHẬN
   *
   * Cách ghi cột KẾT QUẢ cũng lấy nguyên: tên cửa + tổng + ba mặt trong ngoặc nối bằng dấu
   * gạch — "Tài 13(1-6-6)". Đừng đổi sang dấu phẩy cho "đẹp", người chơi quen mắt với dạng này.
   */
  function renderHistory(d) {
    if (_popKind !== 'history') return;
    var list = d && d.list;
    if (!list || !list.length) {
      el.popBody.innerHTML = empty('Chưa có lượt cược nào');
      return;
    }
    var h =
      '<div class="mg-his">' +
      '<div class="mg-his-head">' +
      '<span>THỜI GIAN</span><span>PHIÊN</span><span>CỬA</span><span>TIỀN ĐẶT</span>' +
      '<span>KẾT QUẢ</span><span>TRẢ LẠI</span><span>NHẬN</span>' +
      '</div>';

    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var dice = Array.isArray(it.dice) && it.dice.length === 3 ? it.dice : null;
      var sum = dice ? dice[0] + dice[1] + dice[2] : null;
      // LocationID 1 = XỈU, 2 = TÀI. Cổng 5..18 là bạch thủ (mã = tổng + 1).
      var gate = it.gate === 2 ? 'TÀI' : it.gate === 1 ? 'XỈU' : it.gate >= 5 ? 'T' + (it.gate - 1) : '--';
      var win = Number(it.win) || 0;
      var tm = splitTime(it.at);

      h +=
        '<div class="mg-his-row' +
        (i % 2 ? ' alt' : '') +
        '">' +
        '<span class="c-time">' +
        esc(tm[0]) +
        '<i>' +
        esc(tm[1]) +
        '</i></span>' +
        '<span class="c-ss">#' +
        esc(it.session) +
        '</span>' +
        '<span class="c-gate ' +
        (it.gate === 2 ? 'big' : it.gate === 1 ? 'small' : '') +
        '">' +
        gate +
        '</span>' +
        '<span class="c-bet">' +
        fmt(it.bet) +
        '</span>' +
        // KẾT QUẢ xuống HAI DÒNG: "Tài 13" trên, "(1-6-6)" dưới. Một dòng thì cột phải rộng
        // 148px, đẩy cột NHẬN ra tận ngoài khung — người chơi phải cuộn xa mới thấy tiền ăn,
        // mà đó lại là cột họ nhìn đầu tiên.
        '<span class="c-rs">' +
        (sum != null ? (sum > 10 ? 'Tài ' : 'Xỉu ') + sum + '<i>(' + dice.join('-') + ')</i>' : '--') +
        '</span>' +
        '<span class="c-refund">' +
        fmt(it.refund) +
        '</span>' +
        '<span class="c-win' +
        (win > 0 ? ' w' : '') +
        '">' +
        fmt(win) +
        '</span>' +
        '</div>';
    }
    el.popBody.innerHTML = h + '</div>';
  }

  /**
   * Tách thời gian thành hai dòng: ngày / giờ — cột hẹp, một dòng là tràn.
   *
   * Server có thể trả ISO, có thể trả chuỗi khác. Parse được thì tự định dạng; không parse
   * được thì cắt thô theo khoảng trắng, thà hiện thô còn hơn hiện "Invalid Date".
   */
  function splitTime(v) {
    if (!v) return ['--', ''];
    var t = new Date(v);
    if (isFinite(t.getTime())) {
      var p = function (n) {
        return n < 10 ? '0' + n : '' + n;
      };
      return [p(t.getDate()) + '/' + p(t.getMonth() + 1) + '/' + t.getFullYear(), p(t.getHours()) + ':' + p(t.getMinutes())];
    }
    var parts = String(v).split(' ');
    return [parts[0] || '--', parts[1] || ''];
  }

  function renderChatList(list) {
    if (!_chatOn) return;
    el.chatList.innerHTML = '';
    if (!list || !list.length) {
      el.chatList.innerHTML = empty('Chưa có tin nhắn');
      return;
    }
    for (var i = 0; i < list.length; i++) addChatRow(list[i], true);
    el.chatList.scrollTop = el.chatList.scrollHeight;
  }

  function addChatRow(m, bulk) {
    if (!m) return;
    // Lần đầu có tin thì phải dọn dòng "chưa có tin nhắn" đi.
    var ph = el.chatList.querySelector('.mg-pop-empty');
    if (ph) ph.remove();

    var d = document.createElement('div');
    d.className = 'mg-chatrow' + (m.admin ? ' admin' : '');
    d.innerHTML =
      // Bộ ảnh có v1..v50; cấp vượt 50 thì dùng lại ảnh cuối thay vì hiện ô vỡ.
      (m.vip > 0 ? '<img class="mg-cvip" src="' + ART + 'vip/v' + Math.min(m.vip, 50) + '.png" alt="VIP' + m.vip + '">' : '') +
      '<b>' +
      esc(m.name) +
      ':</b> <span>' +
      esc(m.text) +
      '</span>';
    el.chatList.appendChild(d);
    // Cuộn xuống cuối, nhưng chỉ khi người chơi ĐANG ở cuối — họ đang đọc lại tin cũ mà tự
    // nhảy xuống là mất chỗ.
    if (bulk) return;
    var atEnd = el.chatList.scrollHeight - el.chatList.scrollTop - el.chatList.clientHeight < 40;
    if (atEnd) el.chatList.scrollTop = el.chatList.scrollHeight;
  }

  function empty(msg) {
    return '<div class="mg-pop-empty">' + msg + '</div>';
  }

  /** Tên và nội dung chat do người khác nhập — không được nhét thẳng vào innerHTML. */
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // MỞ / ĐÓNG
  // ═══════════════════════════════════════════════════════════════════════════════════

  function open() {
    if (st.open) return;
    st.open = true;
    el.panel.classList.add('open');
    el.panel.setAttribute('aria-hidden', 'false');
    el.loading.classList.remove('hidden');
    // Mở ra là đang dùng tới → về cỡ đầy đủ.
    _shrunk = false;
    el.panel.classList.remove('small');
    // Xin trạng thái đầy đủ. Cocos trả DICE_SNAPSHOT.
    send('OPEN', {});
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // THU NHỎ KHI KHÔNG DÙNG TỚI
  //
  // Người chơi quay sang game đối tác thì cụm Tài Xỉu co lại 0.7 để đỡ che màn; chạm lại vào
  // cụm là nó về cỡ cũ. Bàn vẫn chạy bình thường ở cỡ nhỏ, chỉ là nhỏ đi.
  // ═══════════════════════════════════════════════════════════════════════════════════

  var _shrunk = false;
  // Mốc lần cuối chạm vào cụm. Đường bắt bằng activeElement (dưới) không phân biệt được
  // "đang ở trong game" với "vừa mới rời game sang bấm bàn", nên phải tự nhớ.
  var _lastIn = 0;

  function setShrunk(on) {
    // Bảng đóng thì không có gì để thu nhỏ; nhớ gỡ lớp để lần mở sau không kế thừa cỡ nhỏ.
    if (!st.open) on = false;
    // ĐANG KÉO thì cấm đổi cỡ. Thu nhỏ giữa cú kéo là cụm nhảy ngay dưới ngón tay, và toạ độ
    // đang tính theo cỡ cũ nên nó văng lệch hẳn đi.
    if (st.dragging && on) return;
    if (on === _shrunk) return;
    _shrunk = on;
    el.panel.classList.toggle('small', on);
    applyTransform();
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // MỘT CHỖ DUY NHẤT TÍNH transform CHO CỤM
  //
  // Cụm chịu BA phép biến hình chồng nhau: căn giữa màn, hệ số vừa-khung, và cỡ thu nhỏ khi
  // người chơi quay sang game của hãng. Trước đây mỗi thứ một rule CSS, chúng ghi đè nhau
  // theo độ đặc hiệu và không rule nào biết hai rule kia — thêm hệ số thứ ba vào là loạn.
  // Đặt bằng biến CSS cũng không xong: biến dùng trong transform KHÔNG được tính lại khi
  // thuộc tính đó đang có transition (đã dính đúng lỗi này một lần rồi).
  // Nên gộp cả ba ở đây rồi ghi thẳng vào style.
  // ═══════════════════════════════════════════════════════════════════════════════════

  // Cỡ THẬT của cụm ở tỉ lệ gốc: thân 765 (= bàn 673 chiếm 88% thân), cao 460 khi chưa mở
  // chat. Đo theo chính cụm chứ không theo khung 750×1334 của Cocos: khung đó là của cả scene,
  // còn cái cần vừa màn ở đây là cụm bàn.
  var FIT_W = 765;
  var FIT_H = 460;
  var _fit = 1;

  /**
   * Hệ số để cụm hiện ra đúng tỉ lệ ở MỌI môi trường.
   *
   * CanvasControl khoá bề ngang 750 khi màn dọc (FIXED_WIDTH) và khoá chiều cao 1334 khi màn
   * ngang (FIXED_HEIGHT). Đối chiếu khung nhìn thật của trang với đúng cạnh bị khoá đó:
   *
   *   - Build web: WebView là iframe cỡ bằng visibleSize, nên innerWidth ĐÃ là 750 → ra 1,
   *     không nhân thêm gì. Cocos tự scale cái iframe như mọi node khác → không scale hai lần.
   *   - Build native: WebView là khung thật, innerWidth là px thật của máy (390) → ra 0.52,
   *     bù đúng phần Cocos không làm.
   *   - Chạy thẳng trên PC: 1280/750 = 1.7, bị min(1,…) kẹp về 1 → giữ nguyên bố cục PC.
   *
   * Kẹp trần ở 1 vì ảnh không có bản lớn hơn — phóng quá cỡ gốc là mờ.
   */
  function computeFit() {
    // MÀN CHUỘT THÌ KHÔNG ĐỘNG VÀO. Màn PC luôn rộng hơn cao nên sẽ rơi vào nhánh "ngang" và
    // bị chia cho 1334 — màn 800px cao ra hệ số 0.6, co mất bố cục PC vốn đã đúng cỡ ảnh gốc.
    // Khung thiết kế 750×1334 là của app điện thoại, không phải của cửa sổ trình duyệt.
    if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      _fit = 1;
      return _fit;
    }
    var w = window.innerWidth || FIT_W;
    var h = window.innerHeight || FIT_H;
    // CHIỀU CAO ĐO THẬT, không lấy hằng số: mở khay cược hay bảng bạch thủ là cụm cao thêm
    // vài trăm px. Lấy offsetHeight vì nó là cỡ TRƯỚC transform — đúng thứ cần chia.
    var cao = (el.panel && el.panel.offsetHeight) || FIT_H;
    // KHUNG CHAT: trừ ra hay không, tuỳ hướng màn.
    //
    // MÀN DỌC — trừ ra. Ở đây bề ngang mới là cạnh chật, chiều cao thừa chỗ: tính cả chat hay
    // không thì hệ số vẫn y hệt nhau, nên trừ ra là được không mất gì, mà bù lại cụm KHÔNG co
    // lúc bật chat → nút Chat đứng yên, bấm lần nữa là đóng được.
    //
    // MÀN NGANG — phải tính. Màn cao 375 mà riêng mặt bàn đã chiếm 344, chat dù đã lùn còn một
    // nửa vẫn thêm 257 nữa: không có cách nào vừa cả hai. Bỏ chat ra khỏi phép tính thì cụm
    // thò cả trên lẫn dưới, mất luôn ô nhập. Thà co lại cho nhìn thấy đủ.
    if (el.chat && !el.chat.hidden && h >= w) cao -= el.chat.offsetHeight + 8; // 8 = margin của chat
    // Vừa CẢ HAI chiều, chừa mép: 98% bề ngang, 92% chiều cao. Không cần biết đang là build
    // web hay native — cứ so cụm với khung nhìn thật là ra đúng, vì mọi khác biệt giữa hai
    // môi trường (đơn vị design px hay px thật) đều đã nằm gọn trong hai số w/h này.
    // Trần 1: ảnh không có bản lớn hơn, phóng quá cỡ gốc là mờ.
    _fit = Math.min(1, (w * 0.98) / FIT_W, (h * 0.92) / cao);
    return _fit;
  }

  /**
   * Cụm vừa đổi chiều cao (mở/đóng khay cược, bạch thủ, chat) → tính lại hệ số.
   *
   * Đo lại thêm MỘT NHỊP nữa: khung chat vào bố cục theo hai bước (bỏ hidden rồi mới nhận
   * chiều cao theo tỉ lệ ảnh), nên nhịp đầu đọc được 766 trong khi cỡ thật là 975 — hệ số ra
   * 0.45 thay vì 0.354 và cụm thò khỏi màn. Nhịp sau bắt đúng số cuối cùng.
   */
  function refit() {
    computeFit();
    applyTransform();
    // Dùng setTimeout chứ KHÔNG requestAnimationFrame: tab ở chế độ nền thì rAF bị treo, nhịp
    // kiểm lại sẽ không bao giờ chạy và cụm kẹt ở hệ số đo hụt.
    setTimeout(function () {
      var truoc = _fit;
      computeFit();
      if (_fit !== truoc) applyTransform();
    }, 0);
  }

  // Cỡ gốc của khung popup: 750 là bề ngang thiết kế (bằng ảnh nền BG.png), 1334 là chiều cao
  // trọn vẹn của ảnh đó — chỉ dùng làm TRẦN, popup không bao giờ cao hơn ảnh nền.
  var POP_W = 750;
  var POP_H = 1334;

  /**
   * Popup đi đường RIÊNG chứ không dùng chung hệ số với cụm bàn: nó gắn thẳng vào body (cụm có
   * transform, mà transform tạo khung tham chiếu mới cho position:fixed nên popup nằm trong đó
   * sẽ neo theo cụm chứ không theo màn hình), và nó cũng cao gấp đôi cụm nên cần hệ số khác.
   */
  function applyPopFit() {
    if (!el.pop) return;
    var w = window.innerWidth || POP_W;
    var h = window.innerHeight || POP_H;
    // Hệ số CHỈ tính theo bề ngang. Đưa cả chiều cao vào thì màn PC (cao 800) ép hệ số xuống
    // 0.56 và khung co còn 423 — mọi ảnh bên trong lại bé đi, đúng thứ vừa sửa.
    var k = Math.min(1, (w * 0.94) / POP_W);
    // Chiều cao đặt riêng: lấy 94% màn rồi CHIA cho hệ số, vì lát nữa nó bị nhân lại khi scale.
    // Chặn trên bằng 1334 để không cao quá ảnh nền.
    el.pop.style.height = Math.min(POP_H, (h * 0.94) / k) + 'px';
    el.pop.style.transform = 'translate(-50%, -50%) scale(' + k + ')';
  }

  function applyTransform() {
    if (!el.panel) return;
    var s = _fit * (_shrunk ? 0.6 : 1);
    // Đã kéo đi chỗ khác thì left/top là toạ độ màn hình thật, không cần căn giữa nữa.
    var giua = el.panel.classList.contains('placed') ? '' : 'translate(-50%, -50%) ';
    el.panel.style.transform = giua + 'scale(' + s + ')';
  }

  function initFit() {
    computeFit();
    applyTransform();
    applyPopFit();
    // Việc ép cụm về trong biên do chính initGrip lo ở sự kiện resize — không làm lại ở đây,
    // hai lời gọi moveTo nối nhau sẽ đọc toạ độ giữa chừng của nhau.
    var lai = function () {
      refit();
      applyPopFit();
    };
    window.addEventListener('resize', lai);
    window.addEventListener('orientationchange', lai);

    // CỤM TỰ ĐỔI CHIỀU CAO thì cũng phải tính lại — mở khay cược, bật bảng bạch thủ, bật chat
    // đều làm cụm cao thêm. Canh bằng ResizeObserver thay vì rải lời gọi ở từng chỗ bật/tắt:
    // chỗ nào quên gọi là chỗ đó tràn màn, mà thêm màn mới sau này thì lại quên tiếp.
    if (typeof ResizeObserver === 'function' && el.panel) {
      var _cao = 0;
      new ResizeObserver(function () {
        var c = el.panel.offsetHeight;
        if (c === _cao) return; // chính transform cũng bắn observer → bỏ qua khi cao không đổi
        _cao = c;
        lai();
      }).observe(el.panel);
    }
    // Số này quyết định toàn bộ cỡ hiển thị — in ra để đối chiếu giữa build web và native.
    console.log('[Minigame] khung nhìn ' + window.innerWidth + 'x' + window.innerHeight + ' | dpr ' + (window.devicePixelRatio || 1) + ' | fit ' + _fit.toFixed(3));
  }

  function initShrink() {
    // Chạm ở đâu cũng bắt được, TRỪ bên trong iframe game của hãng — sự kiện trong iframe
    // không nổi lên trang cha. Bù bằng window blur ngay dưới: bấm vào iframe là trang cha
    // mất focus.
    document.addEventListener(
      'pointerdown',
      function (e) {
        var t = e.target;
        // GIỮ CỠ TO khi chạm vào BẤT KỲ THỨ GÌ THUỘC BẢNG TÀI XỈU — nút, ảnh, mặt bàn, hai
        // thanh hũ, khay chọn mức cược, bảng bạch thủ, khung chat. Lấy hẳn #mg-panel chứ không
        // riêng #mg-table: khay cược và thanh hũ nằm NGOÀI mặt bàn, mà bấm vào chúng rõ ràng
        // là đang dùng bảng.
        //
        // Trừ đúng một thứ: KHOẢNG TRỐNG của cụm. #mg-body phủ kín khung và có pointer-events
        // auto, nên chạm vào chỗ trống quanh bàn vẫn rơi vào nó — mà chỗ đó thì người chơi
        // đang nhắm xuống game bên dưới chứ không phải bảng. Chạm trúng chính #mg-body hay
        // #mg-panel trần thì coi như chạm ra ngoài.
        //
        // #mg-pop và #mini-btn giữ riêng: popup mở ra nằm ngoài cụm, còn nút nổi là đường duy
        // nhất để phóng cụm trở lại.
        var trong = t && t.closest && t.closest('#mg-panel, #mini-btn, #mg-pop');
        if (trong && (t.id === 'mg-body' || t.id === 'mg-panel')) trong = null;
        if (trong) {
          _lastIn = Date.now();
          // GIẬT TIÊU ĐIỂM VỀ TRANG CHA. Bấm vào một cái div KHÔNG làm iframe mất tiêu điểm,
          // nên sau khi rời game sang bấm bàn thì activeElement vẫn là IFRAME — vòng canh
          // 400ms bên dưới lập tức thu nhỏ lại. Đúng cái "lúc được lúc không".
          var a = document.activeElement;
          if (a && a.tagName === 'IFRAME' && a.blur) a.blur();
          // Kéo tiêu điểm về CHÍNH TRANG NÀY. Vòng canh dưới dùng document.hasFocus() làm
          // thước đo; chạm vào bàn mà tiêu điểm vẫn nằm ở khung khác thì 400ms sau nó lại
          // thu nhỏ ngay, dù tay đang đặt trên bàn.
          try {
            window.focus();
          } catch (e) {}
        }
        setShrunk(!trong);
      },
      true,
    );

    window.addEventListener('blur', function () {
      setShrunk(true);
    });

    // ĐƯỜNG BẮT THỨ BA: canh xem TRANG NÀY còn giữ tiêu điểm không.
    //
    // Bấm vào game của hãng thì trang này KHÔNG nhận được sự kiện nào — game nằm ở khung
    // khác (iframe, hoặc canvas của trang bao ngoài khi bảng Tài Xỉu tự nó là một iframe),
    // sự kiện không đi xuyên qua ranh giới đó. `blur` ở trên đáng ra bù được, nhưng nó chỉ
    // bắn khi trang ĐANG giữ tiêu điểm rồi mất — chưa từng bấm vào bảng thì không có gì để
    // mất, nên không bắn.
    //
    // Bản trước đọc document.activeElement và đòi nó phải là IFRAME. Cách đó chỉ đúng khi
    // bảng nằm ở trang NGOÀI CÙNG và game ở iframe con. Ngược lại — bảng nằm trong iframe,
    // game ở ngoài — thì activeElement của trang này mãi là BODY của chính nó, đọc bao nhiêu
    // lần cũng không thấy gì: đúng cái "bấm vùng đen không thu nhỏ, bấm vùng xám mới thu".
    //
    // document.hasFocus() không quan tâm ai đang giữ tiêu điểm, chỉ trả lời "có phải mình
    // không" — nên đúng ở cả hai chiều lồng nhau, và cả khi người chơi chuyển hẳn sang cửa
    // sổ khác.
    setInterval(function () {
      if (!st.open || _shrunk) return;
      // Vừa chạm vào cụm, hoặc đang kéo → còn đang dùng, kệ tiêu điểm nằm đâu.
      if (st.dragging || Date.now() - _lastIn < 800) return;
      if (!document.hasFocus()) {
        setShrunk(true);
        return;
      }
      var a = document.activeElement;
      if (a && a.tagName === 'IFRAME') setShrunk(true);
    }, 400);
  }

  function close() {
    if (!st.open) return;
    // Popup gắn ở body nên KHÔNG tự ẩn theo cụm — phải đóng tay, không thì bảng đóng rồi mà
    // vinh danh/chat vẫn lơ lửng giữa màn hình.
    closePop();
    closeChat();
    st.open = false;
    el.panel.classList.remove('open');
    el.panel.setAttribute('aria-hidden', 'true');
    // TRẢ LẠI 32MB BỘ NHỚ GPU.
    //
    // tron_tx và WIN_TX đều là atlas 2048×2048, mỗi cái 16MB sau khi giải nén. Bảng đóng nghĩa
    // là người chơi quay lại game của hãng — đúng lúc bộ nhớ căng nhất mà mình vẫn ôm 32MB
    // không dùng tới. Mở lại bảng thì mount() dựng lại, ảnh đã nằm trong cache trình duyệt.
    //
    // KHÔNG đụng mini_game_bt: nút nổi vẫn hiện sau khi đóng bảng.
    // Gỡ class TRƯỚC khi huỷ: showRing() dùng chính class 'on' để biết vòng đang chạy hay chưa
    // (`if (classList.contains('on')) return`). Huỷ spine mà để class lại thì lần mở bảng sau
    // nó tưởng vòng vẫn còn và thoát sớm — bảng mở ra không có vòng lửa nào.
    if (el.ring) el.ring.classList.remove('on', 'spine');
    clearWinFx();
    if (window.MGSpine && window.MGSpine.destroy) {
      window.MGSpine.destroy('tron_tx');
      window.MGSpine.destroy('WIN_TX');
    }
    _ringSpine = null;
    _winSpine = null;

    // KHÔNG stopTick(): badge đếm ngược trên nút nổi vẫn phải chạy sau khi đóng bảng. Vòng đếm
    // chỉ dừng hẳn khi rời webview.
    send('CLOSE', {});
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // KÊNH TRANG → COCOS: hàng đợi một-lệnh-một
  //
  // Trên native kênh này là `location.href = 'cc://...'` — tức ĐIỀU HƯỚNG TRANG, không phải
  // gọi hàm. Bắn hai lệnh sát nhau thì trên một số WebView lệnh sau HUỶ lệnh trước, mất gói
  // im lặng. Xếp hàng một-lệnh-một chính là thứ dập phần lớn rủi ro đó.
  //
  // GỬI LẠI: chỉ cho lệnh CHỈ-ĐỌC. Gói DICEDUBAI_BET không mang mã chống trùng (xem
  // DiceKeyboard.onClickAccept: chỉ có msg[1]=cổng, msg[2]=tiền), nên gửi lại một lệnh cược
  // là nguy cơ TRỪ TIỀN HAI LẦN. Cược rơi thì đi hỏi lại trạng thái, để người chơi tự quyết.
  // ═══════════════════════════════════════════════════════════════════════════════════

  var ACK_MS = 1500;
  var MAX_TRY = 4;
  // Chỉ-đọc nên gửi lại vô hại. CHAT_SEND KHÔNG nằm đây: gửi lại là tin nhắn hiện hai lần.
  var REPLAYABLE = { OPEN: 1, CLOSE: 1, SYNC: 1, HELLO: 1, TOP: 1, JACKPOT: 1, HISTORY: 1, CHAT_OPEN: 1, CHAT_CLOSE: 1 };

  var queue = [];
  var inflight = null;
  var ackTimer = null;
  var seq = 0;

  function send(type, payload) {
    queue.push({ reqId: Date.now().toString(36) + '_' + ++seq, type: type, payload: payload || {}, tries: 0 });
    pump();
  }

  function pump() {
    if (inflight || queue.length === 0) return;
    inflight = queue.shift();
    transmit();
  }

  function transmit() {
    var m = inflight;
    if (!m) return;
    m.tries++;
    var body = { reqId: m.reqId, type: m.type, payload: m.payload };

    if (!window.isNative) {
      // Web: postMessage tin cậy hơn, nhưng vẫn đi CÙNG đường hàng đợi để hai nền tảng có
      // cùng hành vi — không thì lỗi chỉ hiện trên native và rất khó lần.
      window.parent.postMessage({ type: 'MINIGAME', payload: body }, '*');
    } else {
      // encodeURIComponent: tiếng Việt có dấu và ký tự & sẽ phá cấu trúc URL.
      window.location.href = 'cc://minigame?d=' + encodeURIComponent(JSON.stringify(body));
    }

    if (ackTimer) clearTimeout(ackTimer);
    ackTimer = setTimeout(onAckTimeout, ACK_MS);
  }

  function onAckTimeout() {
    ackTimer = null;
    var m = inflight;
    if (!m) return;

    if (REPLAYABLE[m.type] && m.tries < MAX_TRY) {
      console.warn('[mg] không có ACK, gửi lại lần ' + (m.tries + 1) + ':', m.type);
      transmit();
      return;
    }

    inflight = null;

    if (m.type === 'BET') {
      // KHÔNG gửi lại. Đi hỏi lại xem cược đã vào chưa rồi để người chơi tự quyết —
      // chậm hơn tự động gửi lại, nhưng không bao giờ trừ tiền hai lần.
      console.warn('[mg] BET không có ACK → xác minh lại');
      st.sending = false;
      note('Chưa rõ cược đã vào chưa, đang kiểm tra lại…', false);
      send('SYNC', {});
    } else {
      console.warn('[mg] gửi thất bại:', m.type);
      note('Mất kết nối, thao tác chưa được gửi.', false);
    }
    pump();
  }

  function onAck(reqId) {
    if (!inflight || inflight.reqId !== reqId) return;
    if (ackTimer) {
      clearTimeout(ackTimer);
      ackTimer = null;
    }
    inflight = null;
    pump();
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // KÊNH COCOS → TRANG
  // ═══════════════════════════════════════════════════════════════════════════════════

  // app.js gọi vào đây cho MỌI tin từ Cocos. Trả true = "tin này của tao, xử lý rồi".
  function handle(type, payload) {
    switch (type) {
      case 'ACK':
        onAck(payload && payload.reqId);
        return true;

      case 'DICE_SNAPSHOT':
        // Vẽ lại TỪ ĐẦU, không hoà giải. Trang không giữ logic nên chẳng có gì để hoà giải —
        // ẩn app bao lâu, mất mạng bao lâu, quay lại cứ vẽ lại là đúng.
        applySnapshot(payload);
        return true;

      case 'DICE_SESSION':
        applySession(payload);
        return true;

      case 'DICE_RESULT':
        applyResult(payload);
        return true;

      case 'DICE_WIN':
        // Tin RIÊNG cho tiền thắng của mình. Không gộp vào DICE_RESULT vì mỗi DICE_RESULT lại
        // cộng một chấm vào bảng cầu — gộp là mỗi phiên ra hai chấm.
        if (payload && payload.win != null) {
          var w = Number(payload.win);
          // Gói này về KHÔNG THEO THỨ TỰ với DICE_RESULT, và thường về TRƯỚC.
          //
          // Vẽ ngay CHỈ KHI đã có xúc xắc và không có chuỗi pha nào đang chạy — tức ca vào lại
          // sau khi ván đã xong. Còn lại thì ghi chờ để chuỗi pha lấy đúng lúc:
          //  - đang chạy chuỗi → vẽ luôn là lộ thắng thua khi bát còn chưa mở
          //  - chưa có xúc xắc → chưa biết cửa nào ăn, không đặt được hiệu ứng thắng ở đâu
          if (_seqTimers.length === 0 && st.dice) {
            showResult(null, w);
            playWinFx(st.dice[0] + st.dice[1] + st.dice[2] > 10 ? GATE_BIG : GATE_SMALL);
          } else {
            _pendingWin = w;
          }
        }
        return true;

      case 'DICE_TOP':
        renderTop(payload && payload.list);
        return true;

      case 'DICE_HISTORY':
        renderHistory(payload);
        return true;

      case 'DICE_JACKPOT':
        renderJackpot(payload && payload.list);
        return true;

      case 'DICE_CHAT_LIST':
        renderChatList(payload && payload.list);
        return true;

      case 'DICE_CHAT_MSG':
        if (payload && payload.error) note(payload.error, false);
        else if (payload && payload.msg && _chatOn) addChatRow(payload.msg, false);
        return true;

      case 'DICE_ROOM':
        if (payload) st.room = payload;
        renderRoom();
        return true;

      case 'DICE_BALANCE':
        if (payload && payload.balance != null) st.balance = Number(payload.balance);
        renderBalance();
        return true;

      case 'DICE_MYBET':
        applyMyBet(payload);
        return true;

      case 'DICE_CAU':
        // Bảng cầu do Cocos chốt và đẩy xuống nguyên khối — trang không tự cộng viên nào.
        st.history = Array.isArray(payload && payload.history) ? payload.history.slice(-CAU_MAX) : [];
        if (payload && payload.overlay) st.overlay = payload.overlay;
        renderCau();
        if (_popKind === 'soicau') renderSoiCau();
        return true;

      case 'DICE_CLOCK':
        // Nhịp đồng hồ, về CẢ KHI bảng đóng — nuôi badge đếm ngược trên nút nổi.
        if (payload) {
          if (payload.status != null) st.status = Number(payload.status);
          if (payload.timer != null) st.timer = Number(payload.timer);
          // VÀO PHA ĐẶT CƯỢC = phiên mới bắt đầu → xoá nhãn kết quả của phiên trước.
          // Bám đúng MiniGameManager.handleSessionInfo: `if (packet[2] == 1) this._hideResult()`.
          // Không so mã phiên: gói kết quả và gói phiên không đảm bảo thứ tự, nhãn có thể bị
          // gắn nhầm sang phiên mới rồi không bao giờ tắt.
          if (st.status === ST_BETTING) clearMiniResult();
          startTick();
          renderMiniClock();
        }
        return true;

      case 'DICE_LAST':
        // Gói nhẹ, về CẢ KHI bảng đang đóng — chỉ để cập nhật nhãn kết quả trên nút nổi.
        if (payload) setMiniResult(!!payload.big);
        return true;

      case 'DICE_SESSION_DETAIL':
        _dtData = payload || null;
        _dtLoading = false;
        if (_popKind === 'detail') renderDetail();
        return true;

      case 'DICE_NOTICE':
        // Thông báo của bàn. Đây cũng là đường server CHỐI lệnh cược — khi bị chối thì không có
        // gói cược trả về, nên phải nhả cờ "đang gửi" ở đây, không thì không đặt lại được nữa.
        if (st.sending) {
          st.sending = false;
          setStake(0);
          render();
        }
        note((payload && payload.message) || '', false);
        return true;

      case 'DICE_BET_ACK':
        // Server đã nhận lệnh cược (khác với ACK của cầu — cái kia chỉ là Cocos nhận được).
        st.sending = false;
        if (payload && payload.ok) {
          note('Đặt cược thành công', true);
          // GÓI VỀ LÀ XONG: đóng khay, bỏ chọn cửa. Người chơi muốn đặt tiếp thì chọn cửa lại
          // — rõ ràng hơn là để khay mở với số tiền cũ, dễ bấm nhầm thành đặt hai lần.
          closeTray();
        } else {
          note((payload && payload.message) || 'Đặt cược không thành công', false);
          setStake(0);
          render();
        }
        return true;

      default:
        return false;
    }
  }

  function applySnapshot(d) {
    if (!d) return;
    el.loading.classList.add('hidden');
    if (d.balance != null) st.balance = Number(d.balance);
    if (d.session != null) st.session = d.session;
    if (d.status != null) st.status = Number(d.status);
    if (d.timer != null) st.timer = Number(d.timer);
    st.myBet = normalizeMyBet(d.myBet);
    st.history = Array.isArray(d.history) ? d.history.slice(-CAU_MAX) : [];
    if (d.overlay) st.overlay = d.overlay;
    st.dice = Array.isArray(d.dice) && d.dice.length === 3 ? d.dice : null;
    if (d.room) st.room = d.room;
    st.pickedGate = 0;
    setStake(0);
    seqClear();
    stopRoll();
    _pendingWin = null;
    el.dice.classList.toggle('show', !!st.dice);
    if (st.dice) paintDice(st.dice);
    // Snapshot đến sau khi ẩn app / mất mạng: vẽ thẳng trạng thái CUỐI, KHÔNG diễn lại chuỗi
    // pha. Diễn lại là bắt người chơi ngồi xem animation của ván đã xong từ lâu.
    showRing(st.status === ST_BETTING);
    startTick();
    render();
  }

  function applySession(d) {
    if (!d) return;
    var wasSession = st.session;
    if (d.session != null) st.session = d.session;
    if (d.status != null) st.status = Number(d.status);
    if (d.timer != null) st.timer = Number(d.timer);

    // Phiên mới → úp bát lại, xoá cược cũ.
    if (st.session !== wasSession || st.status === ST_BETTING) {
      st.dice = null;
      st.myBet = { SMALL: 0, BIG: 0 };
      st.pickedGate = 0;
      setStake(0);
      if (el.tray) el.tray.hidden = true;
      refit();
      el.dice.classList.remove('show');
      clearNote();
      hideResult();
      // Chuỗi pha của phiên trước có thể còn đang chạy dở (server chốt phiên sớm hơn dự tính).
      // Không cắt là nó bắn kết quả CŨ đè lên phiên MỚI.
      seqClear();
      stopRoll();
      _pendingWin = null;
      // Cửa sáng của phiên trước nháy suốt cho tới đúng lúc này mới tắt.
      clearWinFx();
      // Bát chưa kéo mà đã sang phiên mới thì dọn đi, không để úp sang phiên sau.
      hideBowl();
    }
    // Vòng sáng chỉ chạy trong lúc còn nhận cược; hết giờ thì tắt để nhường chỗ cho tung xúc xắc.
    showRing(st.status === ST_BETTING);
    startTick();
    render();
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // KẾT QUẢ — CHẠY THÀNH CHUỖI PHA, KHÔNG LỘ NGAY
  //
  // Bản trước nhận gói là hiện luôn xúc xắc và bảng kết quả. Ván bạc mất hết cảm giác: người
  // chơi chưa kịp nhìn bát thì đã biết mình thua rồi.
  //
  // Chuỗi:  bát lắc  →  bát mở  →  xúc xắc lộ  →  bảng kết quả  →  hiệu ứng thắng ở cửa
  //
  // Gói DICE_WIN có thể về BẤT KỲ lúc nào trong chuỗi (thường sớm hơn). Nên nó chỉ được ghi
  // vào _pending rồi để chuỗi tự lấy khi tới pha của nó — không được vẽ chen ngang.
  // ═══════════════════════════════════════════════════════════════════════════════════

  // Đúng bằng _duration của TungXucXac.anim (1.05s, 21 frame, sample 20).
  var ROLL_MS = 1050;
  var REVEAL_MS = 550; // xúc xắc kết quả đứng yên một nhịp rồi mới tới bảng kết quả

  var _seqTimers = [];
  var _pendingWin = null;
  var _ringSpine = null;
  var _winSpine = null;

  function seqClear() {
    for (var i = 0; i < _seqTimers.length; i++) clearTimeout(_seqTimers[i]);
    _seqTimers = [];
  }

  function seqAt(ms, fn) {
    _seqTimers.push(setTimeout(fn, ms));
  }

  function applyResult(d) {
    if (!d || !Array.isArray(d.dice) || d.dice.length !== 3) return;
    st.dice = d.dice;
    paintDice(d.dice);

    var sum = d.dice[0] + d.dice[1] + d.dice[2];
    // KHÔNG tự thêm viên vào bảng cầu ở đây. Bàn Cocos chỉ thêm khi gói OVERLAY về (chốt sổ
    // phiên), nên bridge cũng đợi tới lúc đó rồi đẩy xuống nguyên bảng qua DICE_CAU. Tự thêm ở
    // đây thì viên hiện sớm hơn bàn Cocos một nhịp và dễ bị đếm hai lần.

    seqClear();
    hideResult();
    el.dice.classList.remove('show');
    showRing(false);

    // ── Pha 1: TUNG XÚC XẮC ──
    playRoll();

    // Cửa về, để dành cho lúc mở kết quả — dù mở tự động hay do người chơi kéo bát.
    _resultSum = sum;
    _resultBig = d.big != null ? !!d.big : sum > 10;

    // ── Pha 2: xúc xắc kết quả đứng yên ──
    seqAt(ROLL_MS, function () {
      stopRoll();
      el.dice.classList.add('show');
      renderCau();
      // BẬT TỰ NẶN thì úp bát lại ở đây và DỪNG — kết quả chỉ hiện khi người chơi kéo bát ra.
      // Tắt thì đi tiếp sang pha 3 như thường. Đúng nhánh if (!this.isHand) của bàn gốc.
      if (_handMode) showBowl();
    });

    // ── Pha 3: bảng kết quả, rồi hiệu ứng thắng ──
    if (!_handMode) seqAt(ROLL_MS + REVEAL_MS, revealResult);

    render();
  }

  /**
   * Tung xúc xắc — flipbook 21 frame cắt từ chính TungXucXac.anim của bản Cocos.
   *
   * Dùng dải ảnh + steps() thay vì 21 thẻ <img>: một request, và steps() nhảy frame dứt khoát
   * đúng kiểu flipbook, không nội suy mượt giữa hai frame như transition thường.
   */
  /**
   * Tung xúc xắc: 21 ẢNH RỜI, đổi src theo đồng hồ thật.
   *
   * Trước dùng một dải ghép + `background-position` chạy bằng CSS steps. Nhưng khung rộng
   * 38.63% bàn ra số LẺ (≈122.46px), nên mỗi frame dịch một lượng lẻ và trình duyệt lấy mẫu
   * lẫn sang ô bên cạnh — viền xúc xắc lem, nhìn đúng kiểu "chạy lệch frame". Ảnh rời thì
   * không có ranh giới nào để lấy mẫu nhầm, dù khung lẻ bao nhiêu cũng sắc.
   *
   * Chạy bằng requestAnimationFrame và tính frame TỪ THỜI GIAN TRÔI, không phải cộng dồn từng
   * nhịp: máy yếu tụt khung hình thì nó bỏ frame chứ không kéo dài cả cú tung.
   */
  var ROLL_DIR = ART + 'roll/';
  var ROLL_N = 21;
  var _rollReady = false;

  /**
   * Dựng sẵn 21 thẻ <img> chồng lên nhau và giải mã sẵn.
   *
   * Nhịp chạy do CSS giữ (xem #mg-roll.rolling): mỗi thẻ sáng đúng 50ms theo animation-delay
   * riêng. Không dùng requestAnimationFrame — rAF chạy trên luồng chính nên nhịp bị rung, đo
   * trên video thấy có frame chỉ 2 khung, có frame 4 khung, và cả cú tung hụt 0.12s.
   */
  function preloadRoll() {
    if (_rollReady) return;
    _rollReady = true;
    for (var i = 1; i <= ROLL_N; i++) {
      var im = document.createElement('img');
      im.alt = '';
      im.src = ROLL_DIR + (i < 10 ? '0' + i : i) + '.png';
      el.roll.appendChild(im);
      // Ép giải mã ngay thay vì đợi lần vẽ đầu, không thì lượt tung đầu tiên bị khựng.
      if (im.decode) im.decode().catch(function () {});
    }
  }

  function playRoll() {
    if (!el.roll) return;
    preloadRoll();
    el.roll.classList.add('on');
    // Ép chạy lại từ đầu: gắn lại cùng animation cho phần tử đang chạy dở thì trình duyệt bỏ
    // qua, xúc xắc sẽ đứng im ở frame cuối của phiên trước.
    el.roll.classList.remove('rolling');
    void el.roll.offsetWidth;
    el.roll.classList.add('rolling');
  }

  function stopRoll() {
    if (!el.roll) return;
    el.roll.classList.remove('on', 'rolling');
  }

  /**
   * Vòng sáng úp lên ô đếm ngược (spine tron_tx), chạy vòng lặp trong lúc còn nhận cược.
   *
   * Không có runtime Spine → rơi về vòng sáng vẽ bằng CSS. Trang phải chạy được cả hai đường.
   */
  function showRing(on) {
    if (!el.ring) return;
    if (!on) {
      el.ring.classList.remove('on', 'spine');
      disposeRing();
      return;
    }
    if (el.ring.classList.contains('on')) return; // đang chạy rồi, đừng dựng lại mỗi giây
    el.ring.classList.add('on');
    disposeRing();
    if (window.MGSpine && window.MGSpine.available()) {
      el.ring.classList.add('spine');
      _ringSpine = window.MGSpine.mount(el.ring, 'tron_tx', { loop: true });
    } else {
      el.ring.classList.remove('spine');
    }
  }

  function disposeRing() {
    if (_ringSpine) {
      _ringSpine.dispose();
      _ringSpine = null;
    }
  }

  /** Hiệu ứng thắng ở cửa vừa ăn (spine WIN_TX). */
  /**
   * Sáng cửa vừa về, và GIỮ NHÁY CHO TỚI KHI SANG PHIÊN MỚI.
   *
   * Trước đây tự tắt sau 4.5 giây — nhưng pha trả thưởng dài hơn thế, nên nửa sau của phiên
   * người chơi nhìn vào bàn không còn biết cửa nào vừa về. Giờ chỉ clearWinFx() mới tắt, và
   * nó được gọi khi phiên mới bắt đầu.
   */
  function playWinFx(gate) {
    var host = gate === GATE_BIG ? el.winfxBig : el.winfxSmall;
    var side = gate === GATE_BIG ? el.sideBig : el.sideSmall;
    if (!host) return;

    clearWinFx();
    _wonSide = side;
    side.classList.add('won');

    if (window.MGSpine && window.MGSpine.available()) {
      _winSpine = window.MGSpine.mount(host, 'WIN_TX', { loop: true });
    }
  }

  /** Kết quả phiên hiện tại, giữ lại để mở được cả bằng tay lẫn tự động. */
  var _resultSum = 0;
  var _resultBig = false;

  /**
   * Mở kết quả: bảng điểm + sáng cửa về.
   *
   * Tách riêng vì có HAI đường gọi tới — hết pha chờ (tự động), hoặc người chơi kéo bát ra
   * (tự nặn). Gộp vào một chỗ để hai đường không bao giờ vẽ lệch nhau.
   */
  function revealResult() {
    showResult(_resultSum, _pendingWin);
    setMiniResult(_resultBig);
    // SÁNG CỬA THẮNG mỗi phiên, không phụ thuộc mình có ăn tiền hay không — bàn gốc cũng
    // chạy spine ở cửa về, đó là cách báo kết quả chứ không phải phần thưởng riêng.
    playWinFx(_resultBig ? GATE_BIG : GATE_SMALL);
    _pendingWin = null;
  }

  /**
   * Nhãn kết quả trên nút nổi.
   *
   * Giữ NGUYÊN cho tới khi có kết quả mới — đây là thứ để liếc một cái là biết phiên vừa rồi
   * về gì, nên không tự tắt theo phiên như bảng kết quả trong bàn.
   */
  /**
   * Badge đếm ngược trên nút nổi. Chỉ hiện trong pha ĐẶT CƯỢC — hết giờ thì ẩn, không treo
   * số 0. Chạy độc lập với bảng: đây là thứ để biết còn kịp cược hay không mà chưa mở bàn.
   */
  function renderMiniClock() {
    if (!el.miniClock) return;
    var show = st.status === ST_BETTING && st.timer > 0;
    el.miniClock.hidden = !show;
    if (show) {
      el.miniClock.textContent = String(st.timer);
      el.miniClock.classList.toggle('urgent', st.timer <= 5);
    }
  }

  function setMiniResult(big) {
    if (!el.miniRs) return;
    el.miniRs.hidden = false;
    el.miniRs.textContent = big ? 'TÀI' : 'XỈU';
    el.miniRs.classList.toggle('big', !!big);
    el.miniRs.classList.toggle('small', !big);
  }

  function clearMiniResult() {
    if (el.miniRs) el.miniRs.hidden = true;
  }

  /** Cửa đang sáng, để gỡ đúng nó khi sang phiên — không quét cả hai cho chắc. */
  var _wonSide = null;

  function clearWinFx() {
    if (_wonSide) {
      _wonSide.classList.remove('won');
      _wonSide = null;
    }
    disposeWinSpine();
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // TỰ NẶN — úp bát rồi tự kéo ra
  //
  // Bám đúng DiceGameView + DiceBowlDrag: cờ isHand quyết định tung xúc xắc xong thì hiện
  // kết quả luôn (tắt) hay úp bát lại (bật). Bát kéo đi xa quá 180px trên bàn 673 thì mở.
  // ═══════════════════════════════════════════════════════════════════════════════════

  /** Kéo xa bao nhiêu thì bát bật ra. 180/673 của bàn, lấy từ DiceBowlDrag.update. */
  var BOWL_OPEN_PCT = 26.7;

  var _handMode = false;
  var _bowlOpen = false;

  function toggleHand() {
    _handMode = !_handMode;
    el.btnHand.classList.toggle('on', _handMode);
    // Bật giữa chừng khi bát đang mở thì thôi, phiên sau mới có tác dụng.
    note(_handMode ? 'Đã bật tự nặn — kéo bát để mở' : 'Đã tắt tự nặn', true);
  }

  /** Úp bát lên kết quả. Gọi ở cuối pha tung xúc xắc, chỉ khi đang bật tự nặn. */
  function showBowl() {
    if (!el.bowl) return;
    _bowlOpen = false;
    el.bowl.hidden = false;
    el.bowl.style.left = '50.3%';
    el.bowl.style.top = '49.1%';
    el.bowl.classList.remove('gone');
  }

  function hideBowl() {
    if (!el.bowl) return;
    el.bowl.hidden = true;
    el.bowl.classList.remove('gone');
    _bowlOpen = false;
  }

  /** Bát đã bị kéo đủ xa → mở kết quả. Chạy đúng một lần cho mỗi phiên. */
  function openBowl() {
    if (_bowlOpen) return;
    _bowlOpen = true;
    el.bowl.classList.add('gone');
    // Chờ hết hoạt cảnh bát bay đi rồi mới dọn, không thì nó biến mất đột ngột.
    seqAt(500, hideBowl);
    revealResult();
  }

  /**
   * Kéo bát. Không dùng lại phần kéo cả cụm: cụm kéo theo con trỏ tuyệt đối, còn bát chỉ cần
   * độ lệch so với chỗ úp ban đầu để đo "đã kéo đủ xa chưa".
   */
  function initBowlDrag() {
    if (!el.bowl) return;
    var sx = 0;
    var sy = 0;
    var dragging = false;

    function pt(e) {
      var t = e.touches && e.touches[0] ? e.touches[0] : e;
      return { x: t.clientX, y: t.clientY };
    }

    function down(e) {
      if (el.bowl.hidden || _bowlOpen) return;
      var p = pt(e);
      sx = p.x;
      sy = p.y;
      dragging = true;
      el.bowl.classList.add('dragging');
      e.preventDefault();
    }

    function move(e) {
      if (!dragging) return;
      var p = pt(e);
      var dx = p.x - sx;
      var dy = p.y - sy;
      el.bowl.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';

      var w = el.table ? el.table.getBoundingClientRect().width : 1;
      if ((Math.sqrt(dx * dx + dy * dy) / w) * 100 >= BOWL_OPEN_PCT) {
        up();
        openBowl();
      }
      e.preventDefault();
    }

    function up() {
      if (!dragging) return;
      dragging = false;
      el.bowl.classList.remove('dragging');
      // Chưa đủ xa thì trả bát về chỗ cũ.
      if (!_bowlOpen) el.bowl.style.transform = '';
    }

    el.bowl.addEventListener('mousedown', down);
    el.bowl.addEventListener('touchstart', down, { passive: false });
    document.addEventListener('mousemove', move);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('mouseup', up);
    document.addEventListener('touchend', up);
  }

  function disposeWinSpine() {
    if (_winSpine) {
      _winSpine.dispose();
      _winSpine = null;
    }
  }

  function applyMyBet(d) {
    st.myBet = normalizeMyBet(d && d.myBet ? d.myBet : d);
    st.sending = false;
    render();
  }

  /**
   * Cocos gửi thẳng object của server: { SMALL, BIG, SUM_FOUR, SUM_FIVE, ... } — cổng không
   * cược thì KHÔNG có khoá.
   *
   * PHẢI GIỮ NGUYÊN mọi khoá SUM_*. Bản đầu tao chỉ lấy SMALL/BIG rồi trả object mới, thế là
   * toàn bộ tiền cược bạch thủ biến mất khỏi lưới dù server có gửi.
   */
  function normalizeMyBet(o) {
    var r = {};
    if (o) {
      for (var k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = Number(o[k]) || 0;
      }
    }
    r.SMALL = r.SMALL || 0;
    r.BIG = r.BIG || 0;
    return r;
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // ĐẶT CƯỢC
  // ═══════════════════════════════════════════════════════════════════════════════════

  /** Trả true nếu chọn được cửa đó. */
  function pickGate(g) {
    if (st.status !== ST_BETTING) {
      note('Chưa tới lượt đặt cược', false);
      return false;
    }
    // Khoá MỘT-CỬA chỉ áp cho cặp TÀI/XỈU (xem handleBetOfAccount bên DiceGameView: đặt SMALL
    // thì nút BIG bị tắt và ngược lại). Bạch thủ là loại cược khác, đặt được nhiều tổng cùng
    // lúc nên KHÔNG dính khoá này.
    var isTaiXiu = g === GATE_SMALL || g === GATE_BIG;
    if (isTaiXiu) {
      var lock = lockedGate();
      if (lock && lock !== g) {
        note('Phiên này đã đặt cửa bên kia rồi', false);
        return false;
      }
    }
    st.pickedGate = g;
    render();
    return true;
  }

  /** Khoá của cổng trong object myBet mà server gửi về. */
  function betKeyOf(g) {
    if (g === GATE_SMALL) return 'SMALL';
    if (g === GATE_BIG) return 'BIG';
    return BT_KEY[g - 1] || ''; // cổng bạch thủ = tổng + 1
  }

  // Cửa TÀI/XỈU duy nhất được phép đặt tiếp, hoặc 0 nếu chưa đặt bên nào.
  // KHÔNG tính bạch thủ — các khoá SUM_* nằm cùng object nhưng là loại cược riêng.
  function lockedGate() {
    if (st.myBet.SMALL > 0) return GATE_SMALL;
    if (st.myBet.BIG > 0) return GATE_BIG;
    return 0;
  }

  function closeTray() {
    setStake(0);
    // Đóng khay thì trả bàn phím về hàng mệnh giá, không thì lần mở sau vẫn thấy bàn phím.
    toggleKeys(false);
    st.pickedGate = 0;
    render();
  }

  function setStake(v) {
    st.stake = Math.max(0, v || 0);
    renderStake();
  }

  function doBet() {
    if (st.sending) return;
    if (st.status !== ST_BETTING) {
      note('Chưa tới lượt đặt cược', false);
      return;
    }
    if (!st.pickedGate) {
      note('Chọn cửa Tài hoặc Xỉu trước', false);
      return;
    }
    if (st.stake <= 0) {
      note('Chọn mệnh giá trước', false);
      return;
    }
    // Chặn phía trang cho đỡ phiền; server vẫn phải tự kiểm vì số dư ở đây có thể cũ.
    if (st.stake > st.balance) {
      note('Số dư không đủ', false);
      return;
    }

    st.sending = true;

    // HIỆN TIỀN NGAY, không đợi server.
    //
    // Vòng đi-về qua cầu rồi qua websocket mất vài trăm ms; chờ mới vẽ thì người chơi bấm xong
    // thấy không có gì đổi và bấm tiếp. Cộng vào ngay, rồi DICE_MYBET của server về sẽ GHI ĐÈ
    // bằng số thật — sai lệch (server chối) tự khỏi trong một nhịp.
    var key = betKeyOf(st.pickedGate);
    if (key) st.myBet[key] = (Number(st.myBet[key]) || 0) + st.stake;
    render();

    // msg[1] = cổng, msg[2] = tiền — đúng như DiceKeyboard.onClickAccept bên Cocos.
    send('BET', { gate: st.pickedGate, amount: st.stake });

    // Gửi xong thì XOÁ SỐ ĐANG GÕ: tiền vừa đặt đã chuyển sang dòng "cược của tôi" bên dưới,
    // để nguyên trên nút là người chơi tưởng chưa đặt và bấm thêm lần nữa. Nút tự trả lại
    // chữ ĐẶT CƯỢC vì renderStake thấy stake = 0.
    setStake(0);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // ĐẾM NGƯỢC
  // Chạy tại trang cho mượt, nhưng MỖI GÓI DICE_SESSION là một lần chỉnh lại theo server —
  // trang không bao giờ là nguồn sự thật về thời gian.
  // ═══════════════════════════════════════════════════════════════════════════════════

  var tickTimer = null;

  function startTick() {
    stopTick();
    tickTimer = setInterval(function () {
      if (st.timer > 0) st.timer--;
      renderTimer();
      // Badge trên nút chạy cả khi bảng đóng, nên đếm ở đây chứ không trong renderTimer.
      renderMiniClock();
    }, 1000);
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // VẼ
  // ═══════════════════════════════════════════════════════════════════════════════════

  function render() {
    renderBalance();
    renderTimer();
    renderStake();
    renderGates();
    renderCau();
    renderChips();
    renderRoom();
    renderBachThu();
    renderTray();
    el.session.textContent = st.session ? '#' + st.session : '#--';
    var canBet = st.status === ST_BETTING && !st.sending;
    el.accept.disabled = !canBet;
    el.cancel.disabled = !canBet;
  }

  function renderBalance() {
    // Số dư không hiện trên bảng nữa — vẫn giữ trong st.balance để chặn cược quá tay.
    if (el.balance) countTo(el.balance, st.balance);
  }

  // Đếm ngược nằm trong Ô TRÒN GIỮA BÀN — đúng chỗ bàn gốc để nó, không phải một badge riêng
  // ở trên. Có kết quả thì ô đó nhường chỗ cho xúc xắc.
  function renderTimer() {
    if (!el.count) return;
    el.count.classList.remove('urgent', 'waiting');
    var betting = st.status === ST_BETTING;
    if (betting) {
      el.count.classList.add('bmtime');
      bmText(el.count, String(st.timer), BM_TIME);
      if (st.timer <= 5) el.count.classList.add('urgent');
    } else if (st.status === ST_WAITING) {
      el.count.classList.remove('bmtime');
      el.count.textContent = '…';
      el.count.classList.add('waiting');
    } else {
      el.count.classList.remove('bmtime');
      el.count.textContent = '--';
      el.count.classList.add('waiting');
    }

    // Ngoài pha đặt cược thì số lớn giữa bàn nhường chỗ cho xúc xắc, đồng hồ chuyển xuống ô
    // nhỏ ở góc. Hết giờ (0) thì ẩn luôn, đỡ treo một số 0 vô nghĩa.
    if (el.miniTimer) {
      var show = !betting && st.timer > 0;
      el.miniTimer.hidden = !show;
      if (show) {
        el.miniTimer.firstChild.textContent = hienGiay(st.timer);
        el.miniTimer.classList.toggle('urgent', st.timer <= 5);
      }
    }
  }

  /**
   * Giây → chuỗi hai chữ số ("05", "11"). Bỏ phần phút: pha trả thưởng ngắn nên "00:" lúc nào
   * cũng là 00, chiếm chỗ mà không nói thêm gì. Quá 60 giây thì cứ hiện tổng giây ("75").
   */
  function hienGiay(giay) {
    var g = Math.max(0, Math.floor(Number(giay) || 0));
    return g < 10 ? '0' + g : String(g);
  }

  function renderRoom() {
    var r = st.room || {};
    // Tiền thì NHẢY SỐ; số người thì gán thẳng — nó nhảy vài đơn vị, chạy hiệu ứng chỉ thành rối.
    countTo(el.jp1, r.jackpotBig);
    countTo(el.jp2, r.jackpotSmall);
    countTo(el.totalBig, r.bigTotal);
    countTo(el.totalSmall, r.smallTotal);
    if (el.usersBig) el.usersBig.textContent = fmt(r.bigUsers);
    if (el.usersSmall) el.usersSmall.textContent = fmt(r.smallUsers);
  }

  /**
   * Số tiền đang gõ hiện NGAY TRONG NÚT ĐẶT CƯỢC của cửa đã chọn.
   *
   * Trước đây nó chỉ nằm ở dòng "Đặt vào TÀI · 0" trên khay — người chơi bấm chip thì mắt đang
   * ở nút cửa mà số lại nhảy ở chỗ khác, phải nhìn hai nơi. Bàn gốc gộp làm một: bấm chip là
   * thấy tiền ngay trên chính cái nút mình sắp bấm.
   *
   * Cửa KHÔNG chọn giữ nguyên chữ, và khi tiền về 0 (bấm HUỶ, hoặc xoá hết) thì trả lại chữ.
   */
  function renderStake() {
    var co = st.stake > 0;
    datChuNutCua(el.gateBig, co && st.pickedGate === GATE_BIG);
    datChuNutCua(el.gateSmall, co && st.pickedGate === GATE_SMALL);
    // Ô bạch thủ cũng là một cửa cược — tiền phải vào thẳng ô đang chọn, y như hai cửa lớn.
    datTienBachThu();
  }

  /** Ghi số tiền đang gõ vào ô bạch thủ ĐANG CHỌN; các ô khác trả lại chữ mời. */
  function datTienBachThu() {
    if (!el.btGrid) return;
    var cells = el.btGrid.children;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var o = c.querySelector('.mg-bt-money');
      if (!o) continue;
      var dangChon = st.stake > 0 && st.pickedGate === btGate(Number(c.dataset.sum));
      var chu = dangChon ? fmt(st.stake) : CHU_MOI_DAT;
      if (o.textContent !== chu) o.textContent = chu;
      c.classList.toggle('co-tien', dangChon);
    }
  }

  /** Đổi chữ trên một nút cửa: hiện tiền, hoặc trả lại chữ "ĐẶT CƯỢC". */
  function datChuNutCua(nut, hienTien) {
    if (!nut) return;
    var o = nut.firstElementChild || nut; // <span> bên trong nút
    var chu = hienTien ? fmt(st.stake) : CHU_DAT_CUOC;
    if (o.textContent === chu) return; // khỏi ghi lại y nguyên mỗi nhịp render
    o.textContent = chu;
    nut.classList.toggle('co-tien', !!hienTien);
  }

  function renderGates() {
    var lock = lockedGate();
    var betting = st.status === ST_BETTING;

    var lockSmall = !betting || (lock && lock !== GATE_SMALL);
    var lockBig = !betting || (lock && lock !== GATE_BIG);

    el.sideSmall.classList.toggle('picked', st.pickedGate === GATE_SMALL);
    el.sideBig.classList.toggle('picked', st.pickedGate === GATE_BIG);
    el.sideSmall.classList.toggle('locked', !!lockSmall);
    el.sideBig.classList.toggle('locked', !!lockBig);
    el.gateSmall.disabled = !!lockSmall;
    el.gateBig.disabled = !!lockBig;

    bmText(el.myBetSmall, fmt(st.myBet.SMALL));
    bmText(el.myBetBig, fmt(st.myBet.BIG));
    el.myBetSmall.classList.toggle('on', st.myBet.SMALL > 0);
    el.myBetBig.classList.toggle('on', st.myBet.BIG > 0);
  }

  /**
   * Khay đặt cược chỉ hiện khi ĐÃ CHỌN CỬA và còn trong giờ nhận cược.
   *
   * Để nó hiện thường trực thì bảng lúc nào cũng cao thêm hai hàng, mà phần lớn thời gian
   * người chơi chỉ đang xem — cụm này nổi đè lên game đối tác nên từng dòng đều đáng giá.
   */
  function renderTray() {
    if (!el.tray) return;
    var on = st.pickedGate !== 0 && st.status === ST_BETTING;
    el.tray.hidden = !on;
    refit(); // khay chọn mức cược bật/tắt
  }

  function renderChips() {
    var betting = st.status === ST_BETTING;
    var chips = el.chips.getElementsByClassName('mg-chip');
    for (var i = 0; i < chips.length; i++) {
      // Mệnh giá vượt số dư thì làm mờ — bấm vào cũng chỉ để bị server chối.
      chips[i].disabled = !betting || (CHIPS[i] && CHIPS[i].value > st.balance);
    }
    var keys = el.keys.getElementsByClassName('mg-key');
    for (var j = 0; j < keys.length; j++) keys[j].disabled = !betting;
    el.other.disabled = !betting;
    el.allin.disabled = !betting || st.balance <= 0;
  }

  /**
   * Bảng cầu — dùng ẢNH GỐC trong assets/dice_mini/cau/, không vẽ chấm bằng CSS.
   *
   * Tên file CHÍNH LÀ tổng điểm (3..18), và bộ ảnh đã tự phân biệt: 3–10 viên TRẮNG (Xỉu),
   * 11–18 viên ĐEN (Tài). Nên không cần tự tô màu theo big/small — cứ lấy đúng ảnh theo tổng
   * là ra đúng cầu.
   */
  /** Số ô trên thanh cầu. Đo THẲNG từ prefab 7.prefab: node historyList rộng 476.5 chứa đúng
      18 ô, bước 26.5 — không phải 16 như đoán từ ảnh nền. */
  var CAU_SLOTS = 18;

  /** Số phiên trang giữ lại. Biểu đồ trong bảng soi cầu vẽ tối đa 40, khớp DiceStatiscalRight. */
  var CAU_MAX = 40;

  function renderCau() {
    el.cau.innerHTML = '';
    // Lấy 16 phiên GẦN NHẤT. Thiếu thì chèn ô trống ở ĐẦU — cầu mới nhất luôn nằm bên phải,
    // đúng như bàn gốc, và thanh không bao giờ nhìn lệch một bên.
    var list = st.history.slice(-CAU_SLOTS);
    for (var k = list.length; k < CAU_SLOTS; k++) {
      var e = document.createElement('span');
      e.className = 'mg-cau-dot empty';
      el.cau.appendChild(e);
    }
    for (var i = 0; i < list.length; i++) {
      (function (h) {
        var b = document.createElement('button');
        b.className = 'mg-cau-dot';
        // Viên TRƠN như bàn gốc: h1 = trắng (Xỉu, 3–10), h2 = đen (Tài, 11–18). Không in số
        // lên viên — số và ba mặt xúc xắc chỉ hiện ở bong bóng khi rê/chạm vào viên.
        // Màu theo CỬA server báo (h.big, suy từ LocationID), KHÔNG tự suy từ tổng — bàn gốc
        // cũng vậy (DiceGameHistoryItem đọc LocationID[0]). Chỉ khi gói thiếu cửa mới dùng tổng.
        var isBig = h.big != null ? !!h.big : h.sum > 10;
        // Viên MỚI NHẤT (phải nhất) nhảy lên xuống không ngừng — bàn gốc gắn tween lặp vô hạn
        // cho children[0] của historyList, mà children[0] chính là ô ở x lớn nhất.
        if (i === list.length - 1) b.classList.add('newest');
        b.innerHTML = '<img src="' + ART + 'main/' + (isBig ? 'h2' : 'h1') + '.png" alt="' + h.sum + '">';
        // Rê / kéo ngang qua viên = xem nhanh phiên đó ra gì; BẤM = mở chi tiết phiên.
        // Đúng cách bàn gốc phân vai: DiceGameHistoryItem dùng TOUCH_MOVE/MOUSE_ENTER cho bong
        // bóng, còn cc.Button click mới mở popup.
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          hideCauInfo();
          openSessionDetail(h);
        });
        b.addEventListener('mouseenter', function () {
          showCauInfo(h, b);
        });
        b.addEventListener('touchmove', function () {
          showCauInfo(h, b);
        });
        b.addEventListener('mouseleave', hideCauInfo);
        el.cau.appendChild(b);
      })(list[i]);
    }
  }

  function paintDice(d) {
    for (var i = 0; i < 3; i++) {
      el.diceImgs[i].src = ART + 'main/dice_' + d[i] + '.png';
    }
  }

  /**
   * Bảng kết quả cuối phiên.
   *
   * Gọi HAI LẦN cho một phiên: lần đầu khi có xúc xắc (biết tổng và bên thắng), lần sau khi
   * server trả tiền thắng của mình. Nên mỗi tham số nhận null = "chưa biết, đừng đụng vào" —
   * lần gọi sau không được xoá mất thông tin lần trước.
   */
  /**
   * Bong bóng chi tiết một phiên trong bảng cầu: phiên nào, ba mặt xúc xắc, tổng, về TÀI hay XỈU.
   *
   * Dựng một bong bóng DÙNG CHUNG chứ không gắn sẵn vào từng viên: bảng cầu vẽ lại mỗi phiên,
   * gắn 30 bong bóng con là 30 lần dựng DOM cho thứ mỗi lúc chỉ hiện một cái.
   */
  var _cauTip = null;
  var _cauTipTimer = null;

  function showCauInfo(h, anchor) {
    if (!_cauTip) {
      _cauTip = document.createElement('div');
      _cauTip.id = 'mg-cau-tip';
      el.panel.appendChild(_cauTip);
    }
    // Một dòng gọn: [viên đen/trắng] Tài 14(3,5,6)
    // ic1.png = viên TRẮNG = XỈU, ic2.png = viên ĐEN = TÀI.
    // Cách ghi bám theo DiceHistoryItem bên Cocos: tên cửa + tổng + ba mặt trong ngoặc.
    var dice = Array.isArray(h.dice) && h.dice.length === 3 ? h.dice : null;
    _cauTip.innerHTML =
      '<img class="mg-tip-ic" src="' +
      ART +
      'popup/' +
      (h.big ? 'ic2' : 'ic1') +
      '.png" alt="">' +
      '<b class="' +
      (h.big ? 'big' : 'small') +
      '">' +
      (h.big ? 'Tài' : 'Xỉu') +
      '</b> ' +
      h.sum +
      (dice ? '(' + dice.join(',') + ')' : '');

    // Neo theo viên cầu, nhưng KẸP trong bề ngang cụm — viên ở hai đầu thì bong bóng sẽ thò
    // ra ngoài màn hình nếu cứ căn giữa nó.
    var pr = el.panel.getBoundingClientRect();
    var ar = anchor.getBoundingClientRect();
    // Đo kích thước trước khi neo: phải hiện ra mới có offsetWidth, nhưng chưa được để người
    // chơi thấy nó nhảy từ chỗ cũ sang chỗ mới.
    _cauTip.style.visibility = 'hidden';
    _cauTip.classList.add('on');
    var w = _cauTip.offsetWidth;
    var x = ar.left - pr.left + ar.width / 2 - w / 2;
    x = Math.max(4, Math.min(x, pr.width - w - 4));
    _cauTip.style.left = x + 'px';
    _cauTip.style.top = ar.top - pr.top - _cauTip.offsetHeight - 8 + 'px';
    _cauTip.style.visibility = 'visible';

    // Trên mobile không có mouseleave → tự tắt.
    if (_cauTipTimer) clearTimeout(_cauTipTimer);
    _cauTipTimer = setTimeout(hideCauInfo, 3000);
  }

  function hideCauInfo() {
    if (_cauTipTimer) {
      clearTimeout(_cauTipTimer);
      _cauTipTimer = null;
    }
    if (_cauTip) _cauTip.classList.remove('on');
  }

  var resultTimer = null;

  /**
   * Bảng tiền thắng/thua của chính mình. CHỈ hiện khi đã biết số tiền — chưa biết thì không
   * bật khung trống lên giữa bàn.
   */
  function showResult(sum, win) {
    if (!el.result || win == null) return;
    el.result.hidden = false;
    el.rsWin.textContent = win > 0 ? '+' + fmt(win) : 'Chúc may mắn lần sau';
    el.result.classList.remove('win', 'lose');
    el.result.classList.add(win > 0 ? 'win' : 'lose');

    if (resultTimer) clearTimeout(resultTimer);
    // Đủ lâu để đọc, nhưng phải tắt trước khi phiên sau bắt đầu nhận cược.
    resultTimer = setTimeout(hideResult, 6000);
  }

  function hideResult() {
    if (resultTimer) {
      clearTimeout(resultTimer);
      resultTimer = null;
    }
    if (!el.result) return;
    el.result.hidden = true;
    // Dọn Ở ĐÂY, không dọn trong showResult — xem ghi chú trên.
    el.rsWin.textContent = '';
    el.result.classList.remove('win', 'lose');
  }

  var noteTimer = null;

  function note(msg, ok) {
    el.note.textContent = msg;
    el.note.classList.add('show');
    el.note.classList.toggle('ok', !!ok);
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(clearNote, 3500);
  }

  function clearNote() {
    if (noteTimer) {
      clearTimeout(noteTimer);
      noteTimer = null;
    }
    el.note.classList.remove('show');
  }

  /**
   * Nhảy số: chạy dần từ giá trị đang hiện tới giá trị mới.
   *
   * Jackpot và tổng cược nhảy liên tục, gán thẳng thì số đổi phựt một cái — người chơi không
   * kịp thấy nó tăng, mà chính cảm giác "hũ đang lớn dần" mới là thứ đáng nhìn.
   *
   * Mỗi phần tử nhớ đích riêng: gói mới về giữa chừng thì chạy tiếp TỪ CHỖ ĐANG Ở tới đích
   * mới, không giật về rồi chạy lại.
   */
  var COUNT_MS = 600;

  // ═══════════════════════════════════════════════════════════════════════════════════
  // CHỮ SỐ BẰNG ẢNH — fontBet.fnt
  //
  // Đây là bitmap font của bản gốc: một ảnh fontBet.png 128×64 chứa sẵn 18 ký tự, kèm file
  // .fnt ghi toạ độ từng ký tự. Trình duyệt không đọc được .fnt, nên tự cắt: mỗi ký tự thành
  // một thẻ lấy đúng ô của nó trong ảnh.
  //
  // Bảng dưới chép thẳng từ fontBet.fnt — [x, y, rộng, cao, bước nhảy]. Bước nhảy (xadvance)
  // rộng hơn ký tự vài pixel, đó là khoảng cách tới ký tự kế; thiếu nó thì chữ số dính vào nhau.
  // ═══════════════════════════════════════════════════════════════════════════════════
  var BM_FONT = ART + 'font/fontBet.png';
  var BM = {
    '0': [19, 0, 15, 25, 17],
    '1': [93, 26, 7, 25, 9],
    '2': [0, 26, 15, 25, 17],
    '3': [80, 0, 14, 25, 16],
    '4': [16, 26, 15, 25, 17],
    '5': [32, 26, 15, 25, 17],
    '6': [65, 0, 14, 25, 16],
    '7': [63, 26, 14, 25, 16],
    '8': [78, 26, 14, 25, 16],
    '9': [48, 26, 14, 25, 16],
    '.': [0, 52, 4, 8, 6],
    ',': [5, 52, 4, 11, 6],
    ':': [95, 0, 4, 18, 6],
    K: [35, 0, 14, 25, 16],
    M: [0, 0, 18, 25, 20],
    B: [50, 0, 14, 25, 16],
  };
  // Chữ số cao 25, còn dấu chấm chỉ cao 8 và nằm ở ĐÁY dòng (yoffset 25 so với 8). Phải đẩy
  // xuống đúng khoảng chênh đó, không thì dấu chấm lơ lửng ngang giữa số.
  var BM_YOFF = { '.': 17, ',': 17, ':': 7 };

  function datChu(elm, s) {
    elm.textContent = s;
  }

  // Bộ thứ hai: fontDiceMini.fnt — chữ số của ĐỒNG HỒ ĐẾM NGƯỢC giữa bàn. Ảnh 512×512, chữ
  // cao 129 (to gấp năm bộ kia). Chỉ có 0-9, không có dấu nào — nên hai trạng thái chờ ('…',
  // '--') vẫn phải dùng chữ thường.
  var BM_TIME = {
    '0': [0, 0, 86, 129, 89],
    '1': [251, 0, 46, 128, 49],
    '2': [169, 130, 83, 129, 86],
    '3': [0, 259, 84, 129, 87],
    '4': [0, 130, 85, 128, 88],
    '5': [86, 130, 82, 128, 85],
    '6': [169, 260, 83, 128, 86],
    '7': [171, 0, 79, 128, 82],
    '8': [87, 0, 83, 129, 86],
    '9': [85, 259, 83, 128, 86],
  };

  /** Vẽ chuỗi bằng bitmap font. Ký tự lạ thì bỏ qua — mỗi bộ chỉ có ngần ấy ký tự. */
  function bmText(elm, s, bo) {
    var bang = bo || BM;
    var html = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var m = bang[c];
      if (!m) continue;
      var dy = (bang === BM ? BM_YOFF[c] : 0) || 0;
      html +=
        '<i style="width:' +
        m[2] +
        'px;height:' +
        m[3] +
        'px;background-position:' +
        -m[0] +
        'px ' +
        -m[1] +
        'px;margin-right:' +
        (m[4] - m[2]) +
        'px;margin-top:' +
        dy +
        'px"></i>';
    }
    elm.innerHTML = html;
  }

  function countTo(elm, to) {
    if (!elm) return;
    // Ô nào mang dấu `bmnum` thì vẽ bằng bộ chữ số ảnh của bản gốc; chỗ khác vẫn là chữ thường.
    var ve = elm.classList && elm.classList.contains('bmnum') ? bmText : datChu;
    to = Number(to) || 0;
    var from = Number(elm._cv);
    if (!isFinite(from)) from = to; // lần đầu: hiện thẳng, không chạy từ 0 lên
    elm._cv = to;
    if (from === to) {
      ve(elm, fmt(to));
      return;
    }
    if (elm._craf) cancelAnimationFrame(elm._craf);

    // Tab/app đang ẩn thì requestAnimationFrame BỊ TREO HẲN — hẹn xong không bao giờ chạy, số
    // kẹt giữa chừng cho tới khi người chơi quay lại. Ẩn thì chẳng ai nhìn, gán thẳng đích.
    if (document.hidden) {
      ve(elm, fmt(to));
      elm._craf = 0;
      return;
    }

    var t0 = 0;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / COUNT_MS);
      // easeOutCubic: vọt nhanh rồi hãm dần — số dừng lại êm thay vì phanh gấp.
      var e = 1 - Math.pow(1 - k, 3);
      ve(elm, fmt(Math.round(from + (to - from) * e)));
      if (k < 1) elm._craf = requestAnimationFrame(step);
      else elm._craf = 0;
    }
    elm._craf = requestAnimationFrame(step);
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('vi-VN');
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // KHỞI ĐỘNG
  // ═══════════════════════════════════════════════════════════════════════════════════

  build();

  // CHÀO NGAY khi trang nạp xong. Trang bọc chạy lại mỗi lần đổi game trong sảnh của hãng, mà
  // gói SESSION_INFO chỉ về lúc phiên đổi trạng thái — không chào thì nút nổi đứng im không
  // đồng hồ, không kết quả, có khi cả chục giây.
  send('HELLO', {});

  // app.js dùng initDragButton nếu có; không thì gắn click thường.
  if (typeof window.initDragButton === 'function') {
    window.initDragButton('mini-btn', open);
  } else {
    document.getElementById('mini-btn').addEventListener('click', open);
  }

  // TRẢ WEBGL CONTEXT KHI RỜI TRANG.
  //
  // Ba spine (vòng, hiệu ứng thắng, nút nổi) mỗi cái giữ một context. Trên iOS số context có
  // hạn và bộ nhớ bị siết chặt — rời trang mà không trả thì phải chờ trình duyệt tự thu hồi,
  // trong khi trang kế tiếp đã bắt đầu xin context mới.
  //
  // Dùng 'pagehide' chứ không 'beforeunload': Safari trên iOS thường không bắn beforeunload khi
  // người chơi chuyển tab hoặc app bị đẩy ra nền.
  window.addEventListener('pagehide', function () {
    if (window.MGSpine && window.MGSpine.destroyAll) window.MGSpine.destroyAll();
  });

  // Cửa duy nhất cho app.js gọi vào.
  window.Minigame = {
    handle: handle,
    open: open,
    close: close,
    isOpen: function () {
      return st.open;
    },
  };
})();
