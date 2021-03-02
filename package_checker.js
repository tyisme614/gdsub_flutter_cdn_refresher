const worker = require('./check_package_version');

//main process
console.log(currentTimestamp() + 'service started');
// console.log(currentTimestamp() + 'requesting package list from official site...');

//check time if it is time to start checking per hour
setInterval(checkWorker, 3600000);

function checkWorker(){
    let ts = Date.now();
    let date = new Date(ts);
    let hour = date.getHours();
    if(true){//hour == 2){//2 o'clock in the morning
        console.log(currentTimestamp() +' start checking package versions');
        console.log(currentTimestamp() + ' requesting package list from official site...');
        worker.checkPackage();
    }
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





