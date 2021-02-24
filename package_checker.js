const worker = require('./check_package_version');

//main process
console.log('service started');
console.log('requesting package list from official site...');

//check time if it is time to start checking per hour
setInterval(checkWorker, 3600000);

function checkWorker(){
    let ts = Date.now();
    let date = new Date(ts);
    let hour = date.getHours();
    if(hour == 2){//2 o'clock in the morning
        console.log('start checking package versions');
        console.log('requesting package list from official site...');
        worker.checkPackage();
    }
}





