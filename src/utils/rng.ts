export class Rng {
    randomBytes(count: number): Uint8Array {
      const array = new Uint8Array(count);
      self.crypto.getRandomValues(array);
      return array;
    }
  }