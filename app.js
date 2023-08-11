const request = require('request');
const { spawn } = require('child_process');
const axios = require('axios');

const http_server = require('./http_server');
const fs = require('fs');

const EventEmitter = require('events');

/**
 *
 *  constants
 */
const flutter_base_url = 'https://pub.dev/api/packages/';
const flutter_source_url = 'https://pub.dev/api/packages?page=1';//[deprecated]'https://pub.dev/api/packages?page=1';
const flutter_source_url_arg_page = 'https://pub.dev/api/packages?page=';//[deprecated]'https://pub.dev/api/packages?page=1';
const aliyuncli_cmd = '/usr/local/bin/aliyuncli';
// const aliyuncli_cmd = '/usr/local/bin/aliyuncli cdn RefreshObjectCaches ';
const aliyun_cdn_url = 'https://pub.flutter-io.cn/api/packages/';
const aliyun_cdn_base_url = 'https://pub.flutter-io.cn/packages/';
const cdn_base_address = 'pub.flutter-io.cn';
const cdn_whole_resource_address = 'https://pub.flutter-io.cn/';
const cdn_browser_resource_address = 'https://pub-web.flutter-io.cn/packages/';
const cdn_browser_document_address = 'https://pub-web.flutter-io.cn/documentation/';
const cdn_publisher_resource_address = 'https://pub-web.flutter-io.cn/publishers/';
// const aliyun_cdn_url = 'https://material-io.cn/';


/**
 * event handler & emitter
 */
class CheckerEventHandler extends EventEmitter {}
const eventHandler = new CheckerEventHandler();
eventHandler.on('checkPage', (page) => {
    if(page == -1){
        isProcessing = false;
        console.log('[eventHandler] stop processing, reset pkg_map');
        pkg_map = tmp_pkg_map;

    }else if(page < 10){
        console.log('[eventHandler] checking page -->' + page);
        retrievePackageData(page);
    }else{
        console.log('[eventHandler] unable to find last updated packages in recent 10 page of package list, abort... ');
        pkg_map = tmp_pkg_map;
        isProcessing = false;
    }

});


/**
 *
 *
 *  local data members
 *
 *
 *
 */

const TYPE_FILE = 'File';
const TYPE_DIRECTORY = 'Directory';

const TYPE_FILE_CHUANG = 'file';
const TYPE_DIRECTORY_CHUANG = 'dir';
// let json_test = '{"name":"quill_zefyr_bijection","latest":{"version":"0.3.0","pubspec":{"name":"quill_zefyr_bijection","description":"Converts Quill.Js JSON to Zefyr Compatible JSON Delta fo user with Zefyr editor flutter package.","version":"0.3.0","homepage":"https://github.com/essuraj/Quill-Zefyr-Bijection","environment":{"sdk":">=2.1.0 <3.0.0"},"dependencies":{"flutter":{"sdk":"flutter"},"quill_delta":"^1.0.2"},"dev_dependencies":{"flutter_test":{"sdk":"flutter"}},"flutter":null},"archive_url":"https://pub.dartlang.org/packages/quill_zefyr_bijection/versions/0.3.0.tar.gz","package_url":"https://pub.dartlang.org/api/packages/quill_zefyr_bijection","url":"https://pub.dartlang.org/api/packages/quill_zefyr_bijection/versions/0.3.0"}}';
// let first_package = '';//JSON.parse(json_test);
// let legacy_pkg = '';
let cdn_refresh_info = '';
let cdn_refresh_service_remain = 0;
let present_day = 0;
let refresh_interval = 666000;//11 minutes
let alert_threshold = 50;//conservative strategy is not used
let allowed_maximum_dir_refresh_times = 1000;

let check_task;
let check_task_conservative;
let refresh_worker;
let refresh_cache = [];
let refresh_list = [];
let refresh_dir_list = [];
let refresh_directory = true;

let refresh_cache_chuangcache_file = [];
let refresh_cache_chuangcache_dir = [];
let refresh_chuang_worker = null;
let refresh_chuang_worker_dir = null;
let refresh_chuang_token;

let chuangcache_token = '';
let token_refresh_time = 0;
let token_expire_time = 0;

let pkg_map = null;
let tmp_pkg_map = new Map();

let extra_refresh_worker;
let extra_pkg_map = new Map();//this map maintains the update time of the latest version for each package
let extra_cache = [];//this list caches the packages that are needed to compare the update time
                        // to decide whether updating the related CDN resource

let refresh_browser_dir_task;

let debug = true;

let isProcessing = false;

let retry_time = 0;

let cdn_refresh_privilege_info = '';

// let lastCheckMSG = '';
/**
 * end of block
 */


/**
 *
 *
 * local functions
 *
 *
 */

/**
 *
 * cdn refresh checker
 *
 */
