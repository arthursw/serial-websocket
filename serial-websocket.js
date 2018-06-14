const Server = require('socket.io');
const server = require('http').Server();

module.exports = (PORT = 6842)=> {

    server.listen(PORT);

    const io = Server(server);

    var SerialPort = require('serialport');
    var port = null;

    let listPorts = ()=> {

        console.log('List ports...');
        SerialPort.list().then((data)=> {
            console.log(data);
            if(data != null) {
                io.emit('list', data);
            }
        })
    };

    console.log('Serial websocket ready');

    io.on('connection', (socket)=> {
        console.log('New connection: ');
        console.log(socket);

        socket.on('data', (data)=> {
            console.log('write: ', data);
            if(port == null) {
                io.emit('error', 'Could not write data: no opened serial port.')
                return;
            }
            port.write(data, function(err) {
                if (err) {
                    console.log('Error on write: ', err.message);
                    io.emit('error', err.message);
                    return;
                }
                console.log('message written');
            });
        });

        socket.on('list', (data)=> {
            listPorts();
        });

        socket.on('open', (data)=> {
            
            console.log('Opening port ' + data.name + ', at ' + data.baudRate);

            port = new SerialPort(data.name, { baudRate: data.baudRate, lock:false }, function (err) {
                if (err) {
                    console.log('Error: ', err.message);
                    io.emit('error', err.message);
                    return;
                }
                console.log('Connection established.');
                io.emit('opened');
            });

            // port.pipe(parser);

            port.on('error', function(err) {
                console.log('Error: ', err.message);
                io.emit('error', err.message);
            })

            port.on('data', function (data) {
                console.log('Received:\t', data.toString('utf8'));
                io.emit('data', data.toString('utf8'));
            });
        });

        socket.on('close', ()=> {
            if(port != null) {
                console.log('Closing port...');
                port.close((result)=> {
                    console.log(result);
                });
            } else {
                console.log('Could not close: no opened serial port.');
            }
        })

        

        listPorts();
    });

}
