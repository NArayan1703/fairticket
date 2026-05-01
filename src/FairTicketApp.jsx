import React, { useMemo, useState } from 'react';
import * as anchor from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const PROGRAM_ID = new anchor.web3.PublicKey('EGizM15vjmre3oskrBNg3Mh6dBrfDp2Xcw74SyfU12jV');
const DEFAULT_RPC = 'https://api.devnet.solana.com';

const toDisc = (s) => Buffer.from(anchor.utils.sha256.hash(s)).subarray(0, 8);
const short = (key) => (key ? `${key.toBase58().slice(0, 4)}...${key.toBase58().slice(-4)}` : 'Not set');

const deriveVaultPda = (owner) =>
  anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('vault'), owner.toBuffer()], PROGRAM_ID)[0];
const deriveTicketMintPda = (organizer, eventId) =>
  anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('ticket_mint'), organizer.toBuffer(), eventId.toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  )[0];
const deriveEventPda = (organizer, mint) =>
  anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('event'), organizer.toBuffer(), mint.toBuffer()], PROGRAM_ID)[0];
const deriveMintAuthorityPda = (organizer, mint) =>
  anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('mint_authority'), organizer.toBuffer(), mint.toBuffer()], PROGRAM_ID)[0];
const deriveExtraAccountMetasPda = (mint) =>
  anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('extra-account-metas'), mint.toBuffer()], PROGRAM_ID)[0];

const parsePubkey = (value) => {
  try {
    return value ? new anchor.web3.PublicKey(value) : null;
  } catch {
    return null;
  }
};

const encodeString = (value) => {
  const bytes = Buffer.from(value ?? '', 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
};
const encodeU64 = (value) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
};
const encodeU16 = (value) => {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(Number(value));
  return buf;
};