function cdnRefreshChecker(){
    if(!isProcessing || retry_time >= 2){//force to start cdn refresh procedure if isProcessing is not set to false after 20 minutes

        //refresh cdn resources cached in list
        refresh_target_file_from_cache();
        refresh_target_directory_from_cache();

        isProcessing = true;
        retry_time = 0;
        check_service_status((left_refresh_amount) => {
            if(left_refresh_amount <= alert_threshold){
                if(debug){
                    console.log('alert! the left refresh service is less than 400, start conservative strategy.');
                }
                //stop current refresh task
                if(debug){
                    console.log('stop current refresh task');
                    clearInterval(check_task);
                }
                //stop refresh worker
                // if(debug){
                //     console.log('stop refresh worker');
                //     clearInterval(refresh_worker);
                // }
                //get the start date of conservative refresh
                present_day = new Date().getDate();
                //start conservative strategy
                // check_task_conservative = setInterval(conservative_refresh, refresh_interval);
            }else{
                if(left_refresh_amount == allowed_maximum_dir_refresh_times){
                    if(debug){
                        console.log('Aliyun service refreshed usage count, refresh whole CDN resource site');
                    }
                    refresh_ali_cdn_of_target(cdn_whole_resource_address, TYPE_DIRECTORY);
                }
                eventHandler.emit('checkPage', 1);
            }
        });

    }else{
        console.log('checker is now processing... retied-->' + retry_time + ' times.');
        retry_time++;
    }

}

/**
 *
 * retrieve package information from dartlang.org
 *
 */
function retrievePackageData(page){
    let url = flutter_source_url_arg_page + page;
    let options= {
        url: url,
        gzip: true,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };
    request.get(options, (err, response, body) => {
        //response from remote http server
        if(err){
            console.error(currentTimestamp() + 'encountered error while requesting package information from remote server, message:' + err.toString());
            console.log('retry checking current page-->' + page);
            eventHandler.emit('checkPage', page);
        }else {
            console.log('cache package data');

            fs.appendFile(__dirname + '/logs/' + currentTimestamp() + '.dartlang.log', body, { encoding: "utf8", mode: 0o666, flag: "a" }, (err) => {
                if (err) console.error(currentTimestamp() + 'encountered error while caching package list, e-->' + err.message);
                console.log('file cached');
            });

            let data = JSON.parse(body);
            if(typeof(data.packages) !== 'undefined' && data.packages.length > 0){
                if(page == 1){
                    console.log('cache legacy_package -->' + show_package_info(data.packages[0]));
                    console.log('cache tmp_pkg_map');

                    let pkg_list = data.packages;
                    tmp_pkg_map = new Map();//reset temporary package map to clean up the cached data
                    for(let i=0; i<pkg_list.length; i++){
                        let pkg = pkg_list[i];
                        tmp_pkg_map.set(pkg.name, pkg);

                    }
                }
                if(pkg_map == null){
                    //initialize first package
                    console.log('initializing pkg_map, refreshing cdn after service being restarted');

                    let pkg_list = data.packages;
                    pkg_map = new Map();
                    tmp_pkg_map = new Map();
                    extra_pkg_map = new Map();

                    for(let i=0; i<pkg_list.length; i++){
                        let pkg = pkg_list[i];
                        pkg_map.set(pkg.name, pkg);
                        // extra_cache.push(pkg);
                    }
                    isProcessing = false;
                }else{
                    if(traversePackages(data)){
                        //found previous package
                        console.log('found start point of last checking round , reset pkg_map & stop processing');
                        page = -1;
                        eventHandler.emit('checkPage', page);
                    }else{
                        //target package not found, check next page
                        page +=1;
                        console.log('target package not found, check next page-->' + page);
                        eventHandler.emit('checkPage', page);
                    }

                }

            }//end of processing block
        }
    });
}


/**
 *
 * traverse all packages to find the last refreshed package
 *
 */
function traversePackages(pkg_json){
    if(typeof(pkg_json.packages) !== 'undefined' && pkg_json.packages.length > 0) {
        //find new index of the previous first package
        let keepSearching = true;
        let count = 0;
        let timeCompareCount = 0;//this variable to used for counting the packages that are added into
        while(keepSearching) {
            console.log('timeCompareCount-->' + timeCompareCount);
            let pkg = pkg_json.packages[count];
            console.log('current package is ' + pkg.name + ' latest version is ' + pkg.latest.version);
            let res = checkPackageUpdateState(pkg, timeCompareCount);
            timeCompareCount = res.timeCompareCount;

            let pkgName = pkg.name;
            if(res.needUpdate){
                console.log(currentTimestamp() + 'needUpdate is true, push package ' + pkgName + ' to refresh_list');
                // refreshTargetPackage(pkg, true);
                if(!refresh_dir_list.includes(pkgName)){
                    refresh_dir_list.push(pkgName);
                }else{
                    console.log(currentTimestamp() + 'found package  ' + pkgName + ' in refresh_dir_list, this package might be ignored');
                }
                if(!refresh_list.includes(pkgName)){
                    refresh_list.push(pkgName);
                }else{
                    console.log(currentTimestamp() + 'found package  ' + pkgName + ' in refresh_list, this package might be ignored');
                }

            }else{
                if(res.timeCompareCount < 16 && res.code == 3){
                    console.log(currentTimestamp() + 'meet the condition -- res.timeCompareCount < 5 && res.code == 3, push package ' + pkgName + ' to refresh_list');
                    extra_cache.push(pkg);
                    // if(!refresh_dir_list.includes(pkgName)){
                    //     refresh_dir_list.push(pkgName);
                    // }
                    // if(!refresh_list.includes(pkgName)){
                    //     refresh_list.push(pkgName);
                    // }
                }else{
                    keepSearching = false;
                    return true;
                }
            }
            // if(checkPKGMap(pkg)){
            //     //no need to refresh package
            //         keepSearching = false;
            //         return true;
            // }else{
            //     refreshTargetPackage(pkg);
            // }

            count++;
            if(count == pkg_json.packages.length){
                //target package not found in current list
                console.log('target package not found in current list');
                // lastCheckMSG = currentTimestamp() + 'target package not found in current list, count -->' + count + ' target package is ' + target;
                return false;
            }
        }//end of loop
    }else{
        return true;
    }
}

