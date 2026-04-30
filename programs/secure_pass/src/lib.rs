use anchor_lang::prelude::*;
// We'll use the new Token-2022 standard for built-in anti-scalping features
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, MintTo};

declare_id!("EGizM15vjmre3oskrBNg3Mh6dBrfDp2Xcw74SyfU12jV");

#[program]
pub mod secure_pass {
    use super::*;

    pub fn mint_ticket(ctx: Context<MintTicket>) -> Result<()> {
        msg!("Minting SecurePass Ticket...");
        
        let cpi_accounts = MintTo {
            mint: ctx.accounts.ticket_mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.organizer.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        // Mint exactly 1 ticket (0 decimals)
        token_interface::mint_to(cpi_ctx, 1)?;
        
        msg!("Ticket successfully minted to: {}", ctx.accounts.user.key());
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintTicket<'info> {
    #[account(mut)]
    pub user: Signer<'info>, // The fan buying the ticket
    
    #[account(mut)]
    pub organizer: Signer<'info>, // For now, only the admin authorizes minting
    
    #[account(mut)]
    pub ticket_mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Interface<'info, TokenInterface>,
}