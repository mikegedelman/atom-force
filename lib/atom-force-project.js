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
  }

  getPrimaryConnection() {
    return this._getPrimaryData().then((oauth, env) => new SfConnection(oauth, env));
  }

  // Look in user's root directory for projectFilePath (hardcoded as [root]/.atomforce right now)
  _getPrimaryData() {
    if (this.projectData) {
      return Promise.resolve(this.projectData.primary.oauth, this.projectData.primary.env);
    }

    return new Promise((resolve, reject) =>
      fs.readFile(this.projectFilePath, (err, data) => {
        if (err) {
          log.error(err);
          reject(null);
        } else {
          const parsed = JSON.parse(data);
          if (parsed.primary) {
            this.emit('projectLoaded', 'Successfully loaded Force.com project data.');
            log.info(parsed);
            this.projectData = parsed;
            resolve(this.projectData.primary.oauth);
          } else {
            reject(`didn't find a primary org: data dump: ${data})`);
          }
        }
      }));
  }

  addOrg(name, oauth, env) {
    this.projectData.others.push({ name, env, oauth });
    this._write();
  }

  getOrgs() {
    return [this.projectData.primary, ...this.projectData.others];
  }

  setPrimaryData(oauth, env) {
    this.projectData = { primary: { name: 'current', env, oauth }, others: [] };
    this._write();
  }

  _write() {
    fs.writeFile(this.projectFilePath, JSON.stringify(this.projectData), err => {
      if (err) this.emit('projectError', JSON.stringify(err));
      this.emit('projectLoaded', 'Successfully saved Force.com project data.');
    });
  }

  emit(type, ...args) {
    super.emit(type, ...args);
    log.info(`SfConnection emitted ${type} with args ${JSON.stringify(args)}`);
  }
}
