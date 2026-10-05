const assert = require('node:assert/strict');
const { createECDH, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// All keys are ephemeral offline test data. No push service is contacted.
const root = process.env.VAPID_TEST_ROOT || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

function loadPage(crypto = webcrypto) {
  const elements = {
    publicKey: { textContent: 'public placeholder' },
    privateKey: { textContent: 'private placeholder' }
  };
  const errors = [];
  const context = vm.createContext({
    window: { crypto }, btoa, Uint8Array,
    document: { getElementById: id => elements[id] },
    console: { error: (...args) => errors.push(args) }
  });
  vm.runInContext(source, context, { filename: 'index.html' });
  return { context, elements, errors };
}

function assertMatchingPair(keys) {
  assert.ok(keys);
  assert.ok(/^[A-Za-z0-9_-]{87}$/.test(keys.publicKey), 'public key must encode the 65-byte point');
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(keys.privateKey), 'private key must encode a 32-byte scalar');
  const publicBytes = Buffer.from(keys.publicKey, 'base64url');
  const privateBytes = Buffer.from(keys.privateKey, 'base64url');
  assert.equal(publicBytes.length, 65);
  assert.equal(publicBytes[0], 4);
  assert.equal(privateBytes.length, 32);
  const curve = createECDH('prime256v1');
  curve.setPrivateKey(privateBytes);
  assert.ok(curve.getPublicKey().equals(publicBytes), 'public point must match the private scalar');
}

test('generated VAPID keys use raw public-point and private-scalar formats', async () => {
  const { context } = loadPage();
  for (let i = 0; i < 10; i++) {
    assertMatchingPair(await context.generateVAPIDKeys());
  }
});

test('the private scalar signs a message verifiable by the exported public point', async () => {
  const { context } = loadPage();
  const keys = await context.generateVAPIDKeys();
  assertMatchingPair(keys);
  const publicBytes = Buffer.from(keys.publicKey, 'base64url');
  const privateKey = await webcrypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: keys.privateKey,
    x: publicBytes.subarray(1, 33).toString('base64url'),
    y: publicBytes.subarray(33).toString('base64url')
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const publicKey = await webcrypto.subtle.importKey('raw', publicBytes,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const message = new TextEncoder().encode('offline VAPID regression');
  const algorithm = { name: 'ECDSA', hash: 'SHA-256' };
  const signature = await webcrypto.subtle.sign(algorithm, privateKey, message);
  assert.equal(await webcrypto.subtle.verify(algorithm, publicKey, signature, message), true);
});

test('a private scalar with leading zero bytes retains its full 32-byte width', async () => {
  const scalar = Buffer.alloc(32);
  scalar[31] = 1;
  const curve = createECDH('prime256v1');
  curve.setPrivateKey(scalar);
  const point = curve.getPublicKey();
  const privateKey = await webcrypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: scalar.toString('base64url'),
    x: point.subarray(1, 33).toString('base64url'),
    y: point.subarray(33).toString('base64url')
  }, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const publicKey = await webcrypto.subtle.importKey('raw', point,
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const { context } = loadPage({ subtle: {
    generateKey: async () => ({ privateKey, publicKey }),
    exportKey: (...args) => webcrypto.subtle.exportKey(...args)
  } });
  const keys = await context.generateVAPIDKeys();
  assertMatchingPair(keys);
  assert.equal(keys.privateKey, scalar.toString('base64url'));
});

test('the page displays the compatible key pair', async () => {
  const { context, elements } = loadPage();
  await context.generateKeys();
  assertMatchingPair({
    publicKey: elements.publicKey.textContent,
    privateKey: elements.privateKey.textContent
  });
});

test('public key base64url encoding preserves all byte values', () => {
  const { context } = loadPage();
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.equal(context.arrayBufferToBase64URL(bytes.buffer), Buffer.from(bytes).toString('base64url'));
});

test('the documented client decoder preserves the generated public key', async () => {
  const { context } = loadPage();
  const keys = await context.generateVAPIDKeys();
  const clientContext = vm.createContext({
    window: { atob }, navigator: {}, Uint8Array,
    console: { warn() {} }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'client_sample.js'), 'utf8'), clientContext);
  assert.deepEqual(Buffer.from(clientContext.urlBase64ToUint8Array(keys.publicKey)),
    Buffer.from(keys.publicKey, 'base64url'));
});

for (const failedStep of ['generateKey', 'raw', 'private']) {
  test(`failure at ${failedStep} retains the previously displayed keys`, async () => {
    const { context, elements, errors } = loadPage({ subtle: {
      generateKey: async (...args) => {
        if (failedStep === 'generateKey') throw new Error('test failure');
        return webcrypto.subtle.generateKey(...args);
      },
      exportKey: async (format, key) => {
        if (format === failedStep || (failedStep === 'private' && format !== 'raw')) {
          throw new Error('test failure');
        }
        return webcrypto.subtle.exportKey(format, key);
      }
    } });
    assert.equal(await context.generateVAPIDKeys(), null);
    await context.generateKeys();
    assert.equal(elements.publicKey.textContent, 'public placeholder');
    assert.equal(elements.privateKey.textContent, 'private placeholder');
    assert.equal(errors.length, 2);
  });
}
