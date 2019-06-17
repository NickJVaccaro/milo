const axios = require('axios');
const keys = require('../config/keys');
const User = require("../models/User");
const ActiveRequest = require("../models/ActiveRequests");

function ioHelper (server, session) {
    let io = require("socket.io")(server);
    let sharedsession = require('express-socket.io-session');

    io.on('connection', function(socket) {
        console.log("Connection established, socket ID: " + socket.id);
        socket.on('disconnect', () => {
            console.log("User disconnected, socket ID: " + socket.id);
            ActiveRequest.findOneAndDelete(
                {socketId: socket.id},
                (err, removedRequest) => {
                    if(err) {
                        console.log(err);
                    } else {
                        console.log(removedRequest);
                    }
                }
            );
        });

        socket.on('action', (action) => {
            console.log(action);
            if(action.type === 'server/sendRequest') {
                sendRequest(action.data.accountId, 'generic', socket,
                    'Did you just send yourself a notification?', '10m');
            } else if (action.type === 'server/sendAuthRequest') {
                const email = action.data.email;
                User.findOne({ email }).then(user => {
                    console.log(user);
                    sendRequest(user._id, 'auth', socket,
                        'Are you trying to log in to MILO?', '2m');
                });
            }
        });
    });

    function sendRequest (accountId, requestType, socket, content, duration) {
        axios.request({
            url: keys.privakeyUrl + "request/add",
            method: 'post',
            headers: {
                'Authorization': 'Basic ' + keys.privakeyBasicAuth,
                'Content-Type': 'application/json'
            },
            data: {
                'accountId': accountId,
                'callback': keys.serverUrl + '/auth/processRequest',
                'content': content,
                'duration': duration,
                "additionalInfo": "{'viewType': 'html', 'format': 'standard'}"
            }
        })
        .then((requestRes) => {
            let activeRequest = new ActiveRequest({
                accoutId: accountId,
                requestGuid: requestRes.data.guid,
                socketId: socket.id,
                requestType: requestType
            });

            activeRequest.save(function(err, activeRequest) {
                if(err) {
                    console.log(err);
                } else if (activeRequest) {
                    console.log(activeRequest);
                }
            });

            socket.emit('action', {
                type: 'server/UPDATE_REQUEST',
                data: {
                    requestStatus: 'SENT'
                }
            });
        })
        .catch((error) => {
            console.log(error);
        });
    }

    io.use(sharedsession(session, {autoSave: true}));

    return function getIo() {
        return io;
    }
}

module.exports.ioHelper = ioHelper;