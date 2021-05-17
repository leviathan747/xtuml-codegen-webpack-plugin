#!/usr/bin/env node

const changelog = require('keepachangelog');
const readJson = require('read-package-json');

function cmpVer(v1, v2, descending=true) {
  if (descending) return cmpVer(v2, v1, false);
  if (v1 === 'upcoming') return 1;
  if (v2 === 'upcoming') return -1;
  return v1.split('.').map((v, i) => parseInt(v) - parseInt(v2.split('.')[i])).find(n => n) || 0;
}

async function updateChangeLog() {

  try {

    // parse the changelog
    const cl = await changelog.read('CHANGELOG.md');

    //console.log(JSON.stringify(cl, null, 2));

    // get unreleased changes
    const upcoming = cl.getRelease('upcoming');
    if (!((upcoming.Added && upcoming.Added.length) ||
          (upcoming.Changed && upcoming.Changed.length) ||
          (upcoming.Deprecated && upcoming.Deprecated.length) ||
          (upcoming.Removed && upcoming.Removed.length) ||
          (upcoming.Fixed && upcoming.Fixed.length) ||
          (upcoming.Security && upcoming.Security.length))) return;  // don't update if no changes

    // get the current version
    const pkgJson = await new Promise((resolve, reject) => {
      readJson('package.json', (err, data) => {
        if (err) { reject(err); }
        resolve(data);
      });
    });

    // create a new release
    let new_release = cl.releases.find(r => r.version === pkgJson.version);
    if (!new_release) {
      const date = new Date().toISOString().split('T')[0];
      const version = pkgJson.version
      new_release = {
        version,
        date,
        title: [
          ['link_ref', {ref: version, original: `[${version}]`}, version],
          ` - ${date}`
        ],
      };
      cl.releases.push(new_release);
    }
    new_release.Added = (upcoming.Added && upcoming.Added.length) ? upcoming.Added : undefined,
    new_release.Changed = (upcoming.Changed && upcoming.Changed.length) ? upcoming.Changed : undefined,
    new_release.Deprecated = (upcoming.Deprecated && upcoming.Deprecated.length) ? upcoming.Deprecated : undefined,
    new_release.Removed = (upcoming.Removed && upcoming.Removed.length) ? upcoming.Removed : undefined,
    new_release.Fixed = (upcoming.Fixed && upcoming.Fixed.length) ? upcoming.Fixed : undefined,
    new_release.Security = (upcoming.Security && upcoming.Security.length) ? upcoming.Security : undefined,

    // reset the unreleased changes
    upcoming.Added = [];
    upcoming.Changed = [];
    upcoming.Deprecated = [];
    upcoming.Removed = [];
    upcoming.Fixed = [];
    upcoming.Security = [];

    // sort by version
    cl.releases.sort((a, b) => cmpVer(a.version, b.version));

    // serialize the changelog
    await cl.write('CHANGELOG.md');

  } catch (e) {
    console.error('Could not update changelog', e);
  }

}

updateChangeLog();
