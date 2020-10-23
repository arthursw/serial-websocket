const WebSocket = require('ws');
const fs = require('fs');
const readline = require('readline');

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
    if(lineReader != null) {
        if(message == continueMessage) {
            lineReader.resume();
        }
        return
    }
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
    console.log('port info', port)
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
        
        if(writeStream != null) {
            writeStream.write(data);
            return
        }

        if(wsSimulator != null) {
            wsSimulator.send(data);
            return
        }

        if(port == null) {
            send(wsController, 'error', 'Could not write data: no opened serial port.');
            return;
        }

        if(lineReader != null) {
            send(wsController, 'error', 'Already printing file.');
            return;
        }

        port.write(data, portWriteCallback);

    } else if(type == 'list') {
        listPorts(wsController);
    } else if(type == 'write-file') {
        writeFile(data);
    } else if(type == 'close-file') {
        closeFile();
    } else if(type == 'list-files') {
        listFiles();
    } else if(type == 'print-file') {
        printFile(data);
    } else if(type == 'cancel-print-file') {
        cancelPrintFile();
    } else if(type == 'delete-file') {
        deleteFile(data);
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

// File

let writeStream = null;
const folderName = 'drawings/';
const continueMessage = 'READY';
let lineReader = null;

let writeFile = (fileName)=> {
    if(lineReader != null) {
        send(wsController, 'error', 'Already printing file.');
        return;
    }
    writeStream = fs.createWriteStream(folderName + fileName);
    writeStream.on('finish', () => {  
        send(wsController, 'info', 'File written.');
        writeStream = null;
    });
}

let closeFile = ()=> {
    if(writeStream != null) {
        writeStream.end();
    }
}

let listFiles = ()=> {
    fs.readdir(folderName, (err, files) => {
        send(wsController, 'files', files);
    });
}


let printFile = (fileName)=> {
    if(port == null) {
        send(wsController, 'error', 'Could not print data: no opened serial port.');
        return;
    }

    lineReader = readline.createInterface( { input: fs.createReadStream(folderName + fileName) } );

    lineReader.on('line', function (line) {
        lineReader.pause();
        if(port == null) {
            send(wsController, 'error', 'Could not print data: no opened serial port (while printing).');
            return;
        }

        port.write(data, portWriteCallback);
    });


    lineReader.on('close', function () {
        send(wsController, 'file-printed', fileName);
        lineReader = null;
    })
}

let cancelPrintFile = ()=> {
    if(lineReader != null) {
        lineReader.close();
    }
}

let deleteFile = (fileName)=> {
    fs.unlink(folderName + fileName, (err) => {
        if (err) {
            send(wsController, 'error', 'Error while deleting file ' + fileName);
            send(wsController, 'error', err);
            return
        };
        send(wsController, 'info', fileName + ' deleted.');
        listFiles();
    });
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
