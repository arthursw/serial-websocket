const WebSocket = require('ws');
const fs = require('fs');
const { execFile, execSync } = require('child_process');

const args = process.argv.slice(2);

let wssSimulator = null;
let wssController = null;

let wsSimulator = null;
let wsController = null;

var SerialPort = require('serialport');
var ports = {};
var availablePorts = [];

let printerAddress = null
if(args.length > 0) {
    printerAddress = args[0];
} else {

    try {
        // Execute the hcitool scan command synchronously
        const output = execSync('hcitool scan', { encoding: 'utf-8' });

        // Print the raw output for debugging
        console.log('Raw output:', output);

        // Use a regular expression to extract the Bluetooth address
        const regex = /([0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5})/;
        const match = output.match(regex);

        if (match) {
            printerAddress = match[0];
            console.log('Printer Address:', printerAddress);
        } else {
            console.log('No Bluetooth address found.');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error executing hcitool scan:', error.message);
        process.exit(1);
    }
}

console.log('Usign printer address:', printerAddress)

const drawingName = 'drawing.png';
const printerArgs = ['-m', 'peripage', '-m', printerAddress, '-p', 'A6', '-b', '100', '-c', '2', '-i', drawingName];

send = (ws, type, data, portName)=> {
    if(ws != null) {
        ws.send( JSON.stringify({type: type, data: data, time: Date.now(), port: portName}) );
    }
}

let createPort = (data)=> {
    let portName = data.name
    console.log('Opening port ' + portName + ', at ' + data.baudRate)
    if(availablePorts instanceof Array &&  availablePorts.findIndex((value, index, obj)=> value.path == portName) < 0) {
        console.error('trying to connect to an unexisting port: ', portName)
    }

    let port = new SerialPort(portName, { baudRate: data.baudRate, lock:false }, (err)=>portCreationCallback(portName, err))

    port.on('data', (data)=> onPortData(portName, data))

    port.on('error', (err)=> onPortError(portName, err))
    
    ports[portName] = port
}

let portCreationCallback = (portName, err)=> {
    if (err) {
        console.log('Error: ', err.message);
        send(wsController, 'error', `${err.message} on port ${portName}.`, portName)
        return;
    }
    console.log(`Connection established on port ${portName}.`)
    send(wsController, 'opened', portName, portName)
}

let onPortData = (portName, data)=> {
    let message = data.toString('utf8')
    send(wsController, 'data', message, portName)
}

let onPortError = (portName, err)=> {
    console.error(portName, err.message)
    send(wsController, 'error', err.message, portName)
}

let portWriteCallback = (portName, err)=> {
    if (err) {
        console.log('Write error on port', portName, ':', err.message)
        send(wsController, 'error', err.message, portName)
        return;
    }
}

let listPorts = ()=> {
    console.log('List availablePorts...')
    SerialPort.list().then(listPortsCallback)
};

let listPortsCallback = (data)=> {
    console.log(data)
    if(data != null) {
        if(data instanceof Array) {
            availablePorts = data
            // Close opened ports which are not findable anymore:
            for(let openedPort of Object.keys(ports)) {
                // If the opened port is not in the list: close it (set port[portName] to null)
                if( availablePorts.findIndex((value, index, obj)=> value.path == openedPort) < 0) {
                    console.log('Found opened port which is not in list anymore:', openedPort)
                    closePort(openedPort)
                }
            }
        }
        send(wsController, 'list', data)
    }
}

let closePort = (portName)=> {
    if(ports[portName] != null) {
        console.log('Closing port...')
        ports[portName].close((result)=>closePortCallback(portName, result))
        ports[portName] = null
    } else {
        console.log('Could not close port:', portName, ' is not opened.')
    }
}

let closePortCallback = (portName, result)=> {
    console.log('Port', portName, 'closed')
    send(wsController, 'closed', portName, portName)
    ports[portName] = null
}

let onControllerConnection = (ws)=> {
    wsController = ws
    ws.on('message', onControllerMessage)
    ws.on('open', onControllerOpen)
    ws.on('close', onControllerClose)
    listPorts(ws)
}

let getPortInfo = (portName)=> {
    let port = portName == null ? Object.values(ports)[0] : ports[portName]
    return port != null ? {baudRate: port.baudRate, isOpen: port.isOpen, path: port.path} : {}
}

let onControllerMessage = (message)=> {
    let type = null;
    let data = null;
    let portName = Object.keys(ports)[0];
    try {
        let json = JSON.parse(message);
        type = json.type;
        data = json.data;
        portName = json.port;
    } catch (e) {
        console.log(e);
    }
    
    if(type == 'data') {
        
        if(wsSimulator != null) {
            wsSimulator.send(data)
            return
        }

        if(Object.keys(ports).length == 0) {
            send(wsController, 'error', 'Could not write data: no opened serial port.', portName)
            return;
        }
        if(ports[portName] == null) {
            send(wsController, 'error', 'Could not data: port not opened.', portName)
            return;
        }
        send(wsController, 'sent', data, portName)
        if(data != null) {
            ports[portName].write(data, portWriteCallback)
        }
    } else if(type == 'list') {
        listPorts(wsController)
    } else if(type == 'is-connected') {
        send(wsController, ports[portName] != null ? 'connected' : wsSimulator ? 'connected-to-simulator' : 'not-connected', getPortInfo(portName), portName)
    } else if(type == 'open') {

        if(ports[portName] != null) {
            send(wsController, 'already-opened', getPortInfo(portName), portName)
            return
        }

        createPort(data)

    } else if(type == 'close') {
        closePort(portName)
    } else if(type == 'print-file') {
        fs.writeFile(drawingName, Buffer.from(data.content, 'base64'), err => {
            if (err) {
                console.error(err);
            }
            
            execFile('python', printerArgs, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    return;
                }
            
                if (stderr) {
                    console.error(`Standard Error: ${stderr}`);
                    return;
                }
            
                console.log(`Standard Output: ${stdout}`);
            });

        });
    }
}

let onControllerOpen = (data)=> {
    console.log('WebSocket opened')
}

let onControllerClose = (data)=> {
    wsController = null
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
