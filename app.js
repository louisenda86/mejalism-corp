const state = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  tx: window.innerWidth / 2,
  ty: window.innerHeight / 2,
  down: false,
  hovering: false,
  scene: "omni",
  pulse: 0,
  idle: 0,
  lastInput: performance.now(),
  dark: false,
  ambient: false,
  audioReady: false,
  audioCtx: null,
  master: null,
  drone: [],
  noise: null
};

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789//[]{}<>+-=*#";
const cursor = document.querySelector("#cursor");
const readout = document.querySelector(".cursor__readout");
const led = document.querySelector("#idleLed");
const statusText = document.querySelector("#statusText");
const themeToggle = document.querySelector("#themeToggle");
const ambientToggle = document.querySelector("#ambientToggle");
const pulseButton = document.querySelector("#pulseButton");

function markInput() {
  state.lastInput = performance.now();
  state.idle = 0;
  led.classList.remove("is-idle");
  led.classList.add("is-live");
  statusText.textContent = "live input";
  window.clearTimeout(markInput.timer);
  markInput.timer = window.setTimeout(() => led.classList.remove("is-live"), 180);
}

function scramble(el, loops = 14) {
  const target = el.dataset.pretext || el.textContent;
  let frame = 0;
  window.clearInterval(el._scrambleTimer);
  el._scrambleTimer = window.setInterval(() => {
    const progress = frame / loops;
    el.textContent = target
      .split("")
      .map((letter, index) => {
        if (letter === " ") return " ";
        if (index < target.length * progress) return target[index];
        return chars[Math.floor(Math.random() * chars.length)];
      })
      .join("");
    frame += 1;
    if (frame > loops) {
      window.clearInterval(el._scrambleTimer);
      el.textContent = target;
    }
  }, 28);
}

function primeText() {
  document.querySelectorAll(".pretext").forEach((el, index) => {
    window.setTimeout(() => scramble(el, 18), 120 + index * 80);
    el.addEventListener("mouseenter", () => scramble(el, 10));
  });
}

function initAudio() {
  if (state.audioReady) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  state.audioCtx = new AudioContext();
  state.master = state.audioCtx.createGain();
  state.master.gain.value = 0.0001;
  state.master.connect(state.audioCtx.destination);
  state.audioReady = true;
}

function clickSound() {
  initAudio();
  if (!state.audioReady) return;
  const now = state.audioCtx.currentTime;
  const osc = state.audioCtx.createOscillator();
  const gain = state.audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(220 + Math.random() * 260, now);
  osc.frequency.exponentialRampToValueAtTime(78, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  osc.connect(gain);
  gain.connect(state.audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

function makeNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.28;
  }
  return buffer;
}

function startAmbient() {
  initAudio();
  if (!state.audioReady || state.ambient) return;
  const ctx = state.audioCtx;
  if (ctx.state === "suspended") ctx.resume();
  state.master.gain.cancelScheduledValues(ctx.currentTime);
  state.master.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 1.2);

  const freqs = [55, 82.41, 110, 146.83];
  state.drone = freqs.map((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = index % 2 ? "triangle" : "sine";
    osc.frequency.value = freq;
    osc.detune.value = (index - 1.5) * 6;
    filter.type = "lowpass";
    filter.frequency.value = 220 + index * 80;
    gain.gain.value = 0.08 / freqs.length;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(state.master);
    osc.start();
    return { osc, gain, filter };
  });

  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  noise.buffer = makeNoiseBuffer(ctx);
  noise.loop = true;
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 670;
  noiseFilter.Q.value = 0.7;
  noiseGain.gain.value = 0.034;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(state.master);
  noise.start();
  state.noise = { source: noise, gain: noiseGain, filter: noiseFilter };
  state.ambient = true;
  ambientToggle.classList.add("is-active");
  ambientToggle.querySelector("strong").textContent = "ON";
}

function stopAmbient() {
  if (!state.audioReady || !state.ambient) return;
  const ctx = state.audioCtx;
  state.master.gain.cancelScheduledValues(ctx.currentTime);
  state.master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
  window.setTimeout(() => {
    state.drone.forEach(({ osc }) => {
      try { osc.stop(); } catch (error) { /* oscillator may already be stopped */ }
    });
    if (state.noise) {
      try { state.noise.source.stop(); } catch (error) { /* noise may already be stopped */ }
    }
    state.drone = [];
    state.noise = null;
  }, 560);
  state.ambient = false;
  ambientToggle.classList.remove("is-active");
  ambientToggle.querySelector("strong").textContent = "OFF";
}

