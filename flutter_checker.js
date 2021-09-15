const https = require('https');
const fs = require('fs');
const qiniu = require('qiniu');

const EventEmitter = require('events');

class MsgEmitter extends EventEmitter{}

var mEmitter = new MsgEmitter();


mEmitter.on('remove_windows', (b, f) => {
    console.log('remove json file of windows version ');
    removeFileFromBucket(b, f, (res)=> {
        mEmitter.emit('remove_linux', bucket, qiniu_jsonfile_linux);
        mEmitter.emit('remove_linux', bucket, qiniu_jsonfile_linux_legacy);
        if(res){
            setTimeout(requestSource, 300 * 1000, [url_qiniu_base + 'releases_windows.json']);

        }
    });


});




mEmitter.on('remove_linux', (b, f) => {
    console.log('remove json file of linux version ');
    removeFileFromBucket(b, f, (res)=> {
        mEmitter.emit('remove_macos', bucket, qiniu_jsonfile_macos);
        mEmitter.emit('remove_macos', bucket, qiniu_jsonfile_macos_legacy);
        if(res){
            setTimeout(requestSource, 300 * 1000, [url_qiniu_base + 'releases_linux.json']);
        }
    });


});

mEmitter.on('remove_macos', (b, f) => {
    console.log('remove json file of macos version ');
    removeFileFromBucket(b, f, (res)=> {
        if(res){
            setTimeout(requestSource, 300 * 1000, [url_qiniu_base + 'releases_macos.json']);
            console.log('file removing operation is done.');
        }
    });

});

const URL_FLUTTER_WINDOWS = 'https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json';
const URL_FLUTTER_MACOS = 'https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json';
const URL_FLUTTER_LINUX = 'https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json';
//legacy address
const URL_FLUTTER_WINDOWS_LEGACY = 'https://storage.googleapis.com/flutter_infra/releases/releases_windows.json';
const URL_FLUTTER_MACOS_LEGACY = 'https://storage.googleapis.com/flutter_infra/releases/releases_macos.json';
const URL_FLUTTER_LINUX_LEGACY = 'https://storage.googleapis.com/flutter_infra/releases/releases_linux.json';

//legacy resources
const qiniu_jsonfile_linux_legacy = 'flutter_infra/releases/releases_linux.json';
const qiniu_jsonfile_macos_legacy = 'flutter_infra/releases/releases_macos.json';
const qiniu_jsonfile_windows_legacy = 'flutter_infra/releases/releases_windows.json';

const qiniu_jsonfile_linux = 'flutter_infra_release/releases/releases_linux.json';
const qiniu_jsonfile_macos = 'flutter_infra_release/releases/releases_macos.json';
const qiniu_jsonfile_windows = 'flutter_infra_release/releases/releases_windows.json';

const url_qiniu_base = 'https://storage.flutter-io.cn/flutter_infra/releases/';



let version_windows = {
    'beta' : '',
    'dev' : '',
    'stable' : ''
};
let version_macos = {
    'beta' : '',
    'dev' : '',
    'stable' : ''
};
let version_linux = {
    'beta' : '',
    'dev' : '',
    'stable' : ''
};

let initializeCheck = true;
let initializeCount = 0;
let mainTask = null;

let windows_beta = false;
let windows_dev = false;
let windows_stable = false;
let macos_beta = false;
let macos_dev = false;
let macos_stable = false;
let linux_beta = false;
let linux_dev = false;
let linux_stable = false;

let flutter_cache = __dirname + '/json_cache/';

let service_log = 'service_flutter.log';

//qiniu
let mac = null;
let config = new qiniu.conf.Config();
//config.zone = qiniu.zone.Zone_z2;//bucket: flutter
config.zone = qiniu.zone.Zone_z1;//bucket: flutter-mirrors
const bucket = 'flutter-mirrors';//'flutter'
let bucketManager = null;



