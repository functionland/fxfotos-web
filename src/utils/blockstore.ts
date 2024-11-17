import { CID } from "multiformats/cid";

export class MemoryBlockStore {
  private store: Map<string, Uint8Array>;

  constructor() {
    this.store = new Map();
  }

  async getBlock(cid: Uint8Array): Promise<Uint8Array | undefined> {
    const decodedCid = CID.decode(cid);
    return this.store.get(decodedCid.toString());
  }

  async putBlockKeyed(cid: Uint8Array, bytes: Uint8Array): Promise<void> {
    const decodedCid = CID.decode(cid);
    this.store.set(decodedCid.toString(), bytes);
  }

  async hasBlock(cid: Uint8Array): Promise<boolean> {
    const decodedCid = CID.decode(cid);
    return this.store.has(decodedCid.toString());
  }
}