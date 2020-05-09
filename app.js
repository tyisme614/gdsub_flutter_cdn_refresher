const request = require('request');
const { spawn } = require('child_process');
const flutter_checker = require('./flutter_checker');

const flutter_base_url = 'https://pub.dartlang.org/api/packages/';
const flutter_source_url = 'https://pub.dartlang.org/api/packages?page=1';//[deprecated]'https://pub.dev/api/packages?page=1';
const aliyuncli_cmd = '/usr/local/bin/aliyuncli';
// const aliyuncli_cmd = '/usr/local/bin/aliyuncli cdn RefreshObjectCaches ';
const aliyun_cdn_url = 'https://pub.flutter-io.cn/api/packages/';
const aliyun_cdn_base_url = 'https://pub.flutter-io.cn/packages/';
const cdn_base_address = 'pub.flutter-io.cn';
const cdn_browser_resource_address = 'https://pub.flutter-io.cn/packages/';
const cdn_browser_document_address = 'https://pub.flutter-io.cn/documentation/';
const cdn_publisher_resource_address = 'https://pub.flutter-io.cn/publishers/';
// const aliyun_cdn_url = 'https://material-io.cn/';

const TYPE_FILE = 'File';
const TYPE_DIRECTORY = 'Directory';

let first_package = '';
let cdn_refresh_info = '';
let cdn_refresh_service_remain = 0;
let present_day = 0;
let refresh_interval = 300000;
let alert_threshold = 400;

let check_task;
let check_task_conservative;
let refresh_worker;
let refresh_cache = [];
let refresh_directory = true;

let refresh_browser_dir_task;

let debug = true;


function check_first_package(){

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
            if(debug){
                console.log('stop refresh worker');
                clearInterval(refresh_worker);
            }
            

            first_package = '';

            //get the start date of conservative refresh
            present_day = new Date().getDate();
            //start conservative strategy
            check_task_conservative = setInterval(conservative_refresh(), refresh_interval);
        }
    });

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
                    refresh_ali_cdn();
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
                                let package_url = {};
                                package_url.url = replacePackage_url(pkg, cdn_base_address);
                                package_url.type = TYPE_FILE;
                                //console.log('refreshing cdn package resource folder:' + package_url);
                                //refresh_ali_cdn_of_target(package_url, 'File');
                                refresh_cache.push(package_url);

//                                let versions_url = {};
//                                versions_url.url = replaceArchive_url(pkg, cdn_base_address);
//                                versions_url.type = TYPE_FILE;
//                                refresh_cache.push(versions_url);

                                let package_file = {};
                                package_file.url = pkg.latest.package_url.replace('pub.dartlang.org', cdn_base_address);
                                package_file.type = TYPE_FILE;
                                //console.log('refreshing cdn package resource file:' + package_file);
                                // refresh_ali_cdn_of_target(package_file, 'File');
                                refresh_cache.push(package_file);


                                let document_url = {};
                                document_url.url = getDocument_url(pkg, cdn_base_address);
                                document_url.type = TYPE_FILE;
                                //console.log('different package, refreshing cdn documentation resource:' + document_url);
                                // refresh_ali_cdn_of_target(document_url, 'File');
                                refresh_cache.push(document_url);

                                //check publisher resource
                                request.get(flutter_base_url + pkg.name + '/publisher', (err, response, body) => {
                                        try{
                                                let j = JSON.parse(body);
                                                if(j.publisherId != null){
                                                    let publisher_url = {};
                                                    publisher_url.url = cdn_publisher_resource_address + j.publisherId + '/packages';
                                                    publisher_url.type = TYPE_FILE;
                                                    refresh_cache.push(publisher_url);
                                                }
                                            }catch(e){
                                                console.error('failed to parse JSON, response-->' + res);
                                            }
                                        });

                                //add browser resources
                                let browser_package = {};
                                browser_package.url = cdn_browser_resource_address + pkg.name;
                                browser_package.type = TYPE_FILE;
                                refresh_cache.push(browser_package);
                                let browser_package2 = {};
                                browser_package2.url = cdn_browser_resource_address + pkg.name + '/';
                                browser_package2.type = TYPE_FILE;
                                refresh_cache.push(browser_package2);
                                let browser_package_versions = {};
                                browser_package_versions.url = cdn_browser_resource_address + pkg.name + '/versions';
                                browser_package_versions.type = TYPE_FILE;
                                refresh_cache.push(browser_package_versions);
                                if(refresh_directory){
                                    let browser_document = {};
                                    browser_document.url = cdn_browser_document_address + pkg.name + '/latest/';
                                    browser_document.type = TYPE_DIRECTORY;
                                    refresh_cache.push(browser_document);    
                                }

                            }


                                break;
                            case 1002:

                                let package_url = {};
                                package_url.url = replacePackage_url(pkg, cdn_base_address);
                                package_url.type = TYPE_FILE;
                                //console.log('refreshing cdn package resource folder:' + package_url);
                                //refresh_ali_cdn_of_target(package_url, 'File');
                                refresh_cache.push(package_url);

