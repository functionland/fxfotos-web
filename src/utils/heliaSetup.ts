// ./heliaSetup.ts

import { createHelia } from 'helia';
import { MemoryBlockstore } from 'blockstore-core/memory';
import { ipns } from '@helia/ipns';
import { dagJson } from '@helia/dag-json';
import { dagCbor } from '@helia/dag-cbor';

export async function initHelia() {
  const blockstore = new MemoryBlockstore(); // You can replace this with a persistent blockstore if needed
  const helia = await createHelia({
    blockstore,
    libp2p: {
      // Configure libp2p options here if needed
    }
  });

  const ipnsStore = ipns(helia);
  const dagJsonStore = dagJson(helia);
  const dagCborStore = dagCbor(helia);

  return { helia, ipnsStore, dagJsonStore, dagCborStore };
}

export class HeliaBlockStore {
  constructor(private helia: any) {}

  async getBlock(cid: Uint8Array) {
    return await this.helia.blockstore.get(cid);
  }

  async putBlockKeyed(cid: Uint8Array, bytes: Uint8Array) {
    await this.helia.blockstore.put(cid, bytes);
  }

  async hasBlock(cid: Uint8Array) {
    return await this.helia.blockstore.has(cid);
  }

  async putBlock(bytes: Uint8Array, codec: number) {
    const cid = await this.helia.dag.put(bytes, { format: codec });
    return cid.bytes;
  }
}