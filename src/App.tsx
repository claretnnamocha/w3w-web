import { Core } from "@walletconnect/core";
import { SessionTypes } from "@walletconnect/types";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import {
  Web3Wallet,
  Web3WalletTypes,
  type IWeb3Wallet,
} from "@walletconnect/web3wallet";
import { HDNodeWallet, Wallet } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";
import { hexToString } from "viem";
import { mainnet } from "viem/chains";
import "./App.css";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";

const chain = mainnet;

function App() {
  const [account, setAccount] = useState<HDNodeWallet>();
  const [address, setAddress] = useState("");
  const [web3wallet, setWeb3Wallet] = useState<IWeb3Wallet>();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [uri, setUri] = useState<string>();
  const [session, setSession] = useState<SessionTypes.Struct>();
  const [requestContent, setRequestContent] = useState({
    method: "",
    message: "",
    topic: "",
    response: {},
  });
  const dialogRef = useRef<HTMLDialogElement>(null);

  const init = useCallback(async () => {
    const core = new Core({
      projectId: import.meta.env.VITE_PROJECT_ID,
    });

    const w3w = await Web3Wallet.init({
      core,
      metadata: {
        name: "W3W Demo",
        description: "Demo Client as Wallet/Peer",
        url: "www.walletconnect.com",
        icons: ["https://icon.icepanel.io/Technology/svg/Vite.js.svg"],
      },
    });

    setWeb3Wallet(w3w);
  }, []);

  const generateAccount = useCallback(() => {
    const randomAccount = Wallet.createRandom();
    setAccount(randomAccount);
    setAddress(randomAccount.address);
  }, []);

  const pair = useCallback(async () => {
    if (uri) {
      try {
        console.log("pairing with uri", uri);
        await web3wallet?.pair({ uri });
        setIsConnected(true);
      } catch (e) {
        console.error("Error pairing with uri", e);
      }
    }
  }, [uri, web3wallet]);

  const onSessionRequest = useCallback(
    async (event: Web3WalletTypes.SessionRequest) => {
      const { topic, params, id } = event;
      const { request } = params;
      const requestParamsMessage = request.params[0];

      const message = hexToString(requestParamsMessage);

      const signedMessage = await account?.signMessage(message);

      setRequestContent({
        message,
        method: request.method,
        topic,
        response: {
          id,
          jsonrpc: "2.0",
          result: signedMessage,
        },
      });

      dialogRef.current?.showModal();
    },
    [account]
  );

  const onSessionProposal = useCallback(
    async ({ id, params }: Web3WalletTypes.SessionProposal) => {
      try {
        if (!address) {
          throw new Error("Address not available");
        }
        const namespaces = {
          proposal: params,
          supportedNamespaces: {
            eip155: {
              chains: [`eip155:${chain.id}`],
              methods: ["eth_sendTransaction", "personal_sign"],
              events: ["accountsChanged", "chainChanged"],
              accounts: [`eip155:${chain.id}:${address}`],
            },
          },
        };

        const approvedNamespaces = buildApprovedNamespaces(namespaces);

        const session = await web3wallet?.approveSession({
          id,
          namespaces: approvedNamespaces,
        });

        setSession(session);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        await web3wallet?.rejectSession({
          id,
          reason: getSdkError("USER_REJECTED"),
        });
      }
    },
    [address, web3wallet]
  );

  const onAcceptSessionRequest = useCallback(async () => {
    const { topic, response } = requestContent;
    await web3wallet?.respondSessionRequest({
      topic,
      response: response as {
        id: number;
        jsonrpc: string;
        result: `0x${string}`;
      },
    });
    dialogRef.current?.close();
  }, [requestContent, web3wallet]);

  const onRejectSessionRequest = useCallback(async () => {
    const { topic, response } = requestContent;
    const { id } = response as { id: number };
    await web3wallet?.respondSessionRequest({
      topic,
      response: {
        id,
        jsonrpc: "2.0",
        error: {
          code: 5000,
          message: "User rejected.",
        },
      },
    });
    dialogRef.current?.close();
  }, [requestContent, web3wallet]);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (web3wallet) {
      web3wallet.on("session_proposal", onSessionProposal);
      web3wallet.on("session_request", onSessionRequest);

      const activeSessions = web3wallet?.getActiveSessions();

      if (activeSessions) {
        const currentSession = Object.values(activeSessions)[0];
        setSession(currentSession);
        setIsConnected(Object.keys(activeSessions).length > 0);
      }
    }

    return () => {
      web3wallet?.off("session_proposal", onSessionProposal);
      web3wallet?.off("session_request", onSessionRequest);
    };
  }, [onSessionProposal, onSessionRequest, web3wallet]);

  return (
    <>
      <div>
        <a href="#">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="#">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      {isConnected && (
        <button
          type="button"
          onClick={() => {
            web3wallet?.disconnectSession({
              topic: session?.topic as string,
              reason: {
                code: 5000,
                message: "User disconnected",
              },
            });
            setIsConnected(false);
          }}
        >
          Disconnect Session
        </button>
      )}
      <div className="card">
        <button onClick={generateAccount}>Generate Wallet</button>
        <p>Click the button above to generate wallet</p>
        {address && (
          <>
            <p>Address: {address}</p>

            <input
              type="text"
              onChange={(e) => setUri(e.target.value)}
              placeholder="Enter URI"
            />
            <br />
            <br />
            <button type="button" onClick={pair}>
              Pair
            </button>
          </>
        )}
      </div>

      <dialog ref={dialogRef}>
        <h3>
          New approval for <span>{requestContent.method}</span>
        </h3>
        <code>{requestContent.message}</code>
        <div className="btn-container">
          <button type="button" onClick={onAcceptSessionRequest}>
            Accept
          </button>
          <button type="button" onClick={onRejectSessionRequest}>
            Reject
          </button>
        </div>
      </dialog>
    </>
  );
}

export default App;
