const request = require('request');
const EventEmitter = require('events');
const nodemailer = require('nodemailer');
let transporter;
const fs = require('fs');

class CheckerEventHandler extends EventEmitter {}

const flutter_base_url = 'https://dartlang-pub.appspot.com/api/packages/';//https://pub.dartlang.org/api/packages/';
const aliyun_cdn_url = 'https://pub.flutter-io.cn/api/packages/';
const package_list_url = 'https://pub.dartlang.org/api/packages?compact=1';
const package_info_url_flutter = 'https://pub.dartlang.org/api/packages?page=';
const package_info_url_aliyun = 'https://pub.flutter-io.cn/api/packages?page=';
const report_sender = 'stevenstian@aol.com';
const report_receiver = 'yuan@gdsub.com, lu@gdsub.com, lucydevrel@gmail.com'

let index = 0;
let pkgList;
let aliyun_version = '';
let official_version = '';
let results = [];
let package_info_map_flutter = new Map();
let package_info_map_aliyun = new Map();
let package_version_map_flutter = new Map();
let package_version_map_aliyun = new Map();
let checked_package = new Map();

let res_version_inconsistent = [];
let res_pkg_not_found_flutter = [];
let res_pkg_not_found_aliyun = [];
let res_http_request_failed_flutter = [];
let res_http_request_failed_aliyun = [];
let res_parse_json_error_flutter = [];
let res_parse_json_error_aliyun = [];


let page_count = 0;
let package_count = 0;
let package_count2 = 0;
let page_total_aliyun = 200;
let page_total_flutter = 200;
let loaded_flutter = false;
let loaded_aliyun = false;
let loading = false;




/**
 *
 * event handler
 *
 *
 */
const eventHandler = new CheckerEventHandler();

eventHandler.on('retrieved_packages', (list)=>{
    pkgList = list;
    index = 0;
    let task_count = 0;
    console.log(' length=' + list.length);
    for(let i=0; i<list.length; i+=250){

        let pkg = list[i];
        checkPackageVersion(pkg, true);
    }

});

eventHandler.on('load_next_page', (page, official)=>{
    let map = package_info_map_aliyun;
    if(official){
        map = package_info_map_flutter;
    }
    if(map.has(page)){
        console.log('page ' + page + ' has been loaded, omit request...');
    }else{
        console.log('loading package page ' + page);
        loadPackageInfo(page, official);
    }

})

eventHandler.on('pkg_info_loaded', ()=>{
   console.log('loading package information completed');
});

eventHandler.on('aliyun_loaded', ()=>{
    if(!loaded_aliyun){
        console.log('loading aliyun package information completed');
        loaded_aliyun = true;
        console.log('starting comparing...');
        constructDataStructure();
    }

});

eventHandler.on('flutter_loaded', ()=>{
    console.log('loading official flutter package information completed');
    loaded_flutter = true;
    if(!loading){
        loading = true;
        for(let i=0; i<200; i+=20){
            loadPackageInfo(i, false);
        }
    }

});

eventHandler.on('check_aliyun', (pkg)=>{
    // console.log('checking aliyun cdn version of ' + pkg);
   checkPackageVersion(pkg, false);
});

eventHandler.on('compare_deprecated', (pkg)=>{
    console.log('comparing version of ' + pkg + ' offcial:' + official_version + ' aliyun:' + aliyun_version);
    if(aliyun_version != official_version){
        let res = 'inconsistent version, package: ' + pkg + ' offcial:' + official_version + ' aliyun:' + aliyun_version;
        results.push(res);
    }
    //start next round
    index++;
    if(index < pkgList.length){
        console.log('checking official version of ' + pkgList[index]);
        checkPackageVersion(pkgList[index], true);
    }else{
        console.log('process completed.');
        console.log('\n\nresults:\n');
        for(let i=0; i<results.length; i++){
            console.log(results[i]);
        }
    }

});