function bindInteractions() {
  window.addEventListener("pointermove", (event) => {
    state.tx = event.clientX;
    state.ty = event.clientY;
    markInput();
  }, { passive: true });

  window.addEventListener("pointerdown", () => {
    state.down = true;
    state.pulse = 1;
    cursor.classList.add("is-down");
    clickSound();
    markInput();
  });

  window.addEventListener("pointerup", () => {
    state.down = false;
    cursor.classList.remove("is-down");
  });

  document.querySelectorAll("[data-interactive]").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      state.hovering = true;
      cursor.classList.add("is-hovering");
      if (el.dataset.scene) state.scene = el.dataset.scene;
    });
    el.addEventListener("mouseleave", () => {
      state.hovering = false;
      cursor.classList.remove("is-hovering");
    });
    el.addEventListener("click", () => {
      if (el.dataset.scene) state.scene = el.dataset.scene;
      state.pulse = 1;
    });
  });

  themeToggle.addEventListener("click", () => {
    state.dark = !state.dark;
    document.documentElement.dataset.theme = state.dark ? "dark" : "light";
    themeToggle.classList.toggle("is-active", state.dark);
    themeToggle.querySelector("strong").textContent = state.dark ? "DARK" : "LIGHT";
  });

  ambientToggle.addEventListener("click", () => {
    if (state.ambient) stopAmbient();
    else startAmbient();
  });

  pulseButton.addEventListener("click", () => {
    state.pulse = 1.8;
    led.classList.add("is-idle");
    window.setTimeout(() => led.classList.remove("is-idle"), 900);
  });
}

