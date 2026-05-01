import "./polyfills";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import "./styles.css";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: anchor.web3.PublicKey;
  connect: () => Promise<{ publicKey: anchor.web3.PublicKey }>;
  disconnect?: () => Promise<void>;
  signTransaction: <T extends anchor.web3.Transaction>(
    transaction: T
  ) => Promise<T>;
  signAllTransactions: <T extends anchor.web3.Transaction>(
    transactions: T[]
  ) => Promise<T[]>;
};

type FlowState = {
  wallet?: anchor.web3.PublicKey;
  eventId: anchor.BN;
  ticketMint?: anchor.web3.PublicKey;
  event?: anchor.web3.PublicKey;
  vault?: anchor.web3.PublicKey;
  userTokenAccount?: anchor.web3.PublicKey;
  extraAccountMetas?: anchor.web3.PublicKey;
};

const PROGRAM_ID = new anchor.web3.PublicKey(
  "EGizM15vjmre3oskrBNg3Mh6dBrfDp2Xcw74SyfU12jV"
);
const DEFAULT_RPC = "http://127.0.0.1:8899";

const toDisc = (s: string) =>
  Buffer.from(anchor.utils.sha256.hash(s)).subarray(0, 8);

const idl = {
  address: PROGRAM_ID.toBase58(),
  version: "0.1.0",
  name: "secure_pass",
  metadata: {},
  instructions: [
    {
      name: "initializeVault",
      discriminator: toDisc("global:initialize_vault"),
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "user", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "createTicketMint",
      discriminator: toDisc("global:create_ticket_mint"),
      accounts: [
        { name: "ticketMint", isMut: true, isSigner: false },
        { name: "organizer", isMut: true, isSigner: true },
        { name: "securePassProgram", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "eventId", type: "u64" }],
    },
    {
      name: "initializeEvent",
      discriminator: toDisc("global:initialize_event"),
      accounts: [
        { name: "event", isMut: true, isSigner: false },
        { name: "organizer", isMut: true, isSigner: true },
        { name: "ticketMint", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "maxResalePriceLamports", type: "u64" },
        { name: "royaltyBasisPoints", type: "u16" },
      ],
    },
    {
      name: "setupExtraAccountMetas",
      discriminator: toDisc("global:setup_extra_account_metas"),
      accounts: [
        { name: "extraAccountMetas", isMut: true, isSigner: false },
        { name: "organizer", isMut: true, isSigner: true },
        { name: "event", isMut: false, isSigner: false },
        { name: "ticketMint", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "mintTicket",
      discriminator: toDisc("global:mint_ticket"),
      accounts: [
        { name: "user", isMut: true, isSigner: true },
        { name: "organizer", isMut: true, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "event", isMut: true, isSigner: false },
        { name: "ticketMint", isMut: true, isSigner: false },
        { name: "userTokenAccount", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "validateTicketResale",
      discriminator: toDisc("global:validate_ticket_resale"),
      accounts: [
        { name: "event", isMut: false, isSigner: false },
        { name: "sourceVault", isMut: false, isSigner: false },
        { name: "destinationVault", isMut: false, isSigner: false },
        { name: "ticketMint", isMut: false, isSigner: false },
        { name: "sourceTokenAccount", isMut: false, isSigner: false },
        { name: "destinationTokenAccount", isMut: false, isSigner: false },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "resalePriceLamports", type: "u64" },
      ],
    },
  ],
  accounts: [
    { name: "userVault", discriminator: toDisc("account:UserVault") },
    { name: "event", discriminator: toDisc("account:Event") },
  ],
  types: [
    {
      name: "userVault",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "publicKey" },
          { name: "ticketCount", type: "u64" },
        ],
      },
    },
    {
      name: "event",
      type: {
        kind: "struct",
        fields: [
          { name: "organizer", type: "publicKey" },
          { name: "ticketMint", type: "publicKey" },
          { name: "maxResalePriceLamports", type: "u64" },
          { name: "royaltyBasisPoints", type: "u16" },
          { name: "ticketsMinted", type: "u64" },
        ],
      },
    },
  ],
} as unknown as anchor.Idl;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing app root");
}

const state: FlowState = {
  eventId: new anchor.BN(Date.now()),
};

const short = (key?: anchor.web3.PublicKey) =>
  key
    ? `${key.toBase58().slice(0, 4)}...${key.toBase58().slice(-4)}`
    : "Not set";

const getWallet = () =>
  (window as unknown as { solana?: PhantomProvider }).solana;

const getConnection = () => {
  const endpoint =
    document.querySelector<HTMLInputElement>("#rpc")?.value || DEFAULT_RPC;
  return new anchor.web3.Connection(endpoint, "confirmed");
};