export default function FairTicketApp() {
  const [wallet, setWallet] = useState(null);
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC);
  const [organizerAddress, setOrganizerAddress] = useState('');
  const [eventIdStr, setEventIdStr] = useState(Date.now().toString());
  const [paymentMintAddress, setPaymentMintAddress] = useState('');
  const [paymentDecimals, setPaymentDecimals] = useState('6');
  const [ticketName, setTicketName] = useState('VIP Ticket');
  const [imageUri, setImageUri] = useState('https://placehold.co/600x600/png');
  const [ticketPriceSol, setTicketPriceSol] = useState('10');
  const [maxResaleSol, setMaxResaleSol] = useState('20');
  const [royaltyBps, setRoyaltyBps] = useState('500');
  const [refundBps, setRefundBps] = useState('7000');
  const [resaleBuyerWallet, setResaleBuyerWallet] = useState('');
  const [logs, setLogs] = useState([]);

  const connection = useMemo(() => new anchor.web3.Connection(rpcUrl || DEFAULT_RPC, 'confirmed'), [rpcUrl]);
  const eventId = useMemo(() => new anchor.BN(eventIdStr || '0'), [eventIdStr]);
  const organizerPubkey = useMemo(() => parsePubkey(organizerAddress) || wallet, [organizerAddress, wallet]);
  const paymentMint = useMemo(() => parsePubkey(paymentMintAddress), [paymentMintAddress]);
  const paymentDecimalsNumber = Number(paymentDecimals || '6');

  const ticketMint = organizerPubkey ? deriveTicketMintPda(organizerPubkey, eventId) : null;
  const event = organizerPubkey && ticketMint ? deriveEventPda(organizerPubkey, ticketMint) : null;
  const mintAuthority = organizerPubkey && ticketMint ? deriveMintAuthorityPda(organizerPubkey, ticketMint) : null;
  const treasuryAuthority = organizerPubkey && ticketMint && paymentMint
    ? anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('treasury_authority'), organizerPubkey.toBuffer(), ticketMint.toBuffer(), paymentMint.toBuffer()],
      PROGRAM_ID,
    )[0]
    : null;
  const treasuryTokenAccount = paymentMint && treasuryAuthority
    ? getAssociatedTokenAddressSync(paymentMint, treasuryAuthority, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    : null;
  const extraAccountMetas = ticketMint ? deriveExtraAccountMetasPda(ticketMint) : null;
  const buyerVault = wallet ? deriveVaultPda(wallet) : null;
  const buyerTokenAccount = wallet && ticketMint
    ? getAssociatedTokenAddressSync(ticketMint, wallet, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    : null;
  const buyerPaymentTokenAccount = wallet && paymentMint
    ? getAssociatedTokenAddressSync(paymentMint, wallet, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    : null;
  const resaleBuyerPubkey = parsePubkey(resaleBuyerWallet);
  const resaleBuyerVault = resaleBuyerPubkey ? deriveVaultPda(resaleBuyerPubkey) : null;
  const resaleBuyerTokenAccount = resaleBuyerPubkey && ticketMint
    ? getAssociatedTokenAddressSync(ticketMint, resaleBuyerPubkey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    : null;
  const resaleBuyerPaymentTokenAccount = resaleBuyerPubkey && paymentMint
    ? getAssociatedTokenAddressSync(paymentMint, resaleBuyerPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    : null;

  const logMsg = (message) => {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    let emoji = 'ℹ️';
    if (message.includes('failed') || message.includes('error')) emoji = '❌';
    else if (message.includes('confirmed') || message.includes('complete')) emoji = '✅';
    else if (message.includes('...')) emoji = '⏳';
    setLogs((prev) => [[timestamp, emoji, message], ...prev].slice(0, 50));
  };

  const getPhantomWallet = () => window.solana;
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

  const connectWallet = () => run('Connect wallet', async () => {
    const phantom = getPhantomWallet();
    if (!phantom) throw new Error('No Solana wallet found. Install Phantom or another Wallet Standard wallet.');
    const connected = await phantom.connect();
    setWallet(connected.publicKey);
    setOrganizerAddress((prev) => prev || connected.publicKey.toBase58());
  });

  const signAndSend = async (tx, signer) => {
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = signer;
    const phantom = getPhantomWallet();
    const signed = await phantom.signTransaction(tx);
    return connection.sendRawTransaction(signed.serialize());
  };

  const requireOrganizerWallet = () => {
    if (!wallet) throw new Error('Connect the organizer wallet first.');
    if (!organizerPubkey) throw new Error('Enter a valid organizer address.');
    if (!wallet.equals(organizerPubkey)) throw new Error('Switch to the organizer wallet for this action.');
  };

  const initVault = () => run('Initialize vault', async () => {
    if (!wallet) throw new Error('Connect a wallet first.');
    const vault = deriveVaultPda(wallet);
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data: toDisc('global:initialize_vault'),
      keys: [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    return signAndSend(new anchor.web3.Transaction().add(instruction), wallet);
  });

  const createMint = () => run('Create ticket mint', async () => {
    requireOrganizerWallet();
    if (!ticketMint || !mintAuthority) throw new Error('Set the organizer address and event ID first.');
    const data = Buffer.concat([toDisc('global:create_ticket_mint'), encodeU64(eventId.toString())]);
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data,
      keys: [
        { pubkey: ticketMint, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: mintAuthority, isSigner: false, isWritable: false },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    return signAndSend(new anchor.web3.Transaction().add(instruction), wallet);
  });

  const initEvent = () => run('Initialize event', async () => {
    requireOrganizerWallet();
    if (!ticketMint || !event || !paymentMint || !treasuryAuthority || !treasuryTokenAccount) {
      throw new Error('Create a ticket mint and set a payment mint first.');
    }
    const ticketPricePaymentUnits = Math.floor(Number(ticketPriceSol) * (10 ** paymentDecimalsNumber));
    const maxResalePaymentUnits = Math.floor(Number(maxResaleSol) * (10 ** paymentDecimalsNumber));
    const data = Buffer.concat([
      toDisc('global:initialize_event'),
      encodeString(ticketName),
      encodeString(imageUri),
      encodeU64(ticketPricePaymentUnits),
      encodeU64(maxResalePaymentUnits),
      encodeU16(Number(royaltyBps)),
      encodeU16(Number(refundBps)),
    ]);
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data,
      keys: [
        { pubkey: event, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: ticketMint, isSigner: false, isWritable: false },
        { pubkey: paymentMint, isSigner: false, isWritable: false },
        { pubkey: treasuryAuthority, isSigner: false, isWritable: false },
        { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    return signAndSend(new anchor.web3.Transaction().add(instruction), wallet);
  });

  const setupHooks = () => run('Setup hook metas', async () => {
    requireOrganizerWallet();
    if (!ticketMint || !event || !extraAccountMetas) throw new Error('Initialize an event first.');
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data: toDisc('global:setup_extra_account_metas'),
      keys: [
        { pubkey: extraAccountMetas, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: event, isSigner: false, isWritable: false },
        { pubkey: ticketMint, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    return signAndSend(new anchor.web3.Transaction().add(instruction), wallet);
  });

  const purchaseTicket = () => run('Purchase ticket', async () => {
    if (!wallet) throw new Error('Connect the buyer wallet first.');
    if (!organizerPubkey || !ticketMint || !event || !mintAuthority || !paymentMint || !treasuryAuthority || !treasuryTokenAccount) {
      throw new Error('Create the organizer mint, event, and payment mint first.');
    }
    let tx = new anchor.web3.Transaction();
    const ataInfo = await connection.getAccountInfo(buyerTokenAccount);
    if (!ataInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          wallet,
          buyerTokenAccount,
          wallet,
          ticketMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }
    const paymentAtaInfo = await connection.getAccountInfo(buyerPaymentTokenAccount);
    if (!paymentAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          wallet,
          buyerPaymentTokenAccount,
          wallet,
          paymentMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data: toDisc('global:purchase_ticket'),
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: organizerPubkey, isSigner: false, isWritable: false },
        { pubkey: buyerVault, isSigner: false, isWritable: true },
        { pubkey: event, isSigner: false, isWritable: true },
        { pubkey: ticketMint, isSigner: false, isWritable: true },
        { pubkey: paymentMint, isSigner: false, isWritable: false },
        { pubkey: mintAuthority, isSigner: false, isWritable: false },
        { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: buyerPaymentTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryAuthority, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    tx.add(instruction);
    return signAndSend(tx, wallet);
  });

  const burnForRefund = () => run('Burn for refund', async () => {
    if (!wallet) throw new Error('Connect the buyer wallet first.');
    if (!organizerPubkey || !ticketMint || !event || !paymentMint || !treasuryAuthority || !treasuryTokenAccount) {
      throw new Error('Create the organizer event and payment mint first.');
    }
    const paymentAtaInfo = await connection.getAccountInfo(buyerPaymentTokenAccount);
    if (!paymentAtaInfo) {
      throw new Error('Create or fund the buyer payment token account first.');
    }
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data: toDisc('global:burn_ticket_for_refund'),
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: organizerPubkey, isSigner: false, isWritable: false },
        { pubkey: buyerVault, isSigner: false, isWritable: true },
        { pubkey: event, isSigner: false, isWritable: true },
        { pubkey: ticketMint, isSigner: false, isWritable: true },
        { pubkey: paymentMint, isSigner: false, isWritable: false },
        { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: buyerPaymentTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryAuthority, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
    return signAndSend(new anchor.web3.Transaction().add(instruction), wallet);
  });

  const validateResale = () => run('Validate resale', async () => {
    if (!wallet) throw new Error('Connect a wallet first.');
    if (!organizerPubkey || !ticketMint || !event || !buyerVault || !buyerTokenAccount) {
      throw new Error('Initialize the organizer event and connect the seller wallet first.');
    }
    if (!resaleBuyerPubkey || !resaleBuyerVault || !resaleBuyerTokenAccount) {
      throw new Error('Enter a destination wallet for the resale.');
    }
    let tx = new anchor.web3.Transaction();
    const buyerAtaInfo = await connection.getAccountInfo(resaleBuyerTokenAccount);
    if (!buyerAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          wallet,
          resaleBuyerTokenAccount,
          resaleBuyerPubkey,
          ticketMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }
    const resalePricePaymentUnits = Math.floor(Number(maxResaleSol) * (10 ** paymentDecimalsNumber));
    const data = Buffer.concat([toDisc('global:validate_ticket_resale'), encodeU64(1), encodeU64(resalePricePaymentUnits)]);
    const instruction = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      data,
      keys: [
        { pubkey: event, isSigner: false, isWritable: false },
        { pubkey: buyerVault, isSigner: false, isWritable: false },
        { pubkey: resaleBuyerVault, isSigner: false, isWritable: false },
        { pubkey: ticketMint, isSigner: false, isWritable: false },
        { pubkey: buyerTokenAccount, isSigner: false, isWritable: false },
        { pubkey: resaleBuyerTokenAccount, isSigner: false, isWritable: false },
      ],
    });
    tx.add(instruction);
    return signAndSend(tx, wallet);
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
          <input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} placeholder="https://api.devnet.solana.com" />
        </label>
        <label>
          Organizer address
          <input value={organizerAddress} onChange={(e) => setOrganizerAddress(e.target.value)} placeholder="Organizer public key" />
        </label>
        <label>
          Event ID
          <input type="number" value={eventIdStr} onChange={(e) => setEventIdStr(e.target.value)} />
        </label>
        <label>
          Ticket name
          <input value={ticketName} onChange={(e) => setTicketName(e.target.value)} placeholder="VIP Ticket" />
        </label>
        <label>
          Image URL
          <input value={imageUri} onChange={(e) => setImageUri(e.target.value)} placeholder="https://..." />
        </label>
        <label>
          Payment mint
          <input value={paymentMintAddress} onChange={(e) => setPaymentMintAddress(e.target.value)} placeholder="USDT mint address" />
        </label>
        <label>
          Payment decimals
          <input type="number" min="0" max="18" value={paymentDecimals} onChange={(e) => setPaymentDecimals(e.target.value)} />
        </label>
        <label>
          Ticket price (payment units)
          <input type="number" step="0.1" value={ticketPriceSol} onChange={(e) => setTicketPriceSol(e.target.value)} />
        </label>
        <label>
          Max resale (payment units)
          <input type="number" step="0.1" value={maxResaleSol} onChange={(e) => setMaxResaleSol(e.target.value)} />
        </label>
        <label>
          Royalty (bps)
          <input type="number" min="0" max="10000" value={royaltyBps} onChange={(e) => setRoyaltyBps(e.target.value)} />
        </label>
        <label>
          Refund (bps)
          <input type="number" min="0" max="10000" value={refundBps} onChange={(e) => setRefundBps(e.target.value)} />
        </label>
        <label>
          Resale destination wallet
          <input value={resaleBuyerWallet} onChange={(e) => setResaleBuyerWallet(e.target.value)} placeholder="Buyer public key" />
        </label>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>📊 Ticket State</h2>
          <dl>
            <div><dt>Connected wallet</dt><dd>{short(wallet)}</dd></div>
            <div><dt>Organizer wallet</dt><dd>{short(organizerPubkey)}</dd></div>
            <div><dt>Ticket name</dt><dd>{ticketName}</dd></div>
            <div><dt>Event ID</dt><dd>{eventIdStr}</dd></div>
            <div><dt>Ticket mint</dt><dd>{short(ticketMint)}</dd></div>
            <div><dt>Mint authority</dt><dd>{short(mintAuthority)}</dd></div>
            <div><dt>Event PDA</dt><dd>{short(event)}</dd></div>
            <div><dt>Payment mint</dt><dd>{short(paymentMint)}</dd></div>
            <div><dt>Treasury authority</dt><dd>{short(treasuryAuthority)}</dd></div>
            <div><dt>Treasury ATA</dt><dd>{short(treasuryTokenAccount)}</dd></div>
            <div><dt>Buyer vault</dt><dd>{short(buyerVault)}</dd></div>
            <div><dt>Buyer ATA</dt><dd>{short(buyerTokenAccount)}</dd></div>
            <div><dt>Buyer payment ATA</dt><dd>{short(buyerPaymentTokenAccount)}</dd></div>
            <div><dt>Resale target</dt><dd>{short(resaleBuyerPubkey)}</dd></div>
            <div><dt>Hook metadata</dt><dd>{short(extraAccountMetas)}</dd></div>
          </dl>
        </article>

        <article className="panel actions">
          <h2>⚡ Organizer / Buyer Actions</h2>
          <button onClick={initVault}>1. Initialize Wallet Vault</button>
          <button onClick={createMint}>2. Create Ticket Mint</button>
          <button onClick={initEvent}>3. Initialize Event</button>
          <button onClick={setupHooks}>4. Setup Hook Metadata</button>
          <button onClick={purchaseTicket}>5. Buy Ticket NFT</button>
          <button onClick={burnForRefund}>6. Burn for 70% Refund</button>
          <button onClick={validateResale}>7. Validate Resale Cap</button>
        </article>
      </section>

      <section className="panel">
        <h2>📝 Transaction Log</h2>
        <div className="output">
          {logs.map((log, i) => (
            <div key={i} style={{ padding: '6px 0', lineHeight: '1.5' }}>
              [{log[0]}] {log[1]} {log[2]}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
