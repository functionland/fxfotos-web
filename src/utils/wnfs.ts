import { 
  share,
  createShareName,
  findLatestShareCounter,
  receiveShare,
  PrivateForest,
  PrivateDirectory,
  BlockStore,
  Name,
  PrivateNode,
  PublicDirectory,

} from 'wnfs';
import { toString, fromString } from "uint8arrays";
import { HDKEY, DID } from '@functionland/fula-sec-web';

// At the top of your file, before any other code

interface InitResult {
  forest: PrivateForest;
  cid: Uint8Array;
  rootDir: PrivateDirectory;
}

class ExchangeKey {
  private key: CryptoKey;

  constructor(key: CryptoKey) {
    this.key = key;
  }

  static generateDeterministicModulus(seed: Uint8Array): Uint8Array {
    // Create 256-byte modulus from seed
    const modulus = new Uint8Array(256);
    for (let i = 0; i < modulus.length; i++) {
      modulus[i] = seed[i % seed.length];
    }
    
    // Clear highest bit to ensure positive number
    modulus[0] &= 0x7F;
    
    // Set lowest bit to ensure odd number
    modulus[modulus.length - 1] |= 1;
    
    return modulus;
  }

  static async fromSeed(seed: Uint8Array): Promise<ExchangeKey> {
    try {
      // Generate 256-byte modulus from seed
      const modulus = this.generateDeterministicModulus(seed);

      const keyData = {
        kty: "RSA",
        n: toString(modulus, "base64url"),
        e: toString(new Uint8Array([0x01, 0x00, 0x01]), "base64url"),
        alg: "RSA-OAEP-256",
        ext: true,
      };

      const key = await crypto.subtle.importKey(
        "jwk",
        keyData,
        {
          name: "RSA-OAEP",
          hash: { name: "SHA-256" },
        },
        true,
        ["encrypt"]
      );
      return new ExchangeKey(key);
    } catch (error) {
      throw new Error(`Failed to create ExchangeKey from seed: ${error.message}`);
    }
  }

  async storePublicKey(store: BlockStore): Promise<Uint8Array> {
    const publicKeyBytes = await this.encodePublicKey();
    return store.putBlock(publicKeyBytes, 0x55); // CODEC_RAW
  }

  async encodePublicKey(): Promise<Uint8Array> {
    const key = await crypto.subtle.exportKey("jwk", this.key);
    return fromString(key.n as string, "base64url");
  }

  async encrypt(data: Uint8Array): Promise<Uint8Array> {
    try {
      const encryptedData = await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        this.key,
        data
      );
      return new Uint8Array(encryptedData);
    } catch (error) {
      throw new Error(`Failed to encrypt: ${error.message}`);
    }
  }
}

declare global {
  interface Window {
    ExchangeKey: typeof ExchangeKey;
  }
}

// After your ExchangeKey class definition
globalThis.ExchangeKey = ExchangeKey;
class PrivateKey {
  private key: CryptoKeyPair;

  constructor(key: CryptoKeyPair) {
    this.key = key;
  }

  static async generate(): Promise<PrivateKey> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: { name: "SHA-256" },
      },
      true,
      ["decrypt"]
    );
    return new PrivateKey(keyPair);
  }

  async decrypt(data: Uint8Array): Promise<Uint8Array> {
    const decryptedData = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP"
      },
      this.key.privateKey,
      data
    );
    return new Uint8Array(decryptedData);
  }

  getPublicKey(): ExchangeKey {
    return new ExchangeKey(this.key.publicKey);
  }
}

class Rng {
  randomBytes(count: number): Uint8Array {
    const array = new Uint8Array(count);
    crypto.getRandomValues(array);
    return array;
  }
}

async function createRecipientExchangeRoot(
  store: BlockStore
): Promise<[PrivateKey, PublicDirectory, Uint8Array]> {
  try {
    // Generate private key
    let key: PrivateKey;
    try {
      key = await PrivateKey.generate();
    } catch (error) {
      throw new Error(`Failed to generate PrivateKey: ${error.message}`);
    }

    // Get exchange key modulus
    let exchangeKey: Uint8Array;
    try {
      const publicKey = key.getPublicKey();
      exchangeKey = await publicKey.getPublicKeyModulus();
    } catch (error) {
      throw new Error(`Failed to get exchange key modulus: ${error.message}`);
    }

    // Create public directory
    let publicDir: PublicDirectory;
    try {
      publicDir = new PublicDirectory(new Date());
    } catch (error) {
      throw new Error(`Failed to create PublicDirectory: ${error.message}`);
    }

    // First store the exchange key in the blockstore to get its CID
    let exchangeKeyCid: Uint8Array;
    try {
      exchangeKeyCid = await store.putBlock(exchangeKey, 0x55);  // Use appropriate codec
      console.log({exchangeKeyCid: exchangeKeyCid});
    } catch (error) {
      throw new Error(`Failed to store exchange key: ${error.message}`);
    }

    // Write to directory using the CID
    let rootDir: PublicDirectory;
    try {
      const result = await publicDir.write(
        ["device1", "v1.exchange_key"],
        exchangeKeyCid,  // Use CID instead of raw content
        new Date(),
        store
      );
      rootDir = result.rootDir;
    } catch (error) {
      throw new Error(`Failed to write to PublicDirectory: ${error.message}`);
    }

    // Store directory and get CID
    let exchangeRootCid: Uint8Array;
    try {
      exchangeRootCid = await rootDir.store(store);
    } catch (error) {
      throw new Error(`Failed to store PublicDirectory: ${error.message}`);
    }

    return [key, rootDir, exchangeRootCid];
  } catch (error) {
    console.error('Detailed error:', error);
    throw error;
  }
}

