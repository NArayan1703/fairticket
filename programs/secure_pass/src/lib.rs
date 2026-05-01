use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke_signed, system_instruction},
};
// Use the Token-2022 standard for built-in features
use anchor_spl::{
    token_2022,
    token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface},
};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::{
    collect_extra_account_metas_signer_seeds, instruction::ExecuteInstruction,
};

// Verify this matches your 'solana address -k target/deploy/secure_pass-keypair.json'
declare_id!("EGizM15vjmre3oskrBNg3Mh6dBrfDp2Xcw74SyfU12jV");

const MAX_BASIS_POINTS: u16 = 10_000;

#[program]
pub mod secure_pass {
    use super::*;

    /// Initialize a User Vault to track ticket ownership or encrypted data
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = *ctx.accounts.user.key;
        vault.ticket_count = 0;
        msg!("Vault initialized for user: {:?}", vault.owner);
        Ok(())
    }

    /// Create a Token-2022 ticket mint with this program installed as its transfer hook.
    pub fn create_ticket_mint(_ctx: Context<CreateTicketMint>, event_id: u64) -> Result<()> {
        msg!(
            "Ticket mint created for event id {} with SecurePass transfer hook.",
            event_id
        );
        Ok(())
    }

    /// Register an event policy before issuing tickets for its mint.
    pub fn initialize_event(
        ctx: Context<InitializeEvent>,
        max_resale_price_lamports: u64,
        royalty_basis_points: u16,
    ) -> Result<()> {
        require!(
            royalty_basis_points <= MAX_BASIS_POINTS,
            SecurePassError::InvalidRoyaltyBasisPoints
        );

        let event = &mut ctx.accounts.event;
        event.organizer = ctx.accounts.organizer.key();
        event.ticket_mint = ctx.accounts.ticket_mint.key();
        event.max_resale_price_lamports = max_resale_price_lamports;
        event.royalty_basis_points = royalty_basis_points;
        event.tickets_minted = 0;

        msg!(
            "Event initialized for mint {:?} with max resale price {} lamports.",
            event.ticket_mint,
            event.max_resale_price_lamports
        );
        Ok(())
    }

    /// Create Token-2022 validation metadata so transfers can supply hook accounts.
    pub fn setup_extra_account_metas(ctx: Context<SetupExtraAccountMetas>) -> Result<()> {
        let event_key = ctx.accounts.event.key();
        let extra_account_metas = vec![
            ExtraAccountMeta::new_with_pubkey(&event_key, false, false)?,
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: b"vault".to_vec(),
                    },
                    Seed::AccountData {
                        account_index: 0,
                        data_index: 32,
                        length: 32,
                    },
                ],
                false,
                false,
            )?,
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: b"vault".to_vec(),
                    },
                    Seed::AccountData {
                        account_index: 2,
                        data_index: 32,
                        length: 32,
                    },
                ],
                false,
                false,
            )?,
        ];

        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
        let rent_lamports = Rent::get()?.minimum_balance(account_size);
        let ticket_mint_key = ctx.accounts.ticket_mint.key();
        let bump = [ctx.bumps.extra_account_metas];
        let signer_seeds = collect_extra_account_metas_signer_seeds(&ticket_mint_key, &bump);

        if ctx.accounts.extra_account_metas.lamports() == 0 {
            invoke_signed(
                &system_instruction::create_account(
                    ctx.accounts.organizer.key,
                    ctx.accounts.extra_account_metas.key,
                    rent_lamports,
                    account_size as u64,
                    ctx.program_id,
                ),
                &[
                    ctx.accounts.organizer.to_account_info(),
                    ctx.accounts.extra_account_metas.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[&signer_seeds],
            )?;
        }

        let mut data = ctx.accounts.extra_account_metas.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

        msg!(
            "Extra account metas configured for ticket mint {:?}.",
            ticket_mint_key
        );
        Ok(())
    }

    /// Mint a SecurePass Ticket (NFT/Token) to the user's account
    pub fn mint_ticket(ctx: Context<MintTicket>) -> Result<()> {
        msg!("Minting SecurePass Ticket...");

        let cpi_accounts = MintTo {
            mint: ctx.accounts.ticket_mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.organizer.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Mint exactly 1 ticket
        token_interface::mint_to(cpi_ctx, 1)?;

        let vault = &mut ctx.accounts.vault;
        vault.ticket_count = vault
            .ticket_count
            .checked_add(1)
            .ok_or(SecurePassError::TicketCountOverflow)?;

        let event = &mut ctx.accounts.event;
        event.tickets_minted = event
            .tickets_minted
            .checked_add(1)
            .ok_or(SecurePassError::TicketCountOverflow)?;

        msg!(
            "Ticket minted! User now has {} tickets.",
            vault.ticket_count
        );
        Ok(())
    }

    /// Marketplace-facing transfer validation that can enforce the resale price.
    pub fn validate_ticket_resale(
        ctx: Context<ValidateTicketTransfer>,
        amount: u64,
        resale_price_lamports: u64,
    ) -> Result<()> {
        validate_transfer_policy(
            &ctx.accounts.event,
            &ctx.accounts.source_token_account,
            &ctx.accounts.destination_token_account,
            &ctx.accounts.source_vault,
            &ctx.accounts.destination_vault,
            &ctx.accounts.ticket_mint,
            amount,
            Some(resale_price_lamports),
        )
    }

    /// Token-2022 Transfer Hook entrypoint. Token-2022 calls this during transfers.
    #[interface(spl_transfer_hook_interface::execute)]
    pub fn execute_transfer(ctx: Context<ExecuteTransfer>, amount: u64) -> Result<()> {
        validate_transfer_policy(
            &ctx.accounts.event,
            &ctx.accounts.source_token_account,
            &ctx.accounts.destination_token_account,
            &ctx.accounts.source_vault,
            &ctx.accounts.destination_vault,
            &ctx.accounts.ticket_mint,
            amount,
            None,
        )
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + UserVault::SPACE,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct CreateTicketMint<'info> {
    #[account(
        init,
        payer = organizer,
        seeds = [
            b"ticket_mint",
            organizer.key().as_ref(),
            &event_id.to_le_bytes(),
        ],
        bump,
        mint::decimals = 0,
        mint::authority = organizer,
        mint::token_program = token_program,
        extensions::transfer_hook::authority = organizer,
        extensions::transfer_hook::program_id = secure_pass_program,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub organizer: Signer<'info>,

    /// CHECK: This must be the current program so Token-2022 invokes this hook.
    #[account(address = crate::ID)]
    pub secure_pass_program: AccountInfo<'info>,

    #[account(
        constraint = token_program.key() == token_2022::ID @ SecurePassError::InvalidTokenProgram,
    )]
    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeEvent<'info> {
    #[account(
        init,
        payer = organizer,
        space = 8 + Event::SPACE,
        seeds = [b"event", organizer.key().as_ref(), ticket_mint.key().as_ref()],
        bump
    )]
    pub event: Account<'info, Event>,

    #[account(mut)]
    pub organizer: Signer<'info>,

    #[account(
        constraint = ticket_mint.to_account_info().owner == &token_2022::ID @ SecurePassError::InvalidTokenProgram,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetupExtraAccountMetas<'info> {
    #[account(
        mut,
        seeds = [b"extra-account-metas", ticket_mint.key().as_ref()],
        bump,
    )]
    /// CHECK: This PDA stores Token-2022 transfer-hook account resolution data.
    pub extra_account_metas: AccountInfo<'info>,

    #[account(mut)]
    pub organizer: Signer<'info>,

    #[account(
        seeds = [b"event", organizer.key().as_ref(), ticket_mint.key().as_ref()],
        bump,
        constraint = event.organizer == organizer.key() @ SecurePassError::InvalidEventOrganizer,
        constraint = event.ticket_mint == ticket_mint.key() @ SecurePassError::InvalidEventMint,
    )]
    pub event: Account<'info, Event>,

    #[account(
        constraint = ticket_mint.to_account_info().owner == &token_2022::ID @ SecurePassError::InvalidTokenProgram,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTicket<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub organizer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump,
        constraint = vault.owner == user.key() @ SecurePassError::InvalidVaultOwner,
    )]
    pub vault: Account<'info, UserVault>,

    #[account(
        mut,
        seeds = [b"event", organizer.key().as_ref(), ticket_mint.key().as_ref()],
        bump,
        constraint = event.organizer == organizer.key() @ SecurePassError::InvalidEventOrganizer,
        constraint = event.ticket_mint == ticket_mint.key() @ SecurePassError::InvalidEventMint,
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        constraint = ticket_mint.to_account_info().owner == &token_2022::ID @ SecurePassError::InvalidTokenProgram,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = ticket_mint,
        token::authority = user,
        token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = token_program.key() == token_2022::ID @ SecurePassError::InvalidTokenProgram,
    )]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ValidateTicketTransfer<'info> {
    #[account(
        seeds = [b"event", event.organizer.as_ref(), ticket_mint.key().as_ref()],
        bump,
        constraint = event.ticket_mint == ticket_mint.key() @ SecurePassError::InvalidEventMint,
    )]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [b"vault", source_token_account.owner.as_ref()],
        bump,
        constraint = source_vault.owner == source_token_account.owner @ SecurePassError::InvalidVaultOwner,
    )]
    pub source_vault: Account<'info, UserVault>,

    #[account(
        seeds = [b"vault", destination_token_account.owner.as_ref()],
        bump,
        constraint = destination_vault.owner == destination_token_account.owner @ SecurePassError::InvalidVaultOwner,
    )]
    pub destination_vault: Account<'info, UserVault>,

    #[account(
        constraint = ticket_mint.to_account_info().owner == &token_2022::ID @ SecurePassError::InvalidTokenProgram,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    #[account(
        constraint = source_token_account.mint == ticket_mint.key() @ SecurePassError::InvalidTransferMint,
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = destination_token_account.mint == ticket_mint.key() @ SecurePassError::InvalidTransferMint,
    )]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct ExecuteTransfer<'info> {
    #[account(
        constraint = source_token_account.mint == ticket_mint.key() @ SecurePassError::InvalidTransferMint,
        constraint = source_token_account.owner == transfer_authority.key() @ SecurePassError::InvalidTransferAuthority,
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = ticket_mint.to_account_info().owner == &token_2022::ID @ SecurePassError::InvalidTokenProgram,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    #[account(
        constraint = destination_token_account.mint == ticket_mint.key() @ SecurePassError::InvalidTransferMint,
    )]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Token-2022 provides this account as the source owner or delegate.
    pub transfer_authority: AccountInfo<'info>,

    /// CHECK: Token-2022 validation-state PDA for this mint and hook program.
    #[account(
        seeds = [b"extra-account-metas", ticket_mint.key().as_ref()],
        bump,
    )]
    pub extra_account_metas: AccountInfo<'info>,

    #[account(
        seeds = [b"event", event.organizer.as_ref(), ticket_mint.key().as_ref()],
        bump,
        constraint = event.ticket_mint == ticket_mint.key() @ SecurePassError::InvalidEventMint,
    )]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [b"vault", source_token_account.owner.as_ref()],
        bump,
        constraint = source_vault.owner == source_token_account.owner @ SecurePassError::InvalidVaultOwner,
    )]
    pub source_vault: Account<'info, UserVault>,

    #[account(
        seeds = [b"vault", destination_token_account.owner.as_ref()],
        bump,
        constraint = destination_vault.owner == destination_token_account.owner @ SecurePassError::InvalidVaultOwner,
    )]
    pub destination_vault: Account<'info, UserVault>,
}

