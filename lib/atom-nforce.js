'use babel';

import path from 'path';
import EventEmitter from 'events';
import archiver from 'archiver';
import xml from 'xml';
import co from 'co';
import nforce from 'nforce';
import addNforceTooling from 'nforce-tooling';
import addNforceMetadata from 'nforce-metadata';
addNforceTooling(nforce); // better ES6y way to import these?
addNforceMetadata(nforce);
import log from './log.js';

const CLIENT_ID =
    '3MVG9xOCXq4ID1uHM155ZfXCXD8FgKFU8zNRnyt3JS07eYXfuhyjwlV0iw.BOS8mS6os74WuS.xCLXM_kG7un';
const XMLNS = 'http://soap.sforce.com/2006/04/metadata';

const EXT_TO_TYPE = {
  cls: 'ApexClass',
  trigger: 'ApexTrigger',
  apxt: 'ApexTrigger',
  page: 'ApexPage',
  resource: 'StaticResource',
};

const EXT_TO_FOLDER = {
  cls: 'classes',
  trigger: 'triggers',
  apxt: 'classes',
  page: 'pages',
  resource: 'staticresources',
};

const POLL_INTERVAL = 500; // ms to wait in between polling for status. TODO make this configurable

// use nforce to save stuff (and eventually do other stuff), and emit events.
export default class SfConnection extends EventEmitter {
  constructor(oauth, environment) {
    log.info(`env ${environment}`);
    super();
    const loginSubDomain = environment === 'sandbox' ? 'test' : 'login';
    this.org = nforce.createConnection({
      clientId: CLIENT_ID,
      redirectUri: `https://${loginSubDomain}.salesforce.com/services/oauth2/success`,
      mode: 'single',
      plugins: ['tooling', 'meta'],
      autoRefresh: true,
      environment,
      oauth,
      metaOpts: {}, // metadata operations fail without this
    });
    this.entityIdCache = {};
    this.reqs = 0;
    log.info(this.org);
  }

  emit(type, ...args) {
    super.emit(type, ...args);
    log.info(`SfConnection emitted ${type} with args ${JSON.stringify(args)}`);
  }

  // expose this nforce method so that our main AtomForce class can easily get the right URL
  getAuthUri() {
    return this.org.getAuthUri({
      responseType: 'token',
      scope: ['full', 'refresh_token'],
    });
  }

  // Will read the given paths and deploy them to a target organization via metadata API
  deployMetadata(paths, tests) {
    const org = this.org;
    const allFilenames = [];
    const arc = archiver('zip');

    paths.forEach(filePath => {
      const name = path.basename(filePath);
      const [,, extension] = SfConnection._parseApexName(name);
      const folder = `src/${EXT_TO_FOLDER[extension]}`;
      log.info(`saw ${filePath}`);
      arc.file(filePath, { name, prefix: folder });
      arc.file(`${filePath}-meta.xml`, { name: `${name}-meta.xml`, prefix: folder });
      allFilenames.push(name);
    });

    const packageXml = SfConnection._createPackageXml(allFilenames);
    log.info(packageXml);
    arc.append(packageXml, { name: 'package.xml', prefix: 'src' });
    arc.finalize();
    log.info('done preparing zip');

    const deployOptions = { rollbackOnError: true };
    if (tests) {
      const runTests = tests.split(',');
      Object.assign(deployOptions, { runTests, testLevel: 'RunSpecifiedTests' });
    }
    log.info(`deployOptions: ${JSON.stringify(deployOptions)}`);

    const deployPromise = org.meta.deployAndPoll({
      deployOptions,
      zipFile: arc,
    });
    deployPromise.poller.on('start', () => this.emit('saveDeploy', this.org.oauth));
    deployPromise.poller.on('poll', (stat) => log.info(stat));
    deployPromise.poller.on('done', () => this.emit('saveComplete', 'Deployment complete!'));

    deployPromise.error(err => { // TODO extract something form this err msg.
      this.emit('deployFailed', err);
      console.error(JSON.stringify(err));
      console.error(err);
    });
  }

  // possible TODO: seem to keep parsing filenames, wrap this stuff in its own class?
  static _createPackageXml(filenames) { // return a string of xml.
    const members = new Map(); // first sort all our members into their appropriate types
    filenames.forEach(filename => {
      const [, name, extension] = SfConnection._parseApexName(filename);
      const type = EXT_TO_TYPE[extension];

      if (!members.has(type)) {
        members.set(type, [name]);
      } else {
        members.get(type).push(name);
      }
    });

    const pkg = { Package: [{ _attr: { xmlns: XMLNS } }, { version: '36.0' }] };
    for (const [type, memberNames] of members) {
      const children = [];
      memberNames.forEach(name => {
        children.push({ members: name });
      });

      children.push({ name: type });
      pkg.Package.push({ types: children });
    }
    log.info(pkg);
    return xml(pkg, { declaration: true });
  }

