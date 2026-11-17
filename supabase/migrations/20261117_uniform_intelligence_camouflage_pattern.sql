-- Records the human-confirmed camouflage pattern separately from uniform designation.
-- Identification remains owner verified and never changes media visibility.
alter table public.corp_uniform_training_references
 add column if not exists camouflage_pattern text not null default ''
 check (length(camouflage_pattern)<=130);
