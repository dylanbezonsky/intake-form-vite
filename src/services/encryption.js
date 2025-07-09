// Simple Web Crypto API encryption (no external dependencies)
// Generate a CryptoKey from user PIN using built-in PBKDF2
export async function generateKey(pin, customSalt = null) {
  try {
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);
    
    // Use device-specific salt
    let salt;
    if (customSalt) {
      salt = customSalt;
    } else {
      salt = await getDeviceSalt();
    }
    
    // Import PIN as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      pinBytes,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derive AES key using PBKDF2
    const cryptoKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000, // Strong iteration count
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    return cryptoKey;
  } catch (error) {
    throw new Error(`Key generation failed: ${error.message}`);
  }
}

// Encrypt data using AES-GCM
export async function encrypt(data, pin) {
  try {
    const key = await generateKey(pin);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    
    // Generate random IV for each encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBytes
    );
    
    // Return IV + encrypted data as single object
    return {
      iv: Array.from(iv), // Convert to array for JSON storage
      data: Array.from(new Uint8Array(encrypted))
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

// Decrypt data using AES-GCM
export async function decrypt(encryptedObj, pin) {
  try {
    const key = await generateKey(pin);
    const iv = new Uint8Array(encryptedObj.iv);
    const encryptedData = new Uint8Array(encryptedObj.data);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encryptedData
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

// Quick test function for development
export async function testEncryption() {
  try {
    const testData = "Hello World - Patient Data Test";
    const testPin = "1234";
    
    console.log("Original:", testData);
    
    const encrypted = await encrypt(testData, testPin);
    console.log("Encrypted:", encrypted);
    
    const decrypted = await decrypt(encrypted, testPin);
    console.log("Decrypted:", decrypted);
    
    return testData === decrypted;
  } catch (error) {
    console.error("Test failed:", error);
    return false;
  }
}

// Helper function for persistent device salt
async function getDeviceSalt() {
  const stored = localStorage.getItem('device_salt');
  if (stored) {
    return new Uint8Array(JSON.parse(stored));
  }
  
  // Generate once and store permanently
  const deviceInfo = navigator.userAgent + navigator.language + Date.now();
  const salt = new TextEncoder().encode(deviceInfo.slice(0, 16));
  localStorage.setItem('device_salt', JSON.stringify(Array.from(salt)));
  return salt;
}