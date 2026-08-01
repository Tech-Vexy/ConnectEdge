// ============================================================================
// POLYFILLS - Must be imported FIRST before any other code
// ============================================================================

console.log('[ConnectEdge] Loading polyfills...');

// 1. Crypto polyfill for secure random number generation (required by Hermes)
import 'react-native-get-random-values';
console.log('[ConnectEdge] ✓ Crypto polyfill loaded');

// 2. Base64 polyfill (required before Buffer to avoid QuickBase64 native module)
// This prevents react-native-buffer from trying to use react-native-quick-base64
const base64 = {
  encode: (str) => {
    // Use btoa-like implementation for React Native
    const bytes = typeof str === 'string' 
      ? new TextEncoder().encode(str)
      : str;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },
  decode: (str) => {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
};

// Polyfill btoa/atob if not present
if (typeof global.btoa === 'undefined') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  global.btoa = (input) => {
    let str = input;
    let output = '';
    for (let block = 0, charCode, i = 0, map = chars;
      str.charAt(i | 0) || (map = '=', i % 1);
      output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
      charCode = str.charCodeAt(i += 3/4);
      if (charCode > 0xFF) {
        throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = block << 8 | charCode;
    }
    return output;
  };
  
  global.atob = (input) => {
    let str = input.replace(/=+$/, '');
    let output = '';
    if (str.length % 4 == 1) {
      throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (let bc = 0, bs = 0, buffer, i = 0;
      buffer = str.charAt(i++);
      ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
      buffer = chars.indexOf(buffer);
    }
    return output;
  };
  console.log('[ConnectEdge] ✓ btoa/atob polyfills loaded');
}

// 3. Buffer polyfill (required by libp2p, hyperswarm, crypto libraries)
// Use pure JS buffer implementation to avoid native module dependencies
import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
  console.log('[ConnectEdge] ✓ Buffer polyfill loaded (pure JS)');
}

// 3.5 TextEncoder/TextDecoder polyfills (required by libp2p and many crypto libraries)
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    encode(str) {
      // Convert string to UTF-8 bytes
      const utf8 = unescape(encodeURIComponent(str));
      const bytes = new Uint8Array(utf8.length);
      for (let i = 0; i < utf8.length; i++) {
        bytes[i] = utf8.charCodeAt(i);
      }
      return bytes;
    }
  };
  console.log('[ConnectEdge] ✓ TextEncoder polyfill loaded');
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = class TextDecoder {
    constructor(encoding = 'utf-8') {
      this.encoding = encoding;
    }
    
    decode(bytes) {
      // Convert UTF-8 bytes to string
      const uint8Array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      let str = '';
      for (let i = 0; i < uint8Array.length; i++) {
        str += String.fromCharCode(uint8Array[i]);
      }
      try {
        return decodeURIComponent(escape(str));
      } catch (e) {
        // If decoding fails, return raw string
        return str;
      }
    }
  };
  console.log('[ConnectEdge] ✓ TextDecoder polyfill loaded');
}

