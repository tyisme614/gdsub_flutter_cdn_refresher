const request = require('request');
const { spawn } = require('child_process');
const flutter_checker = require('./flutter_checker');

const flutter_source_url = 'https://pub.dartlang.org/api/packages?page=1';//[deprecated]'https://pub.dev/api/packages?page=1';
const aliyuncli_cmd = '/usr/local/bin/aliyuncli';
// const aliyuncli_cmd = '/usr/local/bin/aliyuncli cdn RefreshObjectCaches ';
const aliyun_cdn_url = 'https://pub.flutter-io.cn/api/packages/';
// const aliyun_cdn_url = 'https://material-io.cn/';

let first_package = '';
let cdn_refresh_info = '';

let check_task;


function check_first_package(){
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
                console.log('initializing first_package');
                if(typeof(data.packages) !== 'undefined' && data.packages.length > 0){
                    first_package = data.packages[0];
                    console.log(show_package_info(first_package));
                }
            }else{
                if(typeof(data.packages) !== 'undefined' && data.packages.length > 0){
                    let pkg = data.packages[0];
                    if(diff_package(pkg, first_package)){
                        //packages resources have been updated, refresh cdn
                        console.log('refresh cdn');
                        refresh_ali_cdn();
                        //update first_package
                        first_package = pkg;
                        console.log('first_package has been updated\n');
                        console.log(show_package_info(first_package));
                    }else{
                        console.log('source site not updated');
                    }


                }
            }
        }




    });

}

function diff_package(pkg1, pkg2){
    if(pkg1.name != pkg2.name){
        //packages have been updated
        return true;
    }else if(pkg1.latest.version != pkg2.latest.version){
        //same package, but a newer version has been published
        return true;
    }

    return false;
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

function refresh_ali_cdn(){
    let cmd = spawn(aliyuncli_cmd, ['cdn', 'RefreshObjectCaches', '--ObjectPath', aliyun_cdn_url, '--ObjectType', 'Directory']);

    cmd.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        cdn_refresh_info = JSON.parse(data);
        console.log('RefreshTaskId=' + cdn_refresh_info.RefreshTaskId);
        console.log('RequestId=' + cdn_refresh_info.RequestId);
    });

    cmd.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
    });

    cmd.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
}



check_first_package();

check_task = setInterval(check_first_package, 300000);//check source site per 5 min aka 300 sec

flutter_checker.startCheckTask();