eventHandler.on('compare', (pkg)=>{
    let flutter_version = package_version_map_flutter.get(pkg);
    let aliyun_version = package_version_map_aliyun.get(pkg);
    // console.log('comparing version of ' + pkg + ' offcial:' + flutter_version + ' aliyun:' + aliyun_version);
    if(flutter_version.latest != aliyun_version.latest || flutter_version.v_list_count != aliyun_version.v_list_count){
        res_version_inconsistent.push(pkg);
        refreshCDN(pkg);
    }

    // console.log('package checked:' + package_count);
    checked_package.set(pkg, true);
    if(package_count >= pkgList.length){
        console.log('process finished. package_count=' + package_count);
        let content = generateReport();
        let title = 'flutter package check report -- '+ currentTimestamp();
        composeEmail(report_sender, report_receiver, title, content);

        cleanDataMembers();
    }else{
        let i = pkgList.indexOf(pkg);
        i++;
        if(i < pkgList.length){
            let next = pkgList[i];
            if(!checked_package.has(next)){
                // console.log('check next package:' + next + ' index=' + i);

                checkPackageVersion(next, true);
            }else{
                // console.log('package ' + next + ' has been checked, stop this worker');
                // generateReport();
            }

        }else{
            console.log('reached end of package list');
        }
    }
});

eventHandler.on('next_package', (pkg)=>{
    let i = pkgList.indexOf(pkg);
    i++;
    if(i < pkgList.length){
        let next = pkgList[i];
        if(!checked_package.has(next)){
            // console.log('check next package:' + next + ' index=' + i);
            checkPackageVersion(next, true);
        }else{
            // console.log('package ' + next + ' has been checked, stop this worker');
            // generateReport();
        }

    }else{
        console.log('reached end of package list.');
    }
});
eventHandler.on('constructed data structure', ()=>{
    comparePkgVersion();
});

eventHandler.on('comparing finished', ()=>{
    generateReport();
});

/**
 *
 *
 * local functions
 *
 *
 */
function initializeAuth(){
    let data = fs.readFileSync(__dirname + '/auth.json');
    let j = JSON.parse(data);
    //initialize mailer
    transporter = nodemailer.createTransport({
        service: 'aol',
        auth: {
            user: j.mailer.account,
            pass: j.mailer.pwd
        }
    });
}

function requestPackageList(){
    let options= {
        url: package_list_url,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };
    request.get(options, (err, response, body) => {
        if(err){
            console.error('http request error-->' + err.message);
            let title = '[Error] failed to retrieve flutter package list -- '+ currentTimestamp();
            let content = 'Check worker failed to get package list from official site after http request, the error message is the following:\n' + err.message;
            composeEmail('Yuan@gdsub.com', report_receiver, title, content);
        }else{
            let json_error = false;
            try{
                let data = JSON.parse(body);
                if(typeof data != 'undefined' && typeof data.packages != 'undefined'){
                    if(data.packages.length > 0){
                        let list = [];
                        for(let i=0; i<data.packages.length; i++){
                            list.push(data.packages[i]);
                        }
                        eventHandler.emit('retrieved_packages', list);
                        json_error = false;
                    }else{
                       json_error = true;
                    }

                }else{
                    json_error = true;
                }


            }catch(e){
                console.error('json parsing error-->' + e.message);
                json_error = true;
            }
            if(json_error){
                let title = '[Error] failed to retrieve flutter package list -- '+ currentTimestamp();
                let content = 'Check worker failed to get package list from official site after http request, the received json message is the following:\n' + data;
                composeEmail('Yuan@gdsub.com', report_receiver, title, content);
            }
        }
    });

}

