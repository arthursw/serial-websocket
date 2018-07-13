const WebSocket = require('ws');

let wssSimulator = null;
let wssController = null;

let wsSimulator = null;
let wsController = null;

var SerialPort = require('serialport');
var port = null;

send = (ws, type, data)=> {
    if(ws != null) {
        ws.send( JSON.stringify({type: type, data: data}) );
    }
}

let createPort = (data)=> {
    
    console.log('Opening port ' + data.name + ', at ' + data.baudRate)

    port = new SerialPort(data.name, { baudRate: data.baudRate, lock:false }, portCreationCallback)

    port.on('data', onPortData)

    port.on('error', onPortError)
}

let portCreationCallback = (err)=> {
    if (err) {
        console.log('Error: ', err.message);
        wsController.send({type: 'error', data: err.message});
        return;
    }
    console.log('Connection established.');
    send(wsController, 'opened')
}

let onPortData = (data)=> {
    let message = data.toString('utf8')
    send(wsController, 'data', message)
}

let onPortError = (err)=> {
    console.error(err.message)
    send(wsController, 'error', err.message)
}

let portWriteCallback = (err)=> {
    if (err) {
        console.log('Error on write: ', err.message);
        send(wsController, 'error', err.message);
        return;
    }
}

let listPorts = ()=> {
    if(port != null) {
        send(wsController, 'warning', 'Port is already opened');
        return
    }
    console.log('List ports...');
    SerialPort.list().then(listPortsCallback)
};

let listPortsCallback = (data)=> {
    console.log(data);
    if(data != null) {
        send(wsController, 'list', data)
    }    
}

let closePort = ()=> {
    if(port != null) {
        console.log('Closing port...')
        port.close(closePortCallback)
    } else {
        console.log('Could not close: no opened serial port.')
    }
}

let closePortCallback = (result)=> {
    console.log('Port closed: ', result)
    send(wsController, 'closed')
    port = null
}

let onControllerConnection = (ws)=> {
    wsController = ws
    ws.on('message', onControllerMessage)
    ws.on('open', onControllerOpen)
    ws.on('close', onControllerClose)
    listPorts(ws)
}

let getPortInfo = ()=> {
    return port != null ? {baudRate: port.baudRate, isOpen: port.isOpen, path: port.path} : {}
}

let onControllerMessage = (message)=> {
    let type = null;
    let data = null;
    try {
        let json = JSON.parse(message);
        type = json.type;
        data = json.data;
    } catch (e) {
        console.log(e);
    }
    
    if(type == 'data') {

        if(wsSimulator != null) {
            wsSimulator.send(data);
            return
        }

        if(port == null) {
            send(wsController, 'error', 'Could not write data: no opened serial port.');
            return;
        }

        port.write(data, portWriteCallback);

    } else if(type == 'list') {
        listPorts(wsController);
    } else if(type == 'is-connected') {
        send(wsController, port != null ? 'connected' : wsSimulator ? 'connected-to-simulator' : 'not-connected', getPortInfo());
    } else if(type == 'open') {
        
        if(port != null) {
            send(wsController, 'already-opened', getPortInfo());
            return
        }

        createPort(data)

    } else if(type == 'close') {
        closePort(wsController);
    }
}

let onControllerOpen = (data)=> {
    console.log('WebSocket opened');
}

let onControllerClose = (data)=> {
    wsController = null;
}

// SIMULATOR


let onSimulatorConnection = (ws)=> {
    wsSimulator = ws;
    ws.on('message', onSimulatorMessage)
    ws.on('close', onSimulatorClose)
    
    if(wsController != null) {
        send(wsController, 'connected-to-simulator', getPortInfo())
    }
}

let onSimulatorMessage = (data)=> {
    send(wsController, 'data', data + '\n')
}

let onSimulatorClose = (data)=> {
    wsSimulator = null;
    if(wsController != null) {
        send(wsController, port != null ? 'connected' : 'not-connected', getPortInfo());
    }
}


module.exports = (PORT = 6842)=> {

    wssController = new WebSocket.Server({ port: PORT })
    wssController.on('connection', onControllerConnection)

    wssSimulator = new WebSocket.Server({ port: (PORT+1) })
    wssSimulator.on('connection', onSimulatorConnection)
}
