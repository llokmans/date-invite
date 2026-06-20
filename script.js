/**
 * Cinematic Date Invitation Engine
 * Hardened: mobile audio fix + silent EmailJS + bindConfirm cleanup
 */

;(function () {
  'use strict';

  /* ════════════════════════════════════════
     AMBIENT PARTICLES
  ════════════════════════════════════════ */
  (function initParticles() {
    const canvas = document.getElementById('particles');
    const ctx    = canvas.getContext('2d');
    let W, H, particles = [];

    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const COLORS = [
      'rgba(201,168,76,',
      'rgba(232,201,122,',
      'rgba(237,224,200,',
      'rgba(178,35,64,',
    ];

    function createParticle() {
      return {
        x:       Math.random() * W,
        y:       Math.random() * H,
        r:       0.6 + Math.random() * 1.6,
        vx:      (Math.random() - 0.5) * 0.18,
        vy:     -(0.08 + Math.random() * 0.22),
        ta:      0.3 + Math.random() * 0.55,
        color:   COLORS[Math.floor(Math.random() * COLORS.length)],
        life:    0,
        maxLife: 200 + Math.random() * 300,
      };
    }

    for (let i = 0; i < 55; i++) {
      const p = createParticle();
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach((p, i) => {
        p.life++;
        const progress = p.life / p.maxLife;
        const alpha = progress < 0.2
          ? (progress / 0.2) * p.ta
          : progress > 0.75
            ? ((1 - progress) / 0.25) * p.ta
            : p.ta;
        p.x += p.vx;
        p.y += p.vy;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + alpha + ')';
        ctx.fill();
        if (p.life >= p.maxLife) {
          particles[i] = createParticle();
          particles[i].y = H + 10;
        }
      });
      requestAnimationFrame(tick);
    }
    tick();
  })();


  /* ════════════════════════════════════════
     SOFT PIANO AUDIO ENGINE
     Mobile fix: AudioContext created synchronously
     on first gesture, not in a callback chain.
  ════════════════════════════════════════ */
  let audioCtx     = null;
  let musicStarted = false;
  let musicStopped = false;
  let masterGain   = null;
  let reverbNode   = null;

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function buildReverb(ctx) {
    const conv   = ctx.createConvolver();
    const length = ctx.sampleRate * 3.2;
    const buf    = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 1.8);
        d[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    conv.buffer = buf;
    return conv;
  }

  const BEAT = 1.15;
  const MELODY = [
    [61, 1.0], [64, 1.0], [68, 2.5], [null, 2.0],
    [66, 1.0], [64, 1.0], [61, 3.5], [null, 1.5],
    [61, 0.75], [63, 0.75], [66, 0.75], [68, 2.5], [null, 1.5],
    [66, 1.0], [63, 1.0], [59, 1.0], [61, 3.5], [null, 3.0],
  ];

  const LOOP_DURATION = MELODY.reduce((sum, [, d]) => sum + d * BEAT, 0);

  function scheduleNote(midi, t, dur) {
    const hz      = midiToHz(midi);
    const sustain = Math.max(dur * BEAT * 1.8, 4.0);
    const attack  = 0.012;

    function layer(freq, type, peak, decayMul) {
      const osc  = audioCtx.createOscillator();
      const gDry = audioCtx.createGain();
      const gWet = audioCtx.createGain();

      osc.type            = type;
      osc.frequency.value = freq;
      osc.detune.value    = (Math.random() - 0.5) * 6;

      osc.connect(gDry);
      gDry.connect(masterGain);
      gDry.gain.setValueAtTime(0, t);
      gDry.gain.linearRampToValueAtTime(peak, t + attack);
      gDry.gain.setValueAtTime(peak * 0.7, t + attack + 0.05);
      gDry.gain.exponentialRampToValueAtTime(0.0001, t + sustain * decayMul);

      osc.connect(gWet);
      gWet.connect(reverbNode);
      gWet.gain.setValueAtTime(0, t);
      gWet.gain.linearRampToValueAtTime(peak * 0.4, t + attack);
      gWet.gain.exponentialRampToValueAtTime(0.0001, t + sustain * decayMul * 1.3);

      osc.start(t);
      osc.stop(t + sustain * decayMul + 0.2);
    }

    layer(hz,      'sine',     0.26, 1.0);
    layer(hz * 2,  'sine',     0.07, 0.6);
    layer(hz / 2,  'triangle', 0.05, 0.5);
  }

  function scheduleMelody(startTime) {
    if (!audioCtx || musicStopped) return;
    let t = startTime;
    MELODY.forEach(([midi, dur]) => {
      const noteDur = dur * BEAT;
      if (midi !== null) {
        const jitter = (Math.random() - 0.5) * 0.028;
        scheduleNote(midi, t + jitter, dur);
      }
      t += noteDur;
    });
    if (!musicStopped) {
      const delay = (startTime + LOOP_DURATION - audioCtx.currentTime - 0.2) * 1000;
      setTimeout(() => {
        if (!musicStopped) scheduleMelody(audioCtx.currentTime + 0.05);
      }, Math.max(0, delay));
    }
  }

  /**
   * MOBILE FIX:
   * Create the AudioContext synchronously right here.
   * Call this directly inside a user gesture handler (touchstart/click)
   * before any async code runs. This is what Safari and Chrome on mobile require.
   */
  function unlockAudio() {
    if (audioCtx) return; // already created
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
      console.warn('AudioContext creation failed:', e);
      return;
    }
  }

  function startMusic() {
    if (musicStarted) return;
    if (!audioCtx) return; // safety — should never happen after unlockAudio()
    musicStarted = true;

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioCtx.destination);

    reverbNode = buildReverb(audioCtx);
    const wetOut = audioCtx.createGain();
    wetOut.gain.value = 0.5;
    reverbNode.connect(wetOut);
    wetOut.connect(masterGain);

    // Resume in case browser suspended it (common on iOS)
    const doStart = () => {
      masterGain.gain.linearRampToValueAtTime(0.75, audioCtx.currentTime + 3.0);
      scheduleMelody(audioCtx.currentTime + 0.3);
    };

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(doStart).catch(e => console.warn('Audio resume failed:', e));
    } else {
      doStart();
    }
  }

  function stopMusic() {
    if (!audioCtx || musicStopped) return;
    musicStopped = true;
    masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2.5);
    setTimeout(() => { try { audioCtx.suspend(); } catch(e) {} }, 2600);
  }


  /* ════════════════════════════════════════
     ROSE PETALS
  ════════════════════════════════════════ */
  function startRosePetals() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;width:100%;height:100%;';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    });

    const PETAL_COLORS = ['#c0394e','#a8253a','#d4556a','#e87a8a','#b83050','#f0a0b0','#c9a84c'];
    const petals = [];

    function createPetal() {
      return {
        x:       Math.random() * W,
        y:       -(20 + Math.random() * 80),
        w:       8  + Math.random() * 14,
        h:       5  + Math.random() * 8,
        vx:      (Math.random() - 0.5) * 1.2,
        vy:      1.2 + Math.random() * 2.2,
        angle:   Math.random() * Math.PI * 2,
        spin:    (Math.random() - 0.5) * 0.06,
        sway:    Math.random() * Math.PI * 2,
        swayAmt: 0.4 + Math.random() * 0.8,
        color:   PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
        alpha:   0.7 + Math.random() * 0.3,
        delay:   Math.random() * 120,
        active:  false,
      };
    }

    for (let i = 0; i < 90; i++) petals.push(createPetal());
    let frame = 0, running = true;

    function lighten(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&0xff)+amt)},${Math.min(255,(n&0xff)+amt)})`;
    }

    function drawPetal(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.w/2, p.h/2, 0, 0, Math.PI*2);
      const grad = ctx.createRadialGradient(-p.w*0.1,-p.h*0.1,0,p.w*0.3,p.h*0.3,p.w*0.7);
      grad.addColorStop(0, lighten(p.color, 30));
      grad.addColorStop(1, p.color);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      frame++;
      let allGone = true;

      petals.forEach(p => {
        if (frame < p.delay) { allGone = false; return; }
        p.active = true;
        p.x     += p.vx + Math.sin(p.sway) * p.swayAmt;
        p.y     += p.vy;
        p.sway  += 0.03;
        p.angle += p.spin;
        if (p.y > H * 0.8) p.alpha = Math.max(0, p.alpha - 0.012);
        if (p.y < H + 30 && p.alpha > 0) { allGone = false; drawPetal(p); }
      });

      if (allGone && frame > 200) {
        running = false;
        canvas.style.transition = 'opacity 1s ease';
        canvas.style.opacity = '0';
        setTimeout(() => canvas.remove(), 1100);
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
  }


  /* ════════════════════════════════════════
     STATE ENGINE NAVIGATION
  ════════════════════════════════════════ */
  const screens = {
    envelope: document.getElementById('screen-envelope'),
    scenes:   document.getElementById('screen-scenes'),
    question: document.getElementById('screen-question'),
  };

  function transitionTo(nextKey, delay) {
    delay = delay || 0;
    const current = document.querySelector('.screen.active');
    if (!current) return;
    setTimeout(() => {
      current.classList.add('exit');
      current.classList.remove('active');
      setTimeout(() => {
        current.classList.remove('exit');
        screens[nextKey].classList.add('active');
      }, 900);
    }, delay);
  }


  /* ════════════════════════════════════════
     SCREEN 1: ENVELOPE
  ════════════════════════════════════════ */
  (function initEnvelope() {
    const sealBtn  = document.getElementById('sealBtn');
    const envelope = document.querySelector('.envelope');
    const hint     = document.querySelector('.envelope-hint');
    let triggered  = false;

    // MOBILE FIX: unlock audio synchronously on touchstart
    // This must happen before any async code in the same gesture
    sealBtn.addEventListener('touchstart', function(e) {
      unlockAudio(); // synchronous — creates AudioContext right here in the gesture
    }, { passive: true });

    sealBtn.addEventListener('click', open);
    sealBtn.addEventListener('touchend', function(e) {
      e.preventDefault();
      open();
    }, { passive: false });

    function open() {
      if (triggered) return;
      triggered = true;

      // Unlock and start music (desktop path — click)
      unlockAudio();
      startMusic();

      sealBtn.classList.add('cracked');
      if (hint) { hint.style.transition = 'opacity 0.4s ease'; hint.style.opacity = '0'; }
      setTimeout(() => envelope.classList.add('opening'), 300);
      transitionTo('scenes', 1200);
      setTimeout(() => initScenes(), 1200);
    }
  })();


  /* ════════════════════════════════════════
     SCREEN 2: STORY CINEMATICS
  ════════════════════════════════════════ */
  const SCENES = [
    "Hey…\nI've been meaning to ask you something.",
    "I know this will sound crazy, but... I have been thinking...",
    "Damn..",
    "Why is this so hard...?",
    "I don't even know how to say this... but I just have to ask.",
    "Something..\nsomething important…",
  ];

  function initScenes() {
    const sceneText = document.getElementById('sceneText');
    const cursor    = document.getElementById('cursor');
    const nextBtn   = document.getElementById('nextBtn');
    const dotsWrap  = document.getElementById('progressDots');
    let current = 0;
    let typing  = false;

    SCENES.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'dot' + (i === 0 ? ' current' : '');
      dotsWrap.appendChild(dot);
    });

    function getDots() { return dotsWrap.querySelectorAll('.dot'); }

    function updateDots(idx) {
      getDots().forEach((dot, i) => {
        dot.classList.remove('current', 'done');
        if (i < idx)   dot.classList.add('done');
        if (i === idx) dot.classList.add('current');
      });
    }

    function typeText(text) {
      typing = true;
      sceneText.textContent = '';
      sceneText.classList.remove('visible');
      cursor.classList.remove('hidden');
      nextBtn.classList.remove('visible');

      setTimeout(() => {
        sceneText.classList.add('visible');
        let i = 0;
        function typeChar() {
          if (i < text.length) {
            if (text[i] === '\n') sceneText.appendChild(document.createElement('br'));
            else sceneText.appendChild(document.createTextNode(text[i]));
            i++;
            setTimeout(typeChar, 75 + (Math.random() * 40 - 10));
          } else {
            typing = false;
            cursor.classList.add('hidden');
            setTimeout(() => nextBtn.classList.add('visible'), 350);
          }
        }
        typeChar();
      }, 200);
    }

    function showScene(idx) {
      if (idx >= SCENES.length) {
        transitionTo('question', 200);
        setTimeout(() => initQuestion(), 1200);
        return;
      }
      updateDots(idx);
      sceneText.classList.remove('visible');
      cursor.classList.remove('hidden');
      nextBtn.classList.remove('visible');
      setTimeout(() => typeText(SCENES[idx]), 400);
    }

    nextBtn.addEventListener('click', advance);
    nextBtn.addEventListener('touchend', function(e) {
      e.preventDefault();
      advance();
    }, { passive: false });

    document.getElementById('sceneStage').addEventListener('click', function() {
      if (!typing) advance();
    });

    function advance() {
      if (typing) return;
      current++;
      showScene(current);
    }
    showScene(0);
  }


  /* ════════════════════════════════════════
     SCREEN 3: THE MAIN QUESTION & DATE PICKER
  ════════════════════════════════════════ */
  function initQuestion() {
    const wrap      = document.getElementById('questionWrap');
    const headline  = document.getElementById('questionHeadline');
    const btnYes    = document.getElementById('btnYes');
    const btnNo     = document.getElementById('btnNo');
    const celebrate = document.getElementById('celebration');

    headline.innerHTML = 'Will you go on a<br><em>date</em> with me?';
    setTimeout(() => wrap.classList.add('risen'), 200);

    btnYes.addEventListener('click', handleYes);
    btnYes.addEventListener('touchend', function(e) {
      e.preventDefault();
      handleYes();
    }, { passive: false });

    let yesFired = false;

    function handleYes() {
      if (yesFired) return;
      yesFired = true;
      stopMusic();

      wrap.style.transition    = 'opacity 0.6s ease';
      wrap.style.opacity       = '0';
      wrap.style.pointerEvents = 'none';

      fireSparks();
      setTimeout(() => startRosePetals(), 300);
      setTimeout(() => showDatePicker(), 1800);
    }

    function showDatePicker() {
      const old = document.getElementById('datePickerWrap');
      if (old) old.remove();

      const dpWrap = document.createElement('div');
      dpWrap.id = 'datePickerWrap';

      let viewYear     = new Date().getFullYear();
      let viewMonth    = new Date().getMonth();
      let selectedDate = null;
      let selectedTime = null;

      const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const DAYS     = ['Su','Mo','Tu','We','Th','Fr','Sa'];
      const TIME_SLOTS = ['12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM'];

      function renderCalendar() {
        const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const today       = new Date(); today.setHours(0,0,0,0);
        let cells = '';
        DAYS.forEach(d => { cells += `<div class="dp-day-hdr">${d}</div>`; });
        for (let i = 0; i < firstDay; i++) cells += '<div></div>';
        for (let d = 1; d <= daysInMonth; d++) {
          const thisDate   = new Date(viewYear, viewMonth, d);
          const isPast     = thisDate < today;
          const isSelected = selectedDate &&
            selectedDate.getFullYear() === viewYear &&
            selectedDate.getMonth()    === viewMonth &&
            selectedDate.getDate()     === d;
          cells += `<div class="dp-cell${isPast ? ' dp-past' : ''}${isSelected ? ' dp-selected' : ''}" data-day="${d}" data-past="${isPast}">${d}</div>`;
        }
        return `
          <div class="dp-cal-header">
            <button class="dp-nav" id="dpPrev">&#8592;</button>
            <span class="dp-month-label">${MONTHS[viewMonth]} ${viewYear}</span>
            <button class="dp-nav" id="dpNext">&#8594;</button>
          </div>
          <div class="dp-grid">${cells}</div>`;
      }

      function renderTimeSlots() {
        return TIME_SLOTS.map(t =>
          `<button class="dp-time${selectedTime === t ? ' dp-time-selected' : ''}" data-time="${t}">${t}</button>`
        ).join('');
      }

      function renderConfirm() {
        const ready = selectedDate && selectedTime;
        const label = ready
          ? `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()} · ${selectedTime}`
          : 'Pick a date and time above';
        return `
          <div class="dp-summary${ready ? ' dp-summary-ready' : ''}">${label}</div>
          <button class="dp-confirm${ready ? ' dp-confirm-ready' : ''}" id="dpConfirm" ${ready ? '' : 'disabled'}>
            Confirm ❤️
          </button>`;
      }

      function render() {
        dpWrap.innerHTML = `
          <div class="dp-inner">
            <p class="dp-eyebrow">— when are you free? —</p>
            <div class="dp-cal" id="dpCal">${renderCalendar()}</div>
            <div class="dp-time-wrap" id="dpTimeWrap">${renderTimeSlots()}</div>
            <div class="dp-confirm-wrap" id="dpConfirmWrap">${renderConfirm()}</div>
          </div>`;

        dpWrap.querySelector('#dpPrev').addEventListener('click', () => {
          viewMonth--;
          if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          dpWrap.querySelector('#dpCal').innerHTML = renderCalendar();
          bindCalCells();
        });

        dpWrap.querySelector('#dpNext').addEventListener('click', () => {
          viewMonth++;
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          dpWrap.querySelector('#dpCal').innerHTML = renderCalendar();
          bindCalCells();
        });

        bindCalCells();
        bindTimeCells();
      }

      function bindCalCells() {
        dpWrap.querySelectorAll('.dp-cell').forEach(cell => {
          if (cell.dataset.past === 'true') return;
          cell.addEventListener('click', () => {
            selectedDate = new Date(viewYear, viewMonth, parseInt(cell.dataset.day));
            dpWrap.querySelector('#dpCal').innerHTML = renderCalendar();
            bindCalCells();
            dpWrap.querySelector('#dpConfirmWrap').innerHTML = renderConfirm();
            bindConfirmBtn();
          });
        });
      }

      function bindTimeCells() {
        dpWrap.querySelectorAll('.dp-time').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedTime = btn.dataset.time;
            dpWrap.querySelectorAll('.dp-time').forEach(b => b.classList.remove('dp-time-selected'));
            btn.classList.add('dp-time-selected');
            dpWrap.querySelector('#dpConfirmWrap').innerHTML = renderConfirm();
            bindConfirmBtn();
          });
        });
      }

      // Clean name — no collision with window globals
      function bindConfirmBtn() {
        const btn = dpWrap.querySelector('#dpConfirm');
        if (!btn || btn.disabled) return;
        btn.addEventListener('click', () => {
          triggerFinalDelivery(selectedDate, selectedTime, MONTHS, WEEKDAYS);
        });
      }

      render();
      document.getElementById('screen-question').appendChild(dpWrap);
      requestAnimationFrame(() => requestAnimationFrame(() => dpWrap.classList.add('dp-visible')));
    }

    function triggerFinalDelivery(date, time, MONTHS, WEEKDAYS) {
      const picker = document.getElementById('datePickerWrap');
      if (picker) {
        picker.style.transition = 'opacity 0.6s ease';
        picker.style.opacity    = '0';
        setTimeout(() => picker.remove(), 700);
      }

      const dateStr  = `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()} · ${time}`;
      const text     = document.getElementById('finalText');
      text.innerHTML = `${dateStr}<br><br><em>I'll pick you up!</em>`;
      setTimeout(() => document.getElementById('finalMsg').classList.add('show'), 500);

      // EmailJS — silent send, no alert() breaking the mood
      const templateParams = {
        name:    'Your Crush',
        message: 'She said YES! The date is locked in for: ' + dateStr,
      };

      emailjs.send('service_b73vtwk', 'contact', templateParams)
        .then(() => {
          console.log('EmailJS: notification sent successfully.');
        })
        .catch((err) => {
          console.warn('EmailJS: send failed:', err);
          // Silent fail — her experience is unaffected even if email doesn't send
        });
    }

    function fireSparks() {
      const cx     = window.innerWidth  / 2;
      const cy     = window.innerHeight / 2;
      const colors = ['#e8c97a','#c9a84c','#b22340','#f5dda0','#ffffff'];

      for (let i = 0; i < 60; i++) {
        const spark = document.createElement('div');
        spark.className = 'spark';
        const angle = Math.random() * Math.PI * 2;
        const dist  = 120 + Math.random() * 260;
        const size  = 4 + Math.random() * 8;
        spark.style.cssText = `
          left: ${cx}px; top: ${cy}px;
          width: ${size}px; height: ${size}px;
          background: ${colors[Math.floor(Math.random() * colors.length)]};
          --dx: ${Math.cos(angle) * dist}px;
          --dy: ${Math.sin(angle) * dist}px;
          animation-delay: ${Math.random() * 0.3}s;
          animation-duration: ${0.9 + Math.random() * 0.5}s;
          filter: blur(${Math.random() > 0.5 ? '0' : '1px'});
          box-shadow: 0 0 ${size * 2}px currentColor;`;
        celebrate.appendChild(spark);
      }
      setTimeout(() => { celebrate.innerHTML = ''; }, 2500);
    }

    /* ── no (runaway) ── */
    const taunts = [
      'really?', 'are you sure?', 'try again.',
      'that button is lying.', 'it knows the truth.',
      'nice try though.', 'exhausted yet?', 'the yes button misses you.',
    ];

    let tauntEl = document.getElementById('taunt');
    if (!tauntEl) {
      tauntEl = document.createElement('div');
      tauntEl.id = 'taunt';
      document.body.appendChild(tauntEl);
    }

    let dodges = 0, fled = false, isHome = true;
    let homeTop = 0, homeLeft = 0, returnTimer = null;

    function showTaunt(txt) {
      tauntEl.textContent = txt;
      tauntEl.classList.add('show');
      clearTimeout(tauntEl._t);
      tauntEl._t = setTimeout(() => tauntEl.classList.remove('show'), 1700);
    }

    function goHome() {
      btnNo.style.top  = homeTop  + 'px';
      btnNo.style.left = homeLeft + 'px';
      isHome = true;
    }

    function dodge() {
      if (!isHome) return;
      isHome = false;
      clearTimeout(returnTimer);
      dodges++;

      if (!fled) {
        const r  = btnNo.getBoundingClientRect();
        homeTop  = r.top;
        homeLeft = r.left;
        btnNo.style.top  = homeTop  + 'px';
        btnNo.style.left = homeLeft + 'px';
        btnNo.classList.add('fleeing');
        fled = true;
        void btnNo.offsetWidth;
      }

      const margin = 16;
      const w    = btnNo.offsetWidth;
      const newX = margin + Math.random() * Math.max(0, window.innerWidth  - w - margin * 2);
      const newY = margin + Math.random() * Math.max(0, window.innerHeight - btnNo.offsetHeight - margin * 2);

      btnNo.style.left     = newX + 'px';
      btnNo.style.top      = newY + 'px';
      const shrink         = Math.max(0.6, 1 - dodges * 0.04);
      btnNo.style.fontSize = Math.max(10, 16 * shrink) + 'px';
      btnNo.style.padding  = (14 * shrink) + 'px ' + (28 * shrink) + 'px';
      btnNo.style.opacity  = Math.max(0.3, 1 - dodges * 0.06);
      btnNo.textContent    = dodges > 3 ? 'no?' : 'No';

      showTaunt(taunts[Math.min(dodges - 1, taunts.length - 1)]);
      returnTimer = setTimeout(goHome, 900);
    }

    btnNo.addEventListener('mouseenter', dodge);
    btnNo.addEventListener('touchstart', function(e) {
      e.preventDefault();
      dodge();
    }, { passive: false });
    btnNo.addEventListener('click', function(e) {
      e.preventDefault();
      dodge();
    });
  }

  // EmailJS init
  emailjs.init('P0N1mVYMaYicQ25OA');

})();