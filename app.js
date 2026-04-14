// app.js - ツヅク日記 Firebase対応版

(function() {
  'use strict';

  const MOODS = { 5: '😆', 4: '😊', 3: '😐', 2: '😢', 1: '😫' };
  const MOOD_LABELS = { 5: '最高', 4: '良い', 3: '普通', 2: '悪い', 1: '最悪' };
  const MOOD_COLORS = { 5: '#f1c40f', 4: '#2ecc71', 3: '#3498db', 2: '#9b59b6', 1: '#e74c3c' };

  let db, auth;
  let currentUser = null;
  let localData = {}; // ローカルキャッシュ
  let calendarMonth = new Date();
  let autoSaveTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== Firebase初期化 =====
  function initFirebase() {
    if (typeof FIREBASE_CONFIG === 'undefined') {
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.innerHTML = '<div style="text-align:center;padding:40px;color:red;font-family:sans-serif">設定ファイルの読み込みに失敗しました<br><small>firebase-config.jsを確認してください</small></div>';
      return false;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    auth = firebase.auth();

    // 認証状態の監視
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        // メール認証が完了しているか確認
        if (!user.emailVerified) {
          showVerifyScreen(user.email);
          return;
        }
        currentUser = user;
        hideLoginScreen();
        showApp();
        await loadAllData();
        await syncStreakToPublic(); // アプリ起動時にウィジェット用データを更新
        setupEventListeners();
        applyTheme();
      } else {
        currentUser = null;
        showLoginScreen();
      }
    });
    return true;
  }

  // ===== ログイン画面制御 =====
  function showLoginScreen() {
    $('#login-screen').style.display = 'flex';
    $('#login-screen').innerHTML = `
      <div class="login-card">
        <div class="login-logo">📔</div>
        <h1 class="login-title">ツヅク日記</h1>
        <p class="login-subtitle">ログインして続ける</p>
        <div class="login-error" id="login-error"></div>
        <div class="form-group">
          <input type="email" class="login-input" id="login-email" placeholder="メールアドレス" autocomplete="email">
        </div>
        <div class="form-group">
          <input type="password" class="login-input" id="login-password" placeholder="パスワード" autocomplete="current-password">
        </div>
        <button class="login-btn" id="login-btn">ログイン</button>
        <button class="signup-btn" id="signup-btn">新規登録</button>
        <div class="login-loading" id="login-loading"><div class="loading-spinner"></div></div>
      </div>`;
    $('#app').classList.add('hidden');
    // イベント再登録
    $('#login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    $('#login-btn').addEventListener('click', handleLogin);
    $('#signup-btn').addEventListener('click', handleSignup);
  }

  function showVerifyScreen(email) {
    const screen = $('#login-screen');
    screen.style.display = 'flex';
    screen.innerHTML = `
      <div class="login-card">
        <div class="login-logo">📧</div>
        <h1 class="login-title" style="font-size:20px">メールを確認してください</h1>
        <p class="login-subtitle" style="margin-bottom:20px">${email} に確認メールを送信しました。<br>メール内のリンクをクリックしてから、下のボタンを押してください。</p>
        <button class="login-btn" id="verify-reload-btn" onclick="location.reload()">確認完了 → 再読み込み</button>
        <button class="signup-btn" id="verify-resend-btn">確認メールを再送する</button>
        <button class="signup-btn" style="margin-top:6px;color:var(--danger);border-color:var(--danger)" onclick="firebase.auth().signOut()">別のアカウントでログイン</button>
      </div>`;
    $('#verify-resend-btn').addEventListener('click', async () => {
      try {
        await auth.currentUser.sendEmailVerification();
        $('#verify-resend-btn').textContent = '送信しました！';
        $('#verify-resend-btn').disabled = true;
      } catch(e) {
        alert('送信に失敗しました。しばらく待ってから再試行してください。');
      }
    });
    $('#app').classList.add('hidden');
  }

  function hideLoginScreen() {
    $('#login-screen').style.display = 'none';
  }

  function showApp() {
    $('#app').classList.remove('hidden');
  }

  function showLoginError(msg) {
    const el = $('#login-error');
    el.textContent = msg;
    el.classList.add('show');
  }

  function hideLoginError() {
    $('#login-error').classList.remove('show');
  }

  function setLoginLoading(show) {
    $('#login-loading').classList.toggle('show', show);
  }

  // ===== 認証処理 =====
  async function handleLogin() {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email || !password) {
      showLoginError('メールアドレスとパスワードを入力してください');
      return;
    }
    hideLoginError();
    setLoginLoading(true);
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      setLoginLoading(false);
      const msg = e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'
        ? 'メールアドレスまたはパスワードが間違っています'
        : 'ログインに失敗しました。もう一度お試しください';
      showLoginError(msg);
    }
  }

  async function handleSignup() {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email || !password) {
      showLoginError('メールアドレスとパスワードを入力してください');
      return;
    }
    if (password.length < 6) {
      showLoginError('パスワードは6文字以上にしてください');
      return;
    }
    hideLoginError();
    setLoginLoading(true);
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      // 確認メールを送信
      await cred.user.sendEmailVerification();
      // 認証状態監視側でshowVerifyScreenに自動で切り替わる
    } catch (e) {
      setLoginLoading(false);
      const msg = e.code === 'auth/email-already-in-use'
        ? 'このメールアドレスはすでに使用されています'
        : '登録に失敗しました。もう一度お試しください';
      showLoginError(msg);
    }
  }

  async function handleLogout() {
    if (!confirm('ログアウトしますか？')) return;
    await auth.signOut();
    localData = {};
  }

  // ===== データ管理（Firestore） =====
  function userRef() {
    return db.collection('users').doc(currentUser.uid).collection('diary_entries');
  }

  function todayStr() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function getLocalISODate(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function showSync(text = '同期中...') {
    const bar = $('#sync-bar');
    if (bar) {
      $('#sync-text').textContent = text;
      bar.classList.add('show');
    }
  }

  function hideSync() {
    const bar = $('#sync-bar');
    if (bar) bar.classList.remove('show');
  }

  // 全データをFirestoreから読み込む
  async function loadAllData() {
    showSync('データを読み込み中...');
    try {
      const snapshot = await userRef().get();
      localData = {};
      snapshot.forEach(doc => {
        localData[doc.id] = doc.data();
      });
    } catch (e) {
      console.error('データ読み込み失敗:', e);
    }
    hideSync();
    loadTodayEntry();
    updateStreak();
  }

  // 今日のデータをFirestoreへ保存
  async function saveTodayToFirestore(entry) {
    if (!currentUser) return;
    showSync('保存中...');
    try {
      await userRef().doc(todayStr()).set(entry);
      localData[todayStr()] = entry;
      // ストリーク情報も更新
      await syncStreakToPublic();
    } catch (e) {
      console.error('保存失敗:', e);
    }
    hideSync();
  }

  // ストリーク用のPublicドキュメントへ書き込み（KWGTウィジェット用）
  async function syncStreakToPublic() {
    if (!currentUser) return;
    
    const streak = calcStreak(localData);
    const isTodayDone = !!localData[todayStr()];
    const weeklyStatus = calcWeeklyStatus(localData);

    try {
      await db.collection('public_streaks').doc(currentUser.uid).set({
        streak,
        is_today_done: isTodayDone,
        weekly: weeklyStatus,
        last_updated: new Date().toISOString()
      });
    } catch (e) {
      // Publicへの書き込みエラーはサイレント
      console.warn('Public streak sync failed:', e);
    }
  }

  // ===== 今日の記録 =====
  function loadTodayEntry() {
    const entry = localData[todayStr()];
    if (!entry) return;

    if (entry.mood) {
      $$('.mood-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mood === String(entry.mood));
      });
    }

    if (entry.tags) {
      $$('.tag-chip').forEach(chip => {
        chip.classList.toggle('active', entry.tags.includes(chip.dataset.tag));
      });
    }

    if (entry.diary) {
      $('#diary-textarea').value = entry.diary;
      $('#char-count').textContent = entry.diary.length + '文字';
    }
  }

  function saveTodayEntry() {
    const mood = $('.mood-btn.active')?.dataset.mood;
    const tags = Array.from($$('.tag-chip.active')).map(c => c.dataset.tag);
    const diary = $('#diary-textarea').value;

    const entry = {
      mood: mood ? parseInt(mood) : null,
      tags,
      diary,
      updatedAt: new Date().toISOString(),
    };

    // ローカルキャッシュに即時反映
    localData[todayStr()] = entry;

    // 自動保存インジケーター（ローカル表示）
    const indicator = $('#auto-save');
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 2000);

    // Firestoreへ非同期保存
    saveTodayToFirestore(entry);

    updateStreak();
  }

  // ===== ストリーク =====
  function calcStreak(data) {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getLocalISODate(d);
      if (data[key]) {
        streak++;
      } else {
        if (i === 0) continue;
        break;
      }
    }
    return streak;
  }

  function calcWeeklyStatus(data) {
    const today = new Date();
    let dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - mondayOffset);
    const weeklyStatus = [];
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(monday);
      targetDate.setDate(monday.getDate() + i);
      const key = getLocalISODate(targetDate);
      weeklyStatus.push(!!data[key]);
    }
    return weeklyStatus;
  }

  function updateStreak() {
    const streak = calcStreak(localData);
    const isTodayDone = !!localData[todayStr()];

    const countEl = $('#streak-count');
    if (countEl) countEl.textContent = streak;

    const fireEl = $('.streak-fire');
    const countTextEl = $('.streak-count');
    const messageEl = $('#streak-message');
    if (fireEl && countTextEl && messageEl) {
      if (isTodayDone) {
        fireEl.classList.add('active');
        countTextEl.classList.add('active');
        messageEl.textContent = '素晴らしい！今日の火が点きました🔥';
      } else {
        fireEl.classList.remove('active');
        countTextEl.classList.remove('active');
        messageEl.textContent = '今日も記録して火を灯そう！';
      }
    }

    updateWeeklyWidget(localData);
  }

  function updateWeeklyWidget(data) {
    const today = new Date();
    let dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - mondayOffset);

    const dayEls = $$('.streak-day');
    if (!dayEls || dayEls.length === 0) return;

    dayEls.forEach((el) => {
      const targetDay = Number(el.dataset.day);
      const targetDate = new Date(monday);
      const addDays = targetDay === 0 ? 6 : targetDay - 1;
      targetDate.setDate(monday.getDate() + addDays);
      const key = getLocalISODate(targetDate);

      el.classList.toggle('today', key === todayStr());
      el.classList.toggle('completed', !!data[key]);
    });
  }

  // ===== カレンダー =====
  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    $('#cal-month').textContent = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = todayStr();

    let html = '';
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="cal-cell empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const targetDate = new Date(year, month, d);
      const dateStr = getLocalISODate(targetDate);
      const entry = localData[dateStr];
      const isToday = dateStr === todayKey;
      const hasEntry = !!entry;

      html += `
        <div class="cal-cell ${isToday ? 'today' : ''} ${hasEntry ? 'has-entry' : ''}" 
             data-date="${dateStr}">
          <span class="cal-date">${d}</span>
          ${entry?.mood ? `<span class="cal-mood">${MOODS[entry.mood]}</span>` : ''}
        </div>
      `;
    }
    $('#calendar-days').innerHTML = html;
  }

  function showPastEntry(dateStr) {
    const entry = localData[dateStr];
    const panel = $('#past-entry');

    if (!entry) {
      panel.classList.add('hidden');
      return;
    }

    const date = new Date(dateStr);
    const formatted = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;

    $('#past-date').textContent = formatted;
    $('#past-mood').textContent = entry.mood ? `${MOODS[entry.mood]} ${MOOD_LABELS[entry.mood]}` : '記録なし';
    $('#past-tags').innerHTML = (entry.tags || []).map(t => `<span class="tag-chip">${t}</span>`).join('');
    $('#past-diary').textContent = entry.diary || '(日記なし)';

    panel.classList.remove('hidden');
  }

  // ===== 統計 =====
  function renderStats() {
    const entries = Object.entries(localData);

    $('#stat-entries').textContent = entries.length;

    let maxStreak = 0;
    let currentStreak = 0;
    const sortedDates = Object.keys(localData).sort();
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) { currentStreak = 1; }
      else {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diff = (curr - prev) / (1000 * 60 * 60 * 24);
        currentStreak = diff === 1 ? currentStreak + 1 : 1;
      }
      maxStreak = Math.max(maxStreak, currentStreak);
    }
    $('#stat-max-streak').textContent = maxStreak;

    const totalChars = entries.reduce((sum, [, e]) => sum + (e.diary?.length || 0), 0);
    $('#stat-total-chars').textContent = totalChars.toLocaleString();

    const moodEntries = entries.filter(([, e]) => e.mood);
    const avgMood = moodEntries.length > 0
      ? (moodEntries.reduce((sum, [, e]) => sum + e.mood, 0) / moodEntries.length).toFixed(1)
      : '-';
    $('#stat-avg-mood').textContent = avgMood !== '-' ? MOODS[Math.round(parseFloat(avgMood))] + ' ' + avgMood : '-';

    drawMoodChart(localData);
    drawMoodPie(localData);
    drawTagRanking(localData);
  }

  function drawMoodChart(data) {
    const canvas = $('#mood-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);
    const w = canvas.offsetWidth;
    const h = 200;
    const pad = { top: 20, right: 20, bottom: 30, left: 40 };

    ctx.clearRect(0, 0, w, h);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const points = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = getLocalISODate(new Date(year, month, d));
      const entry = data[key];
      points.push({ day: d, mood: entry?.mood || null });
    }

    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--text-muted').trim();
    const gridColor = style.getPropertyValue('--border').trim();
    const accentColor = style.getPropertyValue('--accent').trim();

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.fillStyle = textColor;
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    for (let i = 1; i <= 5; i++) {
      const y = pad.top + (h - pad.top - pad.bottom) * (1 - (i - 1) / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(MOODS[i], pad.left - 6, y + 4);
    }

    const validPoints = points.filter(p => p.mood);
    if (validPoints.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    validPoints.forEach((p, i) => {
      const x = pad.left + ((p.day - 1) / (daysInMonth - 1)) * (w - pad.left - pad.right);
      const y = pad.top + (h - pad.top - pad.bottom) * (1 - (p.mood - 1) / 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    validPoints.forEach(p => {
      const x = pad.left + ((p.day - 1) / (daysInMonth - 1)) * (w - pad.left - pad.right);
      const y = pad.top + (h - pad.top - pad.bottom) * (1 - (p.mood - 1) / 4);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = MOOD_COLORS[p.mood];
      ctx.fill();
    });
  }

  function drawMoodPie(data) {
    const canvas = $('#mood-pie');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(canvas.offsetWidth, 250);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, size, size);

    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    Object.values(data).forEach(e => { if (e.mood) counts[e.mood]++; });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return;

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 30;
    let startAngle = -Math.PI / 2;

    [5, 4, 3, 2, 1].forEach(mood => {
      if (counts[mood] === 0) return;
      const slice = (counts[mood] / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + slice);
      ctx.fillStyle = MOOD_COLORS[mood];
      ctx.fill();
      if (slice > 0.3) {
        const mid = startAngle + slice / 2;
        const lx = cx + (r * 0.65) * Math.cos(mid);
        const ly = cy + (r * 0.65) * Math.sin(mid);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(MOODS[mood], lx, ly + 5);
      }
      startAngle += slice;
    });
  }

  function drawTagRanking(data) {
    const tagCounts = {};
    Object.values(data).forEach(e => {
      (e.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

    $('#tag-ranking').innerHTML = sorted.map(([tag, count]) => `
      <div class="tag-rank-item">
        <span>${tag}</span>
        <div class="tag-rank-bar">
          <div class="tag-rank-fill" style="width: ${(count / maxCount) * 100}%"></div>
        </div>
        <span>${count}回</span>
      </div>
    `).join('') || '<p style="color: var(--text-muted); font-size: 13px;">まだデータがありません</p>';
  }

  // ===== テーマ =====
  function applyTheme() {
    const theme = localStorage.getItem('tsuzuku-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    $('#theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('tsuzuku-theme', next);
    $('#theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
  }

  // ===== イベント =====
  function setupEventListeners() {
    // ログアウト
    $('#logout-btn').addEventListener('click', handleLogout);

    // ナビゲーション
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $$('.view').forEach(v => v.classList.remove('active'));
        $(`#view-${btn.dataset.view}`).classList.add('active');
        if (btn.dataset.view === 'calendar') renderCalendar();
        if (btn.dataset.view === 'stats') renderStats();
      });
    });

    // 気分ボタン
    $$('.mood-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.mood-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        saveTodayEntry();
      });
    });

    // タグ
    $('#tag-list').addEventListener('click', (e) => {
      const chip = e.target.closest('.tag-chip');
      if (!chip) return;
      chip.classList.toggle('active');
      saveTodayEntry();
    });

    // カスタムタグ
    $('#custom-tag-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        const tag = e.target.value.trim();
        const chip = document.createElement('button');
        chip.className = 'tag-chip active';
        chip.dataset.tag = tag;
        chip.textContent = tag;
        chip.addEventListener('click', () => {
          chip.classList.toggle('active');
          saveTodayEntry();
        });
        $('#tag-list').appendChild(chip);
        e.target.value = '';
        saveTodayEntry();
      }
    });

    // 日記テキスト（自動保存）
    $('#diary-textarea').addEventListener('input', () => {
      const len = $('#diary-textarea').value.length;
      $('#char-count').textContent = len + '文字';
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(saveTodayEntry, 800);
    });

    // カレンダーナビ
    $('#cal-prev').addEventListener('click', () => {
      calendarMonth.setMonth(calendarMonth.getMonth() - 1);
      renderCalendar();
    });
    $('#cal-next').addEventListener('click', () => {
      calendarMonth.setMonth(calendarMonth.getMonth() + 1);
      renderCalendar();
    });

    // カレンダーセルクリック
    $('#calendar-days').addEventListener('click', (e) => {
      const cell = e.target.closest('.cal-cell');
      if (!cell || cell.classList.contains('empty')) return;
      showPastEntry(cell.dataset.date);
    });

    $('#close-past').addEventListener('click', () => {
      $('#past-entry').classList.add('hidden');
    });

    // テーマ
    $('#theme-toggle').addEventListener('click', toggleTheme);
  }

  // ===== ログインボタンのイベント（DOMContentLoaded後に登録） =====
  document.addEventListener('DOMContentLoaded', () => {
    // Enterキーでログイン
    $('#login-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
    $('#login-btn').addEventListener('click', handleLogin);
    $('#signup-btn').addEventListener('click', handleSignup);

    // Firebase初期化
    if (!initFirebase()) {
      $('#login-screen').innerHTML = '<div style="text-align:center;padding:40px;color:red">設定ファイルの読み込みに失敗しました</div>';
    }
  });
})();
