\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into public.financial_bank_yearend_balances
 (user_id,company_id,fiscal_year,account_label,opening_balance,
  closing_balance,statement_document_id)
values('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2025,'Banca conto operativo',
 100,220,'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
do $$
declare blocked boolean:=false;
begin
 if (select count(*) from public.financial_bank_yearend_balances)<>1 then
  raise exception 'Impossibile leggere il proprio saldo';end if;
 begin
  insert into public.financial_bank_yearend_balances
   (user_id,company_id,fiscal_year,account_label,closing_balance,statement_document_id)
  values('11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2025,'Conto con prova esterna',
   500,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Estratto di azienda diversa accettato';end if;
 blocked:=false;
 begin
  update public.financial_bank_yearend_balances set company_id=
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Spostamento saldo tra aziende consentito';end if;
end $$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
declare blocked boolean:=false;
begin
 if (select count(*) from public.financial_bank_yearend_balances)<>0 then
  raise exception 'Altro titolare può leggere i saldi della prima azienda';end if;
 begin
  insert into public.financial_bank_yearend_balances
    (user_id,company_id,fiscal_year,account_label,closing_balance)
   values('11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2025,'Intrusione',300);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Altro titolare può creare saldo di azienda altrui';end if;
end $$;
reset role;
