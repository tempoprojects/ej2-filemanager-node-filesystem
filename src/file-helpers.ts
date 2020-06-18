const async  = require('async');
const request  = require('request');
const  archiver = require('archiver');
import * as path from 'path';
import { response } from 'express';
const https = require('https');
import * as moment from 'moment';

export const zipURLs = (files, outStream) => {
  let zipArchive = archiver.create('zip', {
    statConcurrency: 1,
    allowHalfOpen: false,
    decodeStrings: false,
    store: true,
    zlib: {
        level: 0,
    },
  });

  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  zipArchive.on('warning', (err) => {
    console.log('zipArchive.warning', err);
  });

  // good practice to catch this error explicitly
  zipArchive.on('error', (err) => {
    console.error('zipArchive.error', err);
  });

  // To avoid override for the files with the same name
  const appended = [];

  let counter = 0;
  async.eachLimit(files, 1, (file, done) => {

    console.log('zipURLs.append', file)

    https.get(file.url, (stream) => {

        let name = path.join(file.path, file.filename);
        if (appended.includes(name)) {
            // name = path.join(file.path, file.name + '_' + file.objectId + file.type);

            const dateModified = moment(file.dateModified);

            name = path.join(file.path, file.name + '_' + dateModified.format('YYYY-MM-DD_hh-mm-ss') + file.type);
        }
        appended.push(name);

        zipArchive.append(stream, { name });
        console.log('zipURLs.append.end', ++counter, '/', files.length);
        return done();
    });

    // NOTE: using request LIB will hang after huge number of files
    // let stream = request.get(file.url);
    // stream.on('error', (err) => {
    // console.error('zipURLs.err', err);
    // return done(err);
    // }).on('end', () => {
    //     console.log('zipURLs.append.end', ++counter, '/', files.length);
    //     return done();
    // });

    // zipArchive.append(stream, { name: path.join(file.path, file.filename) });
  }, (err) => {
    if (err) throw err;
    zipArchive.pipe(outStream);
    zipArchive.finalize();
    console.log('zipArchive.finalize');
  });
}
