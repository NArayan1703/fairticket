use anchor_lang::prelude::*;

declare_id!("D1548vVyMfbzCC1Hkqb5pPWBJCLrXG8xCKcQ2SipGuGQ");

#[program]
pub mod securepass {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
