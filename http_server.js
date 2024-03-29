const http = require('http');
const mainApp = require('./app.js');
const worker = require('./check_package_version');
const request = require('request');
const flutter_base_url = 'https://pub.dev/api/packages/';
let onRefreshEventListener = null;
let service_info = 'not initialized';
const requestListener = function (req, res) {
    console.log('received request from remote client -->' + req.method);
    console.log('url -->' + req.url);
    let rawStr = req.url.split('/');
    if(rawStr.length > 2){
        console.log(rawStr[0]);
        console.log(rawStr[1]);
        console.log(rawStr[2]);
        let route = rawStr[1];
        if(route == 'refreshCDN'){
            let target = rawStr[2];
            console.log('refresh CDN resource, target-->' + target);
            if(target == '' || typeof(target) == 'undefined'){
                res.writeHead(404);
                res.end('requested path not found, please check your url.');
            }else{
                //check publisher resource
                let options= {
                    url: flutter_base_url +target,
                    gzip: true,
                    headers: {
                        'User-Agent' : 'pub.flutter-io.cn'
                    }
                };
                request.get(options, (err, response, body) => {
                    console.log('http_server | body-->' + body);
                    try{
                        let j = JSON.parse(body);
                        if(j.error != null){
                            console.log('encountered error -->' + j.error.message);
                            res.writeHead(404);
                            res.end('encountered error while checking package information from official dart site.  error message-->' + j.error.message);
                        }else{
                            console.log('found package from official dart source site-->' + j.name + '  latest version is ' + j.latest.version);
                            if(onRefreshEventListener != null){
                                onRefreshEventListener(target);
                            }
                            res.writeHead(200);
                            res.end('found package from official dart source site-->' + j.name + '  latest version is ' + j.latest.version
                                +'\n\nadded new requests of refreshing cdn resources...'
                                + '\n\n\n\nverbose package information\n' + body
                                +'\n\nservice info:\n'
                                + service_info
                            );
                        }
                    }catch(e){
                        console.error('failed to parse JSON, response-->' + body.toString());
                    }
                });
            }



            // console.log('add target into request queue....');
            // // mainApp.add_refresh_package(target);
            // res.writeHead(200);
            // res.end('add target into request queue....');

        }else if(route == 'checkPackage'){
            worker.checkPackage();
            res.writeHead(200);
            res.end('package checking started...');
        }else if(route == 'checkEmail'){
            worker.checkEmailService();
            res.writeHead(200);
            res.end('sending test email to yuan@gdsub.com');

        }else{
            console.log('unimplemented route -->' + route);
            res.writeHead(404);
            res.end('requested path not found, please check your url.  unknown path-->' + route);
        }
    }else{
        res.writeHead(404);
        res.end('requested path not found, please check your url.');
    }
}

const server = http.createServer(requestListener);

// server.on('request', (req, res) =>{
//     console.log('received request from remote client -->' + req.method);
//     console.log('url -->' + req.url);
//     let rawStr = req.url.split('/');
//     if(rawStr.length > 2){
//         console.log(rawStr[0]);
//         console.log(rawStr[1]);
//         console.log(rawStr[2]);
//         let route = rawStr[1];
//         if(route == 'refreshCDN'){
//             let target = rawStr[2];
//             console.log('refresh CDN resource, target-->' + target);
//             console.log('add target into request queue....');
//             res.writeHead(200);
//             res.end('add target into request queue....');
//         }else{
//             console.log('unimplemented route -->' + route);
//             res.writeHead(404);
//             res.end('requested path not found, please check your url.  unknown path-->' + route);
//         }
//     }
//
//     // let url = new URL(req.url, `http://${req.headers.host}`);
//     // console.log('new url-->' + JSON.stringify(url));
// });

module.exports.startHTTPServer = function(callback){
    onRefreshEventListener = callback;
    server.listen(17788);
}

module.exports.setServiceInfo = function(info){
    service_info = info;
}