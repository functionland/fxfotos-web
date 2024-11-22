'use client'

import React, { useState, useEffect } from 'react';
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { Config, WagmiProvider, useAccount, useSignMessage, useConnect } from 'wagmi';
import { metaMask } from '@wagmi/connectors';
import { arbitrum, mainnet } from 'viem/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HDKEY } from '@functionland/fula-sec-web';
import { initWNFS, reloadWNFS, PrivateForest, PrivateDirectory } from '../utils/wnfs';
import { IPFSBlockStore } from '../utils/blockstore';
import { Chain, http } from 'viem'
import { CID } from 'multiformats';
import { sha256 } from 'multiformats/hashes/sha2';
import * as json from 'multiformats/codecs/json';
import { toString } from "uint8arrays";

const projectId = '94a4ca39db88ee0be8f6df95fdfb560a';

const metadata = {
  name: 'FxBlox',
  description: 'Application to set up FxBlox, designed to run as a Decentralized Physical Infrastructure node (DePIN)',
  url: 'https://web3modal.com',
  icons: ['https://imagedelivery.net/_aTEfDRm7z3tKgu9JhfeKA/1f36e0e1-df9a-4bdc-799b-8631ab1eb000/sm']
};

const chains = [mainnet, arbitrum];
const metaMaskConnector = metaMask({ chains });

const wagmiConfig = defaultWagmiConfig({
  chains: chains as unknown as readonly [Chain, ...Chain[]],
  projectId,
  metadata,
  connectors: [metaMaskConnector],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
  },
});

const modal = createWeb3Modal({ 
  wagmiConfig: wagmiConfig as unknown as Config, 
  projectId,
  enableAnalytics: true,
  enableOnramp: true
});

const queryClient = new QueryClient();

function Home() {
  const [password, setPassword] = useState('');
  const [iKnow, setIKnow] = useState(false);
  const [metamaskOpen, setMetamaskOpen] = useState(false);
  const [rootCid, setRootCid] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [forest, setForest] = useState<PrivateForest | null>(null);
  const [rootDir, setRootDir] = useState<PrivateDirectory | null>(null);
  const [linking, setLinking] = useState(false);
  const [key, setKey] = useState('');

  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { connect } = useConnect();

  const store = new IPFSBlockStore();
  
  useEffect(() => {
    const unsubscribe = modal.subscribeEvents(event => {
      console.log(event.data.event);
      const state = event?.data?.event;
      if (state === "CONNECT_SUCCESS") {
        console.log('connected to wallet');
        console.log('logged in with address: ' + address);
        if (address) {
          handleLinkPassword(false);
        }
      }
    });
  
    // Cleanup function to unsubscribe when component unmounts
    return () => {
      unsubscribe();
    };
  }, []); // This effect should also only run once on component mount
  
  // Separate effect to handle address changes if needed
  useEffect(() => {
    if (address) {
      console.log('Address changed:', address);
      
    }
  }, [address]);

  const handleLinkPassword = async (manual: boolean = false) => {
    console.log("handleLinkPassword");
    try {
      let signature: string = "";
  
      if (manual) {
        if (!password || !iKnow) {
          alert("Please complete all required fields and checkboxes.");
          return;
        }
        const sig = prompt("Enter your signature:");
        if (sig) {
          saveCredentials(password, sig);
          signature = sig;
          console.log("signature is:" + signature);
          localStorage.setItem("wallet_set", "true");
          setOutput(`Linked successfully. Signature: ${signature}`);
        }
      } else {
        if (linking) {
          setLinking(false);
          return;
        }
        setLinking(true);
        const ed = new HDKEY(password);
        const chainCode = ed.chainCode;
        const msg = `Sign this message to link your wallet with the chain code: ${chainCode}`;
  
        signature = await signMessageAsync({ message: msg });
  
        if (!signature) {
          throw new Error("Sign failed");
        }
        console.log("Signature:", signature);
        setOutput(`Linked successfully. Signature: ${signature}`);
      }
      try {
        const { forest: forest1, cid: cid1, rootDir: rootDir1 } = await initWNFS(store, signature);
      
        // Convert CID Uint8Array to string for storage
        const cidString = CID.decode(cid1).toString();
    
        setRootDir(rootDir1);
        setForest(forest1);
        setRootCid(cidString);
        setKey(signature);
        console.log({cidString: cidString, cid1: cid1});
      } catch (err) {
        console.error("Error:", err);
        setError("Unable to create private directory3.");
      }
    } catch (err) {
      console.error("Error:", err);
      setError("Unable to create private directory2.");
    }
  };
  
  const loadPrivateDirectory = async (
  ): Promise<any> => {
    try {
      // Convert stored CID string back to Uint8Array
      const cidBytes = CID.parse(rootCid).bytes;
      console.log({cidBytes: cidBytes, rootCid: rootCid});
      
      
      const rootDir = await reloadWNFS(store, cidBytes, key);
      return rootDir;
    } catch (error) {
      console.error('Failed to load private directory:', error);
      throw error;
    }
  };

  const saveCredentials = (password: string, signatureData: string) => {
    const credentials = { password, signatureData };
    localStorage.setItem('credentials', JSON.stringify(credentials));
  };

  const getCredentials = () => {
    const credentials = localStorage.getItem('credentials');
    return credentials ? JSON.parse(credentials) : null;
  };

  const handleSignMetamask = async () => {
    if (!password || !iKnow || !metamaskOpen) {
      alert('Please complete all required fields and checkboxes.');
      return;
    }
    
    try {
      console.log('connect');
      modal.close();
      modal.open({ view: 'Connect' }).then((res) => {
        console.log('res received');
        console.log(res);
      });
    } catch (error) {
      console.error('Connection error:', error);
      alert('Failed to connect wallet. Please try again.');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">FxFotos Web</h1>
      
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter password"
        className="w-full p-2 mb-4 border rounded"
      />
      <div className="mb-4">
        <input
          type="checkbox"
          checked={iKnow}
          onChange={(e) => setIKnow(e.target.checked)}
          id="i-know-checkbox"
        />
        <label htmlFor="i-know-checkbox" className="ml-2">I know the risks</label>
      </div>
      <div className="mb-4">
        <input
          type="checkbox"
          checked={metamaskOpen}
          onChange={(e) => setMetamaskOpen(e.target.checked)}
          id="metamask-open-checkbox"
        />
        <label htmlFor="metamask-open-checkbox" className="ml-2">MetaMask is open</label>
      </div>
      <button
        onClick={handleSignMetamask}
        disabled={!password || !iKnow || !metamaskOpen}
        className="bg-blue-500 text-white p-2 rounded mr-2 disabled:opacity-50"
      >
        Sign with MetaMask
      </button>
      <button
        onClick={() => {handleLinkPassword(true);}}
        disabled={!password || !iKnow}
        className="bg-green-500 text-white p-2 rounded mr-2 disabled:opacity-50"
      >
        Sign Manually
      </button>

      <input 
        type="text" 
        value={rootCid} 
        onChange={(e) => setRootCid(e.target.value)} 
        placeholder="Enter root CID"
        className="w-full p-2 mb-4 border rounded mt-4"
      />
      <button 
        onClick={loadPrivateDirectory}
        className="bg-yellow-500 text-white p-2 rounded mb-4"
      >
        Load Files
      </button>

      {error && <p className="text-red-500">{error}</p>}

      {output && (
        <pre className="bg-gray-100 p-4 rounded mt-4 overflow-auto">
          {output}
        </pre>
      )}
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;