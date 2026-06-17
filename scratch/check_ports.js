const http = require('http');

function checkPort(port, host = 'localhost') {
  return new Promise((resolve) => {
    const req = http.request({ host, port, method: 'GET', path: '/' }, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function main() {
  const backendOn = await checkPort(5000);
  const frontendOn = await checkPort(5173);
  console.log(`PORT_STATUS: backend(5000)=${backendOn}, frontend(5173)=${frontendOn}`);
}

main();