function composeFileRefreshUrl(target){
    let res = 'https://'+ cdn_base_address + '/api/packages/' + target;

    res += '\n' + 'https://'+ cdn_base_address + '/api/documentation/' + target;
    res += '\n' + cdn_browser_resource_address + target;
    res += '\n' + cdn_browser_resource_address + target + '/';
    res += '\n' + cdn_browser_resource_address + target + '/versions';

    return res;
}
/**
 * refresh target package in aliyun CDN
 */
function refreshTargetPackage(pkg, refreshDir){
    let pkg_url = 'https://'+ cdn_base_address + '/api/packages/';
    let package_url = {};
    package_url.url = pkg_url + pkg.name + '/';//replacePackage_url(pkg, cdn_base_address);
    package_url.type = TYPE_FILE;
    refresh_cache.push(package_url);

    let package_file = {};
    package_file.url = pkg_url + pkg.name;//pkg.latest.package_url.replace('pub.dartlang.org', cdn_base_address);
    package_file.type = TYPE_FILE;
    refresh_cache.push(package_file);

    let doc_url = 'https://'+ cdn_base_address + '/api/documentation/'
    let document_url = {};
    document_url.url = doc_url + pkg.name;//getDocument_url(pkg, cdn_base_address);
    document_url.type = TYPE_FILE;
    refresh_cache.push(document_url);

    //check publisher resource
    let options= {
        url: flutter_base_url + pkg.name + '/publisher',
        gzip: true,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };
    request.get(options, (err, response, body) => {
        try {
            let j = JSON.parse(body);
            if (j.publisherId != null) {
                let publisher_url = {};
                publisher_url.url = cdn_publisher_resource_address + j.publisherId + '/packages';
                publisher_url.type = TYPE_FILE;
                // refresh_cache.push(publisher_url);
            }
        } catch (e) {
            console.error(currentTimestamp() + 'failed to parse JSON, response-->' + res);
        }
    });

    //add browser resources
    let browser_package = {};
    browser_package.url = cdn_browser_resource_address + pkg.name;
    browser_package.type = TYPE_FILE;
    // refresh_cache.push(browser_package);
    refresh_cache_chuangcache_file.push(browser_package);

    let browser_package2 = {};
    browser_package2.url = cdn_browser_resource_address + pkg.name + '/';
    browser_package2.type = TYPE_FILE;
    // refresh_cache.push(browser_package2);
    refresh_cache_chuangcache_file.push(browser_package2);

    let browser_package_versions = {};
    browser_package_versions.url = cdn_browser_resource_address + pkg.name + '/versions';
    browser_package_versions.type = TYPE_FILE;
    // refresh_cache.push(browser_package_versions);
    refresh_cache_chuangcache_file.push(browser_package_versions);

    if (refresh_directory && refreshDir) {
        let browser_document = {};
        browser_document.url = cdn_browser_document_address + pkg.name + '/latest/';
        browser_document.type = TYPE_DIRECTORY;
        // refresh_cache.push(browser_document);
        refresh_cache_chuangcache_dir.push(browser_document);
    }
}


/**
 * check the difference between the information of pkg1 and pkg2
 * @param pkg1
 * @param pkg2
 * @returns {1001:the target packages are different; 1002:the target packages are the same but the version is different; 1000:They are the same package}
 */
function diff_package(pkg1, pkg2){
    if(pkg1.name != pkg2.name){
        //different package
        return 1001;
    }else if(pkg1.latest.version != pkg2.latest.version){
        //same package, but a newer version has been published
        return 1002;
    }
    //same package
    return 1003;
}

