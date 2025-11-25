import { decrypt, encrypt } from '../src/lib/encryption.js';

const providerUrl = 'http://play.zee5.live/stalker_portal/';
const mac = '00:1A:79:02:71:11';

console.log('Generating handshake token...');
console.log('Provider URL:', providerUrl);
console.log('MAC:', mac);

// Make handshake request
const params = new URLSearchParams({
  type: 'stb',
  action: 'handshake',
  'JsHttpRequest': '1-xml'
});

const finalUrl = providerUrl + 'server/load.php?' + params.toString();
const cookie = `mac=${mac.toLowerCase()}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`;

const headers = {
  'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
  'X-User-Agent': 'Model: MAG270; Link: WiFi',
  'Referer': providerUrl + 'c/',
  'Accept-Encoding': 'gzip',
  'Connection': 'keep-alive',
  'Cookie': cookie
};

console.log('\nSending handshake request...');
console.log('URL:', finalUrl);
console.log('Cookie:', cookie);

const response = await fetch(finalUrl, { method: 'GET', headers });
console.log('\nResponse status:', response.status);

const data = await response.json();
console.log('Response data:', JSON.stringify(data, null, 2));

if (data && data.js && data.js.token) {
  const token = data.js.token;
  console.log('\n✅ Handshake successful!');
  console.log('Token:', token);
  
  // Encrypt the token
  const encryptedToken = encrypt(token);
  console.log('\nEncrypted token:', encryptedToken);
  console.log('\nSQL UPDATE command:');
  console.log(`UPDATE "Provider" SET "stalkerBearer" = '${encryptedToken}', "stalkerToken" = '${encryptedToken}' WHERE id = 'acf14a2a-abf1-474b-b761-035198eb09aa';`);
} else {
  console.error('❌ Handshake failed - no token in response');
}
