const request = require('request-promise');
const fs = require('fs');

const flutter_source_url = 'https://pub.dartlang.org/api/packages?page=1';

const chuangcache_cdn_url = 'https://pub.flutter-io.cn/api/packages/';

const cdn_base_address = 'pub.flutter-io.cn';
const cdn_browser_resource_address = 'https://pub.flutter-io.cn/packages/';
const cdn_browser_document_address = 'https://pub.flutter-io.cn/documentation/';

const TYPE_FILE = 'file';
const TYPE_DIRECTORY = 'dir';

let first_package = '';
let cdn_refresh_info = '';

let refresh_interval = 30000;//300000;

let token_refresh_time = 0;
let token_expire_time = 0;
let access_token = '';

let check_task;

let refresh_worker;
let refresh_cache = [];

let debug = true;


async function check_first_package(){

    if(access_token == ''){
        access_token = await request_token();
        if(access_token == null){
            console.log('failed to retrieve access token ,try again later');
            return;
        }
    }


    let options= {
        url: flutter_source_url,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }

    };
    request.get(options, (err, response, body) => {

        if(err){
            console.error('encountered error while requesting package information from remote server, message:' + err.toString());

        }else{
            let data = JSON.parse(body);
            if(first_package == ''){
                //initialize first package
                console.log('initializing first_package, refreshing cdn after service being restarted');
                if(typeof(data.packages) !== 'undefined' && data.packages.length > 0){
                    first_package = data.packages[0];
                    console.log(show_package_info(first_package));

                    // let target = {
                    //     arr: [chuangcache_cdn_url],
                    //     type: TYPE_FILE
                    // };
                    //refresh_chuangcache_cdn_of_target(target.arr, target.type, null);
                }
            }else{
                if(typeof(data.packages) !== 'undefined' && data.packages.length > 0){
                    //find new index of the previous first package
                    let index = 0;
                    let keepSearching = true;
                    let updatedPackageURL = [];
                    let pkg = first_package;
                    for(let i=0; (keepSearching && i<data.packages.length); i++){
                        pkg = data.packages[i];
                        console.log('current package is ' + pkg.name + ' latest version is ' + pkg.latest.version);
                        console.log('previous first package is ' + first_package.name + ' latest version is ' + first_package.latest.version);
                        let result = diff_package(pkg, first_package);
                        switch(result){
                            case 1000:
                                console.log('found same package, checking cdn refreshing targets finished.');
                                index = i;
                                keepSearching = false;
                                i = data.packages.length;
                                break;
                            case 1001:{
                                // let archive_url = replaceArchive_url(pkg, cdn_base_address);
                                // console.log('different package, refreshing cdn archive resource:' + archive_url);
                                // refresh_ali_cdn_of_target(archive_url, 'File');
                                console.log('different package');
                                let url_arr = [];
                                let package_url = replacePackage_url(pkg, cdn_base_address);
                                url_arr.push(package_url);

                                let versions_url = replaceVersions_url(pkg, cdn_base_address);
                                url_arr.push(versions_url);

                                let package_file = pkg.latest.package_url.replace('pub.dartlang.org', cdn_base_address);
                                url_arr.push(package_file);

                                let document_url = getDocument_url(pkg, cdn_base_address);
                                url_arr.push(document_url);

                                //add browser resources
                                let browser_package = cdn_browser_resource_address + pkg.name;
                                url_arr.push(browser_package);
                                let browser_package2 = cdn_browser_resource_address + pkg.name + '/';
                                url_arr.push(browser_package2);
                                let browser_package_versions = cdn_browser_resource_address + pkg.name + '/versions';
                                url_arr.push(browser_package_versions);
                                let target = {
                                    arr: url_arr,
                                    type: TYPE_FILE
                                };
                                refresh_cache.push(target);

                                let browser_document = cdn_browser_document_address + pkg.name + '/latest/';
                                let target_dir = {
                                    arr: [browser_document],
                                    type: TYPE_DIRECTORY
                                };

                                // refresh_cache.push(target_dir);


                                if(debug){
                                    console.log('refreshing cdn urls:\n'
                                        + package_url.url + '\n'
                                        + versions_url.url + '\n'
                                        + package_file.url + '\n'
                                        + document_url.url + '\n'
                                        + browser_package.url + '\n'
                                        + browser_package2.url + '\n'
                                        + browser_package_versions.url + '\n'
                                        + browser_document.url + '\n');
                                }
                            }

                            break;
                            case 1002:

                                let url_arr = [];
                                let package_url = replacePackage_url(pkg, cdn_base_address);
                                url_arr.push(package_url);

                                let versions_url = replaceVersions_url(pkg, cdn_base_address);
                                url_arr.push(versions_url);

                                let package_file = pkg.latest.package_url.replace('pub.dartlang.org', cdn_base_address);
                                url_arr.push(package_file);

                                let document_url = getDocument_url(pkg, cdn_base_address);
                                url_arr.push(document_url);

                                //add browser resources
                                let browser_package = cdn_browser_resource_address + pkg.name;
                                url_arr.push(browser_package);
                                let browser_package2 = cdn_browser_resource_address + pkg.name + '/';
                                url_arr.push(browser_package2);
                                let browser_package_versions = cdn_browser_resource_address + pkg.name + '/versions';
                                url_arr.push(browser_package_versions);
                                let target = {
                                    arr: url_arr,
                                    type: TYPE_FILE
                                };
                                refresh_cache.push(target);

                                let browser_document = cdn_browser_document_address + pkg.name + '/latest/';
                                let target_dir = {
                                    arr: [browser_document],
                                    type: TYPE_DIRECTORY
                                };

                                // refresh_cache.push(target_dir);

                                if(debug){
                                    console.log('refreshing cdn urls:\n'
                                        + package_url + '\n'
                                        + versions_url + '\n'
                                        + package_file + '\n'
                                        + document_url + '\n'
                                        + browser_package + '\n'
                                        + browser_package2 + '\n'
                                        + browser_package_versions + '\n'
                                        + browser_document + '\n');
                                }

                                console.log('checking cdn refreshing targets finished.');
                                index = i;
                                keepSearching = false;
                                i = data.packages.length;
                                break;
                        }

                    }
                    first_package = data.packages[0];
                    console.log('the index of previous first_package is ' + index);
                    if(debug){
                        console.log('updated new first package is ' + show_package_info(first_package));
                    }

                }
            }
        }




    });

}