function checkPackageVersion(pkg, official){

    let base_url = aliyun_cdn_url;
    if(official){
        package_count++;
        // console.log('request count:' + package_count2);
        base_url = flutter_base_url;
    }
    let options= {
        url: base_url + pkg,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };
    request.get(options, (err, response, body) => {
        if(err){
            console.error(currentTimestamp() + ' http request error-->' + err.message);
            if(official){
                // let res = 'failed to request version info of  package ' + pkg + ' from official site';
                res_http_request_failed_flutter.push(pkg + '\nhttp error:' + err.message);

            }else{
                res_http_request_failed_aliyun.push(pkg + '\nhttp error:' + err.message);
            }
            eventHandler.emit('next_package', pkg);
        }else{
            try{
                let data = JSON.parse(body);
                if(typeof data.error != 'undefined'){
                    if(data.code == 'NotFound'){
                        if(official){
                            // let res = 'package ' + pkg + ' not found in official site';
                            res_pkg_not_found_flutter.push(pkg);

                        }else{
                            // let res = 'package ' + pkg + ' not found in aliyun cdn';
                            res_pkg_not_found_aliyun.push(pkg);
                        }
                    }else{
                        if(official){
                            // let res = 'package ' + pkg + ' not found in official site';
                            // res_pkg_not_found_flutter.push(pkg);
                            res_parse_json_error_flutter.push('package:' + pkg +  ' original message:' + body.toString())
                        }else{
                            // let res = 'package ' + pkg + ' not found in aliyun cdn';
                            // res_pkg_not_found_aliyun.push(pkg);
                            res_parse_json_error_aliyun.push('package:' + pkg +  ' original message:' + body.toString())
                        }
                    }
                    eventHandler.emit('next_package', pkg);
                }else{
                    let version_info = {};
                    version_info.latest = data.latest.version;
                    version_info.v_list_count = data.versions.length;
                    let len = data.versions.length;
                    version_info.latest_version = data.versions[len - 1].version;
                    if(official){

                        // console.log('request count:' + package_count2);
                        // console.log('official latest version of ' + pkg + ' is ' + data.latest.version);
                        // official_version = data.latest.version;

                        // package_version_map_flutter.set(pkg, data.latest.version);
                        package_version_map_flutter.set(pkg, version_info);
                        eventHandler.emit('check_aliyun', pkg);
                    }else{
                        // console.log('aliyun latest version of ' + pkg + ' is ' + data.latest.version);
                        // aliyun_version = data.latest.version;
                        // package_version_map_aliyun.set(pkg, data.latest.version);
                        package_version_map_aliyun.set(pkg, version_info);
                        eventHandler.emit('compare', pkg);

                    }
                }

            }catch(e){
                console.error('json parsing error-->' + e.message + ' original message:' + body.toString());
                //{"error":{"code":"NotFound","message":"Could not find `package \"flutter_basirun_al_qoddam\"`."},"code":"NotFound","message":"Could not find `package \"flutter_basirun_al_qoddam\"`."}
                if(official){
                    // let res = 'package ' + pkg + ' not found in official site';
                    // res_pkg_not_found_flutter.push(pkg);
                    res_parse_json_error_flutter.push('package:' + pkg +  ' original message:' + body.toString())
                }else{
                    // let res = 'package ' + pkg + ' not found in aliyun cdn';
                    // res_pkg_not_found_aliyun.push(pkg);
                    res_parse_json_error_aliyun.push('package:' + pkg +  ' original message:' + body.toString())
                }
                eventHandler.emit('next_package', pkg);
            }
        }
    });
}

function loadPackageInfo(page, official){
    let base = package_info_url_aliyun;
    if(official){
        base = package_info_url_flutter;
    }
    page_count++;
    let options= {
        url: base + page,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };

    request.get(options, (err, response, body) => {
            try{
                console.log('loaded page ' + page + ' page_count=' + page_count);

                let json = JSON.parse(body);

                let next_url = json.next_url;
                if(typeof next_url != 'undefined'){
                    if(next_url == null){
                        console.log('found last page, page-->' + page);
                        eventHandler.emit('pkg_info_loaded');
                    }else{
                        if(official){
                            package_info_map_flutter.set(page, json);
                        }else{
                            package_info_map_aliyun.set(page, json);
                        }
                        console.log('package length-->' + json.packages.length);
                        eventHandler.emit('load_next_page', page + 1, official);
                    }
                    if(page_count == 194){
                        if(official){
                            page_count = 0;
                            eventHandler.emit('flutter_loaded');
                        }else{
                            eventHandler.emit('aliyun_loaded');
                        }
                    }
                }else{
                    console.error('no content error.');
                }

            }catch(e){
                console.error(e.message + '\noriginal data:\n' + body);
            }
    });

}

function constructDataStructure(){
    let it = package_info_map_flutter.values();
    console.log('start constructing data structure for official data');
    let obj = it.next();
    while(!obj.done){

        let rawJSON = obj.value;
        let packages = rawJSON.packages;
        // console.log(packages);
        // console.log(JSON.stringify(packages));
        for(let i=0; i<packages.length; i++){
            let pkg = packages[i];
            package_version_map_flutter.set(pkg.name, pkg.latest.version);
        }
        obj = it.next();

    }
    console.log('finished official data structure');
    console.log('start constructing data structure for aliyun data');
    let it2 = package_info_map_aliyun.values();
    let obj2 = it2.next();
    while(!obj2.done){
        let rawJSON = obj2.value;
        let packages = rawJSON.packages;
        for(let i=0; i<packages.length; i++){
            let pkg = packages[i];
            package_version_map_aliyun.set(pkg.name, pkg.latest.version);
        }
        obj2 = it2.next();
    }

    console.log('finished aliyun data structure');
    eventHandler.emit('constructed data structure');
}