function checkPKGMap(pkg){
    let res = pkg_map.has(pkg.name);
    if(res){
        let p = pkg_map.get(pkg.name);
        if(p.latest.version != pkg.latest.version){
            console.log('found same package in pkg_map, but version is different');
            return false;
        }else{
            console.log(currentTimestamp() + ' found package ' + pkg.name + ' in pkg_map, info-->' + show_package_info(pkg));

            return true;
        }

    }else{
        console.log(currentTimestamp() + ' unable to find target pakcage -->' + show_package_info(pkg) + ' refresh it');
        return false;
    }

}

function checkPackageUpdateState(_pkg, tcCount){

    let pkg = _pkg;
    if(debug){
        try{
            console.log(currentTimestamp() + 'debug potential crash\ncurrent pkg info-->' + show_package_info(pkg));
        }catch(e){
            console.log(currentTimestamp()
                + 'encountered error while checking package info in function-->checkPackageUpdateState' );
        }

    }
    let res = {};
    res.needUpdate = false;
    res.code = -1;//1:newly updated package;2:same package, but a newer version is released;3:need to check update time
    res.timeCompareCount = 0;
    let hasPkg = pkg_map.has(pkg.name);
    if(hasPkg){
        let p = pkg_map.get(pkg.name);
        if(p.latest.version != pkg.latest.version){
            res.needUpdate = true;
            res.code = 2;
            if(extra_pkg_map.has(pkg.name)){
                console.log(currentTimestamp() + '[checkPackageUpdateState] found ' + pkg.name + ' in extra_pkg_map, reset the update time');
                //check if this package has its update time cached in extra_pkg_map
                let pkg_item = extra_pkg_map.get(pkg.name);
                pkg_item.last_updated_time = Date.now();
                extra_pkg_map.set(pkg.name, pkg_item);

            }
            return res;
        }else{
            console.log(currentTimestamp() + ' found package ' + pkg.name + ' in pkg_map, info-->' + show_package_info(pkg));
            res.needUpdate = false;
            res.code = 3;
            res.timeCompareCount = tcCount + 1;
            return res;
        }
    }else{
        res.needUpdate = true;
        res.code = 1;
        return res;
    }
}


function needRefresh(pkg1, pkg2, useFirstPackage){
    if(useFirstPackage){
        if(pkg1.name != pkg2.name || pkg1.latest.version != pkg2.latest.version){
            //different packages
            console.log('different packages or same package with different version, current-->' + pkg1.name + '   target-->' + pkg2.name );
            return true;
        }else{
            return false;
        }

    }else{
        console.log('unable to use first package to check last updated record, use pkg_map instead');
        return true;
    }



}

function replacePackage_url(pkg, replacer){
    let replaced_url = pkg.latest.package_url.replace('pub.dartlang.org', replacer);
    let index = replaced_url.lastIndexOf('/');
    if(index != (replaced_url.length - 1)){
        //append forward slash for meeting requirement of aliyuncli command
        replaced_url += '/';
    }

    console.log('replaced_url is ' + replaced_url);
    return replaced_url;
}

//function replaceVersions_url(pkg, replacer){
//    let replaced_url = pkg.latest.archive_url.replace('pub.dartlang.org', replacer);
//    let index = replaced_url.lastIndexOf('/');
//    if(index != (replaced_url.length - 1)){
//        //append forward slash for meeting requirement of aliyuncli command
//        replaced_url += '/versions';
//    }
//
//    console.log('replaced_url is ' + replaced_url);
//    return replaced_url;
//}

function replaceArchive_url(pkg, replacer){
    let replaced_url = pkg.latest.archive_url.replace('pub.dartlang.org', replacer);

    console.log('replaced_url is ' + replaced_url);
    return replaced_url;
}

function getDocument_url(pkg, replacer){
        let package_url = pkg.latest.package_url.replace('pub.dartlang.org', replacer);
        let document_url = package_url.replace(/packages/, 'documentation');

        return document_url;
}


function get_archive_name(pkg){
    let sub_str = pkg.latest.archive_url.split('/');
    if(typeof(sub_str) != 'undefined' && sub_str.length >=7){
        return sub_str[6];
    }else{
        return null;
    }
}

function show_package_info(pkg){
    let info  = 'package name: ' + pkg.name + '\n';
    info += 'author: ' + pkg.latest.pubspec.author + '\n';
    info += 'latest version: ' + pkg.latest.version + '\n';
    info += 'archive_url: ' + pkg.latest.archive_url + '\n';
    info += 'package_url: ' + pkg.latest.package_url + '\n';
    info += 'url: ' + pkg.latest.url + '\n';

    return info;
}


/**
 * @Deprecated
 *
 * @param url: the target resource url
 * @param type: the target type, File or Directory
 */
