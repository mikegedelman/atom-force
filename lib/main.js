'use babel';

import AtomForce from './atom-force.js';
import log from './log.js';

const atomForce = new AtomForce();

export default {
  activate() {
    atomForce.init();
  },
  deactivate() { log.info('atom-force deactivate()'); }, // TODO add destroy
  provideLinter() { return atomForce.getLinter(); },
};
