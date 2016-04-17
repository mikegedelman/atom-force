'use babel';

import fs from 'fs';
import nforce from 'nforce';
const CLIENT_ID =
    '3MVG9xOCXq4ID1uHM155ZfXCXD8FgKFU8zNRnyt3JS07eYXfuhyjwlV0iw.BOS8mS6os74WuS.xCLXM_kG7un';

export default {
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

  getAuthUri(env) {
    const subDomain = env === 'sandbox' ? 'test' : 'login';
    const org = nforce.createConnection({
      clientId: CLIENT_ID,
      redirectUri: `https://${subDomain}.salesforce.com/services/oauth2/success`,
      mode: 'single',
      environment: env,
    });
    return org.getAuthUri({
      responseType: 'token',
      scope: ['full', 'refresh_token'],
    });
  },
};