/**
 * check the difference between the information of pkg1 and pkg2
 * @param pkg1
 * @param pkg2
 * @returns {1001:the target packages are different; 1002:the target packages are the same but the version is different; 1000:They are the same package}
 */
function diff_package(pkg1, pkg2){
    if(pkg1.name != pkg2.name){
        //packages have been updated
        return 1001;
    }else if(pkg1.latest.version != pkg2.latest.version){
        //same package, but a newer version has been published
        return 1002;
    }

    return 1000;
}

function replacePackage_url(pkg, replacer){
    let replaced_url = pkg.latest.package_url.replace('pub.dartlang.org', replacer);
    let index = replaced_url.lastIndexOf('/');
    if(index != (replaced_url.length - 1)){

        replaced_url += '/';
    }

    console.log('replaced_url is ' + replaced_url);
    return replaced_url;
}

function replaceVersions_url(pkg, replacer){
    let replaced_url = pkg.latest.package_url.replace('pub.dartlang.org', replacer);
    let index = replaced_url.lastIndexOf('/');
    if(index != (replaced_url.length - 1)){
        replaced_url += '/versions';
    }

    console.log('replaced_url is ' + replaced_url);
    return replaced_url;
}

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
 *
 * @param url: the target resource url
 * @param type: the target type, File or Directory
 */
async function refresh_chuangcache_cdn_of_target(urls, type, callback){

    let current_ts = currentTimeInMilliseconds();

    if((current_ts - token_refresh_time) > token_expire_time){
        //access token has expired, request a new one
        access_token = await request_token();
        if(access_token == null){
            console.log('failed to retrieve access token ,try again later');
            return;
        }
    }

    let url_arr = [];
    for(let u of urls){
        let url = {
            url_name: u
        };
        url_arr.push(url);
    }
    let data =  {
        access_token: access_token,
        api_type: '0',
        type: type,
        urls: url_arr
    };
    console.log('data->' + JSON.stringify(data));

    let options = {
        method: 'POST',
        uri: 'https://api.chuangcache.com/content/purge',
        body: JSON.stringify(data),
        headers: {
            'content-type': 'application/json'
        },
        json: false
    }

    request(options)
        .then((res) => {
            if(debug){
                console.log('response from server after cdn refreshing request, res -->' + JSON.stringify(res));
            }
            if(res.status != 1){
                if(typeof(callback) != 'undefined' && callback != null){
                    // callback(urls, type);
                }
            }
        }).catch((err) => {
        // POST failed...
        console.error('failed to refresh resources, error:' + err.message);

        if(typeof(callback) != 'undefined' && callback != null){
            // callback(urls, type);
        }
    });



}

function refresh_chuangcache_cdn(){
    let cmd = spawn(aliyuncli_cmd, ['cdn', 'RefreshObjectCaches', '--ObjectPath', aliyun_cdn_url, '--ObjectType', 'File']);

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
            console.log('encountered error while parsing response data, exception:' + e.message);
        }

    });

    cmd.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
    });

    cmd.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
}

function refresh_target_from_cache(){

    if(refresh_cache.length > 0){
        let target = refresh_cache.pop();
        refresh_chuangcache_cdn_of_target(target.arr, target.type, (urls, type) => {
            //failed to refresh cdn cache
            let target = {
                arr: urls,
                type: type
            };
            refresh_cache.push(target);
        });
    }

}

async function request_token(){
    if(!fs.existsSync(__dirname + '/auth.json')){
        console.error('unable to find auth.json');
        return null;
    }

    let data = fs.readFileSync(__dirname + '/auth.json');
    try{
        let j = JSON.parse(data);
        let auth = {
            appid: j.chuangcache.appid,
            appsecret: j.chuangcache.appsecret,
            grant_type: j.chuangcache.grant_type
        };
        let options = {
            method: 'POST',
            uri: 'https://api.chuangcache.com/OAuth/authorize',
            body: JSON.stringify(auth),
            headers: {
                'content-type': 'application/json'
            },
            json: false
        }

        let res = await request.post(options);
        let res_json = JSON.parse(res);
        if(res_json.status == 1){
            let access_token = res_json.data.access_token;
            token_refresh_time = currentTimeInMilliseconds();
            token_expire_time = res_json.data.expires_in;
            console.log('retrieved new access token from remote server, token -->' + access_token);
            return access_token;
        }

    }catch(e){
        console.error(e.message);
        return null;
    }


}

function currentTimeInMilliseconds(){
    let timezone = new Date().getTimezoneOffset();//in minutes
    let timestamp = Date.now() - timezone * 60000;
    return timestamp;
}

check_first_package();

refresh_worker = setInterval(refresh_target_from_cache, 90000);//send refresh request at interval of 1 second

check_task = setInterval(check_first_package, refresh_interval);//check source site per 5 min aka 300 sec
