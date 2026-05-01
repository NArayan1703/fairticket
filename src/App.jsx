import React, { useState } from 'react';
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const PROGRAM_ID = new anchor.web3.PublicKey("EGizM15vjmre3oskrBNg3Mh6dBrfDp2Xcw74SyfU12jV");
const DEFAULT_RPC = "http://127.0.0.1:8899";

const toDisc = (s) => Buffer.from(anchor.utils.sha256.hash(s)).subarray(0, 8);

const short = (key) => key ? `${key.toBase58().slice(0, 4)}...${key.toBase58().slice(-4)}` : "Not set";

const deriveVaultPda = (owner) =>
  anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault"), owner.toBuffer()], PROGRAM_ID)[0];

const deriveTicketMintPda = (organizer, eventId) =>
  anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("ticket_mint"), organizer.toBuffer(), eventId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];

const deriveEventPda = (organizer, mint) =>
  anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event"), organizer.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  )[0];

const deriveExtraAccountMetasPda = (mint) =>
  anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("extra-account-metas"), mint.toBuffer()], PROGRAM_ID)[0];

export default function App() {
  const [wallet, setWallet] = useState(null);
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC);
  const [eventIdStr, setEventIdStr] = useState(Date.now().toString());
  const [maxPrice, setMaxPrice] = useState("1.5");
  const [royalty, setRoyalty] = useState("500");
  const [buyerWallet, setBuyerWallet] = useState("");
  const [logs, setLogs] = useState([]);

  const eventId = new anchor.BN(eventIdStr || "0");
  const vault = wallet ? deriveVaultPda(wallet) : null;
  const ticketMint = wallet ? deriveTicketMintPda(wallet, eventId) : null;
  const event = wallet && ticketMint ? deriveEventPda(wallet, ticketMint) : null;
  const extraAccountMetas = ticketMint ? deriveExtraAccountMetasPda(ticketMint) : null;
  const userTokenAccount = wallet && ticketMint ? getAssociatedTokenAddressSync(
    ticketMint, wallet, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  ) : null;

  const logMsg = (message) => {
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    let emoji = "ℹ️";
    if (message.includes("failed") || message.includes("error")) emoji = "❌";
    else if (message.includes("confirmed") || message.includes("complete")) emoji = "✅";
    else if (message.includes("...")) emoji = "⏳";
    
    setLogs(prev => [[timestamp, emoji, message], ...prev].slice(0, 50));
  };

  const getPhantomWallet = () => window.solana;

  const getConnection = () => new anchor.web3.Connection(rpcUrl || DEFAULT_RPC, "confirmed");

  const run = async (label, task) => {
    try {
      logMsg(`${label}...`);
      const signature = await task();
      if (signature) logMsg(`${label} confirmed: ${signature}`);
      else logMsg(`${label} complete`);
    } catch (error) {
      logMsg(`${label} failed: ${error.message}`);
      console.error(error);
    }
  };

  const connectWallet = () => run("Connect wallet", async () => {
    const phantom = getPhantomWallet();
    if (!phantom) throw new Error("No Solana wallet found. Install Phantom or another Wallet Standard wallet.");
    const connected = await phantom.connect();
    setWallet(connected.publicKey);
  });

  const initVault = () => run("Initialize vault", async () => {
    if (!wallet) throw new Error("Connect a wallet first.");
    const connection = getConnection();
    const discriminator = toDisc("global:initialize_vault");
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data: discriminator,
      keys: [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = wallet;
    const phantom = getPhantomWallet();
    const signed = await phantom.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    return sig;
  });

  const createMint = () => run("Create hook mint", async () => {
    if (!wallet) throw new Error("Connect a wallet first.");
    const connection = getConnection();
    const discriminator = toDisc("global:create_ticket_mint");
    const eventIdBuffer = Buffer.alloc(8);
    eventIdBuffer.writeBigUInt64LE(BigInt(eventId.toString()));
    const data = Buffer.concat([discriminator, eventIdBuffer]);
    
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data,
      keys: [
        { pubkey: ticketMint, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = wallet;
    const phantom = getPhantomWallet();
    const signed = await phantom.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    return sig;
  });

  const initEvent = () => run("Initialize event", async () => {
    if (!wallet || !ticketMint || !event) throw new Error("Create a hook mint first.");
    const connection = getConnection();
    const discriminator = toDisc("global:initialize_event");
    const priceBuffer = Buffer.alloc(8);
    priceBuffer.writeBigUInt64LE(BigInt(Math.floor(Number(maxPrice) * anchor.web3.LAMPORTS_PER_SOL)));
    const royaltyBuffer = Buffer.alloc(2);
    royaltyBuffer.writeUInt16LE(Number(royalty));
    const data = Buffer.concat([discriminator, priceBuffer, royaltyBuffer]);
    
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data,
      keys: [
        { pubkey: event, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: ticketMint, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = wallet;
    const phantom = getPhantomWallet();
    const signed = await phantom.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    return sig;
  });

  const setupHooks = () => run("Setup hook metas", async () => {
    if (!wallet || !ticketMint || !event) throw new Error("Initialize an event first.");
    const connection = getConnection();
    const discriminator = toDisc("global:setup_extra_account_metas");
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data: discriminator,
      keys: [
        { pubkey: extraAccountMetas, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: event, isSigner: false, isWritable: false },
        { pubkey: ticketMint, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = wallet;
    const phantom = getPhantomWallet();
    const signed = await phantom.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    return sig;
  });

  const mintTicket = () => run("Mint ticket", async () => {
    if (!wallet || !ticketMint || !event || !vault) throw new Error("Initialize vault and event first.");
    const connection = getConnection();
    let tx = new anchor.web3.Transaction();
    const ataInfo = await connection.getAccountInfo(userTokenAccount);
    if (!ataInfo) {
      tx.add(createAssociatedTokenAccountInstruction(
        wallet, userTokenAccount, wallet, ticketMint, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ));
    }
    
    const discriminator = toDisc("global:mint_ticket");
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data: discriminator,
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: event, isSigner: false, isWritable: true },
        { pubkey: ticketMint, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
    });
    tx.add(instruction);
    
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = wallet;
    const phantom = getPhantomWallet();
    const signed = await phantom.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    return sig;
  });

  const validateResale = () => run("Validate resale", async () => {
    if (!wallet || !ticketMint || !event || !vault || !userTokenAccount) throw new Error("Mint a ticket first.");
    if (!buyerWallet) throw new Error("Enter a buyer wallet that already has an initialized FairTicket vault.");
    const connection = getConnection();
    const buyer = new anchor.web3.PublicKey(buyerWallet);
    const buyerVault = deriveVaultPda(buyer);
    const buyerTokenAccount = getAssociatedTokenAddressSync(
      ticketMint, buyer, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    let tx = new anchor.web3.Transaction();
    const buyerAtaInfo = await connection.getAccountInfo(buyerTokenAccount);
    if (!buyerAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(
        wallet, buyerTokenAccount, buyer, ticketMint, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ));
    }
    
    const discriminator = toDisc("global:validate_ticket_resale");
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(1));
    const priceBuffer = Buffer.alloc(8);
    priceBuffer.writeBigUInt64LE(BigInt(anchor.web3.LAMPORTS_PER_SOL));
    const data = Buffer.concat([discriminator, amountBuffer, priceBuffer]);
    
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data,
      keys: [
        { pubkey: event, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: false },
        { pubkey: buyerVault, isSigner: false, isWritable: false },
        { pubkey: ticketMint, isSigner: false, isWritable: false },
        { pubkey: userTokenAccount, isSigner: false, isWritable: false },
        { pubkey: buyerTokenAccount, isSigner: false, isWritable: false },
      ],
    });
    tx.add(instruction);
    
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = wallet;
    const phantom = getPhantomWallet();
    const signed = await phantom.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    return sig;
  });

  return (
    <section className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Solana Token-2022</p>
          <h1>🎫 FairTicket</h1>
        </div>
        <button onClick={connectWallet} className="primary">Connect Wallet</button>
      </header>

      <section className="toolbar" aria-label="Configuration">
        <label>
          RPC endpoint
          <input value={rpcUrl} onChange={e => setRpcUrl(e.target.value)} placeholder="http://127.0.0.1:8899" />
        </label>
        <label>
          Event ID
          <input type="number" value={eventIdStr} onChange={e => setEventIdStr(e.target.value)} />
        </label>
        <label>
          Max resale (SOL)
          <input type="number" step="0.1" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Price in SOL" />
        </label>
        <label>
          Royalty (bps)
          <input type="number" min="0" max="10000" value={royalty} onChange={e => setRoyalty(e.target.value)} placeholder="500 = 5%" />
        </label>
        <label>
          Buyer wallet
          <input value={buyerWallet} onChange={e => setBuyerWallet(e.target.value)} placeholder="Destination public key" />
        </label>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>📊 Account State</h2>
          <dl>
            <div><dt>Wallet</dt><dd>{short(wallet)}</dd></div>
            <div><dt>Event ID</dt><dd>{eventIdStr}</dd></div>
            <div><dt>User Vault</dt><dd>{short(vault)}</dd></div>
            <div><dt>Ticket Mint</dt><dd>{short(ticketMint)}</dd></div>
            <div><dt>Event PDA</dt><dd>{short(event)}</dd></div>
            <div><dt>Token Account</dt><dd>{short(userTokenAccount)}</dd></div>
            <div><dt>Hook Metadata</dt><dd>{short(extraAccountMetas)}</dd></div>
          </dl>
        </article>

        <article className="panel actions">
          <h2>⚡ Actions</h2>
          <button onClick={initVault}>1. Initialize Vault</button>
          <button onClick={createMint}>2. Create Mint</button>
          <button onClick={initEvent}>3. Initialize Event</button>
          <button onClick={setupHooks}>4. Setup Hooks</button>
          <button onClick={mintTicket}>5. Mint Ticket</button>
          <button onClick={validateResale}>6. Validate Resale</button>
        </article>
      </section>

      <section className="panel">
        <h2>📝 Transaction Log</h2>
        <div className="output">
          {logs.map((log, i) => (
            <div key={i} style={{ padding: "6px 0", lineHeight: "1.5" }}>
              [{log[0]}] {log[1]} {log[2]}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