function animateCursor() {
  state.x += (state.tx - state.x) * 0.19;
  state.y += (state.ty - state.y) * 0.19;
  if (cursor) {
    cursor.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) translate3d(-50%, -50%, 0)`;
  }
  if (readout) {
    readout.textContent = `${Math.round((state.x / window.innerWidth) * 99).toString().padStart(2, "0")}`;
  }
  window.requestAnimationFrame(animateCursor);
}

function idleLoop() {
  const elapsed = performance.now() - state.lastInput;
  state.idle = elapsed;
  if (elapsed > 8500) {
    statusText.textContent = "idle signal";
    if (Math.random() > 0.965) {
      led.classList.add("is-idle");
      state.pulse = 1.25;
      window.setTimeout(() => led.classList.remove("is-idle"), 900);
    }
  }
  window.setTimeout(idleLoop, 360);
}

function boot() {
  primeText();
  bindInteractions();
  animateCursor();
  idleLoop();
}

boot();

if (window.p5) {
  const sketch = (p) => {
    const particles = [];
    let grid = [];

    p.setup = () => {
      const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
      canvas.parent("p5-stage");
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      buildGrid();
      for (let i = 0; i < 82; i += 1) {
        particles.push({
          x: p.random(p.width),
          y: p.random(p.height),
          vx: p.random(-0.22, 0.22),
          vy: p.random(-0.22, 0.22),
          s: p.random(2, 7),
          phase: p.random(p.TAU)
        });
      }
    };

    p.windowResized = () => {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      buildGrid();
    };

    function buildGrid() {
      grid = [];
      const gap = p.width < 700 ? 44 : 68;
      for (let x = -gap; x < p.width + gap; x += gap) {
        for (let y = -gap; y < p.height + gap; y += gap) {
          grid.push({ x, y, n: p.random(1) });
        }
      }
    }

    function palette() {
      const dark = document.documentElement.dataset.theme === "dark";
      return {
        bg: dark ? p.color(7, 7, 10, 16) : p.color(248, 248, 242, 18),
        blue: dark ? p.color(111, 140, 255) : p.color(20, 87, 255),
        paper: dark ? p.color(246, 246, 237) : p.color(248, 248, 242),
        alpha: dark ? 46 : 54
      };
    }

    p.draw = () => {
      const c = palette();
      p.clear();
      p.background(c.bg);
      const t = p.millis() * 0.001;
      state.pulse *= 0.93;

      drawGrid(c, t);
      drawScene(c, t);
      drawParticles(c, t);
    };

    function drawGrid(c, t) {
      p.push();
      p.stroke(c.blue);
      p.strokeWeight(1);
      grid.forEach((cell, index) => {
        const dx = cell.x - state.x;
        const dy = cell.y - state.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const pull = Math.max(0, 1 - d / 260);
        const jitter = Math.sin(t * 1.4 + index * 0.07) * 3 * pull;
        p.stroke(p.red(c.blue), p.green(c.blue), p.blue(c.blue), 44 + pull * 72);
        p.line(cell.x + jitter, cell.y, cell.x + 22 + jitter, cell.y);
        if ((index + Math.floor(t * 5)) % 17 === 0) {
          p.noStroke();
          p.fill(p.red(c.blue), p.green(c.blue), p.blue(c.blue), 18 + pull * 84);
          p.rect(cell.x - pull * 10, cell.y - 2, 30 + pull * 34, 3 + pull * 5);
          p.stroke(c.blue);
        }
      });
      p.pop();
    }

    function drawScene(c, t) {
      p.push();
      p.noFill();
      p.stroke(c.blue);
      p.strokeWeight(2);
      const amp = 18 + state.pulse * 62 + (state.ambient ? 20 : 0);
      if (state.scene === "speed") {
        for (let y = 90; y < p.height; y += 54) {
          for (let x = -120; x < p.width + 120; x += 180) {
            const offset = ((t * 104 + y * 0.45) % 180);
            p.push();
            p.translate(x + offset, y);
            p.rotate(-0.28);
            p.fill(p.red(c.blue), p.green(c.blue), p.blue(c.blue), 125);
            p.noStroke();
            p.rect(0, 0, 68 + state.pulse * 14, 7);
            p.pop();
          }
        }
      } else if (state.scene === "floyd") {
        const cx = p.width * 0.5;
        const cy = p.height * 0.48;
        p.stroke(p.red(c.blue), p.green(c.blue), p.blue(c.blue), 118);
        for (let r = 100; r < Math.max(p.width, p.height); r += 64) {
          const wobble = Math.sin(t + r * 0.02) * amp;
          p.ellipse(cx, cy, r + wobble, r * 0.36 + wobble * 0.2);
        }
        p.strokeWeight(4);
        p.line(cx - 190, cy - 70, cx - 36, cy - 8);
        p.line(cx - 36, cy - 8, cx + 220, cy + Math.sin(t) * 80);
      } else {
        const count = state.scene === "ny" ? 24 : 30;
        for (let i = 0; i < count; i += 1) {
          const x = p.map(i, 0, count - 1, 40, p.width - 40);
          const h = p.noise(i * 0.1, t * 0.42) * p.height * 0.4 + amp;
          p.stroke(p.red(c.blue), p.green(c.blue), p.blue(c.blue), 100);
          p.strokeWeight(i % 5 === 0 ? 4 : 1.5);
          p.line(x, p.height * 0.55 - h * 0.5, x, p.height * 0.55 + h * 0.5);
          if (i % 3 === 0) {
            p.noStroke();
            p.fill(p.red(c.blue), p.green(c.blue), p.blue(c.blue), 130);
            p.rect(x - 5, p.height * 0.55 + Math.sin(t * 1.4 + i) * h * 0.22, 10, 34);
            p.stroke(c.blue);
          }
        }
      }
      p.pop();
    }

    function drawParticles(c, t) {
      p.push();
      p.noStroke();
      particles.forEach((dot, index) => {
        const dx = dot.x - state.x;
        const dy = dot.y - state.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = Math.max(0, 1 - d / 210) * (state.down ? 3.2 : 1.2);
        dot.vx += (dx / d) * force * 0.13;
        dot.vy += (dy / d) * force * 0.13;
        dot.vx += Math.sin(t + dot.phase) * 0.012;
        dot.vy += Math.cos(t * 0.7 + dot.phase) * 0.012;
        dot.vx *= 0.965;
        dot.vy *= 0.965;
        dot.x += dot.vx;
        dot.y += dot.vy;
        if (dot.x < -40) dot.x = p.width + 40;
        if (dot.x > p.width + 40) dot.x = -40;
        if (dot.y < -40) dot.y = p.height + 40;
        if (dot.y > p.height + 40) dot.y = -40;
        const alpha = 16 + Math.sin(t * 1.4 + index) * 12 + force * 68;
        p.fill(p.red(c.blue), p.green(c.blue), p.blue(c.blue), alpha);
        p.rect(dot.x, dot.y, dot.s + force * 10, dot.s * 0.48 + force * 4);
      });
      p.pop();
    }
  };

  new window.p5(sketch);
} else {
  document.body.classList.add("p5-missing");
}
