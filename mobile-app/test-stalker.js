const axios = require('axios');

async function testStalker() {
  try {
    const response = await axios.get(
      'http://tv.stream4k.cc/stalker_portal/server/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml',
      {
        headers: {
          'Cookie': 'mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722',
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
          'X-User-Agent': 'Model: MAG270; Link: WiFi',
          'Authorization': 'Bearer 1E75E91204660B7A876055CE8830130E',
          'Host': 'tv.stream4k.cc',
          'Accept': '*/*'
        }
      }
    );
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data).substring(0, 500));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testStalker();