//                                let versions_url = {};
//                                versions_url.url = replaceVersions_url(pkg, cdn_base_address);
//                                versions_url.type = TYPE_FILE;
//                                refresh_cache.push(versions_url);

                                let package_file = {};
                                package_file.url = pkg.latest.package_url.replace('pub.dartlang.org', cdn_base_address);
                                package_file.type = TYPE_FILE;
                                //console.log('refreshing cdn package resource file:' + package_file);
                                // refresh_ali_cdn_of_target(package_file, 'File');
                                refresh_cache.push(package_file);


                                let document_url = {};
                                document_url.url = getDocument_url(pkg, cdn_base_address);
                                document_url.type = TYPE_FILE;
                                //console.log('different package, refreshing cdn documentation resource:' + document_url);
                                // refresh_ali_cdn_of_target(document_url, 'File');
                                refresh_cache.push(document_url);

                                //check publisher resource
                                request.get(flutter_base_url + pkg.name + '/publisher', (err, response, body) => {
                                try{
                                        let j = JSON.parse(body);
                                        if(j.publisherId != null){
                                            let publisher_url = {};
                                            publisher_url.url = cdn_publisher_resource_address + j.publisherId + '/packages';
                                            publisher_url.type = TYPE_FILE;
                                            refresh_cache.push(publisher_url);
                                        }
                                    }catch(e){
                                        console.error('failed to parse JSON, response-->' + res);
                                    }
                                });
                                //add browser resources
                                let browser_package = {};
                                browser_package.url = cdn_browser_resource_address + pkg.name;
                                browser_package.type = TYPE_FILE;
                                refresh_cache.push(browser_package);
                                let browser_package2 = {};
                                browser_package2.url = cdn_browser_resource_address + pkg.name + '/';
                                browser_package2.type = TYPE_FILE;
                                refresh_cache.push(browser_package2);
                                let browser_package_versions = {};
                                browser_package_versions.url = cdn_browser_resource_address + pkg.name + '/versions';
                                browser_package_versions.type = TYPE_FILE;
                                refresh_cache.push(browser_package_versions);
                                if(refresh_directory){
                                    let browser_document = {};
                                    browser_document.url = cdn_browser_document_address + pkg.name + '/latest/';
                                    browser_document.type = TYPE_DIRECTORY;
                                    refresh_cache.push(browser_document);    
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
 *
 * @param url: the target resource url
 * @param type: the target type, File or Directory
 */
function refresh_ali_cdn_of_target(url, type){

    if(debug){
        console.log('refreshing cdn url -->' + url + ' type -->' + type);
    }
    let cmd = spawn(aliyuncli_cmd, ['cdn', 'RefreshObjectCaches', '--ObjectPath', url, '--ObjectType', type]);

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

function refresh_target_from_cache(){
    if(refresh_cache.length > 0){
        let target = refresh_cache.pop();

        refresh_ali_cdn_of_target(target.url, target.type);

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
                refresh_worker = setInterval(refresh_target_from_cache, 1000);//send refresh request at interval of 1 second

                check_task = setInterval(check_first_package, refresh_interval);//check source site per 5 min aka 300 sec
            }else{
                if(debug){
                    console.log('refresh service is not recovered, keep using conservative strategy');
                }
            }
        })
    }
}

function check_service_status(callback){

    let cmd = spawn(aliyuncli_cmd, ['cdn', 'DescribeRefreshQuota']);

    cmd.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);

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




check_first_package();

refresh_worker = setInterval(refresh_target_from_cache, 1000);//send refresh request at interval of 1 second

check_task = setInterval(check_first_package, refresh_interval);//check source site per 5 min aka 300 sec



flutter_checker.startCheckTask();


//manually add new refresh requests
module.exports.add_refresh_package =  function(pkgName){
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
    request.get(flutter_base_url + pkgName + '/publisher', (err, response, body) => {
        try{
            let j = JSON.parse(body);
            if(j.publisherId != null){
                let publisher_url = {};
                publisher_url.url = cdn_publisher_resource_address + j.publisherId + '/packages';
                publisher_url.type = TYPE_FILE;
                refresh_cache.push(publisher_url);
            }
        }catch(e){
            console.error('failed to parse JSON, response-->' + res);
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
}