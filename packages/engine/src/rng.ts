export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  readonly state: number;
}

function hashSeed(value: string): number {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

class SeededRng implements Rng {
  private current: number;

  constructor(seed: number) {
    this.current = seed | 0;
  }

  get state(): number { return this.current >>> 0; }

  next(): number {
    this.current = (this.current + 0x6d2b79f5) | 0;
    let value = Math.imul(this.current ^ (this.current >>> 15), 1 | this.current);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from an empty collection.');
    return items[this.int(0, items.length - 1)]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = this.int(0, index);
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
    }
    return copy;
  }
}

export function makeRng(seed: string | number): Rng {
  return new SeededRng(typeof seed === 'number' ? seed : hashSeed(seed));
}

export function rngFromState(state: number): Rng {
  return new SeededRng(state);
}