function retriveFlutterVersion(platform){
    let url = '';
    switch(platform){
        case 'windows':
            url = URL_FLUTTER_WINDOWS;
            break;
        case 'macos':
            url = URL_FLUTTER_MACOS;
            break;
        case 'linux':
            url = URL_FLUTTER_LINUX;
            break;
    }

    https.get(url, (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {

            try{
                parseRawData(data, platform);
                let timezone = new Date().getTimezoneOffset();//in minutes
                let timestamp = Date.now() - timezone * 60000;
                let time_str = new Date(timestamp).toISOString();
                console.log(new Date(timestamp));
                console.log('checked flutter version');
                console.log('cache version file');
                time_str = time_str.replace(/T|Z/g, '_');
                fs.writeFile(flutter_cache + time_str + 'releases_' + platform + '.json', data, (err)=>{
                    if(err){
                        fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'encountered error while writing version information into local file' + '\n');
                        console.error('encountered error while writing version information into local file');
                    }else{
                        fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'refreshed local file:' + time_str + 'releases_' + platform + '.json' + '\n');
                        console.log('refreshed local file:' + time_str + 'releases_' + platform + '.json');
                    }
                });

                initializeCount++;
                if(initializeCheck && initializeCheck >= 3){
                    initializeCheck = false;

                }else{
                    if(platform == 'windows'){
                        if(windows_beta || windows_dev || windows_stable){
                            windows_beta = false;
                            windows_dev = false;
                            windows_stable = false;

                            console.log('files are updated, remove related files from Qiniu buckets');
                            mEmitter.emit('remove_windows', bucket, qiniu_jsonfile_windows);
                            //update legacy bucket
                            mEmitter.emit('remove_windows', bucket, qiniu_jsonfile_windows_legacy);

                        }

                    }


                }
            }catch(e){
                console.error('encountered error while parsing json data, error-->' + e.message);
            }

        });

    }).on("error", (err) => {
        fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'Error: ' + err.message + '\n');

        console.log("Error: " + err.message);
    });

}

function parseRawData(data, platform){
    let raw = JSON.parse(data);
    let beta_hash = raw.current_release.beta;
    let dev_hash = raw.current_release.dev;
    let stable_hash = raw.current_release.stable;
    let releases = raw.releases;

    whichIsUpdated(data, platform);
    for(let i=0; i<releases.length; i++){
        let item = releases[i];
        let release_time = new Date(item.release_date).getTime();
        let current_time = Date.now();
        let duration = (current_time - release_time)/86400000;//calculate time duration between release date and current time
        if(initializeCheck || duration < 1){
            if(item.hash == beta_hash && item.channel == 'beta'){
                if(platform == 'windows'){
                    version_windows.beta = item;
                }else if(platform == 'macos'){
                    version_macos.beta = item;
                }else if(platform == 'linux'){
                    version_linux.beta = item;
                }

            }else if(item.hash == dev_hash && item.channel == 'dev'){
                if(platform == 'windows'){
                    version_windows.dev = item;
                }else if(platform == 'macos'){
                    version_macos.dev = item;
                }else if(platform == 'linux'){
                    version_linux.dev = item;
                }
            }else if(item.hash == stable_hash && item.channel == 'stable'){
                if(platform == 'windows'){
                    version_windows.stable = item;
                }else if(platform == 'macos'){
                    version_macos.stable = item;
                }else if(platform == 'linux'){
                    version_linux.stable = item;
                }
            }
        }else{
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'the time of this release version is more than 1 day before current time, it\'s too old. item=' + item.toString() + '\n');
        }

    }

}


