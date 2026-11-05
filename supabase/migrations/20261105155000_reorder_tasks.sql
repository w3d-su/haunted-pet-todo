-- Reorder the visible root list, including children whose parent was soft-deleted.
create function public.reorder_tasks(p_user_id uuid, p_ordered_ids uuid[])
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  root_ids uuid[];
begin
  select array(
    select t.id from public.tasks t
    where t.user_id = p_user_id and t.deleted_at is null
      and not exists (
        select 1 from public.tasks parent
        where parent.id = t.parent_id and parent.user_id = p_user_id and parent.deleted_at is null
      )
    order by t.id for update of t
  ) into root_ids;

  if cardinality(root_ids) = 0 or root_ids <> array(
    select id from unnest(p_ordered_ids) as listed(id) order by id
  ) then
    return false;
  end if;

  update public.tasks t set sort_order = listed.position
  from unnest(p_ordered_ids) with ordinality as listed(id, position)
  where t.user_id = p_user_id and t.id = listed.id and t.sort_order <> listed.position;
  return true;
end;
$$;

revoke all on function public.reorder_tasks(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_tasks(uuid, uuid[]) to service_role;
