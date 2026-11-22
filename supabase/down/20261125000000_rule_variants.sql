-- Rollback for 20261125000000_rule_variants.sql. Every "vs" exception is dropped; base
-- position rules are untouched.

begin;

drop table public.position_rule_variants;

commit;