//check which version has been updated
function whichIsUpdated(data, platform){
    let raw = JSON.parse(data);
    let beta_hash = raw.current_release.beta;
    let dev_hash = raw.current_release.dev;
    let stable_hash = raw.current_release.stable;
    if(platform == 'windows'){
        if(version_windows.beta != '' && beta_hash != version_windows.beta.hash){
            windows_beta = true;
            console.log('windows.beta is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'windows.beta is updated, hash = ' + version_windows.beta.hash + '\n');
        }
        if(version_windows.dev != '' && dev_hash != version_windows.dev.hash){
            windows_dev = true;
            console.log('windows.dev is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'windows.dev is updated, hash = ' + version_windows.dev.hash + '\n');
        }
        if(version_windows.stable != '' && stable_hash != version_windows.stable.hash){
            windows_stable = true;
            console.log('windows.stable is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'windows.stable is updated, hash = ' + version_windows.stable.hash + '\n');

        }
    }

    if(platform == 'macos'){
        if(version_macos.beta != '' && beta_hash != version_macos.beta.hash){
            macos_beta = true;
            console.log('macos.beta is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'macos.beta is updated, hash = ' + version_macos.beta.hash + '\n');


        }
        if(version_macos.dev != '' && dev_hash != version_macos.dev.hash){
            macos_dev = true;
            console.log('macos.dev is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'macos.dev is updated, hash = ' + version_macos.dev.hash + '\n');

        }
        if(version_macos.stable != '' && stable_hash != version_macos.stable.hash){
            macos_stable = true;
            console.log('macos.stable is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'macos.stable is updated, hash = ' + version_macos.stable.hash + '\n');

        }
    }else if(platform == 'linux'){
        if(version_linux.beta != '' && beta_hash != version_linux.beta.hash){
            linux_beta = true;
            console.log('linux.beta is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'linux.beta is updated, hash = ' + version_linux.beta.hash + '\n');

        }
        if(version_linux.dev != '' && dev_hash != version_linux.dev.hash){
            linux_dev = true;
            console.log('linux.dev is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'linux.dev is updated, hash = ' + version_linux.dev.hash + '\n');

        }
        if(version_linux.stable != '' && stable_hash != version_linux.stable.hash){
            linux_stable = true;
            console.log('linux.stable is updated');
            fs.appendFileSync(flutter_cache + service_log, currentTimestamp() + 'linux.stable is updated, hash = ' + version_linux.stable.hash + '\n');
        }
    }

}


function formatDate(date){
    let replaced = date.replace(/T|Z/g, ' ');
    return replaced.split('\.')[0];

}

function currentTimestamp(){
    let timezone = new Date().getTimezoneOffset();//in minutes
    let timestamp = Date.now() - timezone * 60000;
    let time_str = new Date(timestamp).toISOString();

    time_str = time_str.replace(/T|Z/g, '_');

    return time_str;
}


const getFlutterInfo = function(platform){
    let ret;
    switch(platform){
        case 'windows':
            ret = version_windows;
            break;
        case 'macos':
            ret = version_macos;
            break;
        case 'linux':
            ret = version_linux;
            break;
    }
    return ret;
}

function checkVersion(){
    retriveFlutterVersion('windows');
    retriveFlutterVersion('macos');
    retriveFlutterVersion('linux');
}

function removeFileFromBucket(b, f, callback){
    bucketManager.delete(b, f, (err, respBody, respInfo) => {
        let res = false;
        if(err){
            console.error('encountered error while deleting resources, err:' + err.message);
            res = false;
        }else{

            console.log('respInfo=' + JSON.stringify(respInfo));
            if(respInfo.status === 200){
                console.log('operation done.');
                res = true;
            }else if(respInfo.status === 612){
                console.log('no such file or directory.');
                res = false;
            }else{
                console.log(respInfo.data.error);
                res = false;
            }
        }
        if(typeof(callback) != 'undefined'){
            callback(res);
        }
});
}


const requestSource = function(url){
    console.log('requesting ' + url);
    https.get(url, (resp) => {
        let data = '';
        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        resp.on('end', () => {
            console.log(data);
        });

        resp.on('error', (err) =>{
            console.error('encountered error in http request:' + err.message);
        })
    });
}


const startCheckTask = function(){

    let auth_file = __dirname + '/auth.json';

    let data = fs.readFileSync(auth_file);

    let auth = JSON.parse(data);
    mac = new qiniu.auth.digest.Mac(auth.access_key, auth.secret_key);
    bucketManager = new qiniu.rs.BucketManager(mac, config);

    console.log('initializing version information data from official Google Cloud Storage node');
    checkVersion();

    console.log('start flutter checker, check version info per 10 minute');
    if(mainTask != null){
        clearInterval(mainTask);
        mainTask = null;
    }
    mainTask = setInterval(checkVersion, 10 * 60 * 1000);

    console.log('[debug] removing qiniu resources');
    mEmitter.emit('remove_linux', bucket, qiniu_jsonfile_linux);
    mEmitter.emit('remove_linux', bucket, qiniu_jsonfile_linux_legacy);

};

module.exports.startCheckTask = startCheckTask;

console.log('starting flutter version checker...');
startCheckTask();