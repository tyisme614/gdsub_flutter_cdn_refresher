const request = require('request');
const EventEmitter = require('events');
class CheckerEventHandler extends EventEmitter {}

const flutter_base_url = 'https://pub.dartlang.org/api/packages/';
const aliyun_cdn_url = 'https://pub.flutter-io.cn/api/packages/';
const package_list_url = 'https://pub.dartlang.org/api/packages?compact=1';
const package_info_url = 'https://pub.dartlang.org/api/packages?page=';

let index = 0;
let pkgList;
let aliyun_version = '';
let official_version = '';
let results = [];
let package_info_map = new Map();

const eventHandler = new CheckerEventHandler();

eventHandler.on('retrieved_packages', (list)=>{
    pkgList = list;
    index = 0;
    console.log(' length=' + list.length);
    // checkPackageVersion(list[0], true);
});

eventHandler.on('load_next_page', (page)=>{
    if(package_info_map.has(page)){
        console.log('page ' + page + ' has been loaded, omit request...');
    }else{
        console.log('loading package page ' + page);
        loadPackageInfo(page);
    }

})

eventHandler.on('pkg_info_loaded', ()=>{
   console.log('loading package information completed');
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

function loadPackageInfo(page){
    let options= {
        url: package_info_url + page,
        headers: {
            'User-Agent' : 'pub.flutter-io.cn'
        }
    };

    request.get(options, (err, response, body) => {
            try{
                console.log('loaded page ' + page);

                let json = JSON.parse(body);
                package_info_map.set(page, json);
                let next_url = json.next_url;
                if(next_url == null){
                    console.log('loading package information completed');
                    eventHandler.emit('pkg_info_loaded');
                }else{
                    eventHandler.emit('load_next_page', page + 1);
                }
            }catch(e){
                console.error(e.message);
            }
    });

}

console.log('requesting package list from official site...');
for(let i=0; i<200; i+=10){
    loadPackageInfo(i);
}

// requestPackageList();





