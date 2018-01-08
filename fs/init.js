/*
 * Solar panel monitoring example
 */

// Load Mongoose OS API

load('api_timer.js');
load('api_arduino_dht.js');
load('api_gpio.js');
load("api_adc.js");
load('api_arduino_onewire.js');
load('ds18b20.js');
load('api_mqtt.js');
load('api_config.js');


// PINS Assignment
let pinOneWire    = 14;
let pinLedA       = 15;
let pinLedB       = 2;
let pinFan        = 17;
let pinPhotoCell  = 33; 
let pinSolarPanel = 32; 


// ADC Readers
ADC.enable(pinPhotoCell);
ADC.enable(pinSolarPanel);

let isFanOn = 0;
let isLedAOn = 0;
let isLedBOn = 0;


// GPIO Modes
GPIO.set_mode(pinFan,GPIO.MODE_OUTPUT);
GPIO.set_mode(pinLedA,GPIO.MODE_OUTPUT);
GPIO.set_mode(pinLedB,GPIO.MODE_OUTPUT);


// Initialize OneWire library
let ow = OneWire.create(pinOneWire);

// Number of sensors found on the 1-Wire bus
let n = 0;
// Sensors addresses
let rom = ['01234567'];

// Search for sensors
let searchSens = function() {
  let i = 0;
  // Setup the search to find the device type on the next call
  // to search() if it is present.
  ow.target_search(DEVICE_FAMILY.DS18B20);

  while (ow.search(rom[i], 0/* Normal search mode */) === 1) {
    // If no devices of the desired family are currently on the bus, 
    // then another type will be found. We should check it.
    if (rom[i][0].charCodeAt(0) !== DEVICE_FAMILY.DS18B20) {
      break;
    }
    // Sensor found
    print('Sensor#', i, 'address:', toHexStr(rom[i]));
    rom[++i] = '01234567';
  }
  return i;
};
//****************


/*************  MQTT
 * 
 * 
 * 
*/

let topicOut = 'SolarPanel/'+Cfg.get('device.id') +'/out';

let topicIn = 'SolarPanel/'+Cfg.get('device.id') +'/in';
let topicInLedA = 'SolarPanel/'+Cfg.get('device.id') +'/in/leda';
let topicInLedB = 'SolarPanel/'+Cfg.get('device.id') +'/in/ledb';
let topicInFan = 'SolarPanel/'+Cfg.get('device.id') +'/in/fan';
let topicInFanMode = 'SolarPanel/'+Cfg.get('device.id') +'/in/fanmode';
let topicInThreshold = 'SolarPanel/'+Cfg.get('device.id') +'/in/threshold';

let fanMode=0;
let threshold = 25;
let deviceid = Cfg.get('device.id');

let getData = function() {
  let volts = getVolts();
  let amps  = 0.100;
  let watts = volts * amps;
  return JSON.stringify({
    volts:  volts,
    amps:   amps,
    watts:  watts,
    light:  getLight(),
    temp:   getTemperature(),
    fan:    getFan(),
    ledA:   getLedA(),
    ledB:   getLedB(),
    threshold: getThreshold(),
    fanMode:  getFanMode(),
    deviceid: getDeviceId()
  });
};

let getDeviceId = function(){
  return deviceid;
};

let switchFan = function(isOn){
  //print('Switching fan:', isOn);
  if(isOn){
    GPIO.write(pinFan,1);
    isFanOn = 1;
  }else{
    GPIO.write(pinFan,0);
    isFanOn = 0;
  }
  switchLedA(isOn);
};

let switchLedA = function(isOn){
  if(isOn){
    GPIO.write(pinLedA,1);
    isLedAOn = 1;
  }else{
    GPIO.write(pinLedA,0);
    isLedAOn = 0;
  }
};

let getTemperature = function() {
  if (n === 0) {
    if ((n = searchSens()) === 0) {
      print('No device found');
    } else {
      print('# Devices Found:',n);
    }
  }

  for (let i = 0; i < n; i++) {
    let t = getTemp(ow, rom[i]);
    let th = getThreshold();
    if (isNaN(t)) {
      print('No device found');
      return -127;
    } else {
      //print('Sensor#', i, 'Temperature:', t, '*C');
      if (getFanMode() === 2){
        //print('Type Of T:',typeof t);
        //print('Type Of TH:',typeof th);
        if (t > th){
          switchFan(true);
        } else {
          switchFan(false);
        }
      }
      return t;
    }
  }
};

let getVolts =  function(){
  let x = ADC.read(pinSolarPanel);
  //print('Solar panel Value:',x);
  let t = x*3.08/1703;
  // 1703 - 3.08
  return t;
};

let getLight = function() {
  let x = ADC.read(pinPhotoCell);
  //print('Photo Cell Value:',x);
  let t = x*1.05/1100;
  t = t/0.6;
  return t;
};

let getThreshold = function() {
  return threshold;
};

let getFanMode = function() {
  return fanMode;
};

let getFan = function() {
  return isFanOn;
};

let getLedA = function() {
  return isLedAOn;
};

let getLedB = function() {
  return isLedBOn;
};

n = searchSens();

GPIO.write(pinLedA,0);
GPIO.write(pinLedB,0);
GPIO.write(pinFan,0);

// MQTT subscribe


MQTT.sub(topicInLedA, function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  if (msg === '0'){
    GPIO.write(pinLedA,0);
    isLedAOn = 0;
  } else {
    GPIO.write(pinLedA,1);
    isLedAOn = 1;
  }
}, null);



MQTT.sub(topicInLedB, function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  if (msg === '0'){
    GPIO.write(pinLedB,0);
    isLedBOn = 0;
  } else {
    GPIO.write(pinLedB,1);
    isLedBOn = 1;
  }
}, null);

MQTT.sub(topicInFan, function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  if (msg === '0'){
    switchFan(true);
  } else {
    switchFan(false);
  } 
}, null);

MQTT.sub(topicInFanMode, function(conn, topic, msg) {
  //print('Topic:', topic, 'message:', msg);
  
  if (msg === '0'){
    fanMode = 0;
    switchFan(false);
  } else if (msg === '1'){
    fanMode = 1;
    switchFan(true);
  } else {
    fanMode = 2;
  }
}, null);

MQTT.sub(topicInThreshold, function(conn, topic, msg) {
  //print('Topic:', topic, 'message:', msg);
  //print('Type Of msg:',typeof msg);
  let pmsg = JSON.parse(msg);
  //print('pmsg = ',pmsg);
  //print('Type Of pmsg:',typeof pmsg);
  if(isNaN(pmsg)){
    threshold = 25;
  } else {
    threshold = pmsg;  
  }
  
}, null);

  //print(getData());
  //print('mqtt tpoic is:',topicOut);
  //let ok = MQTT.pub(topicOut, getData(), 1);
  //print('Publish was',ok);


Timer.set(3000 /* milliseconds */, true /* repeat */, function() {
  print(getData());
  //print('mqtt tpoic is:',topicOut);
  let ok = MQTT.pub(topicOut, getData(), 1);
  //print('Publish was',ok);

  
/* 
  isLedAOn = GPIO.toggle(pinLedA);
  isLedBOn = GPIO.toggle(pinLedB);
  isFanOn = GPIO.toggle(pinFan);
*/  
}, null);



