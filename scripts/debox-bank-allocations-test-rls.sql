\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
declare response jsonb;
begin
 select public.documio_confirm_bank_allocations(
  '33330000-3333-4333-8333-333300000001',
  '[{"invoiceId":"11110000-1111-4111-8111-111100000001","amount":"100.00"},{"invoiceId":"11110000-1111-4111-8111-111100000002","amount":"30.00"}]'::jsonb,
  'reviewed_suggestion') into response;
 if (response->>'unallocated')::numeric<>0 then
   raise exception 'Residual after split is not zero';
 end if;
 if (select sum(allocated_amount) from public.financial_matches
     where transaction_id='33330000-3333-4333-8333-333300000001')<>150 then
   raise exception 'Bank movement was not fully allocated';
 end if;
 if (select sum(allocated_amount) from public.financial_matches
     where invoice_id='11110000-1111-4111-8111-111100000001')<>120 then
   raise exception 'Invoice A1 not closed precisely';
 end if;
 if (select count(*) from public.financial_match_audit where action='confirm')<>2 then
   raise exception 'Missing new confirmations audit (legacy intentionally unaudited)';
 end if;
end $$;
-- Invoice A2 can be paid by a second transfer, without exceeding total.
select public.documio_confirm_bank_allocations(
 '33330000-3333-4333-8333-333300000002',
 '[{"invoiceId":"11110000-1111-4111-8111-111100000002","amount":"40"}]'::jsonb);
select public.documio_confirm_bank_allocations(
 '33330000-3333-4333-8333-333300000003',
 '[{"invoiceId":"11110000-1111-4111-8111-111100000003","amount":"50"}]'::jsonb);

do $$
declare blocked boolean;
begin
 blocked:=false;
 begin
  perform public.documio_confirm_bank_allocations(
   '33330000-3333-4333-8333-333300000002',
   '[{"invoiceId":"11110000-1111-4111-8111-111100000002","amount":"1.00"}]'::jsonb);
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Allocated beyond bank transfer';end if;
 blocked:=false;
 begin
  perform public.documio_confirm_bank_allocations(
   '33330000-3333-4333-8333-333300000001',
   '[{"invoiceId":"11110000-1111-4111-8111-111100000002","amount":"1"}]'::jsonb);
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Overpayment of bank movement permitted';end if;
 blocked:=false;
 begin
  perform public.documio_confirm_bank_allocations(
   '33330000-3333-4333-8333-333300000002',
   '[{"invoiceId":"11110000-1111-4111-8111-111100000003","amount":"1"}]'::jsonb);
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Incompatible income/expense sign permitted';end if;
 blocked:=false;
 begin
  perform public.documio_confirm_bank_allocations(
   '33330000-3333-4333-8333-333300000001',
   '[{"invoiceId":"22220000-2222-4222-8222-222200000001","amount":"1"}]'::jsonb);
 exception when insufficient_privilege or raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Cross-company allocation allowed';end if;
 blocked:=false;
 begin
  perform public.documio_confirm_bank_allocations(
   '33330000-3333-4333-8333-333300000002',
   '[{"invoiceId":"11110000-1111-4111-8111-111100000002","amount":"0.001"}]'::jsonb);
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Non-cent amount accepted';end if;
end $$;
insert into public.financial_transaction_reviews(
 transaction_id,user_id,company_id,classification,note)
values('33330000-3333-4333-8333-333300000001',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','advance','ACCONTO FATTURE DEBOX');
do $$
declare blocked boolean:=false;
begin
 begin
  insert into public.financial_transaction_reviews(
    transaction_id,user_id,company_id,classification)
  values('33330000-3333-4333-8333-333300000002',
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','advance');
 exception when raise_exception or foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'Cross company review allowed';end if;
end $$;

do $$
declare match_uuid uuid;
begin
 select id into match_uuid from public.financial_matches
  where transaction_id='33330000-3333-4333-8333-333300000001'
    and allocated_amount=30 limit 1;
 if match_uuid is null then raise exception 'Split not found';end if;
 delete from public.financial_matches where id=match_uuid;
 if not exists(select 1 from public.financial_match_audit
  where action='revoke' and transaction_id='33330000-3333-4333-8333-333300000001'
    and allocated_amount=30) then
   raise exception 'Missing revocation audit';end if;
end $$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
declare blocked boolean:=false;
begin
 if (select count(*) from public.financial_matches)<>0 then
   raise exception 'Other user sees bank allocations of DEBOX';end if;
 if (select count(*) from public.financial_transaction_reviews)<>0 then
   raise exception 'Other user sees confidential bank review notes';end if;
 if (select count(*) from public.financial_match_audit)<>0 then
   raise exception 'Other user sees bank audit';end if;
 begin
  perform public.documio_confirm_bank_allocations(
   '33330000-3333-4333-8333-333300000001',
   '[{"invoiceId":"11110000-1111-4111-8111-111100000002","amount":"1"}]'::jsonb);
 exception when insufficient_privilege or raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Other user can allocate DEBOX bank movements';end if;
end $$;
reset role;