// Helper function to get DID from wnfsKey and password
async function getDIDFromKey(wnfsKey: string, password: string): Promise<string> {
  const ed = new HDKEY(password);
  const keyPair = ed.createEDKeyPair(wnfsKey);
  const did = new DID(keyPair.secretKey);
  return did.did();
}

async function initWNFS(store: BlockStore, wnfsKey: string): Promise<InitResult> {
  try {
    if (!wnfsKey) throw new Error('wnfsKey is empty');

    const rng = new Rng();
    const wnfsKeyBytes = new TextEncoder().encode(wnfsKey);

    // Create seed using SHA-256
    const key = await crypto.subtle.digest('SHA-256', wnfsKeyBytes);
    const seed = await crypto.subtle.digest('SHA-256', key);
    const seedArray = new Uint8Array(seed);

    // Create rootDid from seed (not modulus)
    const rootDid = Array.from(seedArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Create exchange key from seed
    console.log({seedArray,rootDid});
    const exchangeKey = await ExchangeKey.fromSeed(seedArray);
    const modulus = await exchangeKey.encodePublicKey();

    // Create forest with modulus from exchange key
    let forest: PrivateForest;
    try {
      forest = new PrivateForest(rng, modulus);
    } catch (error) {
      throw new Error(`Failed to create PrivateForest: ${error.message}`);
    }

    // Create root directory
    let rootDir: PrivateDirectory;
    try {
      const emptyName = forest.emptyName();
      ({forest, rootDir} = await PrivateDirectory.newAndStore(
        emptyName,
        new Date(),
        forest,
        store,
        rng
      ));
    } catch (error) {
      throw new Error(`Failed to create root directory: ${error.message}`);
    }

    // Create access key
    let accessKey;
    try {
      [accessKey, forest] = await rootDir.asNode().store(forest, store, rng);
    } catch (error) {
      throw new Error(`Failed to create access key: ${error.message}`);
    }

    // Setup seeded key pair access
    try {
      // Use the already created exchangeKey from above
      const publicKeyCid = await store.putBlock(modulus, 0x55);

      // Create exchange root
      const exchangeRoot = new PublicDirectory(new Date());
      await exchangeRoot.write(
        ["main", "v1.exchange_key"],
        publicKeyCid,
        new Date(),
        store
      );

      const exchangeRootCid = await exchangeRoot.store(store);

      forest = await share(
        accessKey,
        0,
        rootDid,
        exchangeRootCid,
        forest,
        store
      );
    } catch (error) {
      throw new Error(`Failed to setup sharing: ${error.message}`);
    }

    const cid = await forest.store(store);
    return { forest, cid, rootDir };
  } catch (error) {
    console.error('WNFS Initialization Error:', error);
    throw error;
  }
}

async function reloadWNFS(
  store: BlockStore,
  forestCid: Uint8Array,
  wnfsKey: string
): Promise<PrivateDirectory> {
  try {
    if (!wnfsKey) throw new Error('wnfsKey is empty');

    // Create seed using SHA-256 (same as in initWNFS)
    const wnfsKeyBytes = new TextEncoder().encode(wnfsKey);
    const key = await crypto.subtle.digest('SHA-256', wnfsKeyBytes);
    const seed = await crypto.subtle.digest('SHA-256', key);
    const seedArray = new Uint8Array(seed);
    const seed256 = ExchangeKey.generateDeterministicModulus(seedArray);

    // Create rootDid from seed
    const rootDid = Array.from(seedArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Load forest
    let forest: PrivateForest;
    try {
      forest = await PrivateForest.load(forestCid, store);
    } catch (error) {
      throw new Error(`Failed to load PrivateForest: ${error.message}`);
    }

    // Create exchange key from seed
    let exchangeKey: ExchangeKey;
    try {
      exchangeKey = await ExchangeKey.fromSeed(seed256);
    } catch (error) {
      throw new Error(`Failed to create ExchangeKey: ${error.message}`);
    }

    // Get public key modulus
    let publicKeyModulus: Uint8Array;
    try {
      publicKeyModulus = await exchangeKey.encodePublicKey();
    } catch (error) {
      throw new Error(`Failed to get public key modulus: ${error.message}`);
    }

    // Find latest share counter
    let counter: number;
    try {
      counter = await findLatestShareCounter(
        0,
        1000,
        publicKeyModulus,
        rootDid,
        forest,
        store
      );
    } catch (error) {
      throw new Error(`Failed to find latest share counter: ${error.message}`);
    }

    // Create share name
    let name: Name;
    try {
      name = createShareName(
        counter || 0,
        rootDid,
        publicKeyModulus,
        forest
      );
    } catch (error) {
      throw new Error(`Failed to create share name: ${error.message}`);
    }

    // Receive share
    let node: PrivateNode;
    try {
      node = await receiveShare(name, exchangeKey, forest, store);
    } catch (error) {
      throw new Error(`Failed to receive share: ${error.message}`);
    }

    const latestNode = await node.searchLatest(forest, store);
    return latestNode.asDir();
  } catch (error) {
    console.error('WNFS Reload Error:', error);
    throw error;
  }
}

// Update the exports in wnfs.ts
export { 
  initWNFS, 
  reloadWNFS, 
  PrivateForest,
  PrivateDirectory,
};