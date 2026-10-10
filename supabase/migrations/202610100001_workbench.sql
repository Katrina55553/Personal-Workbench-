-- Browser clients can read their own rows. All writes go through authenticated,
-- serialized RPCs; no service_role key is needed by the app.
create schema if not exists workbench_private;
revoke all on schema workbench_private from public, anon, authenticated;

create table public.workbench_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  timer_epoch bigint not null default 0 check (timer_epoch between 0 and 9007199254740991),
  updated_at bigint not null default 0 check (updated_at between 0 and 9007199254740991)
);

create function workbench_private.valid_record(kind text, r jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  keys text[];
  k text;
  v jsonb;
  n numeric;
begin
  if jsonb_typeof(r) <> 'object' then return false; end if;
  keys := case kind
    when 'categories' then array['id','name','type','active']
    when 'subjects' then array['id','name','active']
    when 'todos' then array['id','title','note','createdAt','updatedAt','priority','done','pinned']
    when 'habits' then array['id','title','note','createdAt','updatedAt','log']
    when 'transactions' then array['id','title','note','createdAt','updatedAt','type','amountCents','categoryId','date']
    when 'study_records' then array['id','title','note','createdAt','updatedAt','subjectId','minutes','date','source','sessionId']
  end;
  if keys is null or (select count(*) from jsonb_object_keys(r)) <> cardinality(keys)
    or not r ?& keys then return false; end if;
  if jsonb_typeof(r->'id') <> 'string' then return false; end if;
  perform (r->>'id')::uuid;
  k := case when kind in ('categories','subjects') then 'name' else 'title' end;
  if jsonb_typeof(r->k) <> 'string' or length(btrim(r->>k)) not between 1 and 120
    or r->>k <> btrim(r->>k) then return false; end if;
  if kind in ('categories','subjects') then
    return jsonb_typeof(r->'active') = 'boolean'
      and (kind = 'subjects' or coalesce(r->>'type' in ('income','expense'),false));
  end if;
  if jsonb_typeof(r->'note') <> 'string' or length(r->>'note') > 10000 then return false; end if;
  foreach k in array array['createdAt','updatedAt'] loop
    if jsonb_typeof(r->k) <> 'number' or r->>k !~ '^[0-9]+$' then return false; end if;
    n := (r->>k)::numeric;
    if n not between 0 and 9007199254740991 then return false; end if;
  end loop;
  if kind = 'todos' then
    return coalesce(r->>'priority' in ('P0','P1','P2'),false)
      and jsonb_typeof(r->'done') = 'boolean' and jsonb_typeof(r->'pinned') = 'boolean';
  elsif kind = 'habits' then
    if jsonb_typeof(r->'log') <> 'object' then return false; end if;
    for k,v in select * from jsonb_each(r->'log') loop
      if k !~ '^\d{4}-\d{2}-\d{2}$' or k <> to_char(k::date,'YYYY-MM-DD')
        or v <> 'true'::jsonb then return false; end if;
    end loop;
    return true;
  end if;
  if jsonb_typeof(r->'date') <> 'string' or r->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
    or r->>'date' <> to_char((r->>'date')::date,'YYYY-MM-DD') then return false; end if;
  k := case when kind = 'transactions' then 'amountCents' else 'minutes' end;
  if jsonb_typeof(r->k) <> 'number' or r->>k !~ '^[0-9]+$' then return false; end if;
  n := (r->>k)::numeric;
  if n < 1 or n > (case when kind = 'transactions' then 9007199254740991 else 1440 end)
    then return false; end if;
  if kind = 'transactions' then
    if jsonb_typeof(r->'categoryId') <> 'string' then return false; end if;
    perform (r->>'categoryId')::uuid;
    return coalesce(r->>'type' in ('income','expense'),false);
  end if;
  if jsonb_typeof(r->'subjectId') <> 'string' then return false; end if;
  perform (r->>'subjectId')::uuid;
  if r->'sessionId' <> 'null'::jsonb then
    if jsonb_typeof(r->'sessionId') <> 'string' then return false; end if;
    perform (r->>'sessionId')::uuid;
  end if;
  return coalesce(r->>'source' in ('manual','pomodoro'),false)
    and (r->>'source' <> 'pomodoro' or r->'sessionId' <> 'null'::jsonb);
exception when others then return false;
end;
$$;

create table public.categories (
  owner_id uuid not null references public.workbench_state(owner_id) on delete cascade,
  payload jsonb not null check (workbench_private.valid_record('categories',payload)),
  id uuid generated always as ((payload->>'id')::uuid) stored,
  record_type text generated always as (payload->>'type') stored,
  position integer not null,
  primary key (owner_id,id),
  unique (owner_id,id,record_type)
);
create unique index categories_name on public.categories(owner_id,record_type,(payload->>'name'));
create table public.subjects (
  owner_id uuid not null references public.workbench_state(owner_id) on delete cascade,
  payload jsonb not null check (workbench_private.valid_record('subjects',payload)),
  id uuid generated always as ((payload->>'id')::uuid) stored,
  position integer not null,
  primary key (owner_id,id)
);
create unique index subjects_name on public.subjects(owner_id,(payload->>'name'));
create table public.todos (
  owner_id uuid not null references public.workbench_state(owner_id) on delete cascade,
  payload jsonb not null check (workbench_private.valid_record('todos',payload)),
  id uuid generated always as ((payload->>'id')::uuid) stored,
  position integer not null,
  primary key (owner_id,id)
);
create table public.habits (
  owner_id uuid not null references public.workbench_state(owner_id) on delete cascade,
  payload jsonb not null check (workbench_private.valid_record('habits',payload)),
  id uuid generated always as ((payload->>'id')::uuid) stored,
  position integer not null,
  primary key (owner_id,id)
);
create table public.transactions (
  owner_id uuid not null references public.workbench_state(owner_id) on delete cascade,
  payload jsonb not null check (workbench_private.valid_record('transactions',payload)),
  id uuid generated always as ((payload->>'id')::uuid) stored,
  category_id uuid generated always as ((payload->>'categoryId')::uuid) stored,
  record_type text generated always as (payload->>'type') stored,
  position integer not null,
  primary key (owner_id,id),
  foreign key (owner_id,category_id,record_type) references public.categories(owner_id,id,record_type)
);
create table public.study_records (
  owner_id uuid not null references public.workbench_state(owner_id) on delete cascade,
  payload jsonb not null check (workbench_private.valid_record('study_records',payload)),
  id uuid generated always as ((payload->>'id')::uuid) stored,
  subject_id uuid generated always as ((payload->>'subjectId')::uuid) stored,
  session_id uuid generated always as ((payload->>'sessionId')::uuid) stored,
  position integer not null,
  primary key (owner_id,id),
  unique (owner_id,session_id),
  foreign key (owner_id,subject_id) references public.subjects(owner_id,id)
);
-- Receipts survive record deletion, so a retry after a lost response cannot
-- resurrect a deleted completion. Epochs stop old queues after a backup import.
create table workbench_private.pomodoro_receipts (
  owner_id uuid not null references public.workbench_state(owner_id) on delete cascade,
  timer_epoch bigint not null,
  session_id uuid not null,
  primary key(owner_id,timer_epoch,session_id)
);

create function workbench_private.ensure_account(uid uuid)
returns void language plpgsql set search_path = '' as $$
declare created uuid;
begin
  if uid is null then raise exception 'WORKBENCH_UNAUTHENTICATED'; end if;
  insert into public.workbench_state(owner_id) values(uid) on conflict do nothing returning owner_id into created;
  if created is null then return; end if;
  insert into public.categories(owner_id,position,payload)
  select uid,i::integer,jsonb_build_object(
    'id','00000000-0000-4000-8000-'||lpad(i::text,12,'0'),
    'name',name,'type','expense','active',true)
  from unnest(array['餐饮','交通','购物','居住','医疗','学习','娱乐','其他']) with ordinality as t(name,i);
  insert into public.categories(owner_id,position,payload)
  select uid,(i+19)::integer,jsonb_build_object(
    'id','00000000-0000-4000-8000-'||lpad((i+19)::text,12,'0'),
    'name',name,'type','income','active',true)
  from unnest(array['工资','奖金','其他']) with ordinality as t(name,i);
  insert into public.subjects(owner_id,position,payload)
  select uid,i::integer,jsonb_build_object(
    'id','00000000-0000-4000-8000-'||lpad((i+39)::text,12,'0'),
    'name',name,'active',true)
  from unnest(array['语文','数学','英语','政治','专业课','阅读','其他']) with ordinality as t(name,i);
end;
$$;

create function workbench_private.snapshot(uid uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('revision',s.revision,'timerEpoch',s.timer_epoch,'updatedAt',s.updated_at,
    'data',jsonb_build_object(
      'todos',coalesce((select jsonb_agg(payload order by position,id) from public.todos where owner_id=uid),'[]'::jsonb),
      'habits',coalesce((select jsonb_agg(payload order by position,id) from public.habits where owner_id=uid),'[]'::jsonb),
      'transactions',coalesce((select jsonb_agg(payload order by position,id) from public.transactions where owner_id=uid),'[]'::jsonb),
      'studyRecords',coalesce((select jsonb_agg(payload order by position,id) from public.study_records where owner_id=uid),'[]'::jsonb),
      'categories',coalesce((select jsonb_agg(payload order by position,id) from public.categories where owner_id=uid),'[]'::jsonb),
      'subjects',coalesce((select jsonb_agg(payload order by position,id) from public.subjects where owner_id=uid),'[]'::jsonb)))
  from public.workbench_state s where s.owner_id=uid;
$$;

create function public.read_workbench()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform workbench_private.ensure_account(uid);
  return workbench_private.snapshot(uid);
end;
$$;

create function workbench_private.replace_data(uid uuid, d jsonb)
returns void language plpgsql set search_path = '' as $$
declare k text;
begin
  if d is null or jsonb_typeof(d) <> 'object' or (select count(*) from jsonb_object_keys(d)) <> 6
    or not d ?& array['todos','habits','transactions','studyRecords','categories','subjects']
    then raise exception 'WORKBENCH_INVALID_DATA'; end if;
  foreach k in array array['todos','habits','transactions','studyRecords','categories','subjects'] loop
    if jsonb_typeof(d->k) <> 'array' then raise exception 'WORKBENCH_INVALID_DATA'; end if;
  end loop;
  delete from public.transactions where owner_id=uid;
  delete from public.study_records where owner_id=uid;
  delete from public.todos where owner_id=uid;
  delete from public.habits where owner_id=uid;
  delete from public.categories where owner_id=uid;
  delete from public.subjects where owner_id=uid;
  insert into public.categories(owner_id,payload,position) select uid,v,i::integer from jsonb_array_elements(d->'categories') with ordinality t(v,i);
  insert into public.subjects(owner_id,payload,position) select uid,v,i::integer from jsonb_array_elements(d->'subjects') with ordinality t(v,i);
  insert into public.todos(owner_id,payload,position) select uid,v,i::integer from jsonb_array_elements(d->'todos') with ordinality t(v,i);
  insert into public.habits(owner_id,payload,position) select uid,v,i::integer from jsonb_array_elements(d->'habits') with ordinality t(v,i);
  insert into public.transactions(owner_id,payload,position) select uid,v,i::integer from jsonb_array_elements(d->'transactions') with ordinality t(v,i);
  insert into public.study_records(owner_id,payload,position) select uid,v,i::integer from jsonb_array_elements(d->'studyRecords') with ordinality t(v,i);
end;
$$;

create function workbench_private.save(d jsonb, expected_revision bigint, importing boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare uid uuid := auth.uid(); current_revision bigint;
begin
  perform workbench_private.ensure_account(uid);
  select revision into current_revision from public.workbench_state where owner_id=uid for update;
  if expected_revision is null or current_revision <> expected_revision then
    raise exception 'WORKBENCH_CONFLICT';
  end if;
  perform workbench_private.replace_data(uid,d);
  update public.workbench_state set revision=revision+1,
    timer_epoch=timer_epoch+case when importing then 1 else 0 end,
    updated_at=floor(extract(epoch from clock_timestamp())*1000)::bigint where owner_id=uid;
  return workbench_private.snapshot(uid);
end;
$$;
create function public.commit_workbench(p_data jsonb,p_expected_revision bigint)
returns jsonb language sql security definer set search_path = '' as $$
  select workbench_private.save(p_data,p_expected_revision,false);
$$;
create function public.replace_workbench(p_data jsonb,p_expected_revision bigint)
returns jsonb language sql security definer set search_path = '' as $$
  select workbench_private.save(p_data,p_expected_revision,true);
$$;

create function public.complete_pomodoro(p_record jsonb,p_timer_epoch bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); epoch bigint; session uuid; inserted integer;
begin
  perform workbench_private.ensure_account(uid);
  select timer_epoch into epoch from public.workbench_state where owner_id=uid for update;
  if p_timer_epoch is null or epoch <> p_timer_epoch then raise exception 'WORKBENCH_TIMER_RESET'; end if;
  if workbench_private.valid_record('study_records',p_record) is distinct from true
    or p_record->>'source' <> 'pomodoro' or p_record->>'minutes' <> '25' then
    raise exception 'WORKBENCH_INVALID_COMPLETION';
  end if;
  session := (p_record->>'sessionId')::uuid;
  if exists(select 1 from workbench_private.pomodoro_receipts where owner_id=uid and timer_epoch=epoch and session_id=session)
    then return workbench_private.snapshot(uid); end if;
  insert into public.study_records(owner_id,payload,position)
    values(uid,p_record,(select coalesce(min(position),1)-1 from public.study_records where owner_id=uid))
    on conflict(owner_id,session_id) do nothing;
  get diagnostics inserted = row_count;
  insert into workbench_private.pomodoro_receipts values(uid,epoch,session);
  if inserted > 0 then
    update public.workbench_state set revision=revision+1,
      updated_at=floor(extract(epoch from clock_timestamp())*1000)::bigint where owner_id=uid;
  end if;
  return workbench_private.snapshot(uid);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['workbench_state','categories','subjects','todos','habits','transactions','study_records'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid())=owner_id)',t);
  end loop;
end;
$$;
revoke all on all functions in schema workbench_private from public,anon,authenticated;
revoke all on function public.read_workbench() from public,anon;
revoke all on function public.commit_workbench(jsonb,bigint) from public,anon;
revoke all on function public.replace_workbench(jsonb,bigint) from public,anon;
revoke all on function public.complete_pomodoro(jsonb,bigint) from public,anon;
grant execute on function public.read_workbench() to authenticated;
grant execute on function public.commit_workbench(jsonb,bigint) to authenticated;
grant execute on function public.replace_workbench(jsonb,bigint) to authenticated;
grant execute on function public.complete_pomodoro(jsonb,bigint) to authenticated;

-- Only small revision notifications are replicated, never entire business snapshots.
alter publication supabase_realtime add table public.workbench_state;
