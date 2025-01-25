const { JSDOM } = require('jsdom');
const dom = new JSDOM('');
const { window } = dom;
const { document } = window;

global.window = window;
global.document = document;
global.navigator = {
  userAgent: 'node.js',
};
global.MutationObserver = class {
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
};

const { registerCoreBlocks } = require('@wordpress/block-library');

registerCoreBlocks();
