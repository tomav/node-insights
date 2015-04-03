'use strict';

var _ = require('lodash');
var request = require('request');
var logger = console;

function Insights(config){

  this.config = _.assign({
    appId: null,
    enabled: true,
    insertKey: '',
    timerInterval: 10000,
    maxPending: 100,
    defaultEventType: 'data',
    url: ''
  }, config);

  if (_.isEmpty(config.insertKey)){
    throw new Error('Missing insert key');
  }

  if(_.isEmpty(config.url)){
    throw new Error('Missing url');
  }

  if (!_.isNumber(config.appId)){
    throw new Error('Missing app id');
  }

  this.data = [];
  this.timerId = null;
  this.timerCallback = _.bind(this.send, this);
}

//start the timer that will send insights after some interval of time
//this is called implicitly when data is added via the add method
Insights.prototype.start = function(){
  if (!this.timerId){
    this.timerId = setInterval(this.timerCallback, this.config.timerInterval);
  }
};

//stop the timer that will send insights after some interval of time
//this is called implicitly when the amount of data exceeds maxPending and the queue is sent
Insights.prototype.stop = function(){
  if (this.timerId){
    clearInterval(this.timerId);
    this.timerId = null;
  }
};

//Send accumulated insights data to new relic (if enabled)
Insights.prototype.send = function(){
  var that = this;
  if (that.config.enabled && that.data.length > 0){
    try {
      request({
        method: 'POST',
        json: true,
        headers: {
          "X-Insert-Key": this.config.insertKey
        },
        url: that.config.url,
        body: that.data
      }, function(err, res, body){
        that.data.length = 0;
        if (err){
          logger.error('Error sending to insights', err);
        }
        else if (res){
          logger.log('Insights response', res.statusCode, body);
        }
      });
    }
    catch(x){
      that.data.length = 0;
      logger.error(x);
    }
  }
};

function reducer(prefix){
  return function(insight, value, key){
    if (_.isString(value) || _.isNumber(value)){
      insight[prefix + key] = value;
    }
    else if (_.isPlainObject(value) || _.isArray(value)){
      _.reduce(value, reducer(key + '.'), insight);
    }
    else if (_.isBoolean(value) || _.isDate(value)){
      insight[prefix + key] = value.toString();
    }
    else {
      //ignore functions, nulls, undefineds
      logger.warn('not reducing', prefix, key, value);
    }
    return insight;
  };
}

//Add insights data to the queue.
//It is sent when the queue reaches a max size or a period of time has elapsed
Insights.prototype.add = function(data, eventType){
  var that = this;
  try {

    var insight = _.reduce(data, reducer(""), {
      "appId": that.config.appId,
      "eventType": eventType || that.config.defaultEventType
    });

    logger.log('Insights data', insight);
    that.data.push(insight);

    if (that.data.length > that.config.maxPending){
      that.stop();
      that.send();
    }
    else {
      that.start();
    }
  }
  catch(x){
    logger.error('Insights Add Exception:', x);
    that.data.length = 0;
  }
};

module.exports = Insights;