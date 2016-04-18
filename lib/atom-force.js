'use babel';

import url from 'url';
import ElectronRemote from 'remote'; // http://electron.atom.io/docs/v0.34.0/api/remote/
const BrowserWindow = ElectronRemote.require('browser-window'); /* not sure if there's a way around
                                                                 * this that's more ES6y */

import log from './log.js';
import util from './util.js';
import SfProject from './atom-force-project.js';
import { EnvSelector } from './ui.js';

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

  addForceNature() {
    log.info('called addForceNature.');
    this._chooseEnv() // .then(() => this._clearHistory())
    .then((env) => this._getTokenUserAgent(env))
    .then((oauth, env) => {
      this._hasForceNature = true;
      this.sfProject.setPrimaryData(oauth, env);
    }).then(() => this.loadProjectData());
  }

  /* use atom package linter to lint apex code with any errors recieved from the server.
   * since lintOnFly == false, this will be called every time the user saves.
   * it binds to events on our current org (a SfConnection) and returns its promise when
   *  one of those events are fired.
   * https://github.com/steelbrain/linter/wiki/Linter-API */
  getLinter() {
    const _this = this;
    return {
      name: 'atom-force',
      grammarScopes: ['*'], // [*]will get it triggered regardless of grammar
      scope: 'file', // or 'project'
      lintOnFly: false,
      lint(textEditor) {
        const splitName = /^(\w+)\.(cls|page|trigger)/.exec(textEditor.getTitle());
        if (!splitName) return []; // only fire linter on apex-looking extensions

        return new Promise((resolve) => { // just never resolve if no errors?
          _this._getSaveErrors().then((details) => {
            if (details) {
              resolve([{
                type: 'Error',
                text: details.problem,
                range: [[details.lineNumber - 1, details.columnNumber],
                    [details.lineNumber - 1, details.columnNumber]],
                filePath: textEditor.getPath(),
              }]);
            } else {
              resolve([]);
            }
          });
        });
      },
    };
  }

  _getSaveErrors() {
    return new Promise((resolve) => {
      this.conn.on('saveFailed', (_, details) => resolve(details));
      this.conn.on('saveComplete', () => resolve(null));
    });
  }

  // bind to events and stuff once we know we have a project loaded.
  _initProject() {
    // Bind to save events to show notifications.
    this.conn.on('saveTooling', (className) => {
      atom.notifications.addInfo(`Saving ${className}...`);
    });
    this.conn.on('saveDeploy', () => {
      const win = new BrowserWindow({ width: 800, height: 800, show: false });
      log.info('opening deployment window');
      console.log(this.sfProject);
      const oauth = this.sfProject.conn.org.oauth;
      win.loadUrl(`${oauth.instance_url}/secur/frontdoor.jsp?sid=${oauth.access_token}` +
          `&retURL=${encodeURIComponent('/changemgmt/monitorDeployment.apexp')}`);
      win.setTitle('Deployment Status');
      win.show();
      win.openDevTools();
    });
    this.conn.on('saveComplete', (className) => {
      atom.notifications.addSuccess(`${className} saved successfully.`);
    });
    this.conn.on('saveFailed', (className, details) => {
      log.info(details);
      atom.notifications.addError(
        `Error saving ${className}: ${details.lineNumber}: ${details.problem}`);
    });
    this.conn.on('saveError', (className, msg) => {
      atom.notifications.addError(`Error saving ${className}: ${msg}`);
    });
    this.conn.on('err', (err) => {
      atom.notifications.addError(err);
    });

    // Tell atom about 'addOrg' command.
    atom.commands.add('atom-workspace', 'atom-force:addOrg', () => this.addOrg());
    atom.menu.add([{
      label: 'Packages',
      submenu: [{ label: 'atom-force',
        submenu: [{ label: 'Add Org', command: 'atom-force:addOrg' }] }] }]);

    // Add our 'deploy' option to context menus.
    atom.commands.add('.tree-view .file .name', 'atom-force:deploy',
      ({ target }) => {
        const fullpath = target.dataset.path;
        this.conn.deployMetadata([fullpath]);
      });

    // .tree-view.multi-select
    atom.contextMenu.add({
      '.tree-view .file .name': [{
        label: 'Deploy via Metadata API',
        command: 'atom-force:deploy',
      }],
    });

    // Tell Atom to save to SF via tooling API when user saves file.
    atom.workspace.observeTextEditors(editor => {
      const buffer = editor.getBuffer();
      if (buffer.file !== null) {
        editor.onDidSave(() => {
          this.conn.saveTooling(editor.getTitle(), editor.getText());
        });
      }
    });
  }

  addOrg() {
    this._chooseEnv()
    .then((env) => this._getTokenUserAgent(env))
    .then((oauth, env) => this.sfProject.addOrg(oauth, env))
    .then(err => {
      if (err) atom.notifications.addError(err);
      else atom.notifications.addInfo('Successfully added an org.');
    });
  }

  _chooseEnv() {
    return new Promise((resolve, reject) => {
      const envSelector = new EnvSelector();
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
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({ width: 800, height: 800, show: false });
      win.loadUrl(util.getAuthUri(env));
      win.setTitle('Authorize Atom Force');

      win.webContents.on('did-finish-load', () => {
        log.info(`got URL: ${win.getUrl()}`);
        const urlData = url.parse(win.getUrl());

        if (urlData.hash) {
          const params = {};
          urlData.hash.substring(1).split('&').forEach((str) => {
            const [key, val] = str.split('=');
            params[key] = unescape(val);
          });

          log.info(`got hash params ${params}`);
          if (params.access_token) {
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
