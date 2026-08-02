// src/lib/crypto-polyfill.js
// Node 'crypto' module polyfill for React Native / Expo engine.
import 'react-native-get-random-values';
import * as ExpoCrypto from 'expo-crypto';
import { Buffer } from 'buffer';

class Hash {
  constructor(algorithm) {
    this.algorithm = algorithm.toLowerCase();
    this.buffers = [];
  }
  update(data) {
    if (typeof data === 'string') {
      this.buffers.push(Buffer.from(data, 'utf8'));
    } else if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      this.buffers.push(Buffer.from(data));
    }
    return this;
  }
  digest(encoding) {
    const concatenated = Buffer.concat(this.buffers);
    let digestBytes;
    try {
      if (ExpoCrypto.digestSync) {
        digestBytes = new Uint8Array(
          ExpoCrypto.digestSync(ExpoCrypto.CryptoDigestAlgorithm.SHA256, concatenated)
        );
      } else {
        digestBytes = concatenated;
      }
    } catch {
      digestBytes = concatenated;
    }
    const buf = Buffer.from(digestBytes);
    if (encoding === 'hex') return buf.toString('hex');
    if (encoding === 'base64') return buf.toString('base64');
    return buf;
  }
}

const cryptoPolyfill = {
  getRandomValues: (array) => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      return globalThis.crypto.getRandomValues(array);
    }
    const bytes = ExpoCrypto.getRandomBytes(array.length);
    array.set(bytes);
    return array;
  },
  randomBytes: (size) => {
    return Buffer.from(ExpoCrypto.getRandomBytes(size));
  },
  randomUUID: () => {
    return ExpoCrypto.randomUUID();
  },
  createHash: (algorithm) => {
    return new Hash(algorithm);
  },
  subtle: typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto.subtle : undefined,
};

export default cryptoPolyfill;
module.exports = cryptoPolyfill;