const getProgram = () => {
  const wallet = getWallet();
  if (!wallet?.publicKey) {
    throw new Error("Connect a wallet first.");
  }

  const anchorWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction.bind(wallet),
    signAllTransactions: wallet.signAllTransactions.bind(wallet),
  };
  const provider = new anchor.AnchorProvider(getConnection(), anchorWallet, {
    commitment: "confirmed",
  });

  return new Program(idl, provider) as any;
};

const deriveVaultPda = (owner: anchor.web3.PublicKey) =>
  anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    PROGRAM_ID
  )[0];

const deriveTicketMintPda = (
  organizer: anchor.web3.PublicKey,
  eventId: anchor.BN
) =>
  anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("ticket_mint"),
      organizer.toBuffer(),
      eventId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  )[0];

const deriveEventPda = (
  organizer: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey
) =>
  anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event"), organizer.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  )[0];

const deriveExtraAccountMetasPda = (mint: anchor.web3.PublicKey) =>
  anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    PROGRAM_ID
  )[0];

const log = (message: string) => {
  const output = document.querySelector<HTMLDivElement>("#output");
  if (!output) return;
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  output.prepend(row);
};

const renderState = () => {
  document.querySelector("#wallet")!.textContent = short(state.wallet);
  document.querySelector("#event-id")!.textContent = state.eventId.toString();
  document.querySelector("#vault")!.textContent = short(state.vault);
  document.querySelector("#mint")!.textContent = short(state.ticketMint);
  document.querySelector("#event")!.textContent = short(state.event);
  document.querySelector("#ata")!.textContent = short(state.userTokenAccount);
  document.querySelector("#metas")!.textContent = short(
    state.extraAccountMetas
  );
};

const run = async (label: string, task: () => Promise<string | void>) => {
  try {
    log(`${label}...`);
    const signature = await task();
    if (signature) {
      log(`${label} confirmed: ${signature}`);
    } else {
      log(`${label} complete.`);
    }
    renderState();
  } catch (error) {
    log(`${label} failed: ${(error as Error).message}`);
  }
};

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Solana Token-2022</p>
        <h1>FairTicket Console</h1>
      </div>
      <button id="connect" class="primary">Connect Wallet</button>
    </header>

    <section class="toolbar" aria-label="Network settings">
      <label>
        RPC endpoint
        <input id="rpc" value="${DEFAULT_RPC}" />
      </label>
      <label>
        Event id
        <input id="event-input" value="${state.eventId.toString()}" />
      </label>
      <label>
        Max resale SOL
        <input id="max-price" value="1.5" />
      </label>
      <label>
        Royalty bps
        <input id="royalty" value="500" />
      </label>
      <label>
        Buyer wallet
        <input id="buyer" placeholder="Destination wallet public key" />
      </label>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>Accounts</h2>
        <dl>
          <div><dt>Wallet</dt><dd id="wallet">Not set</dd></div>
          <div><dt>Event id</dt><dd id="event-id">Not set</dd></div>
          <div><dt>User vault</dt><dd id="vault">Not set</dd></div>
          <div><dt>Ticket mint</dt><dd id="mint">Not set</dd></div>
          <div><dt>Event PDA</dt><dd id="event">Not set</dd></div>
          <div><dt>Ticket account</dt><dd id="ata">Not set</dd></div>
          <div><dt>Hook metas</dt><dd id="metas">Not set</dd></div>
        </dl>
      </article>

      <article class="panel actions">
        <h2>Flow</h2>
        <button id="init-vault">Initialize Vault</button>
        <button id="create-mint">Create Hook Mint</button>
        <button id="init-event">Initialize Event</button>
        <button id="setup-metas">Setup Hook Metas</button>
        <button id="mint-ticket">Mint Ticket</button>
        <button id="validate-resale">Validate Resale</button>
      </article>
    </section>

    <section class="panel">
      <h2>Transaction Output</h2>
      <div id="output" class="output"></div>
    </section>
  </section>