fn validate_transfer_policy(
    event: &Account<Event>,
    source_token_account: &InterfaceAccount<TokenAccount>,
    destination_token_account: &InterfaceAccount<TokenAccount>,
    source_vault: &Account<UserVault>,
    destination_vault: &Account<UserVault>,
    ticket_mint: &InterfaceAccount<Mint>,
    amount: u64,
    resale_price_lamports: Option<u64>,
) -> Result<()> {
    require!(amount == 1, SecurePassError::InvalidTransferAmount);
    require!(
        event.ticket_mint == ticket_mint.key(),
        SecurePassError::InvalidEventMint
    );
    require!(
        source_token_account.mint == ticket_mint.key()
            && destination_token_account.mint == ticket_mint.key(),
        SecurePassError::InvalidTransferMint
    );
    require!(
        source_token_account.key() != destination_token_account.key(),
        SecurePassError::InvalidTransferDestination
    );
    require!(
        source_vault.owner == source_token_account.owner
            && destination_vault.owner == destination_token_account.owner,
        SecurePassError::InvalidVaultOwner
    );

    if let Some(price) = resale_price_lamports {
        require!(
            price <= event.max_resale_price_lamports,
            SecurePassError::ResalePriceTooHigh
        );
    }

    Ok(())
}

#[account]
pub struct UserVault {
    pub owner: Pubkey,     // 32 bytes
    pub ticket_count: u64, // 8 bytes
}