function comparePkgVersion(){
    let it = package_version_map_flutter.keys();
    let key = it.next();
    while(!key.done){
        let pkg = key.value;
        if(!package_version_map_aliyun.has(pkg)){
            console.log('package not found in aliyun map, pkg-->' + pkg);
            res_pkg_not_found.push(pkg);
        }else{
            let version_flutter = package_version_map_flutter.get(pkg);
            let version_aliyun = package_version_map_aliyun.get(pkg);
            if(version_flutter != version_aliyun){
                console.log('version inconsistent, pkg-->' + pkg);
                res_version_inconsistent.push(pkg);
            }
        }
        key = it.next();
    }
    eventHandler.emit('comparing finished');
}



function composeEmail(sender, target, title, content){
    let mailOptions = {
        from: sender,
        to: target,
        subject: title,
        text: content
    };
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log(error);
        } else {
            console.log(currentTimestamp() + 'Email sent: ' + info.response);
        }
    });
}

function cleanDataMembers(){
    //clean up containers
    index = 0;
    pkgList = null;
    results = [];
    package_info_map_flutter = new Map();
    package_info_map_aliyun = new Map();
    package_version_map_flutter = new Map();
    package_version_map_aliyun = new Map();
    checked_package = new Map();

    res_version_inconsistent = [];
    res_pkg_not_found_flutter = [];
    res_pkg_not_found_aliyun = [];
    res_http_request_failed_flutter = [];
    res_http_request_failed_aliyun = [];
    res_parse_json_error_flutter = [];
    res_parse_json_error_aliyun = [];

    page_count = 0;
    package_count = 0;
    package_count2 = 0;
    page_total_aliyun = 200;
    page_total_flutter = 200;
    loaded_flutter = false;
    loaded_aliyun = false;
    loading = false;
}

function refreshCDN(pkg){

    let options= {
        url: 'http://127.0.0.1:17788/refreshCDN/' + pkg,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };

    request.get(options, (err, response, body) => {
        try{
            if(err){
                console.error(currentTimestamp() + ' encountered error while requesting to refresh CDN, err:' + err.message);
            }else{
                console.log(currentTimestamp() + 'refreshed ' + pkg + ' response:\n' + body);
            }
        }catch(e){
            console.error(e.message + '\noriginal data:\n' + body);
        }
    });
}

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



