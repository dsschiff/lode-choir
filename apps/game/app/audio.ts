import type { EngineEvent } from '@lode-choir/engine';

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

class ChoirAudio {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && this.context?.state === 'running') void this.context.suspend();
  }

  async wake() {
    if (!this.enabled || typeof window === 'undefined') return;
    const AudioConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioConstructor) return;
    this.context ??= new AudioConstructor();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  play(event: EngineEvent) {
    if (!this.enabled) return;
    void this.wake().then(() => {
      if (!this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const frequencies: Record<EngineEvent['kind'], number> = {
        room: 196,
        route: 146.8,
        crew: 293.7,
        damage: 82.4,
        story: 246.9,
        progress: 329.6,
        ending: 440,
      };

      oscillator.type = event.emphasis === 'negative' ? 'sawtooth' : 'sine';
      oscillator.frequency.setValueAtTime(frequencies[event.kind], now);
      oscillator.frequency.exponentialRampToValueAtTime(
        event.emphasis === 'positive' ? frequencies[event.kind] * 1.5 : frequencies[event.kind] * 0.75,
        now + 0.22,
      );
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.32);
    });
  }
}

export const choirAudio = new ChoirAudio();
