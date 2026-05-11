'use strict';

var fs = require('fs');
var path = require('path');
var Promise;

exports.setup = function(options) {
  Promise = options.Promise;
};

function runSqlFile(db, fileName) {
  var filePath = path.join(__dirname, 'sqls', fileName);
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, {encoding: 'utf-8'}, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  }).then(function(data) {
    return db.runSql(data);
  });
}

exports.up = function(db) {
  return runSqlFile(db, '20260511161000-github-installation-state-up.sql');
};

exports.down = function(db) {
  return runSqlFile(db, '20260511161000-github-installation-state-down.sql');
};

exports._meta = {
  version: 1,
};
