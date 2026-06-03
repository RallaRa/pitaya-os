/** Node 18 — cheerio/undici 호환 */
if (typeof globalThis.File === 'undefined') {
  const { Blob } = require('buffer');
  globalThis.File = class File extends Blob {
    constructor(chunks, filename, opts = {}) {
      super(chunks, opts);
      this.name = filename;
      this.lastModified = opts.lastModified ?? Date.now();
    }
  };
}
