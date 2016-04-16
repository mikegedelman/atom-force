'use babel';

import fs from 'fs';
const CLIENT_ID =
    '3MVG9xOCXq4ID1uHM155ZfXCXD8FgKFU8zNRnyt3JS07eYXfuhyjwlV0iw.BOS8mS6os74WuS.xCLXM_kG7un';

export default {
  // Simple promise wrapper around fs.readFile
  readFilePromise(path) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  },

  /* Instead of using nforce's, which requires you to create a connection, I do this here because
   * I haven't created a connection when I need it */
  getAuthUri(env) {
    const subDomain = env === 'sandbox' ? 'test' : 'login';
    const redirect = encodeURIComponent(
        `https://${subDomain}.salesforce.com/services/oauth2/success`);

    return `https://${subDomain}.salesforce.com/services/oauth2/authorize?response_type=token&` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${redirect}&scope=full+refresh_token`;
  },

  // Shortcut to add commands to atom-force submenu.
  addMenuItem(label, command) {
    atom.menu.add([{
      label: 'Packages',
      submenu: [{ label: 'atom-force',
        submenu: [{ label, command }] }] }]);
  },
};
