-- The existing editorial bot registry has RLS and no client grants.
alter table dk_editorial.bot_accounts
  add column debate_profile jsonb check (jsonb_typeof(debate_profile) = 'object');

comment on column dk_editorial.bot_accounts.debate_profile is
  'Internal editorial notes for future debates. Exclude from public profile projections.';
