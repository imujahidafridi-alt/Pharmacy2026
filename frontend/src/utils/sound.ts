// Lightweight audio feedback for barcode scanning and counter actions.
// Audio is best-effort: browsers can block it until a user gesture, and the
// app must never fail because a sound could not be played.

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!context) context = new AudioCtx();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function playFeedback(kind: 'success' | 'error' = 'success'): void {
  const ctx = getContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = kind === 'success' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'success' ? 880 : 340, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === 'success' ? 1320 : 220,
      now + (kind === 'success' ? 0.08 : 0.13)
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  } catch {
    // Sound is a convenience, never a requirement.
  }
}