impl UserVault {
    pub const SPACE: usize = 32 + 8;
}

#[account]
pub struct Event {
    pub organizer: Pubkey,
    pub ticket_mint: Pubkey,
    pub max_resale_price_lamports: u64,
    pub royalty_basis_points: u16,
    pub tickets_minted: u64,
}

impl Event {
    pub const SPACE: usize = 32 + 32 + 8 + 2 + 8;
}

#[error_code]
pub enum SecurePassError {
    #[msg("The vault does not belong to the signing user.")]
    InvalidVaultOwner,
    #[msg("Ticket count overflowed.")]
    TicketCountOverflow,
    #[msg("SecurePass requires the Token-2022 program.")]
    InvalidTokenProgram,
    #[msg("Royalty basis points must be between 0 and 10000.")]
    InvalidRoyaltyBasisPoints,
    #[msg("The event organizer does not match the signer.")]
    InvalidEventOrganizer,
    #[msg("The event ticket mint does not match the provided mint.")]
    InvalidEventMint,
    #[msg("Ticket transfers must move exactly one ticket.")]
    InvalidTransferAmount,
    #[msg("The transfer token account mint does not match the event mint.")]
    InvalidTransferMint,
    #[msg("Ticket transfers must use different source and destination accounts.")]
    InvalidTransferDestination,
    #[msg("The transfer authority must own the source ticket account.")]
    InvalidTransferAuthority,
    #[msg("The resale price exceeds this event's price ceiling.")]
    ResalePriceTooHigh,
}
