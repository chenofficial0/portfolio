// CHEN. private KV media adapter (development only; not wired to production).
// The caller MUST authenticate/authorize the editor and verify Origin + CSRF for mutations.
// KV is eventually consistent; this adapter does not promise instant deletion or atomic quotas.
const PREFIX = "private-kv/";
const REF = /^private-kv\/chen-(?:hero|profile|gallery|work-cover|work-still|resource)-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.(?:jpg|png|pdf)$/;
const MAX_IMAGE_BYTES = 1048576; // 1 MiB processed image
const MAX_DOCUMENT_BYTES = 1048576; // 1 MiB, to keep a strict no-cost staging budget
const TYPES = Object.freeze({ jpg: "image/jpeg", png: "image/png", pdf: "application/pdf" });

export function validPrivateRef(path) {
  return typeof path === "string" && REF.test(path);
}
export function privateKv(env) {
  const kv = env?.PRIVATE_DRAFT_KV;
  return kv && ["get", "put", "delete"].every(name => typeof kv[name] === "function") ? kv : null;
}
function signatureMatches(ext, bytes) {
  if (ext === "jpg") return bytes[0] === 255 && bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  if (ext === "png") {
    const first = [137,80,78,71,13,10,26,10], last = [73,69,78,68,174,66,96,130];
    return first.every((v,i) => bytes[i] === v) &&
      last.every((v,i) => bytes[bytes.length - 8 + i] === v);
  }
  if (ext === "pdf") {
    const head = new TextDecoder().decode(bytes.slice(0,5));
    const end = new TextDecoder("latin1").decode(bytes.slice(-1024));
    return head === "%PDF-" && end.includes("%%EOF");
  }
  return false;
}
export function validatePrivateMedia(path, data) {
  if (!validPrivateRef(path)) return false;
  if (!(data instanceof Uint8Array)) return false;
  const extension = path.slice(path.lastIndexOf(".") + 1);
  const limit = path.includes("/chen-resource-") ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
  return data.byteLength >= 100 && data.byteLength <= limit && signatureMatches(extension, data);
}
export function mimeForPrivateMedia(path) {
  if (!validPrivateRef(path)) return null;
  return TYPES[path.slice(path.lastIndexOf(".") + 1)] || null;
}
export async function storePrivateMedia(env, path, data) {
  const kv = privateKv(env);
  if (!kv) throw new Error("PRIVATE_STORAGE_UNAVAILABLE");
  if (!validatePrivateMedia(path, data)) throw new Error("INVALID_PRIVATE_MEDIA");
  // A separate manifest/quota accounting step is required before enabling production writes.
  await kv.put(path, data);
  return { path, mime: mimeForPrivateMedia(path), bytes: data.byteLength };
}
export async function readPrivateMedia(env, path) {
  const kv = privateKv(env);
  if (!kv) throw new Error("PRIVATE_STORAGE_UNAVAILABLE");
  if (!validPrivateRef(path)) throw new Error("INVALID_PRIVATE_REFERENCE");
  const result = await kv.get(path, "arrayBuffer");
  if (result === null) return null;
  const bytes = new Uint8Array(result);
  if (!validatePrivateMedia(path, bytes)) throw new Error("CORRUPT_PRIVATE_MEDIA");
  return { bytes, mime: mimeForPrivateMedia(path) };
}
export async function deletePrivateMedia(env, path) {
  const kv = privateKv(env);
  if (!kv) throw new Error("PRIVATE_STORAGE_UNAVAILABLE");
  if (!validPrivateRef(path)) throw new Error("INVALID_PRIVATE_REFERENCE");
  // Deletion is asynchronous across KV locations. Never promise immediate global erasure.
  await kv.delete(path);
  return { accepted: true, globallyErased: false };
}
export const PRIVATE_KV_LIMITS = Object.freeze({
  maximumItemBytes: MAX_IMAGE_BYTES,
  recommendedTotalBytes: 100 * 1048576,
  isAtomicAccountQuota: false
});
