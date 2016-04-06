'use babel';

import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import log from './log.js';
import SfConnection from './atom-nforce.js';

// Manage remembering tokens + data related to user's SF projects.
export default class SfProject extends EventEmitter {
  constructor(projRoot) { // path should be root dir of user's project
    super();
    this.projRoot = projRoot;
    this.projectFilePath = path.join(`${this.projRoot}`, '.atomforce');
    this.conn = new SfConnection(this);
  }

  // Look in user's root directory for projectFilePath (hardcoded as [root]/.atomforce right now)
  getProjectData() {
    if (this.projectData) {
      return Promise.resolve(this.projectData);
    }

    return new Promise((resolve, reject) =>
      fs.readFile(this.projectFilePath, (err, data) => {
        if (err) {
          log.error(err);
          reject(null);
        } else {
          this.projectData = JSON.parse(data);
          this.emit('projectLoaded', 'Successfully loaded Force.com project data.');
          resolve(data);
        }
      }));
  }

  // No massaging, just dump whatever we are passed into a file.
  writeProjectData(data) {
    this.projectData = data;
    fs.writeFile(this.projectFilePath, JSON.stringify(data), (err) => {
      if (err) this.emit('projectError', JSON.stringify(err));

      this.emit('projectLoaded', 'Successfully saved Force.com project data.');
    });
  }

  getConnection() {
    return this.conn;
  }

  emit(type, ...args) {
    super.emit(type, ...args);
    log.info(`SfConnection emitted ${type} with args ${JSON.stringify(args)}`);
  }
}
