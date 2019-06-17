module.exports = function(io) {
    const express = require("express");
    const router = express.Router();
    const keys = require("../config/keys");
    const axios = require('axios');
    const jwt = require("jsonwebtoken");

    const User = require("../models/User");
    const ActiveRequest = require("../models/ActiveRequests");

    // @route POST auth/privakeyBind
    // @desc Links one of our accounts with a PrivakeyCX account. This is called by the mobile app(s).
    router.post("/privakeyBind", (req, res) => {
        axios.request({
            url: keys.privakeyUrl + 'account/bind',
            method: 'put',
            headers: { 
                'Authorization': 'Basic ' + keys.privakeyBasicAuth,
                'Content-Type': 'application/json'
            },
            data: {
                'accountId': req.body.accountId
            }
        })
        .then((bindRes) => {
            User.findOneAndUpdate(
                { _id: req.body.accountId },
                { privakeyId: bindRes.data.privakeyId }
            );

            console.log(bindRes.data);
            let response = {
                privakeyId: bindRes.data.privakeyId,
                token: bindRes.data.sessionToken.guid,
                tokenexpiry: bindRes.data.sessionToken.expiration
            };
            res.json(response);
        })
        .catch((error) => {
            console.log(error);
        });
    });

    function emit(socket, type, data) {
        socket.emit('action', {
            type: type,
            data: data
        });
    }

    // @route auth/processRequest
    // @desc Lets the user know their request has updated. This is called by the PrivakeyCX Auth Server.
    router.post("/processRequest", (req, res) => {
        ActiveRequest.findOne( {requestGuid: req.body.guid}, function(err, activeRequest) {
            if(err) {
                console.log(err);
            } else {
                let socket = io.sockets.connected[activeRequest.socketId];
                console.log('activeRequest: ' + activeRequest);
                console.log('requestType: ' + activeRequest.requestType);

                if (activeRequest.requestType === 'auth') {
                    if(req.body.buttonSelected == 0) {
                        User.findOne({ id: activeRequest.accountId }).then(user => {
                            const payload = {
                                id: user.id,
                                name: user.name
                            };

                            jwt.sign(payload, keys.secretOrKey, { expiresIn: 31556926 },
                                (err, token) => { 
                                    emit(socket, 'server/APPROVE_LOGIN', {
                                        success: true,
                                        token: "Bearer " + token
                                    });
                                });
                        });
                    } else {
                        emit(socket, 'server/REJECT_LOGIN', { });
                    }
                } else {
                    if(req.body.buttonSelected == 0) {
                        emit(socket, 'server/UPDATE_REQUEST', { requestStatus: 'APPROVED' });
                    } else {
                        emit(socket, 'server/UPDATE_REQUEST', { requestStatus: 'REJECTED' });
                    }
                }

                res.status(204).send();
            }
        });
    });

    return router;
}