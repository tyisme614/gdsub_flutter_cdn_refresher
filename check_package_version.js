const request = require('request');
const EventEmitter = require('events');
class CheckerEventHandler extends EventEmitter {}

const flutter_base_url = 'https://pub.dartlang.org/api/packages/';
const aliyun_cdn_url = 'https://pub.flutter-io.cn/api/packages/';
const package_list_url = 'https://pub.dartlang.org/api/packages?compact=1';
const package_info_url_flutter = 'https://pub.dartlang.org/api/packages?page=';
const package_info_url_aliyun = 'https://pub.flutter-io.cn/api/packages?page=';

let index = 0;
let pkgList;
let aliyun_version = '';
let official_version = '';
let results = [];
let package_info_map_flutter = new Map();
let package_info_map_aliyun = new Map();
let package_version_map_flutter = new Map();
let package_version_map_aliyun = new Map();

let res_version_inconsistent = [];
let res_pkg_not_found = [];

let page_count = 0;
let loaded_flutter = false;
let loaded_aliyun = false;
let loading = false;

const eventHandler = new CheckerEventHandler();

eventHandler.on('retrieved_packages', (list)=>{
    pkgList = list;
    index = 0;
    console.log(' length=' + list.length);
    // checkPackageVersion(list[0], true);
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
    console.log('loading aliyun package information completed');
    loaded_aliyun = true;
    console.log('starting comparing...');
    constructDataStructure();
});

eventHandler.on('flutter_loaded', ()=>{
    console.log('loading official flutter package information completed');
    loaded_flutter = true;
    if(!loading){
        loading = true;
        for(let i=0; i<200; i+=10){
            loadPackageInfo(i, false);
        }
    }

});

eventHandler.on('check_aliyun', (pkg)=>{
    console.log('checking aliyun cdn version of ' + pkg);
   checkPackageVersion(pkg, false);
});

eventHandler.on('compare', (pkg)=>{
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

eventHandler.on('constructed data structure', ()=>{
    comparePkgVersion();
});

eventHandler.on('comparing finished', ()=>{
    showResult();
});

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
        }else{
            try{
                let data = JSON.parse(body);
                let list = [];
                for(let i=0; i<data.packages.length; i++){
                    list.push(data.packages[i]);
                }
                eventHandler.emit('retrieved_packages', list);
            }catch(e){
                console.error('json parsing error-->' + e.message);
            }
        }
    });

}

function checkPackageVersion(pkg, official){

    let base_url = aliyun_cdn_url;
    if(official){
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
            console.error('http request error-->' + err.message);
        }else{
            try{
                let data = JSON.parse(body);
                if(official){
                    // console.log('official latest version of ' + pkg + ' is ' + data.latest.version);
                    official_version = data.latest.version;
                    eventHandler.emit('check_aliyun', pkg);
                }else{
                    // console.log('aliyun latest version of ' + pkg + ' is ' + data.latest.version);
                    aliyun_version = data.latest.version;
                    eventHandler.emit('compare', pkg);

                }
            }catch(e){
                console.error('json parsing error-->' + e.message);
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
                if(official){
                    package_info_map_flutter.set(page, json);
                }else{
                    package_info_map_aliyun.set(page, json);
                }

                let next_url = json.next_url;
                if(next_url == null){
                    console.log('found last page, page-->' + page);
                    eventHandler.emit('pkg_info_loaded');
                }else{
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
            }catch(e){
                console.error(e.message);
            }
    });

}

function constructDataStructure(){
    let it = package_info_map_flutter.entries();
    console.log('start constructing data structure for official data');
    let entry = it.next();
    while(!entry.done){
        let rawJSON = entry.value;
        let packages = rawJSON.packages;
        for(let i=0; i<packages.length; i++){
            let pkg = packages[i];
            package_version_map_flutter.set(pkg.name, pkg.latest.version);
        }
        entry = it.next();

    }
    console.log('finished official data structure');
    console.log('start constructing data structure for aliyun data');
    let it2 = package_info_map_aliyun.entries();
    let entry2 = it2.next();
    while(!entry2.done){
        let rawJSON = entry2.value;
        let packages = rawJSON.packages;
        for(let i=0; i<packages.length; i++){
            let pkg = packages[i];
            package_version_map_aliyun.set(pkg.name, pkg.latest.version);
        }
        entry2 = it2.next();
    }

    console.log('finished aliyun data structure');
    eventHandler.emit('constructed data structure');
}

function comparePkgVersion(){
    let it = package_version_map_flutter.keys();
    let entry = it.next();
    while(!entry.done){
        let pkg = entry.value;
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
        entry = it.next();
    }
    eventHandler.emit('comparing finished');
}

function showResult(){
    if(res_pkg_not_found.length > 0){
        console.log('\n\n**************************************the following packages are not found in aliyun package list*********************************\n\n');
        for(let item of res_pkg_not_found){
            console.log('package: ' + item + ' is not found in aliyun package list, official version:' + package_version_map_flutter.get(item));
        }
    }else{
        console.log('\n\nall packages are found in aliyun package list.\n');
    }

    if(res_version_inconsistent.length > 0){
        console.log('\n\n**************************************the version of following packages are inconsistent between official site and aliyun CDN*********************************\n\n');
        for(let item of res_version_inconsistent){
            console.log('the version of package: ' + item + ' is inconsistent, official version:' + package_version_map_flutter.get(item) + ' aliyun version:' + package_version_map_aliyun.get(item));
        }
    }else{
        console.log('\n\nversion of all packages are consistent between official site and aliyun CDN.\n');
    }
    console.log('************************************end of result report******************************************');
}

console.log('requesting package list from official site...');
for(let i=0; i<200; i+=10){
    loadPackageInfo(i, true);
}

// requestPackageList();





