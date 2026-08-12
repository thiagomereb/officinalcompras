-- Bucket para arquivos de cotação
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cotacoes',
  'cotacoes',
  false,
  10485760, -- 10 MB
  array['image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel']
)
on conflict (id) do nothing;

-- Políticas de storage para usuários autenticados
create policy "Authenticated upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cotacoes');

create policy "Authenticated read" on storage.objects
  for select to authenticated
  using (bucket_id = 'cotacoes');

create policy "Authenticated delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cotacoes');
