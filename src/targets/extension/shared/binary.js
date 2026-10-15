/** Chrome runtime messages use JSON, Firefox uses structured clone. */
export function encodeDocument(document) {
  if (!document) return document;
  const { buffer, ...rest } = document;
  if (!buffer) return rest;
  const bytes = new Uint8Array(buffer);
  let data = '';
  for (let i = 0; i < bytes.length; i += 32768) data += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { ...rest, data: btoa(data) };
}
export function decodeDocument(document) {
  if (!document || typeof document.data !== 'string') return document;
  const { data, ...rest } = document;
  return { ...rest, buffer: Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer };
}

export function encodeMaterial(record) {
  return record?.files ? { ...record, files: Object.fromEntries(Object.entries(record.files).map(([format, file]) => [format, encodeDocument(file)])) } : record;
}
export function decodeMaterial(record) {
  return record?.files ? { ...record, files: Object.fromEntries(Object.entries(record.files).map(([format, file]) => [format, decodeDocument(file)])) } : record;
}
