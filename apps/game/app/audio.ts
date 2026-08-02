import type { EngineEvent } from '@lode-choir/engine';

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export type InterfaceCue = 'select' | 'assign' | 'inspect';

class ChoirAudio {
  private context: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7;
  private ambienceRequested = false;
  private ambience: { oscillators: OscillatorNode[]; lfo: OscillatorNode; master: GainNode } | null = null;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAmbience();
      if (this.context?.state === 'running') void this.context.suspend();
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.volume === 0) {
      this.stopAmbience();
      return;
    }
    if (this.ambience && this.context) {
      this.ambience.master.gain.setValueAtTime(Math.max(0.0001, 0.012 * this.volume), this.context.currentTime);
    } else if (this.ambienceRequested && this.enabled) {
      this.setAmbience(true);
    }
  }

  async wake() {
    if (!this.enabled || typeof window === 'undefined') return;
    const AudioConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioConstructor) return;
    this.context ??= new AudioConstructor();
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return;
      }
    }
  }

  setAmbience(active: boolean) {
    this.ambienceRequested = active;
    if (!active || !this.enabled || this.volume === 0) {
      this.stopAmbience();
      return;
    }
    void this.wake().then(() => {
      if (!this.ambienceRequested || !this.enabled || this.volume === 0 || !this.context || this.context.state !== 'running' || this.ambience) return;
      const now = this.context.currentTime;
      const master = this.context.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.012 * this.volume), now + 1.6);
      master.connect(this.context.destination);

      const frequencies = [55, 82.4];
      const oscillators = frequencies.map((frequency, index) => {
        const oscillator = this.context!.createOscillator();
        const voice = this.context!.createGain();
        oscillator.type = index === 0 ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.detune.setValueAtTime(index === 0 ? -7 : 5, now);
        voice.gain.setValueAtTime(index === 0 ? 0.72 : 0.28, now);
        oscillator.connect(voice).connect(master);
        oscillator.start(now);
        return oscillator;
      });
      const lfo = this.context.createOscillator();
      const lfoDepth = this.context.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.075, now);
      lfoDepth.gain.setValueAtTime(0.0035, now);
      lfo.connect(lfoDepth).connect(master.gain);
      lfo.start(now);
      this.ambience = { oscillators, lfo, master };
    });
  }

  private stopAmbience() {
    if (!this.ambience || !this.context) return;
    const now = this.context.currentTime;
    const stopAt = now + 0.35;
    this.ambience.master.gain.cancelScheduledValues(now);
    this.ambience.master.gain.setValueAtTime(Math.max(0.0001, this.ambience.master.gain.value), now);
    this.ambience.master.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    for (const oscillator of this.ambience.oscillators) oscillator.stop(stopAt);
    this.ambience.lfo.stop(stopAt);
    this.ambience = null;
  }

  play(event: EngineEvent) {
    if (!this.enabled || this.volume === 0) return;
    void this.wake().then(() => {
      if (!this.context || this.context.state !== 'running') return;
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
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.045 * this.volume), now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.32);
    });
  }

  playCue(cue: InterfaceCue) {
    if (!this.enabled || this.volume === 0) return;
    void this.wake().then(() => {
      if (!this.context || this.context.state !== 'running') return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const frequencies: Record<InterfaceCue, [number, number]> = {
        select: [174.6, 220],
        assign: [220, 293.7],
        inspect: [130.8, 164.8],
      };
      const [start, end] = frequencies[cue];
      oscillator.type = cue === 'inspect' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(start, now);
      oscillator.frequency.exponentialRampToValueAtTime(end, now + 0.1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.018 * this.volume), now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.15);
    });
  }
}

export const choirAudio = new ChoirAudio();
