import { PrivateDirectory, PrivateForest, PrivateNode, AccessKey } from 'wnfs';


class Rng {
  randomBytes(count: number): Uint8Array {
    const array = new Uint8Array(count);
    crypto.getRandomValues(array);
    return array;
  }
}

export { Rng, PrivateDirectory, PrivateForest, PrivateNode, AccessKey };