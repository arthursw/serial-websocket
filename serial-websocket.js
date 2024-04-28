var najax = $ = require('najax')
const WebSocket = require('ws');
const fs = require('fs');
const readline = require('readline');

let wssSimulator = null;
let wssController = null;

let wsSimulator = null;
let wsController = null;

var SerialPort = require('serialport');
var port = null;
var ports = [];

send = (ws, type, data)=> {
    if(ws != null) {
        ws.send( JSON.stringify({type: type, data: data, time: Date.now()}) );
    }
}

let createPort = (data)=> {
    
    console.log('Opening port ' + data.name + ', at ' + data.baudRate)
    if(ports instanceof Array && !ports.includes(data.name)) {
        console.error('trying to connect to an unexisting port: ', data.name)
    }
    
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
    console.log('List ports...');
    SerialPort.list().then(listPortsCallback)
};

let listPortsCallback = (data)=> {
    console.log(data);
    if(data != null) {
        if(data instanceof Array) {
            ports = data
        }
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
        
        // if(writeStream != null) {
        //     writeStream.write(data);
        //     return
        // }

        if(wsSimulator != null) {
            wsSimulator.send(data);
            return
        }

        if(port == null) {
            send(wsController, 'error', 'Could not write data: no opened serial port.');
            return;
        }

        send(wsController, 'sent', data);
        port.write(data, portWriteCallback);
    
    } else if(type == 'comme-un-dessein-start') {
        
        startCommeUnDessein(wsController);

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

// Comme Un Dessein

// const commeundesseinAjaxURL = '/ajaxCallNoCSRF/'

// export class CommeUnDessein {

//     static State = {
//         NextDrawing: "NextDrawing",
//         RequestedNextDrawing: "RequestedNextDrawing",
//         Drawing: "Drawing",
//         SetStatus: "SetStatus",
//         RequestedSetStatus: "RequestedSetStatus",
//     }
    
//     static RequestTimeout = 2000
    
//     CommeUnDesseinSize = new paper.Size(4000, 3000)
	
//     mode = 'CommeUnDessein'
// 	origin = ''
// 	secret = '******'
// 	// currentDrawing: { items: any[], pk: string }
// 	state = CommeUnDessein.State.NextDrawing

// 	testMode = false
// 	started = false
// 	serverMode = true
// 	timeoutID = null

// 	constructor() {
// 	}

//     commeUnDesseinToDrawArea(point) {
//         let drawArea = tipibot.drawArea.bounds
//         let CommeUnDesseinPosition = new paper.Point(-CommeUnDesseinSize.width/2, -CommeUnDesseinSize.height/2)
//         const CommeUnDesseinDrawArea = new paper.Rectangle(CommeUnDesseinPosition, CommeUnDesseinSize)
//         return point.subtract(CommeUnDesseinDrawArea.topLeft).divide(CommeUnDesseinDrawArea.size).multiply(drawArea.size).add(drawArea.topLeft)
//     }
    
//     requestNextDrawing() {
            
//         if(this.state != State.NextDrawing) {
//             console.error('CommeUnDessein trying to request next drawing while not in NextDrawing state')
//             return
//         }

//         let args = {
//             cityName: this.mode, secret: this.secret
//         }
//         let functionName = this.testMode ? 'getNextTestDrawing' : 'getNextValidatedDrawing'
//         let data = {
//             data: JSON.stringify({ function: functionName, args: args })
//         }
//         this.state = State.RequestedNextDrawing
        
//         console.log('Request next drawing...')

//         // let url = this.testMode ? 'http://localhost:8000/ajaxCallNoCSRF/' : commeundesseinAjaxURL
//         let url = this.origin + commeundesseinAjaxURL
//         // $.ajax({ method: "GET", url: url, data: data, xhrFields: { withCredentials: false }, headers: {'Access-Control-Allow-Origin':true} }).done((results) => {
    
//         $.ajax({ method: "POST", url: url, data: data }).done((results) => {
//             if(this.testMode) {
//                 console.log(results)
//             }
//             if (results.message == 'no path') {
//                 this.state = State.NextDrawing
//                 console.log('There are no path to draw. Request next drawing in a few seconds...')
//                 if(this.started) {
//                     clearTimeout(this.timeoutID)
//                     this.timeoutID = setTimeout(() => this.requestNextDrawing(), CommeUnDessein.RequestTimeout)
//                 }
//                 return
//             }
//             if(this.state != State.RequestedNextDrawing) {
//                 console.error('CommeUnDessein trying to set to draw while not in RequestedNextDrawing state')
//                 return
//             }
//             this.drawSVG(results)
//             return
//         }).fail((results) => {
//             console.error('getNextValidatedDrawing request failed')
//             console.error(results)
//             this.state = State.NextDrawing
//             if(this.started) {
//                 clearTimeout(this.timeoutID)
//                 this.timeoutID = setTimeout(() => this.requestNextDrawing(), CommeUnDessein.RequestTimeout)
//             }
//         })
//     }

//     drawSVG(results) {
//         if (results.state == 'error') {
//             console.log(results)
//             return
//         }
//         this.state = State.Drawing
//         this.currentDrawing = results

//         let drawing = new paper.Group()

//         paper.project.importSVG(results.svg, (item, svg)=> {
//             if(item.visible == false) {
//                 console.error('When receiving next validated drawing: while importing SVG: the imported item is not visible: ignore.')
//                 return
//             }
//             for (let path of item.children) {

//                 if(path.className != 'Path') {
//                     continue
//                 }

//                 // Ignore anything that humans can't see to avoid hacks
//                 let strokeColor = path.strokeColor
//                 if(path.strokeWidth <= 0.2 || path.strokeColor == 'white' || path.strokeColor == null || path.opacity <= 0.1 || strokeColor.alpha <= 0.2 || !path.visible) {
//                     continue
//                 }

//                 let controlPath = path.clone()

//                 controlPath.flatten(Settings.plot.flattenPrecision)
                
//                 // now that controlPath is flattened: convert in draw area coordinates
//                 for(let segment of controlPath.segments) {
//                     segment.point = commeUnDesseinToDrawArea(segment.point)
//                 }
//                 drawing.addChild(controlPath)
//             }
//             item.remove()
//             if(SVGPlot.svgPlot != null) {
//                 SVGPlot.svgPlot.destroy()
//             }
//             SVGPlot.svgPlot = new SVGPlot(drawing)
//             SVGPlot.svgPlot.plot(() => this.setDrawingStatusDrawn(results.pk))
//         })
//     }

//     setDrawingStatusDrawn(pk) {
//         if(visualFeedback.paths.children.length > 0) {
//             visualFeedback.paths.removeChildren()
//         }

//         if(this.state != State.Drawing) {
//             console.error('CommeUnDessein trying to setDrawingStatusDrawn while not in Drawing state')
//             return
//         }

//         let args = {
//             pk: pk,
//             secret: this.secret
//         }
//         let functionName = this.testMode ? 'setDrawingStatusDrawnTest' : 'setDrawingStatusDrawn'
//         let data = {
//             data: JSON.stringify({ function: functionName, args: args })
//         }
//         this.state = State.RequestedSetStatus

//         if(this.testMode) {
//             console.log('setDrawingStatusDrawn')
//         }

//         let url = this.origin + commeundesseinAjaxURL
//         $.ajax({ method: "POST", url: url, data: data }).done((results) => {
//             console.log(results)
//             if(this.testMode) {
//                 console.log(results)
//             }
//             if (results.state == 'error') {
//                 console.error(results)
//                 return
//             }
//             if(this.state != State.RequestedSetStatus) {
//                 console.error('CommeUnDessein trying to requestNextDrawing while not in RequestedSetStatus state')
//                 return
//             }
//             this.state = State.NextDrawing
//             if(this.started) {
//                 this.requestNextDrawing()
//             }
//             return
//         }).fail((results) => {
//             console.error('setDrawingStatusDrawn request failed')
//             console.error(results)
//             this.state = State.Drawing
//             if(this.started) {
//                 this.setDrawingStatusDrawn(pk)
//             }
//         })
//     }

//     // From SVG Plot

// 	itemMustBeDrawn(item) {
// 		return (item.strokeWidth > 0 && item.strokeColor != null) // || item.fillColor != null
// 	}

// 	moveTipibotLinear(segment) {
// 		let point = segment.point
// 		let minSpeed = 0
// 		// if(Settings.plot.fullSpeed) {
// 		// 	minSpeed = speeds[segment.index]
// 		// 	// let speedRatio = minSpeed / Settings.tipibot.maxSpeed
// 		// 	// let circle = paper.Path.Circle(point, 4)
// 		// 	// circle.fillColor = <any> { hue: speedRatio * 240, saturation: 1, brightness: 1 }
// 		// }
// 		tipibot.moveLinear(point, minSpeed, Settings.tipibot.drawSpeed, ()=> tipibot.pen.setPosition(point, true, false), false)
// 	}

// 	plotPath(path) {
// 		if(path.className != 'Path' || !itemMustBeDrawn(path) || path.segments == null) {
// 			return
// 		}
// 		// let speeds = Settings.plot.fullSpeed ? this.computeSpeeds(path) : null

// 		for(let segment of path.segments) {
// 			let point = segment.point

// 			if(segment == path.firstSegment) {
// 				if(!tipibot.lastSentPosition.equals(point)) {
// 					tipibot.penUp()
// 					tipibot.moveDirect(point, ()=> tipibot.pen.setPosition(point, true, false), false)
// 				}
// 				tipibot.penDown()
// 			} else {
// 				// this.moveTipibotLinear(segment, speeds)
// 				this.moveTipibotLinear(segment)
// 			}
// 		}
// 		if(path.closed) {
// 			// this.moveTipibotLinear(path.firstSegment, speeds)
// 			this.moveTipibotLinear(path.firstSegment)
// 		}
// 	}

// 	plotCurrentPath() {
// 		this.plotPath(this.currentPath)
// 		this.nSegments += this.currentPath.segments.length
// 		let currentPath = this.currentPath.nextSibling
// 		if(currentPath != null) {
// 			let currentColor = this.getColorCSS(this.currentPath.strokeColor)
// 			let nextColor = this.getColorCSS(currentPath.strokeColor)
// 			if(currentColor != null && nextColor != null && currentColor != nextColor) {
// 				let wasPenUp = tipibot.pen.isUp
// 				tipibot.penUp()
// 				tipibot.sendChangePen(nextColor, this.currentColorIndex++)
// 				if(!wasPenUp) {
// 					tipibot.penDown()
// 				} 
// 			}
// 		}
// 		this.currentPath = currentPath
// 	}

// 	plotAll() {
// 		this.nSegments = 0
// 		while(this.currentPath != null) {
// 			this.plotCurrentPath()
// 		}
// 		communication.interpreter.startQueue()
// 	}
// }

// let commeUnDessein = new CommeUnDessein()

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
