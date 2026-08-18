const fs = require('fs');
const path = require('path');
const axios = require('axios');

const logFile = path.join(__dirname, 'test_output.log');
function log(msg) {
  fs.appendFileSync(logFile, msg + '\n');
}

fs.writeFileSync(logFile, '--- START TEST ---\n');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  log('ENV file read. Length: ' + envContent.length);
  
  const match = envContent.match(/OPENAI_API_KEY=(.+)/);
  const apiKey = match ? match[1].trim() : null;
  
  log('API Key length: ' + (apiKey ? apiKey.length : 0));
  log('API Key prefix: ' + (apiKey ? apiKey.substring(0, 15) : 'NONE'));

  const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const dataUrl = `data:image/png;base64,${dummyBase64}`;

  axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Test' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    }
  ).then(res => {
    log('SUCCESS! OpenAI response choice: ' + JSON.stringify(res.data.choices[0]?.message?.content));
  }).catch(err => {
    if (err.response) {
      log('OPENAI ERROR STATUS: ' + err.response.status);
      log('OPENAI ERROR DATA: ' + JSON.stringify(err.response.data));
    } else {
      log('ERROR: ' + err.message);
    }
  });

} catch (err) {
  log('OUTER ERROR: ' + err.message);
}