// 3. EventTarget polyfill (required by libp2p and its dependencies)
if (typeof global.EventTarget === 'undefined') {
  console.log('[ConnectEdge] Loading EventTarget polyfill...');
  // More complete EventTarget implementation
  global.EventTarget = class EventTarget {
    constructor() {
      this._listeners = new Map();
    }
    
    addEventListener(type, listener, options) {
      if (!this._listeners.has(type)) {
        this._listeners.set(type, []);
      }
      const listeners = this._listeners.get(type);
      const index = listeners.findIndex(l => l.listener === listener);
      if (index === -1) {
        listeners.push({ listener, options });
      }
    }
    
    removeEventListener(type, listener) {
      if (!this._listeners.has(type)) return;
      const listeners = this._listeners.get(type);
      const index = listeners.findIndex(l => l.listener === listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    
    dispatchEvent(event) {
      const type = event.type;
      if (!this._listeners.has(type)) return true;
      
      // Set event target
      Object.defineProperty(event, 'target', {
        value: this,
        writable: false
      });
      Object.defineProperty(event, 'currentTarget', {
        value: this,
        writable: false
      });
      
      const listeners = this._listeners.get(type).slice();
      for (const { listener, options } of listeners) {
        try {
          if (typeof listener === 'function') {
            listener.call(this, event);
          } else if (listener && typeof listener.handleEvent === 'function') {
            listener.handleEvent(event);
          }
        } catch (err) {
          console.error('EventTarget listener error:', err);
        }
        
        if (options && options.once) {
          this.removeEventListener(type, listener);
        }
      }
      
      return !event.defaultPrevented;
    }
  };
  console.log('[ConnectEdge] ✓ EventTarget polyfill loaded');
}

// 4. Event polyfill (required by EventTarget)
if (typeof global.Event === 'undefined') {
  global.Event = class Event {
    constructor(type, eventInitDict = {}) {
      this.type = type;
      this.bubbles = eventInitDict.bubbles || false;
      this.cancelable = eventInitDict.cancelable || false;
      this.composed = eventInitDict.composed || false;
      this.defaultPrevented = false;
      this.timeStamp = Date.now();
      this.isTrusted = false;
      this.target = null;
      this.currentTarget = null;
      
      // Copy custom properties from eventInitDict
      Object.keys(eventInitDict).forEach(key => {
        if (!['bubbles', 'cancelable', 'composed'].includes(key)) {
          this[key] = eventInitDict[key];
        }
      });
    }
    
    preventDefault() {
      if (this.cancelable) {
        this.defaultPrevented = true;
      }
    }
    
    stopPropagation() {
      // No-op in simplified implementation
    }
    
    stopImmediatePropagation() {
      // No-op in simplified implementation
    }
  };
  console.log('[ConnectEdge] ✓ Event polyfill loaded');
}

// Add CustomEvent polyfill (used by some libraries)
if (typeof global.CustomEvent === 'undefined') {
  global.CustomEvent = class CustomEvent extends global.Event {
    constructor(type, eventInitDict = {}) {
      super(type, eventInitDict);
      this.detail = eventInitDict.detail || null;
    }
  };
  console.log('[ConnectEdge] ✓ CustomEvent polyfill loaded');
}

// 5. WebAssembly stub (Hermes doesn't support WASM - libraries will fall back to JS)
// Note: libsodium will see this and fall back to pure JS implementation
if (typeof global.WebAssembly === 'undefined') {
  // Create stub with proper methods so libraries can check capabilities
  global.WebAssembly = {
    compile: () => {
      console.warn('[ConnectEdge] WebAssembly.compile called but WASM not supported - library should fall back to JS');
      return Promise.reject(new Error('WebAssembly is not supported in React Native/Hermes'));
    },
    instantiate: () => {
      console.warn('[ConnectEdge] WebAssembly.instantiate called but WASM not supported - library should fall back to JS');
      return Promise.reject(new Error('WebAssembly is not supported in React Native/Hermes'));
    },
    validate: () => false,
    Module: class Module {},
    Instance: class Instance {},
    Memory: class Memory {},
    Table: class Table {},
    CompileError: class CompileError extends Error {},
    LinkError: class LinkError extends Error {},
    RuntimeError: class RuntimeError extends Error {},
  };
  
  // Also set up globals that libsodium checks
  global._sodiumJSReady = false;
  console.log('[ConnectEdge] ✓ WebAssembly stub (WASM not supported, JS fallback enabled)');
}

// 6. Process polyfill (required by Node.js-style libraries)
if (typeof global.process === 'undefined') {
  global.process = {
    env: {},
    version: '',
    nextTick: (fn, ...args) => setImmediate(() => fn(...args)),
    browser: false,
    cwd: () => '/',
    platform: 'react-native',
  };
  console.log('[ConnectEdge] ✓ Process polyfill loaded');
} else if (typeof global.process.nextTick === 'undefined') {
  global.process.nextTick = (fn, ...args) => setImmediate(() => fn(...args));
  console.log('[ConnectEdge] ✓ Process.nextTick polyfill loaded');
}

// 7. Promise.withResolvers polyfill (ES2024 feature not in Hermes yet)
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  console.log('[ConnectEdge] ✓ Promise.withResolvers polyfill loaded');
}

console.log('[ConnectEdge] All polyfills loaded successfully');

// ============================================================================
// Import expo-router entry point AFTER polyfills
// ============================================================================
import 'expo-router/entry';
