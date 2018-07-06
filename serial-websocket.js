const WebSocket = require('ws');

send = (ws, type, data)=> {
    if(ws != null) {
        ws.send( JSON.stringify({type: type, data: data}) );
    }
}

module.exports = (PORT = 6842)=> {


    const wssim = new WebSocket.Server({ port: (PORT+1) });
    const wss = new WebSocket.Server({ port: PORT });
    let wsSimulator = null;
    let wsClient = null;

    var SerialPort = require('serialport');
    var port = null;

    let listPorts = (ws)=> {

        console.log('List ports...');
        SerialPort.list().then((data)=> {
            console.log(data);
            if(data != null) {
                send(ws, 'list', data)
            }
        })
    };

    let closePort = (ws)=> {
        if(port != null) {
            console.log('Closing port...');
            port.close((result)=> {
                console.log('Port closed: ', result);
                send(ws, 'closed');
                port = null;
            });
        } else {
            console.log('Could not close: no opened serial port.');
        }
    }

    console.log('Serial websocket ready');

    wss.on('connection', (ws)=> {
        wsClient = ws;
        console.log('New connection');

        ws.on('message', (message)=> {
            let json = JSON.parse(message);
            let type = json.type;
            let data = json.data;
            
            if(type == 'data') {

                if(wsSimulator != null) {
                    wsSimulator.send(data);
                    return
                }

                if(port == null) {
                    send(ws, 'error', 'Could not write data: no opened serial port.');
                    return;
                }
                port.write(data, (err)=> {
                    if (err) {
                        console.log('Error on write: ', err.message);
                        send(ws, 'error', err.message);
                        return;
                    }
                });

            } else if(type == 'list') {
                listPorts(ws);
            } else if(type == 'open') {

                console.log('Opening port ' + data.name + ', at ' + data.baudRate);

                port = new SerialPort(data.name, { baudRate: data.baudRate, lock:false }, (err)=> {
                    if (err) {
                        console.log('Error: ', err.message);
                        ws.send({type: 'error', data: err.message});
                        return;
                    }
                    console.log('Connection established.');
                    send(ws, 'opened');
                });

                port.on('error', (err)=> {
                    console.log('Error: ', err.message);
                    send(ws, 'error', err.message);
                })

                port.on('data', (data)=> {
                    send(ws, 'data', data.toString('utf8'));
                });

            } else if(type == 'close') {
                closePort(ws);
            }
        })

        ws.on('open', (data)=> {
            console.log('WebSocket opened');
        });

        ws.on('close', ()=> {
            wsClient = null;
            closePort(ws);
        })

        listPorts(ws);
    });

    // SIMULATOR


    wssim.on('connection', (ws)=> {

        console.log('Simulator connected')
        
        wsSimulator = ws;

        ws.on('message', (data) => {
            send(wsClient, 'data', data)
        });

        ws.on('close', ()=> {
            wsSimulator = null;
        })
    });
}
