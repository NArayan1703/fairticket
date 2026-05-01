import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("secure_pass", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const toDisc = (s) =>
    Buffer.from(anchor.utils.sha256.hash(s)).subarray(0, 8);

  const programId = new anchor.web3.PublicKey(
    "EGizM15vjmre3oskrBNg3Mh6dBrfDp2Xcw74SyfU12jV"
  );
  const idl = {
    address: programId.toBase58(),
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
      {
        name: "executeTransfer",
        discriminator: Buffer.from([105, 37, 101, 197, 75, 251, 102, 26]),
        accounts: [
          { name: "sourceTokenAccount", isMut: false, isSigner: false },
          { name: "ticketMint", isMut: false, isSigner: false },
          { name: "destinationTokenAccount", isMut: false, isSigner: false },
          { name: "transferAuthority", isMut: false, isSigner: false },
          { name: "extraAccountMetas", isMut: false, isSigner: false },
          { name: "event", isMut: false, isSigner: false },
          { name: "sourceVault", isMut: false, isSigner: false },
          { name: "destinationVault", isMut: false, isSigner: false },
        ],
        args: [{ name: "amount", type: "u64" }],
      },
    ],
    accounts: [
      {
        name: "userVault",
        discriminator: toDisc("account:UserVault"),
      },
      {
        name: "event",
        discriminator: toDisc("account:Event"),
      },
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
  };
  const program = new Program(idl, provider);
  const user = provider.wallet;

  const deriveVaultPda = (owner) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.toBuffer()],
      program.programId
    )[0];

  const vaultPda = deriveVaultPda(user.publicKey);

  const deriveEventPda = (mint) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), user.publicKey.toBuffer(), mint.toBuffer()],
      program.programId
    )[0];

  const deriveTicketMintPda = (eventId) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("ticket_mint"),
        user.publicKey.toBuffer(),
        eventId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

  const deriveExtraAccountMetasPda = (mint) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mint.toBuffer()],
      program.programId
    )[0];

  const createTicketMint = async (eventId) => {
    const mint = deriveTicketMintPda(eventId);

    await program.methods
      .createTicketMint(eventId)
      .accounts({
        ticketMint: mint,
        organizer: user.publicKey,
        securePassProgram: program.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return mint;
  };

  const setupExtraAccountMetas = async (mint, eventPda) => {
    const extraAccountMetas = deriveExtraAccountMetasPda(mint);

    await program.methods
      .setupExtraAccountMetas()
      .accounts({
        extraAccountMetas,
        organizer: user.publicKey,
        event: eventPda,
        ticketMint: mint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return extraAccountMetas;
  };

  it("Initializes the User Vault", async () => {
    await program.methods
      .initializeVault()
      .accounts({
        vault: vaultPda,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const vaultAccount = await program.account.userVault.fetch(vaultPda);
    expect(vaultAccount.owner.toBase58()).to.equal(user.publicKey.toBase58());
    expect(vaultAccount.ticketCount.toNumber()).to.equal(0);
  });

  it("Mints a Ticket", async () => {
    const mint = await createTicketMint(new anchor.BN(1));
    const eventPda = deriveEventPda(mint);

    await program.methods
      .initializeEvent(new anchor.BN(2_000_000_000), 250)
      .accounts({
        event: eventPda,
        organizer: user.publicKey,
        ticketMint: mint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await setupExtraAccountMetas(mint, eventPda);

    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user.payer,
      mint,
      user.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .mintTicket()
      .accounts({
        user: user.publicKey,
        organizer: user.publicKey,
        vault: vaultPda,
        event: eventPda,
        ticketMint: mint,
        userTokenAccount: userTokenAccount.address,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const vaultAccount = await program.account.userVault.fetch(vaultPda);
    expect(vaultAccount.ticketCount.toNumber()).to.equal(1);

    const eventAccount = await program.account.event.fetch(eventPda);
    expect(eventAccount.organizer.toBase58()).to.equal(
      user.publicKey.toBase58()
    );
    expect(eventAccount.ticketMint.toBase58()).to.equal(mint.toBase58());
    expect(eventAccount.maxResalePriceLamports.toString()).to.equal(
      "2000000000"
    );
    expect(eventAccount.royaltyBasisPoints).to.equal(250);
    expect(eventAccount.ticketsMinted.toNumber()).to.equal(1);

    const ticketAccount = await getAccount(
      provider.connection,
      userTokenAccount.address,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    expect(ticketAccount.amount.toString()).to.equal("1");
  });

  it("Rejects minting to a token account not owned by the user", async () => {
    const mint = await createTicketMint(new anchor.BN(2));
    const eventPda = deriveEventPda(mint);

    await program.methods
      .initializeEvent(new anchor.BN(1_000_000_000), 500)
      .accounts({
        event: eventPda,
        organizer: user.publicKey,
        ticketMint: mint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await setupExtraAccountMetas(mint, eventPda);

    const otherUser = anchor.web3.Keypair.generate();
    const otherTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user.payer,
      mint,
      otherUser.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    try {
      await program.methods
        .mintTicket()
        .accounts({
          user: user.publicKey,
          organizer: user.publicKey,
          vault: vaultPda,
          event: eventPda,
          ticketMint: mint,
          userTokenAccount: otherTokenAccount.address,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      expect.fail("Expected mintTicket to reject a mismatched token account");
    } catch (error) {
      expect(error.message).to.include("ConstraintTokenOwner");
    }

    const vaultAccount = await program.account.userVault.fetch(vaultPda);
    expect(vaultAccount.ticketCount.toNumber()).to.equal(1);

    const eventAccount = await program.account.event.fetch(eventPda);
    expect(eventAccount.ticketsMinted.toNumber()).to.equal(0);
  });

  it("Validates resale price ceilings for ticket transfers", async () => {
    const buyer = anchor.web3.Keypair.generate();
    const buyerVaultPda = deriveVaultPda(buyer.publicKey);

    const airdropSignature = await provider.connection.requestAirdrop(
      buyer.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    await program.methods
      .initializeVault()
      .accounts({
        vault: buyerVaultPda,
        user: buyer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const mint = await createTicketMint(new anchor.BN(3));
    const eventPda = deriveEventPda(mint);

    await program.methods
      .initializeEvent(new anchor.BN(1_500_000_000), 500)
      .accounts({
        event: eventPda,
        organizer: user.publicKey,
        ticketMint: mint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await setupExtraAccountMetas(mint, eventPda);

    const sellerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user.payer,
      mint,
      user.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user.payer,
      mint,
      buyer.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .mintTicket()
      .accounts({
        user: user.publicKey,
        organizer: user.publicKey,
        vault: vaultPda,
        event: eventPda,
        ticketMint: mint,
        userTokenAccount: sellerTokenAccount.address,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const transferAccounts = {
      event: eventPda,
      sourceVault: vaultPda,
      destinationVault: buyerVaultPda,
      ticketMint: mint,
      sourceTokenAccount: sellerTokenAccount.address,
      destinationTokenAccount: buyerTokenAccount.address,
    };

    await program.methods
      .validateTicketResale(new anchor.BN(1), new anchor.BN(1_500_000_000))
      .accounts(transferAccounts)
      .rpc();

    try {
      await program.methods
        .validateTicketResale(new anchor.BN(1), new anchor.BN(1_500_000_001))
        .accounts(transferAccounts)
        .rpc();

      expect.fail(
        "Expected resale validation to reject an overpriced transfer"
      );
    } catch (error) {
      expect(error.message).to.include("ResalePriceTooHigh");
    }
  });
});
