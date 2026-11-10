import { installPageReader } from "./page-reader.ts";

installPageReader({
  href: location.href, hash: location.hash,
  fetch: window.fetch.bind(window),
  replaceFetch: fetcher => { window.fetch = fetcher; },
  xhrPrototype: XMLHttpRequest.prototype,
  publish: message => window.postMessage(message, location.origin),
  delay: (callback, milliseconds) => setTimeout(callback, milliseconds),
});
