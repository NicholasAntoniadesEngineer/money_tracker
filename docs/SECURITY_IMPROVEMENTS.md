# Security Improvements Required for MITM Protection

## Current Vulnerability Analysis

### Attack Vector: Key Substitution
**Severity: HIGH**

The current implementation uses Trust-on-First-Use (TOFU) without verification:
- Public keys stored in database without authentication
- No fingerprint verification
- No out-of-band key verification
- No key change notifications

**Attack Scenario:**
1. Attacker compromises database OR performs MITM on HTTPS
2. Attacker replaces User A's public key with their own key
3. User B fetches "User A's key" → Gets attacker's key
4. User B encrypts message with attacker's key
5. Attacker can decrypt all messages

## Required Security Improvements

### 1. Key Fingerprint Verification (Signal Protocol)

**Implementation:**
```javascript
// Generate 60-digit safety number from both users' public keys
KeyManager.generateSafetyNumber(myPublicKey, theirPublicKey) {
    // Combine both public keys deterministically
    const combined = new Uint8Array(myPublicKey.length + theirPublicKey.length);
    combined.set(myPublicKey);
    combined.set(theirPublicKey, myPublicKey.length);

    // Hash with SHA-512
    const hash = await crypto.subtle.digest('SHA-512', combined);

    // Convert to 60-digit number
    return formatAs60DigitNumber(hash);
}
```

**UI Display:**
- Show 60-digit safety number in conversation settings
- Users compare numbers out-of-band (phone call, in person)
- Mark conversation as "verified" after comparison
- Show warning if safety number changes

### 2. Key Pinning (HPKP-like)

**Implementation:**
```javascript
KeyManager.pinPublicKey(userId, publicKey) {
    // Store hash of first-seen public key
    const keyHash = await crypto.subtle.digest('SHA-256', publicKey);
    localStorage.setItem(`pinned_key_${userId}`, base64(keyHash));
}

KeyManager.validatePinnedKey(userId, publicKey) {
    const pinnedHash = localStorage.getItem(`pinned_key_${userId}`);
    if (!pinnedHash) return 'first_use'; // TOFU

    const currentHash = await crypto.subtle.digest('SHA-256', publicKey);
    if (base64(currentHash) !== pinnedHash) {
        return 'key_changed'; // ⚠️ SECURITY WARNING
    }
    return 'valid';
}
```

**Behavior:**
- First time seeing a user → Pin their key
- Subsequent fetches → Verify key matches pinned hash
- If key changes → Show prominent warning
- Require user acknowledgment before accepting new key

### 3. Key Transparency Log (Advanced)

**Implementation:**
```javascript
// Cryptographically append-only log of all key changes
KeyTransparencyLog {
    logKeyChange(userId, oldKey, newKey, timestamp) {
        const entry = {
            userId,
            oldKeyHash: hash(oldKey),
            newKeyHash: hash(newKey),
            timestamp,
            previousHash: this.getLatestHash()
        };
        entry.hash = hash(entry);
        return this.append(entry);
    }

    verifyLogIntegrity() {
        // Merkle tree verification
        // Ensures no keys were retroactively changed
    }
}
```

### 4. Out-of-Band Key Verification

**QR Code Verification:**
```javascript
// User A shows QR code containing their public key fingerprint
KeyManager.generateVerificationQR(publicKey) {
    const fingerprint = await crypto.subtle.digest('SHA-256', publicKey);
    return {
        userId: this.currentUserId,
        fingerprint: base64(fingerprint),
        timestamp: Date.now()
    };
}

// User B scans QR and verifies
KeyManager.verifyQRCode(scannedData, fetchedPublicKey) {
    const fetchedFingerprint = await crypto.subtle.digest('SHA-256', fetchedPublicKey);
    return scannedData.fingerprint === base64(fetchedFingerprint);
}
```

### 5. Key Change Notifications

**Implementation:**
```javascript
// When fetching a public key, check if it's changed
async fetchPublicKey(userId) {
    const newKey = await database.fetchKey(userId);
    const lastSeenKey = await this.getLastSeenKey(userId);

    if (lastSeenKey && !keysEqual(lastSeenKey, newKey)) {
        // ⚠️ KEY CHANGED - Could be MITM!
        await this.notifyKeyChange(userId, lastSeenKey, newKey);
        throw new SecurityError('User key changed - verification required');
    }

    await this.storeLastSeenKey(userId, newKey);
    return newKey;
}
```

### 6. Certificate Pinning (HTTPS)

**Implementation:**
```javascript
// Pin Supabase's certificate
const PINNED_CERTS = [
    'sha256/actualSupabaseCertHash...',
    'sha256/backupCertHash...'
];

// Validate on every request (Service Worker)
self.addEventListener('fetch', event => {
    if (event.request.url.includes('supabase.co')) {
        // Verify certificate matches pinned hash
        validateCertificatePinning(event.request);
    }
});
```

## Comparison with Signal Protocol

| Feature | Current Implementation | Signal Protocol | Required |
|---------|----------------------|----------------|----------|
| Key Exchange | Diffie-Hellman ✅ | X3DH | ✅ |
| Perfect Forward Secrecy | ❌ | Double Ratchet | Recommended |
| Key Verification | ❌ | Safety Numbers | **CRITICAL** |
| Key Pinning | ❌ | Implicit | **CRITICAL** |
| Key Change Alerts | ❌ | Yes | **CRITICAL** |
| Out-of-band Verification | ❌ | QR Codes | **CRITICAL** |
| Key Transparency | ❌ | Optional | Recommended |

## Implementation Priority

### Phase 1: Critical (Do Immediately)
1. **Key Fingerprint Verification** - Show safety numbers
2. **Key Pinning** - Detect key changes
3. **Key Change Notifications** - Warn users

### Phase 2: Important
4. Out-of-band QR verification
5. Certificate pinning
6. Perfect forward secrecy (Double Ratchet)

### Phase 3: Advanced
7. Key transparency log
8. Automated key rotation
9. Post-quantum cryptography

## Attack Surface After Implementation

With all protections:
- ✅ Database compromise → Detected via key pinning
- ✅ MITM on key exchange → Detected via safety number mismatch
- ✅ Key substitution → Detected immediately, user warned
- ✅ Certificate compromise → Detected via pinning

## Conclusion

**Current Status:** Vulnerable to MITM attacks during key exchange

**Required:** Implement key fingerprint verification and pinning ASAP

**Without these:** E2E encryption provides false sense of security - attacker can perform undetected MITM attack.

---

**References:**
- Signal Protocol Specification: https://signal.org/docs/
- WhatsApp Security Whitepaper
- NIST SP 800-57 (Key Management)
- RFC 7469 (Public Key Pinning)
