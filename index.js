const path = require('path');
const fs = require('fs');

const filePath = 'config.json';

let config = JSON.parse(fs.readFileSync(filePath));

console.log('Starting websocket server on port ' + config.port);

require('./serial-websocket.js')(config.port);