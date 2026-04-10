// app.js - ツヅク日記 メインロジック

(function() {
  'use strict';

  const DATA_KEY = 'tsuzuku-diary-data';
  const MOODS = { 5: '😆', 4: '😊', 3: '😐', 2: '😢', 1: '😫' };
  const MOOD_LABELS = { 5: '最高', 4: '良い', 3: '普通', 2: '悪い', 1: '最悪' };
  const MOOD_COLORS = { 5: '#f1c40f', 4: '#2ecc71', 3: '#3498db', 2: '#9b59b6', 1: '#e74c3c' };

  let calendarMonth = new Date();
  let autoSaveTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== データ管理 =====
  function getAll() {
    try { return JSON.parse(localStorage.getItem(DATA_KEY) || '{}'); }
    catch { return {}; }
  }

  function getEntry(dateStr) {
    return getAll()[dateStr] || null;
  }

  function saveEntry(dateStr, entry) {
    const data = getAll();
    data[dateStr] = entry;
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  }

  function getLocalISODate(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function todayStr() {
    return getLocalISODate(new Date());
  }

  // ===== 初期化 =====
  function init() {
    setupEventListeners();
    loadTodayEntry();
    updateStreak();
    applyTheme();
  }

  // ===== 今日の記録 =====
  function loadTodayEntry() {
    const entry = getEntry(todayStr());
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

    saveEntry(todayStr(), {
      mood: mood ? parseInt(mood) : null,
      tags,
      diary,
      updatedAt: new Date().toISOString(),
    });

    // 自動保存インジケーター
    const indicator = $('#auto-save');
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 2000);
  }

  // ===== ストリーク =====
  function updateStreak() {
    const data = getAll();
    let streak = 0;
    const today = new Date();
    
    const isTodayDone = !!data[todayStr()];

    // ストリーク計算 (今日やっていなくても作日はやっていれば継続中とする)
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getLocalISODate(d);
      
      if (data[key]) {
        streak++;
      } else {
        if (i === 0) continue; // 今日まだでもストリークは途切れない
        break;
      }
    }

    const countEl = $('#streak-count');
    if (countEl) countEl.textContent = streak;
    
    // 今日の状況に応じて火を点ける
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

    updateWeeklyWidget(data);
  }

  function updateWeeklyWidget(data) {
    const today = new Date();
    let dayOfWeek = today.getDay();
    // 月曜始まり (月=0, 火=1, ... 日=6)
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
      
      // 今日の日付なら .today 付与
      if (key === todayStr()) {
        el.classList.add('today');
      } else {
        el.classList.remove('today');
      }

      // 記録があれば .completed 付与
      if (data[key]) {
        el.classList.add('completed');
      } else {
        el.classList.remove('completed');
      }
    });
  }

  // ===== カレンダー =====
  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    $('#cal-month').textContent = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const data = getAll();
    const todayKey = todayStr();

    let html = '';

    // 空セル
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="cal-cell empty"></div>';
    }

    // 日セル
    for (let d = 1; d <= daysInMonth; d++) {
      const targetDate = new Date(year, month, d);
      const dateStr = getLocalISODate(targetDate);
      const entry = data[dateStr];
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
    const entry = getEntry(dateStr);
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
    const data = getAll();
    const entries = Object.entries(data);

    // 基本統計
    $('#stat-entries').textContent = entries.length;

    // 最長ストリーク
    let maxStreak = 0;
    let currentStreak = 0;
    const sortedDates = Object.keys(data).sort();
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

    // 総文字数
    const totalChars = entries.reduce((sum, [, e]) => sum + (e.diary?.length || 0), 0);
    $('#stat-total-chars').textContent = totalChars.toLocaleString();

    // 平均気分
    const moodEntries = entries.filter(([, e]) => e.mood);
    const avgMood = moodEntries.length > 0
      ? (moodEntries.reduce((sum, [, e]) => sum + e.mood, 0) / moodEntries.length).toFixed(1)
      : '-';
    $('#stat-avg-mood').textContent = avgMood !== '-' ? MOODS[Math.round(parseFloat(avgMood))] + ' ' + avgMood : '-';

    // グラフ
    drawMoodChart(data);
    drawMoodPie(data);
    drawTagRanking(data);
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

    // グリッド
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

    // 折れ線
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

    // ドット
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
    Object.values(data).forEach(e => {
      if (e.mood) counts[e.mood]++;
    });

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

      // ラベル
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
    const theme = localStorage.getItem('tsuzuku-theme') || 'light';
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
        updateStreak();
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
      autoSaveTimer = setTimeout(() => {
        saveTodayEntry();
        updateStreak();
      }, 500);
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

  document.addEventListener('DOMContentLoaded', init);
})();
