'use babel';

import { CompositeDisposable } from 'atom';
import AtomForce from './atom-force.js';
import log from './log.js';

const atomForce = new AtomForce();

export default {
  activate() {
    atomForce.init();
    this.subscriptions = new CompositeDisposable();
  },
  deactivate() { log.info('atom-force deactivate()'); this.subscriptions.dispose(); },
  consumeLinter(indieRegistry) {
    const afLinter = indieRegistry.register({ name: 'atom-force' });
    this.subscriptions.add(afLinter);
    atomForce.linter = afLinter;
  },
};
