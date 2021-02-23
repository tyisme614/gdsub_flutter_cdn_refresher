const request = require('request');
const EventEmitter = require('events');
class CheckerEventHandler extends EventEmitter {}

const flutter_base_url = 'https://pub.dartlang.org/api/packages/';
const aliyun_cdn_url = 'https://pub.flutter-io.cn/api/packages/';
const package_list_url = 'https://pub.dartlang.org/api/packages?compact=1';

let index = 0;
let pkgList;
let aliyun_version = '';
let official_version = '';
let results = [];

const eventHandler = new CheckerEventHandler();

eventHandler.on('retrieved_packages', (list)=>{
    pkgList = list;
    index = 0;
    console.log('checking official version of ' + list[0]);
    checkPackageVersion(list[0], true);
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

console.log('requesting package list from official site...');
requestPackageList();





