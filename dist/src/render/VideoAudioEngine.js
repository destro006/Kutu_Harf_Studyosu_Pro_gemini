/**
 * Zero-Dependency Web Audio Engine for Video Stüdyosu
 * - Provides 4 royalty-free synthesized ambient/cinematic tracks + custom MP3/WAV support
 * - Muxes live audio stream directly into MediaRecorder via AudioContext.createMediaStreamDestination()
 */

export const BUILTIN_AUDIO_TRACKS = Object.freeze([
  { id: 'none', label: 'Sessiz (Müzik Yok)', bpm: 0, desc: 'Yalnızca video görüntüsü' },
  { id: 'luxury_ambient', label: 'Lüks Mimari Ambient (68 BPM)', bpm: 68, notes: [220, 277.18, 329.63, 440], wave: 'sine' },
  { id: 'cinematic_pulse', label: 'Sinematik Nabız & Rise (96 BPM)', bpm: 96, notes: [196, 246.94, 293.66, 392], wave: 'triangle' },
  { id: 'corporate_warm', label: 'Kurumsal Prestij (84 BPM)', bpm: 84, notes: [261.63, 329.63, 392, 523.25], wave: 'sine' },
  { id: 'modern_tech', label: 'Modern Lazer / Showroom (112 BPM)', bpm: 112, notes: [293.66, 369.99, 440, 587.33], wave: 'triangle' },
]);

export async function createVideoAudioMuxer({
  trackId = 'none',
  customAudioBuffer = null,
  trimStartSec = 0,
  volume = 0.7,
  durationSec = 10,
} = {}) {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx || (trackId === 'none' && !customAudioBuffer)) return null;

  const audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume().catch(() => {});
  }
  const dest = audioCtx.createMediaStreamDestination();
  const master = audioCtx.createGain();
  const gainVal = Math.max(0, Math.min(1, Number(volume) || 0.7));
  master.gain.setValueAtTime(0.01, audioCtx.currentTime);
  master.gain.linearRampToValueAtTime(gainVal, audioCtx.currentTime + 0.35);
  master.connect(dest);

  let stopTimer = null;

  if (customAudioBuffer) {
    const src = audioCtx.createBufferSource();
    src.buffer = customAudioBuffer;
    src.loop = true;
    src.connect(master);
    const offset = Math.max(0, Math.min(Math.max(0, customAudioBuffer.duration - 0.5), Number(trimStartSec) || 0));
    src.start(0, offset, Math.max(1, durationSec + 0.5));
  } else {
    const track = BUILTIN_AUDIO_TRACKS.find(t => t.id === trackId);
    if (!track || !track.notes) {
      await audioCtx.close().catch(() => {});
      return null;
    }
    const stepMs = Math.max(250, Math.round((60 / track.bpm) * 1000));
    let step = 0;
    const playChord = () => {
      if (audioCtx.state === 'closed') return;
      const now = audioCtx.currentTime;
      const freq = track.notes[step % track.notes.length];
      step++;
      for (const mul of [1, 1.5]) {
        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        osc.type = track.wave || 'sine';
        osc.frequency.setValueAtTime(freq * mul, now);
        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(mul === 1 ? 0.14 : 0.06, now + 0.08);
        env.gain.exponentialRampToValueAtTime(0.0008, now + (stepMs / 1000) * 0.95);
        osc.connect(env);
        env.connect(master);
        osc.start(now);
        osc.stop(now + stepMs / 1000);
      }
    };
    playChord();
    stopTimer = setInterval(playChord, stepMs);
  }

  return {
    stream: dest.stream,
    audioTracks: dest.stream.getAudioTracks(),
    dispose: async () => {
      if (stopTimer) clearInterval(stopTimer);
      try {
        master.gain.setValueAtTime(master.gain.value, audioCtx.currentTime);
        master.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
      } catch {}
      await audioCtx.close().catch(() => {});
    },
  };
}