function refresh_ali_cdn_of_target(url, type){

    if(debug){
        console.log('refreshing cdn url -->' + url + ' type -->' + type);
    }
    let cmd = spawn(aliyuncli_cmd, ['cdn', 'RefreshObjectCaches', '--ObjectPath', url, '--ObjectType', type, '--secure']);

    cmd.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        try{
            cdn_refresh_info = JSON.parse(data);
            if(typeof(cdn_refresh_info.RefreshTaskId) != 'undefined'){
                console.log('RefreshTaskId=' + cdn_refresh_info.RefreshTaskId);
            }

            if(typeof(cdn_refresh_info.RequestId) != 'undefined'){
                console.log('RequestId=' + cdn_refresh_info.RequestId);
            }

            if(typeof(cdn_refresh_info.Code) != 'undefined'){
                console.log('Aliyun CDN response:\n' + cdn_refresh_info.Code +'\nMessage: ' + cdn_refresh_info.Message);
            }

        }catch(e){
            console.log('[refresh_ali_cdn_of_target] encountered error while parsing response data, exception:' + e.message);
            if(debug){
                console.log('unable to refresh cdn, push url back to refresh cache, url -->' + url);
            }
            if(type != TYPE_DIRECTORY){
                let refresh_obj = {};
                refresh_obj.url = url;
                refresh_obj.type = type;
                refresh_cache.push(refresh_obj);
            }

        }
    });

    cmd.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
    });

    cmd.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
}

function refresh_ali_cdn(){
    let cmd = spawn(aliyuncli_cmd, ['cdn', 'RefreshObjectCaches', '--ObjectPath', aliyun_cdn_url, '--ObjectType', 'Directory', '--secure']);

    cmd.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        try{
            cdn_refresh_info = JSON.parse(data);
            if(typeof(cdn_refresh_info.RefreshTaskId) != 'undefined'){
                console.log('RefreshTaskId=' + cdn_refresh_info.RefreshTaskId);
            }

            if(typeof(cdn_refresh_info.RequestId) != 'undefined'){
                console.log('RequestId=' + cdn_refresh_info.RequestId);
            }

            if(typeof(cdn_refresh_info.Code) != 'undefined'){
                console.log('Aliyun CDN response:\n' + cdn_refresh_info.Code +'\nMessage: ' + cdn_refresh_info.Message);
            }

        }catch(e){
            console.log('[refresh_ali_cdn] encountered error while parsing response data, exception:' + e.message);
        }

    });

    cmd.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
    });

    cmd.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
}

async function refresh_chuangcache_resource(refresh_type, cache){

    let url_arr = [];

    if(cache.length == 0 ){
        // console.log('no item found in chuang cache');
        return;
    }

    while(cache.length > 0){
        let item = cache.pop();
        let target = {
            url_name: item.url
        };
        url_arr.push(target);
    }

    let data =  {
        access_token: chuangcache_token,
        type: refresh_type,
        urls: url_arr
    };
    console.log('data->' + JSON.stringify(data));

    let options = {
        method: 'POST',
        uri: 'https://api.chuangcache.com/content/purge',
        body: JSON.stringify(data),
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
        },
        json: false
    }

    request(options, (error, response, body)=>{
        if(debug){
            console.log('response from server after cdn refreshing request, res -->' + JSON.stringify(body));
        }
    });

}

function initialize_chuang(){
    console.log('cleaning up workers');
    if(refresh_chuang_worker != null){
        clearInterval(refresh_chuang_worker);
    }
    if(refresh_chuang_worker_dir != null){
        clearInterval(refresh_chuang_worker_dir);
    }


    console.log('refreshing token...');
    if(!fs.existsSync(__dirname + '/auth.json')){
        console.error('unable to find auth.json');
        return null;
    }
    let data = fs.readFileSync(__dirname + '/auth.json');
    console.log('parsing auth.json for chuang_cache authentication');
    try{
        let j = JSON.parse(data);
        let auth = {
            ak: j.chuangcache.ak,
            sk: j.chuangcache.sk
        };
        let url = 'https://api.chuangcache.com/OAuth/authorize';
        let body = JSON.stringify(auth);
        let headers = {
            'Accept': 'application/json',
            'Content-Type' : 'application/json; charset=utf-8'
        };

        let current_ts = currentTimeInMilliseconds();

        if((current_ts - token_refresh_time) > token_expire_time){
            //access token has expired, request a new one
            console.log('access token has expired, request a new one');
            axios.post(url, body, headers).then((res) => {
                chuangcache_token = res.data.data.access_token;
                console.log('requested new token-->' + chuangcache_token);
                console.log('starting refresh_chuang_worker');
                refresh_chuang_worker = setInterval(refresh_chuangcache_resource, 600000, TYPE_FILE_CHUANG, refresh_cache_chuangcache_file);
                console.log('starting refresh_chuang_worker_dir')
                refresh_chuang_worker_dir = setInterval(refresh_chuangcache_resource, 600000, TYPE_DIRECTORY_CHUANG, refresh_cache_chuangcache_dir);

            });
        }
    }catch(e){
        console.error(e.message);

    }


}

function currentTimeInMilliseconds(){
    let timezone = new Date().getTimezoneOffset();//in minutes
    let timestamp = Date.now() - timezone * 60000;
    return timestamp;
}

