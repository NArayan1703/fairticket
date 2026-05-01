use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenInterface},
};

declare_id!("D1548vVyMfbzCC1Hkqb5pPWBJCLrXG8xCKcQ2SipGuGQ");

#[program]
pub mod securepass {
    use super::*;

    pub fn initialize_mint(
        ctx: Context<InitializeMint>,
        event_name: String,
        event_date: String,
        seat_number: String,
        ticket_price: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.ticket_config;
        config.organizer = ctx.accounts.organizer.key();
        config.event_name = event_name.clone();
        config.event_date = event_date.clone();
        config.seat_number = seat_number.clone();
        config.ticket_price = ticket_price;
        config.mint = ctx.accounts.mint.key();
        config.bump = ctx.bumps.ticket_config;
        msg!(
            "Mint initialized: event={}, date={}, seat={}, price={}",
            event_name,
            event_date,
            seat_number,
            ticket_price
        );
        Ok(())
    }

    pub fn initialize_delegate(ctx: Context<InitializeDelegate>) -> Result<()> {
        msg!("Permanent delegate PDA: {}", ctx.accounts.delegate.key());
        Ok(())
    }

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        msg!("Vault initialized for organizer: {}", ctx.accounts.organizer.key());
        Ok(())
    }

    pub fn deposit_to_vault(ctx: Context<DepositToVault>, amount: u64) -> Result<()> {
        anchor_spl::token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_interface::TransferChecked {
                    from: ctx.accounts.organizer_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.organizer.to_account_info(),
                },
            ),
            amount,
            6,
        )?;
        msg!("Deposited {} to vault", amount);
        Ok(())
    }

    pub fn mint_ticket(ctx: Context<MintTicket>) -> Result<()> {
        let config = &ctx.accounts.ticket_config;
        let ticket_price = config.ticket_price;

        anchor_spl::token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_interface::TransferChecked {
                    from: ctx.accounts.buyer_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            ticket_price,
            6,
        )?;

        let seeds = &[b"mint-auth".as_ref(), &[ctx.bumps.mint_authority]];
        let signer_seeds = &[&seeds[..]];

        anchor_spl::token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_interface::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.buyer_nft_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ),
            1,
        )?;

        emit!(TicketMinted {
            buyer: ctx.accounts.buyer.key(),
            seat: config.seat_number.clone(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Ticket minted to buyer: {}", ctx.accounts.buyer.key());
        Ok(())
    }

    pub fn burn_for_refund(ctx: Context<BurnForRefund>) -> Result<()> {
        let config = &ctx.accounts.ticket_config;
        let ticket_price = config.ticket_price;

        require!(
            ctx.accounts.buyer_nft_account.amount == 1,
            FairTicketError::AlreadyBurned
        );

        require!(
            ctx.accounts.buyer_nft_account.owner == ctx.accounts.buyer.key(),
            FairTicketError::Unauthorized
        );

        let refund_amount = ticket_price
            .checked_mul(70)
            .unwrap()
            .checked_div(100)
            .unwrap();

        require!(
            ctx.accounts.vault.amount >= refund_amount,
            FairTicketError::VaultInsufficient
        );

        anchor_spl::token_interface::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_interface::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.buyer_nft_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            1,
        )?;

        let organizer_key = config.organizer;
        let seeds = &[
            b"vault".as_ref(),
            organizer_key.as_ref(),
            &[ctx.bumps.vault_authority],
        ];
        let signer_seeds = &[&seeds[..]];

        anchor_spl::token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_interface::TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.buyer_usdc.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            refund_amount,
            6,
        )?;

        emit!(RefundIssued {
            buyer: ctx.accounts.buyer.key(),
            amount: refund_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        anchor_spl::token_interface::close_account(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_interface::CloseAccount {
                    account: ctx.accounts.buyer_nft_account.to_account_info(),
                    destination: ctx.accounts.buyer.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
        )?;

        msg!("Refund of {} issued to {}", refund_amount, ctx.accounts.buyer.key());
        Ok(())
    }

    pub fn clawback(ctx: Context<Clawback>) -> Result<()> {
        require!(
            ctx.accounts.organizer.key() == ctx.accounts.ticket_config.organizer,
            FairTicketError::Unauthorized
        );

        require!(
            ctx.accounts.scalper_nft_account.amount == 1,
            FairTicketError::AlreadyBurned
        );

        require!(
            ctx.accounts.treasury_nft_account.owner == ctx.accounts.organizer.key(),
            FairTicketError::Unauthorized
        );

        let seeds = &[b"delegate".as_ref(), &[ctx.bumps.delegate]];
        let signer_seeds = &[&seeds[..]];

        anchor_spl::token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_interface::TransferChecked {
                    from: ctx.accounts.scalper_nft_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury_nft_account.to_account_info(),
                    authority: ctx.accounts.delegate.to_account_info(),
                },
                signer_seeds,
            ),
            1,
            0,
        )?;

        emit!(ClawbackExecuted {
            scalper: ctx.accounts.scalper_nft_account.owner,
            seat: ctx.accounts.ticket_config.seat_number.clone(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Clawback executed for seat {}", ctx.accounts.ticket_config.seat_number);
        Ok(())
    }
}

// ---- Accounts ----

#[derive(Accounts)]
#[instruction(event_name: String, event_date: String, seat_number: String, ticket_price: u64)]
pub struct InitializeMint<'info> {
    #[account(mut)]
    pub organizer: Signer<'info>,

    #[account(
        init,
        payer = organizer,
        mint::decimals = 0,
        mint::authority = mint_authority,
        mint::freeze_authority = mint_authority,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA used as mint authority
    #[account(seeds = [b"mint-auth"], bump)]
    pub mint_authority: AccountInfo<'info>,

    #[account(
        init,
        payer = organizer,
        space = 8 + TicketConfig::SIZE,
        seeds = [b"ticket-config", mint.key().as_ref()],
        bump,
    )]
    pub ticket_config: Account<'info, TicketConfig>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeDelegate<'info> {
    #[account(mut)]
    pub organizer: Signer<'info>,

    /// CHECK: PDA used as permanent delegate for clawback
    #[account(seeds = [b"delegate"], bump)]
    pub delegate: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub organizer: Signer<'info>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = organizer,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    /// CHECK: PDA used as vault authority
    #[account(seeds = [b"vault", organizer.key().as_ref()], bump)]
    pub vault_authority: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToVault<'info> {
    #[account(mut)]
    pub organizer: Signer<'info>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = organizer,
        associated_token::token_program = token_program,
    )]
    pub organizer_usdc: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    /// CHECK: PDA vault authority
    #[account(seeds = [b"vault", organizer.key().as_ref()], bump)]
    pub vault_authority: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTicket<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA mint authority
    #[account(seeds = [b"mint-auth"], bump)]
    pub mint_authority: AccountInfo<'info>,

    #[account(
        seeds = [b"ticket-config", mint.key().as_ref()],
        bump = ticket_config.bump,
    )]
    pub ticket_config: Account<'info, TicketConfig>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_nft_account: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_usdc: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    /// CHECK: PDA vault authority
    #[account(seeds = [b"vault", ticket_config.organizer.as_ref()], bump)]
    pub vault_authority: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnForRefund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"ticket-config", mint.key().as_ref()],
        bump = ticket_config.bump,
    )]
    pub ticket_config: Account<'info, TicketConfig>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_nft_account: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_usdc: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    /// CHECK: PDA vault authority
    #[account(seeds = [b"vault", ticket_config.organizer.as_ref()], bump)]
    pub vault_authority: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Clawback<'info> {
    #[account(mut)]
    pub organizer: Signer<'info>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"ticket-config", mint.key().as_ref()],
        bump = ticket_config.bump,
    )]
    pub ticket_config: Account<'info, TicketConfig>,

    /// CHECK: PDA permanent delegate
    #[account(seeds = [b"delegate"], bump)]
    pub delegate: AccountInfo<'info>,

    #[account(mut)]
    pub scalper_nft_account: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    #[account(
        init_if_needed,
        payer = organizer,
        associated_token::mint = mint,
        associated_token::authority = organizer,
        associated_token::token_program = token_program,
    )]
    pub treasury_nft_account: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ---- Events ----

#[event]
pub struct TicketMinted {
    pub buyer: Pubkey,
    pub seat: String,
    pub timestamp: i64,
}

#[event]
pub struct RefundIssued {
    pub buyer: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ClawbackExecuted {
    pub scalper: Pubkey,
    pub seat: String,
    pub timestamp: i64,
}

// ---- State ----

#[account]
pub struct TicketConfig {
    pub organizer: Pubkey,
    pub event_name: String,
    pub event_date: String,
    pub seat_number: String,
    pub ticket_price: u64,
    pub mint: Pubkey,
    pub bump: u8,
}

impl TicketConfig {
    pub const SIZE: usize = 32 + (4 + 64) + (4 + 32) + (4 + 16) + 8 + 32 + 1;
}

// ---- Errors ----

#[error_code]
pub enum FairTicketError {
    #[msg("Vault has insufficient funds for refund")]
    VaultInsufficient,
    #[msg("Token account already burned or does not exist")]
    AlreadyBurned,
    #[msg("Only the original buyer can request a refund")]
    Unauthorized,
}
