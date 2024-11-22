import { CID } from "multiformats/cid";
import { BlockStore } from "wnfs";
import { sha256 } from 'multiformats/hashes/sha2';

class IPFSBlockStore implements BlockStore {
  private store: Map<string, Uint8Array>;

  constructor() {
    this.store = new Map();
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
    const storedData = localStorage.getItem('blockstore');
    if (storedData) {
      const parsed = JSON.parse(storedData);
      for (const [key, value] of Object.entries(parsed)) {
        this.store.set(key, new Uint8Array(Object.values(value as never)));
      }
    }
  }

  private saveToLocalStorage() {
    const serialized: Record<string, number[]> = {};
    for (const [key, value] of this.store.entries()) {
      serialized[key] = Array.from(value);
    }
    localStorage.setItem('blockstore', JSON.stringify(serialized));
  }

  async getBlock(cid: Uint8Array): Promise<Uint8Array | undefined> {
    const decodedCid = CID.decode(cid);
    return this.store.get(decodedCid.toString());
  }

  // Add this method to match BlockStore interface
  async putBlock(bytes: Uint8Array, code: number): Promise<Uint8Array> {
    const hash = await sha256.digest(bytes);
    const cid = CID.create(1, code, hash);
    this.store.set(cid.toString(), bytes);
    this.saveToLocalStorage();
    return cid.bytes;
  }

  async putBlockKeyed(cid: Uint8Array, bytes: Uint8Array): Promise<void> {
    const decodedCid = CID.decode(cid);
    this.store.set(decodedCid.toString(), bytes);
    this.saveToLocalStorage();
  }

  async hasBlock(cid: Uint8Array): Promise<boolean> {
    const decodedCid = CID.decode(cid);
    return this.store.has(decodedCid.toString());
  }

  async show(): Promise<void> {
    console.log('MemoryBlockStore contents:');
    console.log('Total blocks:', this.store.size);
    
    for (const [cidStr, bytes] of this.store.entries()) {
      console.log({
        cid: cidStr,
        byteLength: bytes.byteLength,
        bytes: bytes.slice(0, 32),
      });
    }
  }
}

export { IPFSBlockStore };