// Original looping motifs, synthesized locally without audio downloads.
const scores = {
  urgent: [0.16, 'sawtooth', [45, 52, 45, 53, 45, 55, 52, 50]],
  relaxed: [0.60, 'sine', [60, 67, 69, 64, 62, 67, 64, 0]],
  joyful: [0.28, 'triangle', [60, 64, 67, 72, 69, 67, 64, 67]]
};
let context, timer;
export async function play(mode) {
  clearInterval(timer);
  if (!scores[mode]) return;
  context ??= new AudioContext();
  await context.resume();
  const [beat, waveform, melody] = scores[mode];
  let step = 0;
  function note() {
    const pitch = melody[step++ % melody.length];
    if (!pitch) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = waveform;
    oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.94);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + beat);
  }
  note();
  timer = setInterval(note, beat * 1000);
}
export function bindMusic(host) {
  const menu = document.querySelector('#soundtrack');
  play('off');
  menu.hidden = !host;
  if (!host) return;
  menu.hidden = false;
  menu.innerHTML = '<label>房主配乐 <select><option value="off">关闭</option><option value="urgent">急促</option><option value="relaxed">轻松</option><option value="joyful">喜悦</option></select></label>';
  menu.querySelector('select').onchange = event => play(event.target.value);
}
