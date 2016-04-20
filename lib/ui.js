'use babel';

import { SelectListView } from 'atom-space-pen-views';
import Dialog from './dialog';
import EventEmitter from 'events';
import log from './log.js';

// Show a selector that proposes multiple options and passes the selected text in a
// 'selected' event.
export class Selector extends SelectListView {
  constructor() {
    super();
    this.panel = atom.workspace.addModalPanel({ item: this, visible: false });
    this.panel.show();
    this.emitter = new EventEmitter();
    this.on = this.emitter.on;
  }

  viewForItem(item) {
    return `<li>${item.name}</li>`;
  }

  cancel() {
    super.cancel();
    this.emitter.emit('cancelled');
    this.panel.hide();
  }

  confirmed(sel) {
    log.info(`${sel.name} was selected`);
    this.emitter.emit('selected', sel);
    this.cancel();
  }
}

// Simple prompt at the top of the screen that passes you user input on 'confirmed' events
// See dialog.coffee
export class Prompt extends Dialog {
  constructor() {
    super({
      prompt: 'What should the new org entry be called?',
      select: false,
      iconClass: 'icon-file-add' });
    this.emitter = new EventEmitter();
  }

  onConfirm(input) {
    this.emitter.emit('confirmed', input);
    this.panel.hide();
  }
}
