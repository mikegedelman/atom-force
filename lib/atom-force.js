'use babel';

import url from 'url';
import ElectronRemote from 'remote'; // http://electron.atom.io/docs/v0.34.0/api/remote/
const BrowserWindow = ElectronRemote.require('browser-window'); /* not sure if there's a way around
                                                                 * this that's more ES6y */

import log from './log.js';
import SfProject from './atom-force-project.js';

/* Everything that knows about atom is in this file. All of the other files in .lib
 * don't know about atom and focus on working with nforce or doing other specific jobs. */
export default class {
  init() {
    this.loadProjectData();
  }

  /* use our "SfProject" class to try to load project data, if that fails, then kick off a
   * user-agent flow. */
  loadProjectData() {
    this.sfProject = new SfProject(atom.project.getPaths()[0]);
    this.sfProject.on('projectLoaded', (msg) => { atom.notifications.addInfo(msg); });
    this.sfProject.on('projectError', (msg) => { atom.notifications.addError(msg); });

    this.sfProject.getProjectData().then(() => {
      this._hasForceNature = true;
      this._initProject();
    })
    .catch((err) => {
      log.error(err);
      this._hasForceNature = false;
      // TODO Add "Add force.com nature" option to menu.
      log.error('First folder has no Force.com nature.');
      this._getTokenUserAgent().then((data) => {
        this._hasForceNature = true;
        this.sfProject.writeProjectData(data);
        this._initProject();
      });
    });
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
      this.org.on('saveFailed', (_, details) => resolve(details));
      this.org.on('saveComplete', () => resolve(null));
    });
  }

  // bind to events and stuff once we know we have sfProject set up and ready
  _initProject() {
    this.org = this.sfProject.getConnection();

    // Bind to save events to show notifications.
    this.org.on('saveDeploy', (className) => {
      atom.notifications.addInfo(`Saving ${className}...`);
    });
    this.org.on('saveComplete', (className) => {
      atom.notifications.addSuccess(`${className} saved successfully.`);
    });
    this.org.on('saveFailed', (className, details) => {
      log.info(details);
      atom.notifications.addError(
        `Error saving ${className}: ${details.lineNumber}: ${details.problem}`);
    });
    this.org.on('saveError', (className, msg) => {
      atom.notifications.addError(`Error saving ${className}: ${msg}`);
    });
    this.org.on('err', (err) => {
      atom.notifications.addError(err);
    });

    // Tell Atom to save to SF via tooling API when user saves file.
    atom.workspace.observeTextEditors(editor => {
      const buffer = editor.getBuffer();
      if (buffer.file !== null) {
        editor.onDidSave(() => {
          this.org.saveTooling(editor.getTitle(), editor.getText());
        });
      }
    });
  }

  // use Electron to pop up a window and do the user-agent flow, capturing result.
  _getTokenUserAgent() {
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({ width: 800, height: 800, show: false });
      log.info(`project: ${this.sfProject}`);
      win.loadUrl(this.sfProject.conn.getAuthUri()); // TODO refresh tok
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
            resolve(params);
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