//batch refresh
function refresh_target_directory_from_cache(){
    if(refresh_dir_list.length > 0){
        let url_collection = '';
        for(let i=0; i<refresh_dir_list.length; i++){
            let target = refresh_dir_list[i];
            let url = cdn_browser_document_address + target + '/latest/'
            url_collection += url + '\n';
        }
        console.log('length of refresh_dir_list -->' + refresh_dir_list.length);
        refresh_dir_list = [];
        console.log(currentTimestamp() + ' [refresh_target_directory_from_cache]');
        console.log('the url list-->' + url_collection);
        let cmd = spawn(aliyuncli_cmd, ['cdn', 'RefreshObjectCaches', '--ObjectPath', url_collection, '--ObjectType', TYPE_DIRECTORY, '--secure']);

        cmd.stdout.on('data', (data) => {

            console.log(currentTimestamp() +`stdout: ${data}`);
            try{
                cdn_refresh_info = JSON.parse(data);
                if(typeof(cdn_refresh_info.RefreshTaskId) != 'undefined'){
                    console.log(currentTimestamp() +'RefreshTaskId=' + cdn_refresh_info.RefreshTaskId);
                }

                if(typeof(cdn_refresh_info.RequestId) != 'undefined'){
                    console.log(currentTimestamp() +'RequestId=' + cdn_refresh_info.RequestId);
                }

                if(typeof(cdn_refresh_info.Code) != 'undefined'){
                    console.log(currentTimestamp() +'Aliyun CDN response:\n' + cdn_refresh_info.Code +'\nMessage: ' + cdn_refresh_info.Message);
                }

            }catch(e){
                console.log(currentTimestamp() +'[refresh_ali_cdn_of_target] encountered error while parsing response data, exception:' + e.message);
                // if(debug){
                //     console.log('unable to refresh cdn, url -->' + url);
                // }

            }
        });

        cmd.stderr.on('data', (data) => {
            console.log(currentTimestamp() +`stderr: ${data}`);
        });

        cmd.on('close', (code) => {
            console.log(currentTimestamp() +`child process exited with code ${code}`);
        });
    }


}

//batch refresh
function refresh_target_file_from_cache(){

    if(refresh_list.length > 0){
        console.log(currentTimestamp() + ' refresh_cache length is ' + refresh_list.length);
        let url_collection = '';
        for(let i=0; i<refresh_list.length; i++){
            let target = refresh_list[i];
            let urls = composeFileRefreshUrl(target);
            url_collection += urls + '\n';
        }
        console.log(currentTimestamp() + ' [refresh_target_file_from_cache]');
        console.log('the url list-->' + url_collection);
        console.log('length of refresh_list -->' + refresh_list.length);
        refresh_list = [];
        let cmd = spawn(aliyuncli_cmd, ['cdn', 'RefreshObjectCaches', '--ObjectPath', url_collection, '--ObjectType', TYPE_FILE, '--secure']);

        cmd.stdout.on('data', (data) => {
            console.log(currentTimestamp() + `stdout: ${data}`);
            try{
                cdn_refresh_info = JSON.parse(data);
                if(typeof(cdn_refresh_info.RefreshTaskId) != 'undefined'){
                    console.log(currentTimestamp() +'RefreshTaskId=' + cdn_refresh_info.RefreshTaskId);
                }

                if(typeof(cdn_refresh_info.RequestId) != 'undefined'){
                    console.log(currentTimestamp() +'RequestId=' + cdn_refresh_info.RequestId);
                }

                if(typeof(cdn_refresh_info.Code) != 'undefined'){
                    console.log(currentTimestamp() +'Aliyun CDN response:\n' + cdn_refresh_info.Code +'\nMessage: ' + cdn_refresh_info.Message);
                }

            }catch(e){
                console.log(currentTimestamp() +'[refresh_ali_cdn_of_target] encountered error while parsing response data, exception:' + e.message);
                if(debug){
                    console.log(currentTimestamp() +'unable to refresh cdn, url -->' + url);
                }

            }
        });

        cmd.stderr.on('data', (data) => {
            console.log(currentTimestamp() +`stderr: ${data}`);
        });

        cmd.on('close', (code) => {
            console.log(currentTimestamp() +`child process exited with code ${code}`);
        });

    }
}
//work process function
function refresh_target_from_cache(){
    if(refresh_cache.length > 0){
        console.log(currentTimestamp() + ' refresh_cache length is ' + refresh_cache.length);
        // console.log('[info] last check message -->' + lastCheckMSG);
        let target = refresh_cache.pop();
        refresh_ali_cdn_of_target(target.url, target.type);
    }
}