`;

document.querySelector("#connect")?.addEventListener("click", () =>
  run("Connect wallet", async () => {
    const wallet = getWallet();
    if (!wallet) {
      throw new Error(
        "No Solana wallet found. Install Phantom or another Wallet Standard wallet."
      );
    }
    const connected = await wallet.connect();
    state.wallet = connected.publicKey;
    state.vault = deriveVaultPda(connected.publicKey);
  })
);

document.querySelector("#event-input")?.addEventListener("change", (event) => {
  state.eventId = new anchor.BN(
    (event.target as HTMLInputElement).value || "0"
  );
  state.ticketMint = state.wallet
    ? deriveTicketMintPda(state.wallet, state.eventId)
    : undefined;
  state.event =
    state.wallet && state.ticketMint
      ? deriveEventPda(state.wallet, state.ticketMint)
      : undefined;
  state.extraAccountMetas = state.ticketMint
    ? deriveExtraAccountMetasPda(state.ticketMint)
    : undefined;
  renderState();
});

document.querySelector("#init-vault")?.addEventListener("click", () =>
  run("Initialize vault", async () => {
    const program = getProgram();
    state.wallet = getWallet()!.publicKey;
    state.vault = deriveVaultPda(state.wallet!);
    return program.methods
      .initializeVault()
      .accounts({
        vault: state.vault,
        user: state.wallet,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  })
);

document.querySelector("#create-mint")?.addEventListener("click", () =>
  run("Create hook mint", async () => {
    const program = getProgram();
    state.wallet = getWallet()!.publicKey;
    state.ticketMint = deriveTicketMintPda(state.wallet!, state.eventId);
    state.event = deriveEventPda(state.wallet!, state.ticketMint);
    state.extraAccountMetas = deriveExtraAccountMetasPda(state.ticketMint);
    return program.methods
      .createTicketMint(state.eventId)
      .accounts({
        ticketMint: state.ticketMint,
        organizer: state.wallet,
        securePassProgram: PROGRAM_ID,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  })
);

document.querySelector("#init-event")?.addEventListener("click", () =>
  run("Initialize event", async () => {
    const program = getProgram();
    if (!state.wallet || !state.ticketMint || !state.event) {
      throw new Error("Create a hook mint first.");
    }
    const maxSol = Number(
      document.querySelector<HTMLInputElement>("#max-price")?.value || "0"
    );
    const royalty = Number(
      document.querySelector<HTMLInputElement>("#royalty")?.value || "0"
    );
    return program.methods
      .initializeEvent(
        new anchor.BN(maxSol * anchor.web3.LAMPORTS_PER_SOL),
        royalty
      )
      .accounts({
        event: state.event,
        organizer: state.wallet,
        ticketMint: state.ticketMint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  })
);

document.querySelector("#setup-metas")?.addEventListener("click", () =>
  run("Setup hook metas", async () => {
    const program = getProgram();
    if (!state.wallet || !state.ticketMint || !state.event) {
      throw new Error("Initialize an event first.");
    }
    state.extraAccountMetas = deriveExtraAccountMetasPda(state.ticketMint);
    return program.methods
      .setupExtraAccountMetas()
      .accounts({
        extraAccountMetas: state.extraAccountMetas,
        organizer: state.wallet,
        event: state.event,
        ticketMint: state.ticketMint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  })
);

document.querySelector("#mint-ticket")?.addEventListener("click", () =>
  run("Mint ticket", async () => {
    const program = getProgram();
    if (!state.wallet || !state.ticketMint || !state.event || !state.vault) {
      throw new Error("Initialize vault and event first.");
    }
    state.userTokenAccount = getAssociatedTokenAddressSync(
      state.ticketMint,
      state.wallet,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const connection = getConnection();
    const ataInfo = await connection.getAccountInfo(state.userTokenAccount);
    if (!ataInfo) {
      const tx = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          state.wallet,
          state.userTokenAccount,
          state.wallet,
          state.ticketMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      const sig = await program.provider.sendAndConfirm(tx, []);
      log(`Ticket account created: ${sig}`);
    }

    return program.methods
      .mintTicket()
      .accounts({
        user: state.wallet,
        organizer: state.wallet,
        vault: state.vault,
        event: state.event,
        ticketMint: state.ticketMint,
        userTokenAccount: state.userTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  })
);

document.querySelector("#validate-resale")?.addEventListener("click", () =>
  run("Validate resale", async () => {
    const program = getProgram();
    if (
      !state.wallet ||
      !state.ticketMint ||
      !state.event ||
      !state.vault ||
      !state.userTokenAccount
    ) {
      throw new Error("Mint a ticket first.");
    }
    const buyerValue =
      document.querySelector<HTMLInputElement>("#buyer")?.value;
    if (!buyerValue) {
      throw new Error(
        "Enter a buyer wallet that already has an initialized FairTicket vault."
      );
    }
    const buyer = new anchor.web3.PublicKey(buyerValue);
    const buyerVault = deriveVaultPda(buyer);
    const buyerTokenAccount = getAssociatedTokenAddressSync(
      state.ticketMint,
      buyer,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const connection = getConnection();
    const buyerAtaInfo = await connection.getAccountInfo(buyerTokenAccount);
    if (!buyerAtaInfo) {
      const tx = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          state.wallet,
          buyerTokenAccount,
          buyer,
          state.ticketMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      const sig = await program.provider.sendAndConfirm(tx, []);
      log(`Buyer ticket account created: ${sig}`);
    }

    return program.methods
      .validateTicketResale(
        new anchor.BN(1),
        new anchor.BN(anchor.web3.LAMPORTS_PER_SOL)
      )
      .accounts({
        event: state.event,
        sourceVault: state.vault,
        destinationVault: buyerVault,
        ticketMint: state.ticketMint,
        sourceTokenAccount: state.userTokenAccount,
        destinationTokenAccount: buyerTokenAccount,
      })
      .rpc();
  })
);

renderState();