function generateReport(){
    let report = '';

    console.log('\n\n*************************************************************************');
    console.log('                            start of result report');
    console.log('***************************************************************************\n\n');

    if(res_version_inconsistent.length > 0){
        console.log('\n\n-- the version of following packages are inconsistent between official site and aliyun CDN --\n\n');
        report += '\n\n-- the version of following packages are inconsistent between official site and aliyun CDN --\n\n';
        for(let item of res_version_inconsistent){

            let version_info_flutter = package_version_map_flutter.get(item);
            let version_info_aliyun = package_version_map_aliyun.get(item);
            console.log('the version of package: ' + item + ' is inconsistent. \n[official site]\nlatest stable version:' + version_info_flutter.latest
                + ' latest published version:'+ version_info_flutter.latest_version
                + ' version list length:' +version_info_flutter.v_list_count
                +' \n[aliyun cdn]\nversion:' + version_info_aliyun.latest
                + ' latest published version:' + version_info_aliyun.latest_version
                + ' version list length:' + version_info_aliyun.v_list_count);
            report += 'the version of package: ' + item + ' is inconsistent. \n[official site]\nlatest stable version:' + version_info_flutter.latest
                + ' latest published version:'+ version_info_flutter.latest_version
                + ' version list length:' +version_info_flutter.v_list_count
                +' \n[aliyun cdn]\nversion:' + version_info_aliyun.latest
                + ' latest published version:' + version_info_aliyun.latest_version
                + ' version list length:' + version_info_aliyun.v_list_count + '\n';
        }
        console.log('\ntotal: ' + res_version_inconsistent.length + '\n');
        report += '\ntotal: ' + res_version_inconsistent.length + '\n';
    }else{
        console.log('\n\n-- version of all packages are consistent between official site and aliyun CDN. --\n');
        report += '\n\n-- version of all packages are consistent between official site and aliyun CDN. --\n';
    }

    if(res_pkg_not_found_flutter.length > 0){
        console.log('\n\n-- the following packages are not found in official path of  /api/packages/  --\n\n');
        report += '\n\n-- the following packages are not found in official path of  /api/packages/ --\n\n';
        for(let item of res_pkg_not_found_flutter){
            // console.log('package: ' + item + ' is not found in official package list');
            console.log(item);
            report += item + '\n';
        }
        console.log('\ntotal: ' + res_pkg_not_found_flutter.length + '\n');
        report += '\ntotal: ' + res_pkg_not_found_flutter.length + '\n'
    }else{
        console.log('\n\nall packages are found in official path of  /api/packages/ .\n');
        report += '\n\nall packages are found in officialpath of  /api/packages/ .\n';
    }

    if(res_pkg_not_found_aliyun.length > 0){
        console.log('\n\n-- the following packages are not found in aliyun path of  /api/packages/ but could be found in official site  --\n\n');
        report += '\n\n-- the following packages are not found in aliyun path of  /api/packages/  but could be found in official site   --\n\n';
        for(let item of res_pkg_not_found_aliyun){
            console.log(item);
            report += item + '\n';
        }
        console.log('\ntotal: ' + res_pkg_not_found_aliyun.length + '\n');
        report += '\ntotal: ' + res_pkg_not_found_aliyun.length + '\n';
    }else{
        console.log('\n\nall packages that could be found from official site are found in aliyun path of  /api/packages/ .\n');
        report +='\n\nall packages that could be found from official site  are found in aliyun path of  /api/packages/ .\n';
    }

    if(res_http_request_failed_flutter.length > 0){
        console.log('\n\n-- failed to request the version information of the following packages from official package list --\n\n');
        report += '\n\n-- failed to request the version information of the following packages from official package list --\n\n';
        for(let item of res_http_request_failed_flutter){
            console.log(item);
            report += item + '\n';
        }
        console.log('\ntotal: ' + res_http_request_failed_flutter.length + '\n');
        report +='\ntotal: ' + res_http_request_failed_flutter.length + '\n';
    }else{
        console.log('\n\n-- no http request error from official site encountered during checking --\n\n');
        report += '\n\n-- no http request error from official site encountered during checking --\n\n';
    }

    if(res_http_request_failed_aliyun.length > 0){
        console.log('\n\n-- failed to request the version information of the following packages from alliyun package list --\n\n');
        report += '\n\n-- failed to request the version information of the following packages from alliyun package list --\n\n';
        for(let item of res_http_request_failed_aliyun){
            console.log(item);
            report += item + '\n';
        }
        console.log('\ntotal: ' + res_http_request_failed_aliyun.length + '\n');
        report += '\ntotal: ' + res_http_request_failed_aliyun.length + '\n';
    }else{
        console.log('\n\n-- no http request error from aliyun cdn encountered during checking --\n\n');
        report += '\n\n-- no http request error from aliyun cdn encountered during checking --\n\n';
    }

    if(res_parse_json_error_flutter.length > 0){
        console.log('\n\n--failed to parse the returned json of the version information of the following packages from official package list --\n\n');
        report += '\n\n-- failed to parse the returned json of the version information of the following packages from official package list --\n\n';
        for(let item of res_parse_json_error_flutter){
            console.log(item);
            report += item + '\n';
        }
        console.log('\ntotal: ' + res_parse_json_error_flutter.length + '\n');
        report +='\ntotal: ' + res_parse_json_error_flutter.length + '\n';
    }else{
        console.log('\n\n-- no json parse error from official site encountered during checking --\n\n');
        report += '\n\n-- no json parse error from official site encountered during checking --\n\n';
    }

    if(res_parse_json_error_aliyun.length > 0){
        console.log('\n\n--failed to parse the returned json of the version information of the following packages from aliyun package list --\n\n');
        report += '\n\n-- failed to parse the returned json of the version information of the following packages from aliyun package list --\n\n';
        for(let item of res_parse_json_error_aliyun){
            console.log(item);
            report += item + '\n';
        }
        console.log('\ntotal: ' + res_parse_json_error_aliyun.length + '\n');
        report +='\ntotal: ' + res_parse_json_error_aliyun.length + '\n';
    }else{
        console.log('\n\n-- no json parse error from aliyun site encountered during checking --\n\n');
        report += '\n\n-- no json parse error from aliyun site encountered during checking --\n\n';
    }


    console.log('\n\n*************************************************************************');
    console.log('                      end of result report');
    console.log('report date: ' + currentTimestamp());
    console.log('***************************************************************************\n\n');

    return report;
}


module.exports.checkPackage = function(){
    console.log('initialize mailer authentication');
    initializeAuth();

//main process
    console.log('requesting package list from official site...');

// for(let i=0; i<200; i+=40){
//     loadPackageInfo(i, true);
// }

    requestPackageList();
//check time if it is time to start checking per hour
//     setInterval(checkWorker, 3600000);
}