function refresh_package_by_update_time(){
    if(extra_cache.length > 0){
        let target = extra_cache.pop();
        let options= {
            url: flutter_base_url + target.name,
            gzip: true,
            headers: {
                'User-Agent' : 'pub.flutter-io.cn'
            }

        };
        request.get(options, (err, response, body) => {
            if(err){
                console.error(currentTimestamp() + ' encountered error while requesting package information from remote server, message:' + err.toString());

            }else{
                let json = JSON.parse(body);
                let name = json.name;
                if(extra_pkg_map.has(name)){
                    console.log(currentTimestamp() + '[extra check] found package ' + name + ' in extra_pkg_map, compare update time');
                    let versions = json.versions;
                    let len = versions.length;
                    //find last update version, the last version should be the latest update record
                    let v = versions[len - 1];
                    let update_time = Date.parse(v.published);
                    let pkg = extra_pkg_map.get(name);
                    let base_time = pkg.last_updated_time;
                    console.log('[extra check] update_time-->' + update_time + '\nbase_time-->' + base_time);
                    if(base_time != update_time){
                        pkg.last_updated_time = update_time;
                        extra_pkg_map.set(name, pkg);
                        refreshTargetPackage(pkg.package, false);
                    }
                }else{
                    console.log('[extra check] package ' + name + '  not found in extra_pkg_map, cache it');
                    let obj = {};
                    obj.package = json;
                    let versions = json.versions;
                    let len = versions.length;
                    let v = versions[len - 1];
                    let update_time = Date.parse(v.published);
                    obj.last_updated_time = update_time;
                    extra_pkg_map.set(name, obj);
                    // refreshTargetPackage(json, false);
                }

            }
        });
    }
}

function conservative_refresh(){
    let date = new Date().getDate();
    if(date == present_day){
        if(debug){
            console.log('present day -->' + date + ' still today');
        }
        let options= {
            url: flutter_source_url,
            gzip: true,
            headers: {
                'User-Agent' : 'pub.flutter-io.cn'
            }

        };
        request.get(options, (err, response, body) => {

            if(err){
                console.error(currentTimestamp() + 'encountered error while requesting package information from remote server, message:' + err.toString());

            }else{
                let data = JSON.parse(body);
                if(first_package == ''){
                    //initialize first package
                    if(debug)
                        console.log('initializing first_package in conservative strategy');
                    if(typeof(data.packages) !== 'undefined' && data.packages.length > 0){
                        first_package = data.packages[0];
                        console.log(show_package_info(first_package));
                        //refresh_ali_cdn();
                    }
                }else{
                    if(typeof(data.packages) !== 'undefined' && data.packages.length > 0){
                        //find new index of the previous first package
                        let index = 0;
                        let keepSearching = true;
                        let updatedPackageURL = [];
                        let pkg = data.packages[0];
                        let result = diff_package(pkg, first_package);
                        if(result != 1000){
                            if(debug)
                                console.log('different package, refresh aliyun cdn');

                            refresh_ali_cdn();

                            first_package = data.packages[0];

                            if(debug){
                                console.log('updated new first package is ' + show_package_info(first_package));
                            }
                        }else{
                            if(debug)
                                console.log('pacakge list not changed.');
                        }


                    }
                }
            }
        });

    }else if(date != present_day){
        if(debug){
            console.log('present day -->' + date + ' it is tomorrow now');
        }
        //new day is coming
        check_service_status((left_refresh_amount) => {
            if(debug){
                console.log('new day is coming, the refresh service request limitation is ' + left_refresh_amount);
            }
            if(left_refresh_amount > alert_threshold){
                //stop conservative strategy
                clearInterval(check_task_conservative);

                present_day = 0;

                //restart normal strategy
                // refresh_worker = setInterval(refresh_target_from_cache, 600000);//send refresh request at interval of 600 second

                // check_task = setInterval(check_first_package, refresh_interval);//check source site per 5 min aka 300 sec
            }else{
                if(debug){
                    console.log('refresh service is not recovered, keep using conservative strategy');
                }
            }
        })
    }
}

function check_service_status(callback){

    let cmd = spawn(aliyuncli_cmd, ['cdn', 'DescribeRefreshQuota', '--secure']);

    cmd.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        cdn_refresh_privilege_info = data;
        http_server.setServiceInfo(data);
            try{
                let j = JSON.parse(data);
                if(typeof(j.UrlRemain) !== 'undefined'){
                    cdn_refresh_service_remain = j.UrlRemain;
                    if(typeof(callback) !== 'undefined'){
                        callback(cdn_refresh_service_remain);
                    }
                }
                
                if(typeof(j.DirRemain) !== 'undefined'){
                    if(j.DirRemain <= 50){
                        console.log('[check_server_status] Alert! Dir Refresh Service is less than 50 for today. Omit dir refresh requests');
                        if(refresh_browser_dir_task == null){
                            console.log('[check_server_status] start refresh_browser_dir_task ');
                             refresh_directory = false;
                             refresh_browser_dir_task = setInterval(refresh_whole_browser_document_dir, 3600000);//refresh browser dir per hour

                        }
                    }else{
                        refresh_directory = true;
                        if(refresh_browser_dir_task != null){
                            console.log('[check_server_status] stop refresh_browser_dir_task ');
                            clearInterval(refresh_browser_dir_task);
                            refresh_browser_dir_task = null;
                        }
                    }
                }

            }catch(e){
                console.log('[check_server_status] encountered error while parsing response data, exception:' + e.message);
            }

    });

    cmd.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
    });

    cmd.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
}

