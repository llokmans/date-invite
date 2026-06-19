/**
 * Cinematic Date Invitation
 * State machine: envelope → scenes → question
 * Additions: Music box melody (Web Audio API) + rose petal canvas on Yes
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
     SOFT PIANO  (Web Audio API)
     Slow, emotional, few notes — lots of silence.
     Three layers per note: fundamental + warm harmonic + deep bass resonance.
     Long reverb tail so notes breathe into each other.
     Starts on first interaction, loops until Yes.
  ════════════════════════════════════════ */
  let audioCtx     = null;
  let musicStarted = false;
  let musicStopped = false;
  let masterGain   = null;
  let reverbNode   = null;

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Long hall reverb — piano needs space to breathe
  function buildReverb(ctx) {
    const conv   = ctx.createConvolver();
    const length = ctx.sampleRate * 3.2; // 3.2s tail — large, warm room
    const buf    = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // early reflections stronger, late tail soft
        const decay = Math.pow(1 - i / length, 1.8);
        d[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    conv.buffer = buf;
    return conv;
  }

  // Piano melody — slow, sparse, emotional
  // C# minor / E major — naturally melancholic and tender
  // [midi, beats]   null = silence   BEAT = 1.15s (~52 bpm, very slow)
  const BEAT = 1.15;
  const MELODY = [
    // opening — three notes, then silence to let them ring
    [61, 1.0], [64, 1.0], [68, 2.5],
    [null, 2.0],

    // second phrase — step down, one note held long
    [66, 1.0], [64, 1.0], [61, 3.5],
    [null, 1.5],

    // third phrase — rises with hope
    [61, 0.75], [63, 0.75], [66, 0.75], [68, 2.5],
    [null, 1.5],

    // fourth phrase — resolves gently downward
    [66, 1.0], [63, 1.0], [59, 1.0], [61, 3.5],
    [null, 3.0], // long silence before loop — feels like a breath
  ];

  const LOOP_DURATION = MELODY.reduce((sum, [, d]) => sum + d * BEAT, 0);

  /**
   * One piano note = three oscillator layers:
   *   1. Fundamental  (sine)     — the main pitch, soft attack, long sustain
   *   2. 2nd harmonic (sine ×2)  — adds brightness, quieter
   *   3. Bass body    (triangle) — one octave down, very soft, felt not heard
   *
   * Piano attack: slightly slower than a music box (8–12ms) — key pressing a hammer
   * Piano decay:  long and natural — sustain pedal feel
   */
  function scheduleNote(midi, t, dur) {
    const hz      = midiToHz(midi);
    const sustain = Math.max(dur * BEAT * 1.8, 4.0); // notes ring well past their beat
    const attack  = 0.012;                            // soft hammer attack

    function layer(freq, type, peak, decayMul) {
      const osc  = audioCtx.createOscillator();
      const gDry = audioCtx.createGain();
      const gWet = audioCtx.createGain();

      osc.type            = type;
      osc.frequency.value = freq;
      // very slight detune per note — piano strings are never perfectly tuned
      osc.detune.value    = (Math.random() - 0.5) * 6;

      // dry signal
      osc.connect(gDry);
      gDry.connect(masterGain);
      gDry.gain.setValueAtTime(0, t);
      gDry.gain.linearRampToValueAtTime(peak, t + attack);
      gDry.gain.setValueAtTime(peak * 0.7, t + attack + 0.05); // slight initial drop (piano characteristic)
      gDry.gain.exponentialRampToValueAtTime(0.0001, t + sustain * decayMul);

      // reverb send
      osc.connect(gWet);
      gWet.connect(reverbNode);
      gWet.gain.setValueAtTime(0, t);
      gWet.gain.linearRampToValueAtTime(peak * 0.4, t + attack);
      gWet.gain.exponentialRampToValueAtTime(0.0001, t + sustain * decayMul * 1.3);

      osc.start(t);
      osc.stop(t + sustain * decayMul + 0.2);
    }

    layer(hz,      'sine',     0.26, 1.0);   // fundamental
    layer(hz * 2,  'sine',     0.07, 0.6);   // 2nd harmonic (brightness)
    layer(hz / 2,  'triangle', 0.05, 0.5);   // bass body (warmth)
  }

  function scheduleMelody(startTime) {
    if (!audioCtx || musicStopped) return;

    let t = startTime;
    MELODY.forEach(([midi, dur]) => {
      const noteDur = dur * BEAT;
      if (midi !== null) {
        // humanise timing slightly — no two notes land exactly on the grid
        const jitter = (Math.random() - 0.5) * 0.028;
        scheduleNote(midi, t + jitter, dur);
      }
      t += noteDur;
    });

    // reschedule loop just before end
    if (!musicStopped) {
      const delay = (startTime + LOOP_DURATION - audioCtx.currentTime - 0.2) * 1000;
      setTimeout(() => {
        if (!musicStopped) scheduleMelody(audioCtx.currentTime + 0.05);
      }, Math.max(0, delay));
    }
  }

  function startMusic() {
    if (musicStarted) return;
    musicStarted = true;

    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioCtx.destination);

    reverbNode = buildReverb(audioCtx);
    const wetOut = audioCtx.createGain();
    wetOut.gain.value = 0.5; // generous reverb mix — piano lives in the room
    reverbNode.connect(wetOut);
    wetOut.connect(masterGain);

    if (audioCtx.state === 'suspended') audioCtx.resume();

    // fade in slowly — piano enters like someone sitting down quietly
    masterGain.gain.linearRampToValueAtTime(0.75, audioCtx.currentTime + 3.0);

    scheduleMelody(audioCtx.currentTime + 0.3);
  }

  function stopMusic() {
    if (!audioCtx || musicStopped) return;
    musicStopped = true;
    masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2.5);
    setTimeout(() => audioCtx.suspend(), 2600);
  }

  // start on first interaction (browser requires gesture before AudioContext)
  function onFirstInteraction() {
    startMusic();
    document.removeEventListener('click',      onFirstInteraction);
    document.removeEventListener('touchstart', onFirstInteraction);
  }
  document.addEventListener('click',      onFirstInteraction);
  document.addEventListener('touchstart', onFirstInteraction, { passive: true });


  /* ════════════════════════════════════════
     ROSE PETALS  (canvas overlay)
  ════════════════════════════════════════ */
  function startRosePetals() {
    // create a full-screen canvas above everything
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      position: fixed; inset: 0; z-index: 30;
      pointer-events: none;
      width: 100%; height: 100%;
    `;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    });

    // petal colour palette — warm reds, pinks, soft gold edges
    const PETAL_COLORS = [
      '#c0394e', '#a8253a', '#d4556a', '#e87a8a',
      '#b83050', '#f0a0b0', '#c9a84c',
    ];

    const petals = [];

    function createPetal() {
      return {
        x:      Math.random() * W,
        y:      -(20 + Math.random() * 80),     // start above screen
        w:      8  + Math.random() * 14,         // petal width
        h:      5  + Math.random() * 8,          // petal height (ellipse)
        vx:     (Math.random() - 0.5) * 1.2,    // horizontal drift
        vy:     1.2 + Math.random() * 2.2,       // fall speed
        angle:  Math.random() * Math.PI * 2,     // current rotation
        spin:   (Math.random() - 0.5) * 0.06,   // rotation speed
        sway:   Math.random() * Math.PI * 2,     // sway phase
        swayAmt:0.4 + Math.random() * 0.8,      // sway amplitude
        color:  PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
        alpha:  0.7 + Math.random() * 0.3,
        delay:  Math.random() * 120,             // stagger frames
        active: false,
      };
    }

    // spawn 90 petals staggered
    for (let i = 0; i < 90; i++) petals.push(createPetal());

    let frame = 0;
    let running = true;

    function drawPetal(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;

      // draw an ellipse as the petal shape
      ctx.beginPath();
      ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);

      // subtle gradient to give petal depth
      const grad = ctx.createRadialGradient(
        -p.w * 0.1, -p.h * 0.1, 0,
         p.w * 0.3,  p.h * 0.3, p.w * 0.7
      );
      grad.addColorStop(0, lighten(p.color, 30));
      grad.addColorStop(1, p.color);

      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    // naive colour lightener for gradient highlight
    function lighten(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.min(255, (n >> 16) + amt);
      const g = Math.min(255, ((n >> 8) & 0xff) + amt);
      const b = Math.min(255, (n & 0xff) + amt);
      return `rgb(${r},${g},${b})`;
    }

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      frame++;

      let allGone = true;

      petals.forEach(p => {
        if (frame < p.delay) { allGone = false; return; }
        p.active = true;

        // sway horizontally like a leaf in wind
        p.x    += p.vx + Math.sin(p.sway) * p.swayAmt;
        p.y    += p.vy;
        p.sway += 0.03;
        p.angle += p.spin;

        // fade out near the bottom
        if (p.y > H * 0.8) {
          p.alpha = Math.max(0, p.alpha - 0.012);
        }

        if (p.y < H + 30 && p.alpha > 0) {
          allGone = false;
          drawPetal(p);
        }
      });

      // once all petals have fallen and faded, remove the canvas
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
     STATE MACHINE
  ════════════════════════════════════════ */
  const screens = {
    envelope: document.getElementById('screen-envelope'),
    scenes:   document.getElementById('screen-scenes'),
    question: document.getElementById('screen-question'),
  };

  function transitionTo(nextKey, delay = 0) {
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

    sealBtn.addEventListener('click', open);
    sealBtn.addEventListener('touchend', function(e) {
      e.preventDefault();
      open();
    }, { passive: false });

    function open() {
      if (triggered) return;
      triggered = true;

      sealBtn.classList.add('cracked');
      if (hint) { hint.style.transition = 'opacity 0.4s ease'; hint.style.opacity = '0'; }

      setTimeout(() => envelope.classList.add('opening'), 300);

      transitionTo('scenes', 1200);
      setTimeout(() => initScenes(), 1200);
    }
  })();


  /* ════════════════════════════════════════
     SCREEN 2: SCENES
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
     SCREEN 3: THE QUESTION
  ════════════════════════════════════════ */
  function initQuestion() {
    const wrap      = document.getElementById('questionWrap');
    const headline  = document.getElementById('questionHeadline');
    const btnYes    = document.getElementById('btnYes');
    const btnNo     = document.getElementById('btnNo');
    const celebrate = document.getElementById('celebration');
    const finalMsg  = document.getElementById('finalMsg');
    const finalText = document.getElementById('finalText');

    headline.innerHTML = 'Will you go on a<br><em>date</em> with me?';
    setTimeout(() => wrap.classList.add('risen'), 200);

    /* ── yes ── */
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

    /* ── date + time picker ── */
    function showDatePicker() {
      const old = document.getElementById('datePickerWrap');
      if (old) old.remove();

      const dpWrap = document.createElement('div');
      dpWrap.id = 'datePickerWrap';

      let viewYear  = new Date().getFullYear();
      let viewMonth = new Date().getMonth();
      let selectedDate = null;
      let selectedTime = null;

      const MONTHS   = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
      const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const DAYS     = ['Su','Mo','Tu','We','Th','Fr','Sa'];
      const TIME_SLOTS = [
        '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM',
        '5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM',
      ];

      function renderCalendar() {
        const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const today       = new Date(); today.setHours(0,0,0,0);
        let cells = '';
        DAYS.forEach(d => { cells += `<div class="dp-day-hdr">${d}</div>`; });
        for (let i = 0; i < firstDay; i++) cells += `<div></div>`;
        for (let d = 1; d <= daysInMonth; d++) {
          const thisDate   = new Date(viewYear, viewMonth, d);
          const isPast     = thisDate < today;
          const isSelected = selectedDate &&
            selectedDate.getFullYear() === viewYear &&
            selectedDate.getMonth()    === viewMonth &&
            selectedDate.getDate()     === d;
          cells += `<div class="dp-cell${isPast ? ' dp-past' : ''}${isSelected ? ' dp-selected' : ''}"
                        data-day="${d}" data-past="${isPast}">${d}</div>`;
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
          viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          dpWrap.querySelector('#dpCal').innerHTML = renderCalendar();
          bindCalCells();
        });
        dpWrap.querySelector('#dpNext').addEventListener('click', () => {
          viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
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
            bindConfirm();
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
            bindConfirm();
          });
        });
      }

      function bindConfirm() {
        const btn = dpWrap.querySelector('#dpConfirm');
        if (!btn || btn.disabled) return;
        btn.addEventListener('click', () => showFinalConfirmation(selectedDate, selectedTime, MONTHS, WEEKDAYS));
      }

      render();
      document.getElementById('screen-question').appendChild(dpWrap);
      requestAnimationFrame(() => requestAnimationFrame(() => dpWrap.classList.add('dp-visible')));
    }

    function showFinalConfirmation(date, time, MONTHS, WEEKDAYS) {
      const picker = document.getElementById('datePickerWrap');
      if (picker) {
        picker.style.transition = 'opacity 0.6s ease';
        picker.style.opacity    = '0';
        setTimeout(() => picker.remove(), 700);
      }
      const dateStr = `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()} · ${time}`;
      const text    = document.getElementById('finalText');
      text.innerHTML = `${dateStr}<br><br><em>I'll pick you up!</em>`;
      setTimeout(() => document.getElementById('finalMsg').classList.add('show'), 500);
    }

    function fireSparks() {
      const cx = window.innerWidth  / 2;
      const cy = window.innerHeight / 2;
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
          box-shadow: 0 0 ${size * 2}px currentColor;
        `;
        celebrate.appendChild(spark);
      }
      setTimeout(() => { celebrate.innerHTML = ''; }, 2500);
    }

    /* ── no (runaway) ── */
    const taunts = [
      "really?",
      "are you sure?",
      "try again.",
      "that button is lying to you.",
      "it knows the truth.",
      "nice try though.",
      "exhausted yet?",
      "the yes button misses you.",
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
        const r = btnNo.getBoundingClientRect();
        homeTop  = r.top;
        homeLeft = r.left;
        btnNo.style.top  = homeTop  + 'px';
        btnNo.style.left = homeLeft + 'px';
        btnNo.classList.add('fleeing');
        fled = true;
        void btnNo.offsetWidth;
      }

      const margin = 16;
      const w = btnNo.offsetWidth;
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

})();