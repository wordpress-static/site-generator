#!/usr/bin/env node
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const dir = path.dirname(fs.realpathSync(process.argv[1]));
child_process.spawn('node', [dir + '/index.mjs', ...process.argv.slice(2)], {
	stdio: ['inherit', 'inherit', 'inherit'],
});
