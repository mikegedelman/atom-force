## RC 0.3.0
### Features
* Deploy via metadata API! After activating atom-force, right click one or more files and do `Deploy via Metadata API` or go to `Packages > atom-force > Deploy open tabs`.
* Deploy to other orgs via metadata API. atom-force menu > `Add org`, enter a name, choose sandbox or production, and then finish the oauth flow.
* Ability to choose sandbox/production when adding your main (first) org.


### Bug Fixes
* You can now save when the same file is open in multiple tabs without error.
* Fixed a (potential) memory leak where callbacks were continually added to SfConnection object each time you saved. (Switched from regular Linter API to Linter Indie API.)
* Reorganized a bunch of code, and then wrote a bunch more, which should probably be reoganized again.

## 0.2.1 - First APM Release!
