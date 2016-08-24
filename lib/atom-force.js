'use babel';

import url from 'url';
import path from 'path';
import ElectronRemote from 'remote'; // http://electron.atom.io/docs/v0.34.0/api/remote/
const BrowserWindow = ElectronRemote.require('browser-window'); /* not sure if there's a way around
                                                                 * this that's more ES6y */

import log from './log.js';
import util from './util.js';
import SfProject from './atom-force-project.js';
import SfConnection from './atom-nforce.js';
import { Selector, Prompt } from './ui.js';
import { $ } from 'atom-space-pen-views';

import apd from 'atom-package-dependencies';
apd.install();

/* Everything that knows about atom is in this file. All of the other files in .lib
 * don't know about atom and focus on working with nforce or doing other specific jobs. */
export default class {
  init() {
    atom.commands.add('atom-workspace', 'atom-force:addForceNature', () => {
      log.info('called atom-force:addForceNature');
      this.addForceNature();
    });

    this.sfProject = new SfProject(atom.project.getPaths()[0]);
    this.sfProject.on('projectLoaded', (msg) => { atom.notifications.addInfo(msg); });
    this.sfProject.on('projectError', (msg) => { atom.notifications.addError(msg); });
    this.loadProjectData();
  }

  /* use our "SfProject" class to try to load project data, if that fails, then kick off a
   * user-agent flow. */
  loadProjectData() {
    this.sfProject.getPrimaryConnection().then(conn => {
      this._hasForceNature = true;
      this.conn = conn;
      this._initProject();
    })
    .catch((err) => {
      log.error(err);
      this._hasForceNature = false;
      // TODO Add "Add force.com nature" option to menu.
      log.info('First folder has no Force.com nature.');
      log.error(err);
      atom.notifications.addInfo('Root folder has no Force.com nature.' +
          'Set up a project via Packages > atom-force > Add/Change Force.com nature.');
    });
  }

  // Get credentials via implicit grant flow (salesforce calls it user-agent) and save them.
  addForceNature() {
    log.info('called addForceNature.');
    let env = '';
    this._chooseEnv()
    .then(({ name }) => {
      env = name;
      return this._getTokenUserAgent(env);
    })
    .then(oauth => {
      log.info(`env: ${env}`);
      this._hasForceNature = true;
      this.sfProject.setPrimaryData(oauth, env);
    }).then(() => this.loadProjectData());
  }

  // bind to events and stuff once we know we have a project loaded.
  _initProject() {
    // Bind to save events to show notifications.
    this.conn.on('saveTooling', (className) => {
      atom.notifications.addInfo(`Saving ${className}...`);
      console.log(this);
      this.busySignal.add(`Saving ${className}`);
    });

    this.conn.on('saveComplete', (className) => {
      atom.notifications.addSuccess(`${className} saved successfully.`);
      this.linter.setMessages([]);
      this.busySignal.clear();
    });

    this.conn.on('saveFailed', (fullPath, details) => {
      log.info(details);
      atom.notifications.addError(
        `Error saving ${path.basename(fullPath)}: ${details.lineNumber}: ${details.problem}`);
      this.linter.setMessages([{
        type: 'Error',
        text: details.problem,
        range: [[details.lineNumber - 1, details.columnNumber],
            [details.lineNumber - 1, details.columnNumber]],
        filePath: fullPath,
      }]);
    });
    this.conn.on('saveError', (className, msg) => {
      atom.notifications.addError(`Error saving ${className}: ${msg}`);
    });
    this.conn.on('err', (err) => {
      atom.notifications.addError(err);
    });
    this._listenDeploy(this.conn);

    // Tell atom about 'addOrg' command.
    atom.commands.add('atom-workspace', 'atom-force:addOrg', () => this.addOrg());
    util.addMenuItem('Add Org', 'atom-force:addOrg');

    // Context menu: deploy selected files.
    atom.commands.add('atom-workspace', 'atom-force:deploySelected', () => {
      // using jquery here is really hacky, but this stuff is not documented very well.
      const elements = $('.selected span');
      const filenames = [];
      elements.each((_, ele) => filenames.push(ele.getAttribute('data-path')));
      this._deployFiles(filenames); // just one
    });

    // Menu bar menu: deploy files currently open.
    atom.commands.add('atom-workspace', 'atom-force:deployOpenTabs', () => {
      const filenames = [];
      atom.textEditors.editors.forEach(ed => filenames.push(ed.getPath()));
      this._deployFiles(filenames);
    });
    util.addMenuItem('Deploy Open Tabs', 'atom-force:deployOpenTabs');

    atom.contextMenu.add({
      '.tree-view .file .name': [{
        label: 'Deploy via Metadata API',
        command: 'atom-force:deploySelected',
      }],
    });

    // Tell Atom to save to SF via tooling API when user saves file.
    atom.workspace.observeTextEditors(editor => {
      const buffer = editor.getBuffer();
      if (buffer.file !== null) {
        editor.onDidSave(() => {
          this.conn.saveTooling(editor.getPath(), editor.getText());
        });
      }
    });
  }

