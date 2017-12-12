# atom-force

### This repository is no longer maintained

If you submit reasonable PRs, I will gladly merge them.

Lightweight [atom.io](https://github.com/atom/atom) Salesforce development plugin.

## Install

`File > Settings` or `ctrl-,`, then `Install`, then search for `atom-force`.

Via apm: `apm install atom-force`

## Setup

Do `Packages > atom-force > activate` after opening up your SF project directory. The first time, it will open a browser window and ask you to authenticate. Upon success, your oauth token is saved in your project's root directory in a file `.atomforce`. Next time you open up and do `activate`, atom-force will read your previous token and you can pick up where you left off.

Note: this is a big difference from how other IDEs work. This way your username/password is never stored in plain text. If your machine is ever compromised, you can de-authorize atom-force tokens via Salesforce UI and you will still be protected.

You can now add other orgs, which you can then deploy to via metadata API: `Packages > atom-force > Add org`.

Currently atom-force cannot download your org's metadata - the assumption is that you already have a git repository set up with your code in it. This functionality is on the roadmap. For now, use another IDE or use ant or solenopsis.

## Usage

Simply save any file whose extension matches `(cls|trigger|page|resource)` and atom-force will automatically save to your Salesforce environment. Any errors will be linted using linter. (Future: allow auto-save to be turned off, allowing the user to keybind to the save command).

## Roadmap
In order of priority:
* ~~Allow developer (production) orgs.~~
* ~~Deploy to target via Metadata API.~~
* ~~Add and remember deployment targets using oauth flow.~~


## Development notes
Code uses [ES6](https://github.com/lukehoban/es6features) and follows [airbnb style](https://github.com/airbnb/javascript). I recommend installing [linter-eslint](https://atom.io/packages/linter-eslint) to atom while working on this package to help keep style consistent.
#### Atom Dependencies
* [linter](https://atom.io/packages/linter)

#### Notable libraries used
* [nforce](https://github.com/kevinohara80/nforce)
* [nforce-tooling](https://github.com/jeffdonthemic/nforce-tooling)
 * **NOTE:** This project is currently using a forked version of nforce-tooling. It's a small change, but it seems the `update()` call isn't playing nice with promises. See [this PR](https://github.com/jeffdonthemic/nforce-tooling/pull/11). To work around this, either manually apply the above patch to nforce-tooling in your `node_modules` folder or clone my forked repo and symlink it in `node_modules`.
* [nforce-metadata](https://github.com/kevinohara80/nforce-metadata) - not currently used but targeted for the metadata API work.

Inspiration has been and will be taken from [vim-force](https://github.com/neowit/vim-force.com). It's easily the best Salesforce IDE out there.

## License

This project is licensed under the [GPLv2](https://github.com/mikegedelman/atom-force/blob/master/LICENSE).