function refresh_whole_browser_document_dir(){
    let browser_document = {};
    browser_document.url = cdn_browser_document_address;
    browser_document.type = TYPE_DIRECTORY;
    refresh_cache.push(browser_document);
}

let onHTTPEventListener = function(pkgName){
    console.log('[app.js] added new package refreshing request -->' + pkgName);
    let package_url = {};
    package_url.url = 'https://'+ cdn_base_address +'/api/packages/' + pkgName;
    package_url.type = TYPE_FILE;
    refresh_cache.push(package_url);

    let package_file = {};
    package_file.url = 'https://'+ cdn_base_address +'/api/packages/' + pkgName + '/';
    package_file.type = TYPE_FILE;
    //console.log('refreshing cdn package resource file:' + package_file);
    // refresh_ali_cdn_of_target(package_file, 'File');
    refresh_cache.push(package_file);


    let document_url = {};
    document_url.url = 'https://'+ cdn_base_address +'/api/documentation/' + pkgName;
    document_url.type = TYPE_FILE;
    refresh_cache.push(document_url);

    //check publisher resource
    let options= {
        url: flutter_base_url + pkgName + '/publisher',
        gzip: true,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };
    request.get(options, (err, response, body) => {
        try{
            let j = JSON.parse(body);
            if(j.publisherId != null){
                let publisher_url = {};
                publisher_url.url = cdn_publisher_resource_address + j.publisherId + '/packages';
                publisher_url.type = TYPE_FILE;
                refresh_cache.push(publisher_url);
            }
        }catch(e){
            console.error(currentTimestamp() + 'failed to parse JSON, response-->' + res);
        }
    });

    //add browser resources
    let browser_package = {};
    browser_package.url = cdn_browser_resource_address + pkgName;
    browser_package.type = TYPE_FILE;
    refresh_cache.push(browser_package);
    let browser_package2 = {};
    browser_package2.url = cdn_browser_resource_address + pkgName + '/';
    browser_package2.type = TYPE_FILE;
    refresh_cache.push(browser_package2);
    let browser_package_versions = {};
    browser_package_versions.url = cdn_browser_resource_address + pkgName + '/versions';
    browser_package_versions.type = TYPE_FILE;
    refresh_cache.push(browser_package_versions);
    if(refresh_directory){
        let browser_document = {};
        browser_document.url = cdn_browser_document_address + pkgName + '/latest/';
        browser_document.type = TYPE_DIRECTORY;
        refresh_cache.push(browser_document);
    }
};

function currentTimestamp(){
    let ts = Date.now();

    let date_ob = new Date(ts);
    let date = date_ob.getDate();
    let month = date_ob.getMonth() + 1;
    let year = date_ob.getFullYear();

    let hour = date_ob.getHours();
    let minute = date_ob.getMinutes();
    let second = date_ob.getSeconds();

    return '[' + year + "-" + month + "-" + date + '_' + hour + ':' + minute +':' + second + ']';
}

/**
 *
 *
 *
 * end of local functions
 *
 *
 *
 */

//start processing
//intialize first package information
// check_first_package();
//start refresh worker
refresh_worker = setInterval(refresh_target_from_cache, 100);//send 10 refresh requests per second
//start interval task
check_task = setInterval(cdnRefreshChecker, refresh_interval);//check source site per refresh_interval
// check_task = setInterval(check_first_package, refresh_interval);//check source site per 5 min aka 300 sec
//start aliyun service checker
// flutter_checker.startCheckTask();
initialize_chuang();
refresh_chuang_token = setInterval(initialize_chuang, 86000000);
//start extra refresh worker
extra_refresh_worker = setInterval(refresh_package_by_update_time, 1000);

//check aliyun cdn refresh service status
check_service_status();
//manually add new refresh requests
http_server.startHTTPServer(onHTTPEventListener);


//for testing purpose
//check package info and order from dartlang.org
function checkPackageInfo(){
    let url = flutter_source_url_arg_page + '1';
    let options= {
        url: url,
        gzip: true,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };
    request.get(options, (err, response, body) => {
        //response from remote http server
        if (err) {
            console.error(currentTimestamp() + '[debug] encountered error while requesting package information from remote server, message:' + err.toString());
        } else {
            try{
                let data = JSON.parse(body);
                if(typeof(data.packages) !== 'undefined' && data.packages.length > 0){
                    for(let i=0; i<data.packages.length; i++){
                        let index = i+1;
                        let pkg = data.packages[i];
                        console.log('[debug] ' + index + '. name-->' + pkg.name + '  version-->' + pkg.latest.version);
                    }
                }
            }catch(e){
                console.error(currentTimestamp() + '[debug] encountered error while parsing json data -->' + e.message);
            }

        }
    });
}

// let debug_worker = setInterval(checkPackageInfo, 300000);