  // pick and org and then kick off a metadata deploy.
  _deployFiles(filenames) {
    let projectData = {};
    this._chooseOrg().then(data => { projectData = data; })
    .then(() => this._prompt('Run which tests? (blank for all)'))
    .then(tests => {
      if (projectData.name === 'Primary') {
        this.conn.deployMetadata(filenames);
      } else {
        const tempConn =
            new SfConnection(projectData.oauth, projectData.env);
        this._listenDeploy(tempConn);
        tempConn.deployMetadata(filenames, tests);
      }
    });
  }

  // add listeners to a SfConnection - open a window with deployment status, catch messages
  _listenDeploy(conn) {
    const win = new BrowserWindow({
      width: 900,
      height: 500,
      show: false,
      'node-integration': false,
      'web-preferences': { javascript: true },
    });
    conn.on('saveDeploy', oauth => {
      log.info('opening deployment window');
      win.loadUrl(`${oauth.instance_url}/secur/frontdoor.jsp?sid=${oauth.access_token}` +
          `&retURL=${encodeURIComponent('/changemgmt/monitorDeployment.apexp')}`);
      win.setTitle('Deployment Status');
      win.show();
      atom.notifications.addInfo('Deployment started.');
    });
    conn.on('deployFailed', msg => {
      win.hide();
      log.error(msg);
      atom.notifications.addError(JSON.stringify(msg));
    });
  }

  // add a new org that can then be deployed to.
  addOrg() {
    let env = '';
    let orgName = '';

    this._prompt('What should the org be called?').then(input => { orgName = input; })
    .then(() => this._chooseEnv())
    .then(({ name }) => {
      env = name;
      return this._getTokenUserAgent(env);
    })
    .then(oauth => this.sfProject.addOrg(orgName, oauth, env))
    .then(err => {
      if (err) atom.notifications.addError(err);
      else atom.notifications.addInfo('Successfully added an org.');
    })
    .catch(err => {
      // atom.notifications.addError(JSON.stringify(err));
      log.error(err);
    });
  }

  // use dialog.coffee file to show a mini prompt and capture the input result.
  _prompt() {
    return new Promise((resolve) => {
      const prompt = new Prompt('');
      prompt.attach();
      prompt.emitter.on('confirmed', input => resolve(input));
    });
  }

  // show a selector with production/sandbox
  _chooseEnv() {
    return new Promise((resolve, reject) => {
      const envSelector = new Selector();
      envSelector.setItems([{ name: 'production' }, { name: 'sandbox' }]);
      envSelector.emitter.on('selected', sel => {
        log.info(sel);
        resolve(sel);
      });
      envSelector.on('cancelled', () => reject());
    });
  }

  // For deploying via metadata, show a list of all our orgs to choose from
  _chooseOrg() {
    return new Promise((resolve, reject) => {
      const envSelector = new Selector();
      envSelector.setItems(this.sfProject.getOrgs());
      envSelector.emitter.on('selected', sel => {
        log.info(sel);
        resolve(sel);
      });
      envSelector.on('cancelled', () => reject());
    });
  }


  /* use Electron to pop up a window and do the user-agent flow, capturing result.
   * TODO: there's a potential problem if you've used this to set up multiple orgs,
   * it can take you to a specific domain instead of test.salesforce.com. */
  _getTokenUserAgent(env) {
    log.info(env);
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({ width: 800, height: 800, show: false });
      win.loadUrl(util.getAuthUri(env));
      win.setTitle('Authorize Atom Force');

      win.webContents.on('did-finish-load', () => {
        log.info(`got URL: ${win.getUrl()}`);
        const urlData = url.parse(win.getUrl());

        if (urlData.hash) {
          const params = {};
          urlData.hash.substring(1).split('&').forEach(str => {
            const [key, val] = str.split('=');
            params[key] = unescape(val);
          });

          log.info(`got hash params ${params}`);
          if (params.access_token) {
            log.info(`env: ${env}`);
            resolve(params, env);
            win.hide();
          } else {
            reject(params);
          }
        }
      });
      win.show();
    });
  }
}
