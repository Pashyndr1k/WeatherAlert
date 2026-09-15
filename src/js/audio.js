// Audible alerts synthesised with the Web Audio API (no sound files needed).
// warning  = two-tone chime, repeats every 12 s until acknowledged
// critical = fast alternating siren burst, repeats every 4 s until acknowledged
(function () {
  'use strict';
  const WA = (window.WA = window.WA || {});
  let ctx = null;
  let loop = null;
  let mode = null;
  let muted = false;
  let volume = 0.6;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type = 'sine', gain = 0.5) {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0, c.currentTime + start);
    g.gain.linearRampToValueAtTime(gain * volume, c.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.05);
  }
  function chime() {
    tone(880, 0, 0.35, 'sine', 0.5);
    tone(1175, 0.3, 0.5, 'sine', 0.45);
    tone(880, 0.9, 0.35, 'sine', 0.4);
    tone(1175, 1.2, 0.6, 'sine', 0.35);
  }
  function siren() {
    for (let i = 0; i < 6; i++) {
      tone(i % 2 ? 620 : 930, i * 0.22, 0.2, 'square', 0.22);
    }
  }
  function click() { tone(1500, 0, 0.05, 'sine', 0.15); }

  function play(kind) {
    if (muted) return;
    if (kind === 'critical') siren();
    else if (kind === 'warning') chime();
    else click();
  }
  // Keep repeating the highest-priority unacknowledged alarm sound.
  function setMode(next) {
    if (next === mode) return;
    mode = next;
    if (loop) { clearInterval(loop); loop = null; }
    if (!mode) return;
    play(mode);
    loop = setInterval(() => play(mode), mode === 'critical' ? 4000 : 12000);
  }
  function setMuted(m) { muted = Boolean(m); }
  function setVolume(v) { volume = Math.max(0, Math.min(1, v)); }

  WA.audio = { play, setMode, setMuted, setVolume, isMuted: () => muted, mode: () => mode };
})();
