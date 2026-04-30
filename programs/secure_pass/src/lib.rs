use anchor_lang::prelude::*;
// Use the Token-2022 standard for built-in features
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, MintTo};

// Verify this matches your 'solana address -k target/deploy/secure_pass-keypair.json'
declare_id!("EGizM15vjmre3oskrBNg3Mh6dBrfDp2Xcw74SyfU12jV");

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

        // Optional: Update the user's vault record
        let vault = &mut ctx.accounts.vault;
        vault.ticket_count += 1;
        
        msg!("Ticket minted! User now has {} tickets.", vault.ticket_count);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 64, 
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub user: Signer<'info>,
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
    )]
    pub vault: Account<'info, UserVault>,
    
    #[account(mut)]
    pub ticket_mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
pub struct UserVault {
    pub owner: Pubkey,      // 32 bytes
    pub ticket_count: u64,  // 8 bytes
}