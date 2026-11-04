/* Public connection settings for Closing Desk.
   The anon / publishable key is designed to be public: your contacts are protected by your login and
   database row-level security, not by hiding this key.
   NEVER put a service_role key or your database password in this file. */
window.CD_CONFIG = {
  url: "https://rlenqenlkmrskoxockpm.supabase.co",
  anonKey: "sb_publishable_rfWPmIumXAWmMe9ktEX8Yw_BNkggRV8",
  /* Feature switches. tellClaude: the Tell Claude box on Today. It calls Anthropic's paid API, so it stays off
     until the Anthropic key is added in Supabase (README, Tell Claude setup). Change to true to turn it on. */
  features: {
    tellClaude: false
  }
};
