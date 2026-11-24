-- Catalog topics keep their permanent slug. Existing pins and their original routes remain valid.
alter table public.dk_collection
  drop constraint dk_collection_kind_check,
  add constraint dk_collection_kind_check
    check (kind in ('question','debate','person','poster','topic'));