  saveTooling(fullPath, body) {
    if (this.isSaving) { // handles case when user has the same file open in multiple tabs
      return;
    }
    this.isSaving = true;
    const fullName = path.basename(fullPath);
    const [, name, extension] = SfConnection._parseApexName(fullName);
    const type = EXT_TO_TYPE[extension];

    this.emit('saveTooling', fullName);
    if (type === 'StaticResource') {
      this._saveToolingOther(fullName, name, type, body);
    } else {
      this._saveToolingApex(fullPath, name, type, body);
    }
  }

  static _parseApexName(fullName) {
    return /^(\w+)\.(cls|page|trigger|resource)/.exec(fullName);
  }

  // this is primarily intended for StaticResource
  _saveToolingOther(fullName, name, type, body) {
    this._getEntityId(fullName, name, type)
    .then((id) => {
      this.org.tooling.update({
        id,
        type,
        object: { name, body: new Buffer(body).toString('base64') },
      });
    })
    .then(() => {
      this.emit('saveComplete', fullName);
    }).catch(err => {
      this.emit('saveError', err);
    });
  }

  /* Save any apex code - VF, class, or trigger.
   * This way more complicated than above: we have to:
   *  (0. be authenticated)
   *  1. get the class Id if we don't have it and save it - _getEntityId
   *  2. create a container - _getContainer
   *  3. tell SF to add our class to that container - addContainerArtifact
   *  4. tell SF to deploy
   *  5. poll on the result
   *  6. delete our container. once your class saves successfully in a container,
   *     you can't deploy it with that container again, so it seems best to just always
   *     delete it.
   *     maybe in the future this class can remember which files you have tried and failed to save.
   * this fn uses co() simply to make it more readable */
  _saveToolingApex(fullPath, name, type, body) {
    const t = this.org.tooling;
    const fullName = path.basename(fullPath);
    co(function* asyncDeploy() {
      const [containerId, contentEntityId] =
          yield [this._getContainer(), this._getEntityId(fullName, name, type)];

      const artifact = t.createDeployArtifact(`${type}Member`, { body, contentEntityId });
      yield t.addContainerArtifact({ id: containerId, artifact });
      const { id: asyncContainerId } =
          yield t.deployContainer({ id: this.containerId, isCheckOnly: false });

      yield this._pollOnToolingDeploy(asyncContainerId);
      this.emit('saveComplete', fullName);
      this._deleteContainer();
    }.bind(this)).catch(err => {
      if (err.State === 'Failed') {
        this.emit('saveFailed', fullPath, err.DeployDetails.componentFailures[0]);
      } else if (err.State === 'Error') {
        this.emit('saveError', fullName, err.ErrorMsg
                                         ? err.deployStatus.ErrorMsg
                                         : 'unknown error');
      } else {
        this.emit('saveError', fullName, err);
      }
      this._deleteContainer();
    });
  }

  // just create a promise and pass off the info.
  _pollOnToolingDeploy(asyncContainerId) {
    return new Promise((resolve, reject) => {
      this._pollOnToolingDeployInner(asyncContainerId, resolve, reject);
    });
  }

  /* for readability mainly we want to chain these polls using setTimeout, and we need a way
   * to call this part directly without creating a new promise every time.
   * I think there's a better and clearer way to do this... */
  _pollOnToolingDeployInner(asyncContainerId, resolve, reject) {
    this.org.tooling.getContainerDeployStatus({ id: asyncContainerId }).then((deployStatus) => {
      log.info(`polling; state: ${deployStatus.State}`);
      if (deployStatus.State === 'Queued') {
        setTimeout(() => this._pollOnToolingDeployInner(asyncContainerId, resolve, reject),
                   POLL_INTERVAL);
      } else if (deployStatus.State === 'Completed') {
        resolve();
      } else {
        reject(deployStatus);
      }
    }).catch(err => { console.log('here'); reject(JSON.stringify(err)); });
  }

  // get and remember container. (for now) we should only ever have one open at a time.
  _getContainer() {
    return this.org.tooling.createContainer({ name: 'atom-force-deploy' }) // hash token
      .then(({ id }) => {
        this.containerId = id;
        return id;
      })
      .catch((err) => {
        log.error(err);
      });
  }

  // get and remember the Id of a given apex (class|page|trigger).
  _getEntityId(fullName, name, type) {
    if (this.entityIdCache[fullName]) {
      return Promise.resolve(this.entityIdCache[fullName]);
    }

    return this.org.tooling.query({ q: `SELECT Id FROM ${type} WHERE Name = '${name}'` })
    .then(({ records: [{ Id: id }] }) => {
      this.entityIdCache[fullName] = id;
      return id;
    });
  }

  _deleteContainer() {
    if (this.containerId) {
      this.org.tooling.deleteContainer({ id: this.containerId },
        err => { if (err) log.error(err); });
    }
    this.containerId = null;
    this.isSaving = false;
  }
}
