class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5;

  constructor() {
    // Respect stored mute preference; default to unmuted for arcade excitement, or check storage
    const savedMute = localStorage.getItem('duelverse_sound_muted');
    if (savedMute !== null) {
      this.isMuted = savedMute === 'true';
    }
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem('duelverse_sound_muted', muted ? 'true' : 'false');
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  // Play a procedural synthesized tone
  private playTone(freq: number, type: OscillatorType, duration: number, gainPeak: number = 0.2, delay: number = 0) {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(gainPeak * this.volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // AudioContext could be blocked by browser policy prior to interaction
    }
  }

  // Tactile button click
  public playClick() {
    this.playTone(800, 'sine', 0.05, 0.15);
    this.triggerHaptic(12);
  }

  // Card flip / Disc drop move sound
  public playMove() {
    this.playTone(440, 'triangle', 0.1, 0.25);
    this.triggerHaptic(18);
  }

  // Synchronized Countdown (3, 2, 1, GO)
  public playCountdown(num: number) {
    if (num > 0) {
      this.playTone(520, 'sine', 0.15, 0.3);
      this.triggerHaptic(20);
    } else {
      // GO! High vibrant double tone
      this.playTone(880, 'triangle', 0.2, 0.35);
      this.playTone(1320, 'sine', 0.35, 0.3, 0.08);
      this.triggerHaptic([30, 40, 50]);
    }
  }

  // Score increment
  public playScore() {
    this.playTone(587.33, 'sine', 0.1, 0.25); // D5
    this.playTone(880, 'sine', 0.22, 0.3, 0.09); // A5
    this.triggerHaptic(25);
  }

  // Reaction Rush signal trigger
  public playSignalAlert() {
    this.playTone(1046.5, 'square', 0.25, 0.2); // C6 bright
    this.triggerHaptic([50, 30, 50]);
  }

  // False start / illegal move buzz
  public playFalseStart() {
    this.playTone(180, 'sawtooth', 0.3, 0.35);
    this.triggerHaptic([60, 60, 60]);
  }

  // Match / Round Victory Fanfare
  public playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.3, 0.3, idx * 0.12);
    });
    this.triggerHaptic([40, 60, 40, 80]);
  }

  // Defeat / melancholic chime
  public playDefeat() {
    const notes = [440, 415.3, 392, 349.23];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'sine', 0.25, 0.2, idx * 0.15);
    });
  }

  // Draw round
  public playDraw() {
    this.playTone(440, 'sine', 0.2, 0.2);
    this.playTone(440, 'sine', 0.2, 0.2, 0.15);
  }

  // Opponent joined or alert ping
  public playNotification() {
    this.playTone(659.25, 'sine', 0.12, 0.25);
    this.playTone(987.77, 'sine', 0.25, 0.25, 0.1);
  }

  // Safe Haptic feedback trigger
  public triggerHaptic(pattern: number | number[]) {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration errors
    }
  }
}

export const soundService = new SoundEngine();
