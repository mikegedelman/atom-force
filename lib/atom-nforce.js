'use babel';

import nforce from 'nforce';
import EventEmitter from 'events';
import log from './log.js';
import addNforceTooling from 'nforce-tooling';
addNforceTooling(nforce); // better ES6y way to import this?

const CLIENT_ID =
    '3MVG9xOCXq4ID1uHM155ZfXCXD8FgKFU8zNRnyt3JS07eYXfuhyjwlV0iw.BOS8mS6os74WuS.xCLXM_kG7un';

const EXT_TO_TYPE = {
  cls: 'ApexClass',
  trigger: 'ApexTrigger',
  apxt: 'ApexTrigger',
  page: 'ApexPage',
  resource: 'StaticResource',
};

const POLL_INTERVAL = 500; // ms to wait in between polling for status. TODO make this configurable

// use nforce to save stuff (and eventually do other stuff), and emit events.
export default class SfConnection extends EventEmitter {
  constructor(project) {
    super();
    this.org = nforce.createConnection({
      clientId: CLIENT_ID,
      redirectUri: 'https://test.salesforce.com/services/oauth2/success',
      mode: 'single',
      plugins: ['tooling'],
      environment: 'sandbox',
      autoRefresh: true,
    });
    this.entityIdCache = {};
    this.reqs = 0;
    this.project = project;

    this.project.on('projectLoaded', () => {
      this.org.oauth = this.project.projectData;
    });
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

  // TODO implement mutex or something to make sure this doesn't get called twice
  saveTooling(fullName, body) {
    const [, name, extension] = /^(\w+)\.(cls|page|trigger|resource)/.exec(fullName);
    const type = EXT_TO_TYPE[extension];
    this.emit('saveDeploy', fullName);
    if (type === 'StaticResource') {
      this._saveToolingOther(fullName, name, type, body);
    } else {
      this._saveToolingApex(fullName, name, type, body);
    }
  }

  // right now this is just for StaticResource which is why it base64's the body
  _saveToolingOther(fullName, name, type, body) {
    this._auth().then(() =>
      this._getEntityId(fullName, name, type))
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
   */
  _saveToolingApex(fullName, name, type, body) {
    const t = this.org.tooling;
    try {
      this._auth().then(() =>
        Promise.all([   // Create container + get class id
          this._getContainer(),
          this._getEntityId(fullName, name, type),
        ]))
      .then(([containerId, contentEntityId]) => { // Add container artfifact
        const artifact = t.createDeployArtifact(`${type}Member`, { body, contentEntityId });
        return t.addContainerArtifact({ id: containerId, artifact });
      })
      .then(() => t.deployContainer({ id: this.containerId, isCheckOnly: false }))
      .then(({ id: asyncContainerId }) => this._pollOnToolingDeploy(asyncContainerId))
      .then(() => {
        this.emit('saveComplete', fullName);
        this._deleteContainer();
      })
      .catch(err => {
        if (err.State === 'Failed') {
          this.emit('saveFailed', fullName, err.DeployDetails.componentFailures[0]);
        } else if (err.State === 'Error') {
          this.emit('saveError', fullName, err.ErrorMsg
                                           ? err.deployStatus.ErrorMsg
                                           : 'unknown error');
        } else {
          this.emit('saveError', fullName, err);
        }
        this._deleteContainer();
      });
    } catch (e) {
      this._deleteContainer();
      throw e;
    }
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
    }).catch(err => { console.log('here'); reject(err); });
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
  }

  /* Originally was doing auth lazily, waiting until the first save. this may be useful
   * in the future, otherwise I will kill it. */
  _auth() {
    if (!this.project.projectData) {
      return Promise.reject('Project not set up - no token found.');
    }
    return Promise.resolve(true);
  }
}
