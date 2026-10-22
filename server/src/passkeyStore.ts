import type { CredentialDeviceType } from "@simplewebauthn/server";

/** A registered passkey (WebAuthn credential) and the account it signs in to. */
export interface StoredPasskey {
  /** Credential ID (base64url), unique across all users. */
  id: string;
  /** The account's email address. */
  email: string;
  /** Random WebAuthn user handle (base64url). Never the email, which is personal data. */
  userHandle: string;
  publicKey: Uint8Array;
  /** Signature counter, used to spot cloned authenticators. */
  counter: number;
  transports?: string[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  createdAt: string;
}

/**
 * Where passkeys are kept. The default is in memory (lost on restart, fine for
 * the demo); implement this on your database for real use.
 */
export interface PasskeyStore {
  get(id: string): Promise<StoredPasskey | undefined>;
  listByEmail(email: string): Promise<StoredPasskey[]>;
  save(passkey: StoredPasskey): Promise<void>;
  updateCounter(id: string, counter: number): Promise<void>;
  /** Deletes the passkey if it belongs to `email`. Returns whether it did. */
  delete(id: string, email: string): Promise<boolean>;
}

export class MemoryPasskeyStore implements PasskeyStore {
  private readonly byId = new Map<string, StoredPasskey>();

  async get(id: string) {
    return this.byId.get(id);
  }

  async listByEmail(email: string) {
    return [...this.byId.values()].filter((p) => p.email === email);
  }

  async save(passkey: StoredPasskey) {
    this.byId.set(passkey.id, passkey);
  }

  async updateCounter(id: string, counter: number) {
    const passkey = this.byId.get(id);
    if (passkey) passkey.counter = counter;
  }

  async delete(id: string, email: string) {
    const passkey = this.byId.get(id);
    if (!passkey || passkey.email !== email) return false;
    return this.byId.delete(id);
  }
}
