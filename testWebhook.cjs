const http = require('https');

const data = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{
    changes: [{
      value: {
        messages: [{
          from: "1234567890",
          type: "text",
          text: { body: "Hello this is a fake test message from the debugger!" }
        }]
      }
    }]
  }]
});

const options = {
  hostname: 'us-central1-whatanagent-a1e59.cloudfunctions.net',
  path: '/api/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => process.stdout.write(d));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
