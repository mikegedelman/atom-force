# atom-force

Lightweight [atom.io](https://github.com/atom/atom) Salesforce development plugin.

Primary goal is seamless atom.io integration. Utilize the growing atom.io ecosystem of packages and play to its strengths as an editor as much as possible. For example, compile error messages are linted in code using [linter](https://github.com/steelbrain/linter). And no, you do not have to have a separate app or server running to use it!

Other goals:
* Minimal configuration to set up and start working, while not sacrificing configurability.
 * Example: most IDEs require you to create a new folder and download code from your target org to set up a project. This can be a major headache when working with git - you already have the code ready, you just need to save stuff. atom-force will work immediately with an existing folder, requiring you to log in only once and do zero setup.
* Focus on development tools that matter most, such as ability to diff with server and other orgs. No Salesforce IDE I know of gets this right currently - please correct me if I'm wrong.
* Flexibility: play nicely with other plugins, IDEs, etc.
 * Example: atom doesn't care how your folder structure is setup - as long as your files are named like expected (ex: `MyClass.cls`) then it can figure out what you're trying to save to.

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

## Known Issues

This project is in active development, and is by no means stable. Please log issues as you feel necessary with bugs or ideas.

* Save blows up multiple tabs open. One tab at a time for now.
* Activating on a new project assumes you're in a sandbox environment and doesn't give you the option to specify otherwise - this is the next item on the roadmap.

## Roadmap
In order of priority:
* ~~Allow developer (production) orgs.~~
* ~~Deploy to target via Metadata API.~~
* ~~Add and remember deployment targets using oauth flow.~~
* Pull all files from server / initialize new project.
* Extend linting functionality to catch syntax errors as you type, before attempting to save to the server.
* Ability to diff files or folders with version on the server via an atom package (TBD) or diff program of your choice.
* Deploy to target via Tooling API. (Sandbox/Developer only)

If you think one of these should be higher, please consider submitting a pull request!

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
