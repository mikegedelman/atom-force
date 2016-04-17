'use babel';

import { SelectListView } from 'atom-space-pen-views';
import EventEmitter from 'events';
import log from './log.js';

export class EnvSelector extends SelectListView {
  constructor() {
    super();
    this.setItems(['production', 'sandbox']);
    this.panel = atom.workspace.addModalPanel({ item: this, visible: false });
    this.panel.show();
    this.emitter = new EventEmitter();
    this.on = this.emitter.on;
  }

  viewForItem(item) {
    return `<li>${item}</li>`;
  }

  cancel() {
    super.cancel();
    this.emitter.emit('cancelled');
    this.panel.hide();
  }

  confirmed(sel) {
    log.info(`${sel} was selected`);
    this.emitter.emit('selected', sel);
    this.cancel();
  }
}

export class OrgSelector extends SelectListView {
  constructor() {
    super();
    this.setItems(['production', 'sandbox']);
    this.panel = atom.workspace.addModalPanel({ item: this, visible: false });
    this.panel.show();
    this.emitter = new EventEmitter();
    this.on = this.emitter.on;
  }

  viewForItem(item) {
    return `<li>${item}</li>`;
  }

  cancel() {
    super.cancel();
    this.emitter.emit('cancelled');
    this.panel.hide();
  }

  confirmed(sel) {
    log.info(`${sel} was selected`);
    this.emitter.emit('selected', sel);
    this.cancel();
  }
}
