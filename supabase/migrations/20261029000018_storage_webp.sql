-- O app aceita fotos em WebP (e a Edge Function de OCR também), mas o bucket
-- não tinha image/webp em allowed_mime_types, então o upload era recusado.
UPDATE storage.buckets
SET allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]
WHERE id = 'cotacoes';
