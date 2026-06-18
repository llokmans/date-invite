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
     MUSIC BOX  (Web Audio API)
     A gentle looping melody — delicate, fairytale-like.
     Starts on first interaction, loops until Yes.
  ════════════════════════════════════════ */
  let audioCtx       = null;
  let musicStarted   = false;
  let musicStopped   = false;
  let masterGain     = null;

  // Melody: a short romantic phrase in C major / A minor
  // Each entry: [midi note, duration in beats, slight timing humanisation]
  // Tempo: ~72 bpm → 1 beat = ~833ms
  const BEAT        = 0.82;   // seconds per beat (slightly slower = more dreamy)
  const MELODY = [
    // phrase 1 — ascending question
    [64, 0.5], [67, 0.5], [69, 1.0], [72, 1.5],
    // breath
    [null, 0.5],
    // phrase 2 — descending answer
    [71, 0.5], [69, 0.5], [67, 1.0], [64, 1.0],
    // breath
    [null, 0.5],
    // phrase 3 — rise and linger
    [60, 0.5], [64, 0.5], [67, 0.5], [72, 0.5], [76, 2.0],
    // breath
    [null, 1.0],
    // phrase 4 — gentle resolution
    [74, 0.5], [72, 0.5], [69, 0.5], [67, 0.5], [64, 2.5],
    // long breath before loop
    [null, 1.5],
  ];

  // Convert MIDI note to frequency
  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Total loop duration in seconds
  const LOOP_DURATION = MELODY.reduce((sum, [, dur]) => sum + dur * BEAT, 0);

  /**
   * Schedule the entire melody phrase starting at `startTime` (audioCtx time).
   * A music box note: sine osc + very fast attack + slow exponential decay
   * + a tiny triangle undertone for body, slight detune per note for hand-wound feel.
   */
  function scheduleMelody(startTime) {
    if (!audioCtx || musicStopped) return;

    let t = startTime;

    MELODY.forEach(([midi, dur]) => {
      const noteDur = dur * BEAT;

      if (midi !== null) {
        const hz       = midiToHz(midi);
        // slight random detune ±2 cents — feels imperfect, mechanical
        const detune   = (Math.random() - 0.5) * 4;
        // slight timing humanisation ±20ms
        const jitter   = (Math.random() - 0.5) * 0.04;
        const noteTime = t + jitter;

        // — main tine (sine, bright) —
        const osc1  = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.type = 'sine';
        osc1.frequency.value = hz;
        osc1.detune.value    = detune;
        gain1.gain.setValueAtTime(0, noteTime);
        gain1.gain.linearRampToValueAtTime(0.22, noteTime + 0.008); // sharp pluck
        gain1.gain.exponentialRampToValueAtTime(0.0001, noteTime + noteDur * 0.9);
        osc1.start(noteTime);
        osc1.stop(noteTime + noteDur);

        // — body undertone (triangle, one octave down, very soft) —
        const osc2  = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.type = 'triangle';
        osc2.frequency.value = hz / 2;
        gain2.gain.setValueAtTime(0, noteTime);
        gain2.gain.linearRampToValueAtTime(0.06, noteTime + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.0001, noteTime + noteDur * 0.6);
        osc2.start(noteTime);
        osc2.stop(noteTime + noteDur);
      }

      t += noteDur;
    });

    // schedule next loop just before this one ends
    if (!musicStopped) {
      const loopAt = startTime + LOOP_DURATION - 0.1;
      const delay  = (loopAt - audioCtx.currentTime) * 1000;
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
    masterGain.gain.value = 0.0;
    masterGain.connect(audioCtx.destination);

    if (audioCtx.state === 'suspended') audioCtx.resume();

    // fade in gently over 2 seconds so it doesn't startle
    masterGain.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 2);

    scheduleMelody(audioCtx.currentTime + 0.1);
  }

  function stopMusic() {
    if (!audioCtx || musicStopped) return;
    musicStopped = true;
    // fade out over 1.5s then suspend
    masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
    setTimeout(() => audioCtx.suspend(), 1600);
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
    "You've been on my mind lately.",
    "Every conversation with you feels different.\nSpecial.",
    "So I wanted to ask you\nsomething important…",
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
            setTimeout(typeChar, 38 + (Math.random() * 20 - 10));
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

      // stop the music — the moment has arrived
      stopMusic();

      // fade out the question
      wrap.style.transition    = 'opacity 0.6s ease';
      wrap.style.opacity       = '0';
      wrap.style.pointerEvents = 'none';

      // sparks burst
      fireSparks();

      // rose petals cascade
      setTimeout(() => startRosePetals(), 300);

      // final message
      const endings = [
        "Then it's settled.\nI'll be counting the minutes.",
        "Wonderful.\nI'll make it worth your while.",
        "Good.\nI was hoping you'd say that.",
      ];
      finalText.innerHTML = endings[Math.floor(Math.random() * endings.length)]
        .split('\n').join('<br>');
      setTimeout(() => finalMsg.classList.add('show'), 700);
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