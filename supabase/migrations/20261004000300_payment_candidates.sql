-- HP-010: searchable, keyset-paginated confirmed transactions that can still be
-- linked to a bill/receivable/expected income, with the amount left to allocate.
-- Invoker security: RLS scopes every table read to the calling user.

create or replace function public.list_payment_candidates(
  p_type text, p_currency text, p_search text default null,
  p_after_date date default null, p_after_id uuid default null,
  p_limit integer default 25
) returns table (
  id uuid, transaction_date date, amount text, description text,
  merchant_name text, remaining text
) language sql stable security invoker set search_path='' as $$
  with applied as (
    select transaction_id, sum(amount_applied) as n from (
      select transaction_id, amount_applied from public.bill_payments
      union all select transaction_id, amount_applied from public.receivable_payments
      union all select transaction_id, amount_applied from public.expected_income_receipts
    ) a group by transaction_id
  ), candidates as (
    select t.id, t.transaction_date, t.amount, t.description, t.merchant_name,
           t.amount - coalesce(a.n,0) as remaining
    from public.transactions t
    left join applied a on a.transaction_id = t.id
    where t.status='confirmed' and t.type = p_type and t.currency_code = p_currency
      and t.amount - coalesce(a.n,0) > 0
      and (p_search is null or p_search = ''
           or coalesce(t.description,'') ilike '%'||replace(replace(p_search,'%','\%'),'_','\_')||'%'
           or coalesce(t.merchant_name,'') ilike '%'||replace(replace(p_search,'%','\%'),'_','\_')||'%')
      and (p_after_date is null
           or (t.transaction_date, t.id) < (p_after_date, p_after_id))
  )
  select c.id, c.transaction_date, c.amount::text, c.description, c.merchant_name,
         c.remaining::text
  from candidates c
  order by c.transaction_date desc, c.id desc
  limit greatest(1, least(coalesce(p_limit,25), 50));
$$;

revoke all on function public.list_payment_candidates(text,text,text,date,uuid,integer) from public,anon;
grant execute on function public.list_payment_candidates(text,text,text,date,uuid,integer) to authenticated;
