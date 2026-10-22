// Member photos live in a private bucket and are only ever served through short-lived signed
// links: to the member, to intu staff, and to partner staff at the moment of a scan.

export interface PhotoStore {
  /** Stores a JPEG and returns its path in the bucket. */
  put(path: string, jpeg: Uint8Array): Promise<void>;
  /** A link that works for `expiresIn` seconds, or null when there's no such photo. */
  signedUrl(path: string, expiresIn: number): Promise<string | null>;
}

const BUCKET = "member-photos";

export function supabasePhotoStore(opts: { supabaseUrl: string; serviceRoleKey: string }): PhotoStore {
  const base = `${opts.supabaseUrl.replace(/\/$/, "")}/storage/v1`;
  // As for Auth: a new-style secret key goes in the apikey header only.
  const legacyJwt = opts.serviceRoleKey.startsWith("eyJ");
  const auth = { apikey: opts.serviceRoleKey, ...(legacyJwt ? { authorization: `Bearer ${opts.serviceRoleKey}` } : {}) };
  let bucketReady: Promise<void> | null = null;

  // Creates the private bucket the first time a photo is stored; it already existing is fine.
  const ensureBucket = () =>
    (bucketReady ??= (async () => {
      const res = await fetch(`${base}/bucket`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 2_000_000, allowed_mime_types: ["image/jpeg"] }),
      });
      if (!res.ok && res.status !== 409 && !(await res.text()).includes("already exists")) {
        bucketReady = null;
        throw new Error(`Couldn't create the ${BUCKET} bucket: ${res.status}`);
      }
    })());

  return {
    async put(path, jpeg) {
      await ensureBucket();
      const res = await fetch(`${base}/object/${BUCKET}/${path}`, { method: "POST", headers: { ...auth, "content-type": "image/jpeg", "x-upsert": "true" }, body: jpeg });
      if (!res.ok) throw new Error(`Photo upload failed: ${res.status} ${await res.text()}`);
    },
    async signedUrl(path, expiresIn) {
      const res = await fetch(`${base}/object/sign/${BUCKET}/${path}`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ expiresIn }) });
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error(`Couldn't sign a photo link: ${res.status}`);
      const { signedURL } = (await res.json()) as { signedURL?: string };
      return signedURL ? `${base}${signedURL}` : null;
    },
  };
}

/** For tests and local development: photos kept in memory, served as data URLs. */
export function memoryPhotoStore(): PhotoStore & { saved: Map<string, Uint8Array> } {
  const saved = new Map<string, Uint8Array>();
  return {
    saved,
    async put(path, jpeg) {
      saved.set(path, jpeg);
    },
    async signedUrl(path) {
      const jpeg = saved.get(path);
      return jpeg ? `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}` : null;
    },
  };
}

/** True for JPEG data: it starts FF D8 FF. */
export const isJpeg = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
