function isCompatible() {
  return !!('querySelector'in document && 'localStorage'in window && typeof Promise === 'function' && Promise.prototype['finally'] && (function() {
      try {
          new Function('(a = 0) => a');
          return true;
      } catch (e) {
          return false;
      }
  }()) && /./g.flags === 'g');
}
if (!isCompatible()) {
  document.documentElement.className = document.documentElement.className.replace(/(^|\s)client-js(\s|$)/, '$1client-nojs$2');
  while (window.NORLQ && NORLQ[0]) {
      NORLQ.shift()();
  }
  NORLQ = {
      push: function(fn) {
          fn();
      }
  };
  RLQ = {
      push: function() {}
  };
} else {
  if (window.performance && performance.mark) {
      performance.mark('mwStartup');
  }
  (function() {
      'use strict';
      var con = window.console;
      function Map() {
          this.values = Object.create(null);
      }
      Map.prototype = {
          constructor: Map,
          get: function(selection, fallback) {
              if (arguments.length < 2) {
                  fallback = null;
              }
              if (typeof selection === 'string') {
                  return selection in this.values ? this.values[selection] : fallback;
              }
              var results;
              if (Array.isArray(selection)) {
                  results = {};
                  for (var i = 0; i < selection.length; i++) {
                      if (typeof selection[i] === 'string') {
                          results[selection[i]] = selection[i]in this.values ? this.values[selection[i]] : fallback;
                      }
                  }
                  return results;
              }
              if (selection === undefined) {
                  results = {};
                  for (var key in this.values) {
                      results[key] = this.values[key];
                  }
                  return results;
              }
              return fallback;
          },
          set: function(selection, value) {
              if (arguments.length > 1) {
                  if (typeof selection === 'string') {
                      this.values[selection] = value;
                      return true;
                  }
              } else if (typeof selection === 'object') {
                  for (var key in selection) {
                      this.values[key] = selection[key];
                  }
                  return true;
              }
              return false;
          },
          exists: function(selection) {
              return typeof selection === 'string' && selection in this.values;
          }
      };
      var log = function() {};
      log.warn = Function.prototype.bind.call(con.warn, con);
      var mw = {
          now: function() {
              var perf = window.performance;
              var navStart = perf && perf.timing && perf.timing.navigationStart;
              mw.now = navStart && perf.now ? function() {
                  return navStart + perf.now();
              }
              : Date.now;
              return mw.now();
          },
          trackQueue: [],
          trackError: function(data) {
              if (mw.track) {
                  mw.track('resourceloader.exception', data);
              } else {
                  mw.trackQueue.push({
                      topic: 'resourceloader.exception',
                      args: [data]
                  });
              }
              var e = data.exception;
              var msg = (e ? 'Exception' : 'Error') + ' in ' + data.source + (data.module ? ' in module ' + data.module : '') + (e ? ':' : '.');
              con.log(msg);
              if (e) {
                  con.warn(e);
              }
          },
          Map: Map,
          config: new Map(),
          messages: new Map(),
          templates: new Map(),
          log: log
      };
      window.mw = window.mediaWiki = mw;
      window.QUnit = undefined;
  }());
  (function() {
      'use strict';
      var store, hasOwn = Object.hasOwnProperty;
      function fnv132(str) {
          var hash = 0x811C9DC5;
          for (var i = 0; i < str.length; i++) {
              hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
              hash ^= str.charCodeAt(i);
          }
          hash = (hash >>> 0).toString(36).slice(0, 5);
          while (hash.length < 5) {
              hash = '0' + hash;
          }
          return hash;
      }
      var registry = Object.create(null), sources = Object.create(null), handlingPendingRequests = false, pendingRequests = [], queue = [], jobs = [], willPropagate = false, errorModules = [], baseModules = ["jquery", "mediawiki.base"], marker = document.querySelector('meta[name="ResourceLoaderDynamicStyles"]'), lastCssBuffer;
      function addToHead(el, nextNode) {
          if (nextNode && nextNode.parentNode) {
              nextNode.parentNode.insertBefore(el, nextNode);
          } else {
              document.head.appendChild(el);
          }
      }
      function newStyleTag(text, nextNode) {
          var el = document.createElement('style');
          el.appendChild(document.createTextNode(text));
          addToHead(el, nextNode);
          return el;
      }
      function flushCssBuffer(cssBuffer) {
          if (cssBuffer === lastCssBuffer) {
              lastCssBuffer = null;
          }
          newStyleTag(cssBuffer.cssText, marker);
          for (var i = 0; i < cssBuffer.callbacks.length; i++) {
              cssBuffer.callbacks[i]();
          }
      }
      function addEmbeddedCSS(cssText, callback) {
          if (!lastCssBuffer || cssText.startsWith('@import')) {
              lastCssBuffer = {
                  cssText: '',
                  callbacks: []
              };
              requestAnimationFrame(flushCssBuffer.bind(null, lastCssBuffer));
          }
          lastCssBuffer.cssText += '\n' + cssText;
          lastCssBuffer.callbacks.push(callback);
      }
      function getCombinedVersion(modules) {
          var hashes = modules.reduce(function(result, module) {
              return result + registry[module].version;
          }, '');
          return fnv132(hashes);
      }
      function allReady(modules) {
          for (var i = 0; i < modules.length; i++) {
              if (mw.loader.getState(modules[i]) !== 'ready') {
                  return false;
              }
          }
          return true;
      }
      function allWithImplicitReady(module) {
          return allReady(registry[module].dependencies) && (baseModules.indexOf(module) !== -1 || allReady(baseModules));
      }
      function anyFailed(modules) {
          for (var i = 0; i < modules.length; i++) {
              var state = mw.loader.getState(modules[i]);
              if (state === 'error' || state === 'missing') {
                  return modules[i];
              }
          }
          return false;
      }
      function doPropagation() {
          var didPropagate = true;
          var module;
          while (didPropagate) {
              didPropagate = false;
              while (errorModules.length) {
                  var errorModule = errorModules.shift()
                    , baseModuleError = baseModules.indexOf(errorModule) !== -1;
                  for (module in registry) {
                      if (registry[module].state !== 'error' && registry[module].state !== 'missing') {
                          if (baseModuleError && baseModules.indexOf(module) === -1) {
                              registry[module].state = 'error';
                              didPropagate = true;
                          } else if (registry[module].dependencies.indexOf(errorModule) !== -1) {
                              registry[module].state = 'error';
                              errorModules.push(module);
                              didPropagate = true;
                          }
                      }
                  }
              }
              for (module in registry) {
                  if (registry[module].state === 'loaded' && allWithImplicitReady(module)) {
                      execute(module);
                      didPropagate = true;
                  }
              }
              for (var i = 0; i < jobs.length; i++) {
                  var job = jobs[i];
                  var failed = anyFailed(job.dependencies);
                  if (failed !== false || allReady(job.dependencies)) {
                      jobs.splice(i, 1);
                      i -= 1;
                      try {
                          if (failed !== false && job.error) {
                              job.error(new Error('Failed dependency: ' + failed), job.dependencies);
                          } else if (failed === false && job.ready) {
                              job.ready();
                          }
                      } catch (e) {
                          mw.trackError({
                              exception: e,
                              source: 'load-callback'
                          });
                      }
                      didPropagate = true;
                  }
              }
          }
          willPropagate = false;
      }
      function setAndPropagate(module, state) {
          registry[module].state = state;
          if (state === 'ready') {
              store.add(module);
          } else if (state === 'error' || state === 'missing') {
              errorModules.push(module);
          } else if (state !== 'loaded') {
              return;
          }
          if (willPropagate) {
              return;
          }
          willPropagate = true;
          mw.requestIdleCallback(doPropagation, {
              timeout: 1
          });
      }
      function sortDependencies(module, resolved, unresolved) {
          if (!(module in registry)) {
              throw new Error('Unknown module: ' + module);
          }
          if (typeof registry[module].skip === 'string') {
              var skip = (new Function(registry[module].skip)());
              registry[module].skip = !!skip;
              if (skip) {
                  registry[module].dependencies = [];
                  setAndPropagate(module, 'ready');
                  return;
              }
          }
          if (!unresolved) {
              unresolved = new Set();
          }
          var deps = registry[module].dependencies;
          unresolved.add(module);
          for (var i = 0; i < deps.length; i++) {
              if (resolved.indexOf(deps[i]) === -1) {
                  if (unresolved.has(deps[i])) {
                      throw new Error('Circular reference detected: ' + module + ' -> ' + deps[i]);
                  }
                  sortDependencies(deps[i], resolved, unresolved);
              }
          }
          resolved.push(module);
      }
      function resolve(modules) {
          var resolved = baseModules.slice();
          for (var i = 0; i < modules.length; i++) {
              sortDependencies(modules[i], resolved);
          }
          return resolved;
      }
      function resolveStubbornly(modules) {
          var resolved = baseModules.slice();
          for (var i = 0; i < modules.length; i++) {
              var saved = resolved.slice();
              try {
                  sortDependencies(modules[i], resolved);
              } catch (err) {
                  resolved = saved;
                  mw.log.warn('Skipped unavailable module ' + modules[i]);
                  if (modules[i]in registry) {
                      mw.trackError({
                          exception: err,
                          source: 'resolve'
                      });
                  }
              }
          }
          return resolved;
      }
      function resolveRelativePath(relativePath, basePath) {
          var relParts = relativePath.match(/^((?:\.\.?\/)+)(.*)$/);
          if (!relParts) {
              return null;
          }
          var baseDirParts = basePath.split('/');
          baseDirParts.pop();
          var prefixes = relParts[1].split('/');
          prefixes.pop();
          var prefix;
          var reachedRoot = false;
          while ((prefix = prefixes.pop()) !== undefined) {
              if (prefix === '..') {
                  reachedRoot = !baseDirParts.length || reachedRoot;
                  if (!reachedRoot) {
                      baseDirParts.pop();
                  } else {
                      baseDirParts.push(prefix);
                  }
              }
          }
          return (baseDirParts.length ? baseDirParts.join('/') + '/' : '') + relParts[2];
      }
      function makeRequireFunction(moduleObj, basePath) {
          return function require(moduleName) {
              var fileName = resolveRelativePath(moduleName, basePath);
              if (fileName === null) {
                  return mw.loader.require(moduleName);
              }
              if (hasOwn.call(moduleObj.packageExports, fileName)) {
                  return moduleObj.packageExports[fileName];
              }
              var scriptFiles = moduleObj.script.files;
              if (!hasOwn.call(scriptFiles, fileName)) {
                  throw new Error('Cannot require undefined file ' + fileName);
              }
              var result, fileContent = scriptFiles[fileName];
              if (typeof fileContent === 'function') {
                  var moduleParam = {
                      exports: {}
                  };
                  fileContent(makeRequireFunction(moduleObj, fileName), moduleParam, moduleParam.exports);
                  result = moduleParam.exports;
              } else {
                  result = fileContent;
              }
              moduleObj.packageExports[fileName] = result;
              return result;
          }
          ;
      }
      function addScript(src, callback, modules) {
          var script = document.createElement('script');
          script.src = src;
          function onComplete() {
              if (script.parentNode) {
                  script.parentNode.removeChild(script);
              }
              if (callback) {
                  callback();
                  callback = null;
              }
          }
          script.onload = onComplete;
          script.onerror = function() {
              onComplete();
              if (modules) {
                  for (var i = 0; i < modules.length; i++) {
                      setAndPropagate(modules[i], 'error');
                  }
              }
          }
          ;
          document.head.appendChild(script);
          return script;
      }
      function queueModuleScript(src, moduleName, callback) {
          pendingRequests.push(function() {
              if (moduleName !== 'jquery') {
                  window.require = mw.loader.require;
                  window.module = registry[moduleName].module;
              }
              addScript(src, function() {
                  delete window.module;
                  callback();
                  if (pendingRequests[0]) {
                      pendingRequests.shift()();
                  } else {
                      handlingPendingRequests = false;
                  }
              });
          });
          if (!handlingPendingRequests && pendingRequests[0]) {
              handlingPendingRequests = true;
              pendingRequests.shift()();
          }
      }
      function addLink(url, media, nextNode) {
          var el = document.createElement('link');
          el.rel = 'stylesheet';
          if (media) {
              el.media = media;
          }
          el.href = url;
          addToHead(el, nextNode);
          return el;
      }
      function globalEval(code) {
          var script = document.createElement('script');
          script.text = code;
          document.head.appendChild(script);
          script.parentNode.removeChild(script);
      }
      function indirectEval(code) {
          (1,
          eval)(code);
      }
      function enqueue(dependencies, ready, error) {
          if (allReady(dependencies)) {
              if (ready) {
                  ready();
              }
              return;
          }
          var failed = anyFailed(dependencies);
          if (failed !== false) {
              if (error) {
                  error(new Error('Dependency ' + failed + ' failed to load'), dependencies);
              }
              return;
          }
          if (ready || error) {
              jobs.push({
                  dependencies: dependencies.filter(function(module) {
                      var state = registry[module].state;
                      return state === 'registered' || state === 'loaded' || state === 'loading' || state === 'executing';
                  }),
                  ready: ready,
                  error: error
              });
          }
          dependencies.forEach(function(module) {
              if (registry[module].state === 'registered' && queue.indexOf(module) === -1) {
                  queue.push(module);
              }
          });
          mw.loader.work();
      }
      function execute(module) {
          if (registry[module].state !== 'loaded') {
              throw new Error('Module in state "' + registry[module].state + '" may not execute: ' + module);
          }
          registry[module].state = 'executing';
          var runScript = function() {
              var script = registry[module].script;
              var markModuleReady = function() {
                  setAndPropagate(module, 'ready');
              };
              var nestedAddScript = function(arr, offset) {
                  if (offset >= arr.length) {
                      markModuleReady();
                      return;
                  }
                  queueModuleScript(arr[offset], module, function() {
                      nestedAddScript(arr, offset + 1);
                  });
              };
              try {
                  if (Array.isArray(script)) {
                      nestedAddScript(script, 0);
                  } else if (typeof script === 'function') {
                      if (module === 'jquery') {
                          script();
                      } else {
                          script(window.$, window.$, mw.loader.require, registry[module].module);
                      }
                      markModuleReady();
                  } else if (typeof script === 'object' && script !== null) {
                      var mainScript = script.files[script.main];
                      if (typeof mainScript !== 'function') {
                          throw new Error('Main file in module ' + module + ' must be a function');
                      }
                      mainScript(makeRequireFunction(registry[module], script.main), registry[module].module, registry[module].module.exports);
                      markModuleReady();
                  } else if (typeof script === 'string') {
                      globalEval(script);
                      markModuleReady();
                  } else {
                      markModuleReady();
                  }
              } catch (e) {
                  setAndPropagate(module, 'error');
                  mw.trackError({
                      exception: e,
                      module: module,
                      source: 'module-execute'
                  });
              }
          };
          if (registry[module].deprecationWarning) {
              mw.log.warn(registry[module].deprecationWarning);
          }
          if (registry[module].messages) {
              mw.messages.set(registry[module].messages);
          }
          if (registry[module].templates) {
              mw.templates.set(module, registry[module].templates);
          }
          var cssPending = 0;
          var cssHandle = function() {
              cssPending++;
              return function() {
                  cssPending--;
                  if (cssPending === 0) {
                      var runScriptCopy = runScript;
                      runScript = undefined;
                      runScriptCopy();
                  }
              }
              ;
          };
          var style = registry[module].style;
          if (style) {
              if ('css'in style) {
                  for (var i = 0; i < style.css.length; i++) {
                      addEmbeddedCSS(style.css[i], cssHandle());
                  }
              }
              if ('url'in style) {
                  for (var media in style.url) {
                      var urls = style.url[media];
                      for (var j = 0; j < urls.length; j++) {
                          addLink(urls[j], media, marker);
                      }
                  }
              }
          }
          if (module === 'user') {
              var siteDeps;
              var siteDepErr;
              try {
                  siteDeps = resolve(['site']);
              } catch (e) {
                  siteDepErr = e;
                  runScript();
              }
              if (!siteDepErr) {
                  enqueue(siteDeps, runScript, runScript);
              }
          } else if (cssPending === 0) {
              runScript();
          }
      }
      function sortQuery(o) {
          var sorted = {};
          var list = [];
          for (var key in o) {
              list.push(key);
          }
          list.sort();
          for (var i = 0; i < list.length; i++) {
              sorted[list[i]] = o[list[i]];
          }
          return sorted;
      }
      function buildModulesString(moduleMap) {
          var str = [];
          var list = [];
          var p;
          function restore(suffix) {
              return p + suffix;
          }
          for (var prefix in moduleMap) {
              p = prefix === '' ? '' : prefix + '.';
              str.push(p + moduleMap[prefix].join(','));
              list.push.apply(list, moduleMap[prefix].map(restore));
          }
          return {
              str: str.join('|'),
              list: list
          };
      }
      function makeQueryString(params) {
          var str = '';
          for (var key in params) {
              str += (str ? '&' : '') + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
          }
          return str;
      }
      function batchRequest(batch) {
          if (!batch.length) {
              return;
          }
          var sourceLoadScript, currReqBase, moduleMap;
          function doRequest() {
              var query = Object.create(currReqBase)
                , packed = buildModulesString(moduleMap);
              query.modules = packed.str;
              query.version = getCombinedVersion(packed.list);
              query = sortQuery(query);
              addScript(sourceLoadScript + '?' + makeQueryString(query), null, packed.list);
          }
          batch.sort();
          var reqBase = {
              "lang": "bg",
              "skin": "vector-2022"
          };
          var splits = Object.create(null);
          for (var b = 0; b < batch.length; b++) {
              var bSource = registry[batch[b]].source;
              var bGroup = registry[batch[b]].group;
              if (!splits[bSource]) {
                  splits[bSource] = Object.create(null);
              }
              if (!splits[bSource][bGroup]) {
                  splits[bSource][bGroup] = [];
              }
              splits[bSource][bGroup].push(batch[b]);
          }
          for (var source in splits) {
              sourceLoadScript = sources[source];
              for (var group in splits[source]) {
                  var modules = splits[source][group];
                  currReqBase = Object.create(reqBase);
                  if (group === 0 && mw.config.get('wgUserName') !== null) {
                      currReqBase.user = mw.config.get('wgUserName');
                  }
                  var currReqBaseLength = makeQueryString(currReqBase).length + 23;
                  var length = 0;
                  moduleMap = Object.create(null);
                  for (var i = 0; i < modules.length; i++) {
                      var lastDotIndex = modules[i].lastIndexOf('.')
                        , prefix = modules[i].slice(0, Math.max(0, lastDotIndex))
                        , suffix = modules[i].slice(lastDotIndex + 1)
                        , bytesAdded = moduleMap[prefix] ? suffix.length + 3 : modules[i].length + 3;
                      if (length && length + currReqBaseLength + bytesAdded > mw.loader.maxQueryLength) {
                          doRequest();
                          length = 0;
                          moduleMap = Object.create(null);
                      }
                      if (!moduleMap[prefix]) {
                          moduleMap[prefix] = [];
                      }
                      length += bytesAdded;
                      moduleMap[prefix].push(suffix);
                  }
                  doRequest();
              }
          }
      }
      function asyncEval(implementations, cb, offset) {
          if (!implementations.length) {
              return;
          }
          offset = offset || 0;
          mw.requestIdleCallback(function(deadline) {
              asyncEvalTask(deadline, implementations, cb, offset);
          });
      }
      function asyncEvalTask(deadline, implementations, cb, offset) {
          for (var i = offset; i < implementations.length; i++) {
              if (deadline.timeRemaining() <= 0) {
                  asyncEval(implementations, cb, i);
                  return;
              }
              try {
                  indirectEval(implementations[i]);
              } catch (err) {
                  cb(err);
              }
          }
      }
      function getModuleKey(module) {
          return module in registry ? (module + '@' + registry[module].version) : null;
      }
      function splitModuleKey(key) {
          var index = key.lastIndexOf('@');
          if (index === -1 || index === 0) {
              return {
                  name: key,
                  version: ''
              };
          }
          return {
              name: key.slice(0, index),
              version: key.slice(index + 1)
          };
      }
      function registerOne(module, version, dependencies, group, source, skip) {
          if (module in registry) {
              throw new Error('module already registered: ' + module);
          }
          registry[module] = {
              module: {
                  exports: {}
              },
              packageExports: {},
              version: version || '',
              dependencies: dependencies || [],
              group: typeof group === 'undefined' ? null : group,
              source: typeof source === 'string' ? source : 'local',
              state: 'registered',
              skip: typeof skip === 'string' ? skip : null
          };
      }
      mw.loader = {
          moduleRegistry: registry,
          maxQueryLength: 5000,
          addStyleTag: newStyleTag,
          addScriptTag: addScript,
          addLinkTag: addLink,
          enqueue: enqueue,
          resolve: resolve,
          work: function() {
              store.init();
              var q = queue.length
                , storedImplementations = []
                , storedNames = []
                , requestNames = []
                , batch = new Set();
              while (q--) {
                  var module = queue[q];
                  if (mw.loader.getState(module) === 'registered' && !batch.has(module)) {
                      registry[module].state = 'loading';
                      batch.add(module);
                      var implementation = store.get(module);
                      if (implementation) {
                          storedImplementations.push(implementation);
                          storedNames.push(module);
                      } else {
                          requestNames.push(module);
                      }
                  }
              }
              queue = [];
              asyncEval(storedImplementations, function(err) {
                  store.stats.failed++;
                  store.clear();
                  mw.trackError({
                      exception: err,
                      source: 'store-eval'
                  });
                  var failed = storedNames.filter(function(name) {
                      return registry[name].state === 'loading';
                  });
                  batchRequest(failed);
              });
              batchRequest(requestNames);
          },
          addSource: function(ids) {
              for (var id in ids) {
                  if (id in sources) {
                      throw new Error('source already registered: ' + id);
                  }
                  sources[id] = ids[id];
              }
          },
          register: function(modules) {
              if (typeof modules !== 'object') {
                  registerOne.apply(null, arguments);
                  return;
              }
              function resolveIndex(dep) {
                  return typeof dep === 'number' ? modules[dep][0] : dep;
              }
              for (var i = 0; i < modules.length; i++) {
                  var deps = modules[i][2];
                  if (deps) {
                      for (var j = 0; j < deps.length; j++) {
                          deps[j] = resolveIndex(deps[j]);
                      }
                  }
                  registerOne.apply(null, modules[i]);
              }
          },
          implement: function(module, script, style, messages, templates, deprecationWarning) {
              var split = splitModuleKey(module)
                , name = split.name
                , version = split.version;
              if (!(name in registry)) {
                  mw.loader.register(name);
              }
              if (registry[name].script !== undefined) {
                  throw new Error('module already implemented: ' + name);
              }
              registry[name].version = version;
              registry[name].declarator = null;
              registry[name].script = script;
              registry[name].style = style;
              registry[name].messages = messages;
              registry[name].templates = templates;
              registry[name].deprecationWarning = deprecationWarning;
              if (registry[name].state !== 'error' && registry[name].state !== 'missing') {
                  setAndPropagate(name, 'loaded');
              }
          },
          impl: function(declarator) {
              var data = declarator()
                , module = data[0]
                , script = data[1] || null
                , style = data[2] || null
                , messages = data[3] || null
                , templates = data[4] || null
                , deprecationWarning = data[5] || null
                , split = splitModuleKey(module)
                , name = split.name
                , version = split.version;
              if (!(name in registry)) {
                  mw.loader.register(name);
              }
              if (registry[name].script !== undefined) {
                  throw new Error('module already implemented: ' + name);
              }
              registry[name].version = version;
              registry[name].declarator = declarator;
              registry[name].script = script;
              registry[name].style = style;
              registry[name].messages = messages;
              registry[name].templates = templates;
              registry[name].deprecationWarning = deprecationWarning;
              if (registry[name].state !== 'error' && registry[name].state !== 'missing') {
                  setAndPropagate(name, 'loaded');
              }
          },
          load: function(modules, type) {
              if (typeof modules === 'string' && /^(https?:)?\/?\//.test(modules)) {
                  if (type === 'text/css') {
                      addLink(modules);
                  } else if (type === 'text/javascript' || type === undefined) {
                      addScript(modules);
                  } else {
                      throw new Error('Invalid type ' + type);
                  }
              } else {
                  modules = typeof modules === 'string' ? [modules] : modules;
                  enqueue(resolveStubbornly(modules));
              }
          },
          state: function(states) {
              for (var module in states) {
                  if (!(module in registry)) {
                      mw.loader.register(module);
                  }
                  setAndPropagate(module, states[module]);
              }
          },
          getState: function(module) {
              return module in registry ? registry[module].state : null;
          },
          require: function(moduleName) {
              var path;
              if (window.QUnit) {
                  var paths = moduleName.startsWith('@') ? /^(@[^/]+\/[^/]+)\/(.*)$/.exec(moduleName) : /^([^/]+)\/(.*)$/.exec(moduleName);
                  if (paths) {
                      moduleName = paths[1];
                      path = paths[2];
                  }
              }
              if (mw.loader.getState(moduleName) !== 'ready') {
                  throw new Error('Module "' + moduleName + '" is not loaded');
              }
              return path ? makeRequireFunction(registry[moduleName], '')('./' + path) : registry[moduleName].module.exports;
          }
      };
      var hasPendingFlush = false
        , hasPendingWrites = false;
      function flushWrites() {
          while (store.queue.length) {
              store.set(store.queue.shift());
          }
          if (hasPendingWrites) {
              store.prune();
              try {
                  localStorage.removeItem(store.key);
                  localStorage.setItem(store.key, JSON.stringify({
                      items: store.items,
                      vary: store.vary,
                      asOf: Math.ceil(Date.now() / 1e7)
                  }));
              } catch (e) {
                  mw.trackError({
                      exception: e,
                      source: 'store-localstorage-update'
                  });
              }
          }
          hasPendingFlush = hasPendingWrites = false;
      }
      mw.loader.store = store = {
          enabled: null,
          items: {},
          queue: [],
          stats: {
              hits: 0,
              misses: 0,
              expired: 0,
              failed: 0
          },
          key: "MediaWikiModuleStore:bgwiki",
          vary: "vector-2022:2:1:bg",
          init: function() {
              if (this.enabled === null) {
                  this.enabled = false;
                  if (true) {
                      this.load();
                  } else {
                      this.clear();
                  }
              }
          },
          load: function() {
              try {
                  var raw = localStorage.getItem(this.key);
                  this.enabled = true;
                  var data = JSON.parse(raw);
                  if (data && data.vary === this.vary && data.items && Date.now() < (data.asOf * 1e7) + 259e7) {
                      this.items = data.items;
                  }
              } catch (e) {}
          },
          get: function(module) {
              if (this.enabled) {
                  var key = getModuleKey(module);
                  if (key in this.items) {
                      this.stats.hits++;
                      return this.items[key];
                  }
                  this.stats.misses++;
              }
              return false;
          },
          add: function(module) {
              if (this.enabled) {
                  this.queue.push(module);
                  this.requestUpdate();
              }
          },
          set: function(module) {
              var descriptor = registry[module]
                , key = getModuleKey(module);
              if (key in this.items || !descriptor || descriptor.state !== 'ready' || !descriptor.version || descriptor.group === 1 || descriptor.group === 0 || !descriptor.declarator) {
                  return;
              }
              var script = String(descriptor.declarator);
              if (script.length > 1e5) {
                  return;
              }
              var srcParts = ['mw.loader.impl(', script, ');\n'];
              if (true) {
                  srcParts.push('// Saved in localStorage at ', (new Date()).toISOString(), '\n');
                  var sourceLoadScript = sources[descriptor.source];
                  var query = Object.create({
                      "lang": "bg",
                      "skin": "vector-2022"
                  });
                  query.modules = module;
                  query.version = getCombinedVersion([module]);
                  query = sortQuery(query);
                  srcParts.push('//# sourceURL=', (new URL(sourceLoadScript,location)).href, '?', makeQueryString(query), '\n');
                  query.sourcemap = '1';
                  query = sortQuery(query);
                  srcParts.push('//# sourceMappingURL=', sourceLoadScript, '?', makeQueryString(query));
              }
              this.items[key] = srcParts.join('');
              hasPendingWrites = true;
          },
          prune: function() {
              for (var key in this.items) {
                  if (getModuleKey(splitModuleKey(key).name) !== key) {
                      this.stats.expired++;
                      delete this.items[key];
                  }
              }
          },
          clear: function() {
              this.items = {};
              try {
                  localStorage.removeItem(this.key);
              } catch (e) {}
          },
          requestUpdate: function() {
              if (!hasPendingFlush) {
                  hasPendingFlush = setTimeout(function() {
                      mw.requestIdleCallback(flushWrites);
                  }, 2000);
              }
          }
      };
  }());
  mw.requestIdleCallbackInternal = function(callback) {
      setTimeout(function() {
          var start = mw.now();
          callback({
              didTimeout: false,
              timeRemaining: function() {
                  return Math.max(0, 50 - (mw.now() - start));
              }
          });
      }, 1);
  }
  ;
  mw.requestIdleCallback = window.requestIdleCallback ? window.requestIdleCallback.bind(window) : mw.requestIdleCallbackInternal;
  (function() {
      var queue;
      mw.loader.addSource({
          "local": "https://bg.wikipedia.org/w/load.php",
          "metawiki": "//meta.wikimedia.org/w/load.php"
      });
      mw.loader.register([["site", "1ysb8", [1]], ["site.styles", "b1l9e", [], 2], ["filepage", "1ljys"], ["user", "1tdkc", [], 0], ["user.styles", "18fec", [], 0], ["user.options", "12s5i", [], 1], ["mediawiki.skinning.interface", "1kdfh"], ["jquery.makeCollapsible.styles", "1yumy"], ["mediawiki.skinning.content.parsoid", "1jtc1"], ["web2017-polyfills", "174re", [], null, null, "return'IntersectionObserver'in window\u0026\u0026typeof fetch==='function'\u0026\u0026typeof URL==='function'\u0026\u0026'toJSON'in URL.prototype;"], ["jquery", "xt2am"], ["mediawiki.base", "sy9wt", [10]], ["jquery.chosen", "1ft2a"], ["jquery.client", "5k8ja"], ["jquery.confirmable", "zz1tf", [103]], ["jquery.highlightText", "9qzq7", [77]], ["jquery.i18n", "1tati", [102]], ["jquery.lengthLimit", "tlk9z", [60]], ["jquery.makeCollapsible", "1q0wf", [7, 77]], ["jquery.spinner", "iute0", [20]], ["jquery.spinner.styles", "1yw8b"], ["jquery.suggestions", "xoi3f", [15]], ["jquery.tablesorter", "jld8g", [23, 104, 77]], ["jquery.tablesorter.styles", "zkbtz"], ["jquery.textSelection", "18yom", [13]], ["jquery.ui", "qn8rf"], ["moment", "12tvk", [100, 77]], ["vue", "17txg", [111]], ["vuex", "16fjm", [27]], ["pinia", "17tzw", [27]], ["@wikimedia/codex", "3wac7", [31, 27]], ["codex-styles", "fpk6l"], ["mediawiki.codex.messagebox.styles", "1ggqx"], ["@wikimedia/codex-search", "huxrq", [34, 27]], ["codex-search-styles", "3zzdj"], ["mediawiki.template", "72v1k"], ["mediawiki.template.mustache", "1m2gq", [35]], ["mediawiki.apipretty", "qt7g6"], ["mediawiki.api", "1lwiu", [103]], ["mediawiki.content.json", "kwexm"], ["mediawiki.confirmCloseWindow", "xpr9i"], ["mediawiki.debug", "f5byx", [201]], ["mediawiki.diff", "1nznf", [38]], ["mediawiki.diff.styles", "h2rqy"], ["mediawiki.feedback", "2cdxg", [67, 103, 834, 201, 209]], ["mediawiki.feedlink", "642xe"], ["mediawiki.filewarning", "nweqp", [201, 213]], ["mediawiki.ForeignApi", "r63m6", [306]], ["mediawiki.ForeignApi.core", "gpvmk", [38, 198]], ["mediawiki.helplink", "wnaaz"], ["mediawiki.hlist", "artqm"], ["mediawiki.htmlform", "cg2ee", [175]], ["mediawiki.htmlform.ooui", "qp5p1", [201]], ["mediawiki.htmlform.styles", "p2y46"], ["mediawiki.htmlform.codex.styles", "1hkvv"], ["mediawiki.htmlform.ooui.styles", "9z05d"], ["mediawiki.inspect", "2ufuk", [60, 77]], ["mediawiki.notification", "smm1t", [77, 83]], ["mediawiki.notification.convertmessagebox", "1qfxt", [57]], ["mediawiki.notification.convertmessagebox.styles", "15u5e"], ["mediawiki.String", "rowro"], ["mediawiki.pager.styles", "ev5dv"], ["mediawiki.pager.codex", "as9np"], ["mediawiki.pager.codex.styles", "1wgjb"], ["mediawiki.pulsatingdot", "1n5g0"], ["mediawiki.searchSuggest", "ehro6", [21, 38]], ["mediawiki.storage", "byncp", [77]], ["mediawiki.Title", "szj3g", [60, 77]], ["mediawiki.Upload", "1kc0u", [38]], ["mediawiki.ForeignUpload", "3foen", [47, 68]], ["mediawiki.Upload.Dialog", "1xmx0", [71]], ["mediawiki.Upload.BookletLayout", "xbuiu", [68, 26, 204, 209, 214, 215]], ["mediawiki.ForeignStructuredUpload.BookletLayout", "1l8vg", [69, 71, 107, 179, 172]], ["mediawiki.toc", "ui5eu", [80]], ["mediawiki.Uri", "4dbs6", [77]], ["mediawiki.user", "w2qqj", [38, 80]], ["mediawiki.userSuggest", "ba9yz", [21, 38]], ["mediawiki.util", "1ajgi", [13, 9]], ["mediawiki.checkboxtoggle", "snz0j"], ["mediawiki.checkboxtoggle.styles", "1eitw"], ["mediawiki.cookie", "5gpj0"], ["mediawiki.experiments", "15xww"], ["mediawiki.editfont.styles", "l9cd2"], ["mediawiki.visibleTimeout", "40nxy"], ["mediawiki.action.edit", "1i014", [24, 85, 82, 175]], ["mediawiki.action.edit.styles", "d8ktr"], ["mediawiki.action.edit.collapsibleFooter", "10x3b", [18, 66]], ["mediawiki.action.edit.preview", "1m2l6", [19, 113]], ["mediawiki.action.history", "1c95i", [18]], ["mediawiki.action.history.styles", "n2g43"], ["mediawiki.action.protect", "1p14t", [175]], ["mediawiki.action.view.metadata", "1ltv9", [98]], ["mediawiki.editRecovery.postEdit", "wh5q0"], ["mediawiki.editRecovery.edit", "1kfcu", [57, 171, 217]], ["mediawiki.action.view.postEdit", "1wvz0", [57, 66, 161, 201, 221]], ["mediawiki.action.view.redirect", "9jbdf"], ["mediawiki.action.view.redirectPage", "1qvab"], ["mediawiki.action.edit.editWarning", "15on3", [24, 40, 103]], ["mediawiki.action.view.filepage", "v2tzv"], ["mediawiki.action.styles", "1unbi"], ["mediawiki.language", "1bnil", [101]], ["mediawiki.cldr", "1dc8t", [102]], ["mediawiki.libs.pluralruleparser", "1sv4p"], ["mediawiki.jqueryMsg", "1ld7a", [67, 100, 5]], ["mediawiki.language.months", "44mle", [100]], ["mediawiki.language.names", "132cb", [100]], ["mediawiki.language.specialCharacters", "13u6d", [100]], ["mediawiki.libs.jpegmeta", "n7h67"], ["mediawiki.page.gallery", "1pso7", [109, 77]], ["mediawiki.page.gallery.styles", "z9zy8"], ["mediawiki.page.gallery.slideshow", "15z2t", [204, 224, 226]], ["mediawiki.page.ready", "benfd", [75]], ["mediawiki.page.watch.ajax", "f3r6f", [75]], ["mediawiki.page.preview", "z90ij", [18, 24, 42, 43, 201]], ["mediawiki.page.image.pagination", "1qg8v", [19, 77]], ["mediawiki.page.media", "1oc5n"], ["mediawiki.rcfilters.filters.base.styles", "1ciew"], ["mediawiki.rcfilters.highlightCircles.seenunseen.styles", "h1hgf"], ["mediawiki.rcfilters.filters.ui", "17nbo", [18, 74, 169, 210, 217, 220, 221, 222, 224, 225]], ["mediawiki.interface.helpers.styles", "xcye7"], ["mediawiki.special", "175ed"], ["mediawiki.special.apisandbox", "d26jq", [18, 191, 176, 200]], ["mediawiki.special.restsandbox.styles", "tjxcg"], ["mediawiki.special.restsandbox", "snzcl", [122]], ["mediawiki.special.block", "7etr6", [51, 172, 190, 180, 191, 188, 217]], ["mediawiki.misc-authed-ooui", "179gl", [19, 52, 169, 175]], ["mediawiki.misc-authed-pref", "1fmt6", [5]], ["mediawiki.misc-authed-curate", "v7z2l", [12, 14, 17, 19, 38]], ["mediawiki.special.block.codex", "11qkq", [30, 29]], ["mediawiki.protectionIndicators.styles", "mii98"], ["mediawiki.special.changeslist", "mg0wn"], ["mediawiki.special.changeslist.watchlistexpiry", "my9tm", [120, 221]], ["mediawiki.special.changeslist.enhanced", "1w8do"], ["mediawiki.special.changeslist.legend", "15e9o"], ["mediawiki.special.changeslist.legend.js", "13r7x", [80]], ["mediawiki.special.contributions", "1203g", [18, 172, 200]], ["mediawiki.special.import.styles.ooui", "15hlr"], ["mediawiki.special.interwiki", "1bg2w"], ["mediawiki.special.changecredentials", "1eqrg"], ["mediawiki.special.changeemail", "q0qtr"], ["mediawiki.special.preferences.ooui", "1ver9", [40, 82, 58, 66, 180, 175, 209]], ["mediawiki.special.preferences.styles.ooui", "5xt5f"], ["mediawiki.special.editrecovery.styles", "1o89f"], ["mediawiki.special.editrecovery", "7vvar", [27]], ["mediawiki.special.search", "1slvn", [193]], ["mediawiki.special.search.commonsInterwikiWidget", "s5w7q", [38]], ["mediawiki.special.search.interwikiwidget.styles", "1nmjz"], ["mediawiki.special.search.styles", "kkry3"], ["mediawiki.special.unwatchedPages", "1a2ig", [38]], ["mediawiki.special.upload", "m1yoa", [19, 38, 40, 107, 120, 35]], ["mediawiki.authenticationPopup", "188zv", [19, 209]], ["mediawiki.authenticationPopup.success", "6zddp"], ["mediawiki.special.userlogin.common.styles", "1l6na"], ["mediawiki.special.userlogin.login.styles", "1sitc"], ["mediawiki.special.userlogin.authentication-popup", "n4u0d"], ["mediawiki.special.createaccount", "1lc6i", [38]], ["mediawiki.special.userlogin.signup.styles", "14ngn"], ["mediawiki.special.userrights", "1des1", [17, 58]], ["mediawiki.special.watchlist", "oxbhc", [201, 221]], ["mediawiki.tempUserBanner.styles", "3pp37"], ["mediawiki.tempUserBanner", "10ciy", [103]], ["mediawiki.tempUserCreated", "ecwit", [77]], ["mediawiki.ui", "7b78o"], ["mediawiki.ui.checkbox", "aoztu"], ["mediawiki.ui.radio", "mflx2"], ["mediawiki.legacy.messageBox", "9s5x8"], ["mediawiki.ui.button", "ueaf4"], ["mediawiki.ui.input", "hci3s"], ["mediawiki.ui.icon", "l7y8c"], ["mediawiki.widgets", "1kjim", [170, 204, 214, 215]], ["mediawiki.widgets.styles", "1yzt2"], ["mediawiki.widgets.AbandonEditDialog", "1cn43", [209]], ["mediawiki.widgets.DateInputWidget", "1qyr4", [173, 26, 204, 226]], ["mediawiki.widgets.DateInputWidget.styles", "in97o"], ["mediawiki.widgets.DateTimeInputWidget.styles", "1r6r1"], ["mediawiki.widgets.visibleLengthLimit", "4i5bv", [17, 201]], ["mediawiki.widgets.datetime", "1vnym", [174, 201, 221, 225, 226]], ["mediawiki.widgets.expiry", "xgign", [176, 26, 204]], ["mediawiki.widgets.CheckMatrixWidget", "1lq0f", [201]], ["mediawiki.widgets.CategoryMultiselectWidget", "1hty0", [47, 204]], ["mediawiki.widgets.SelectWithInputWidget", "11wi8", [181, 204]], ["mediawiki.widgets.SelectWithInputWidget.styles", "d1pwh"], ["mediawiki.widgets.SizeFilterWidget", "1j2mh", [183, 204]], ["mediawiki.widgets.SizeFilterWidget.styles", "hozo0"], ["mediawiki.widgets.MediaSearch", "anhj8", [47, 204]], ["mediawiki.widgets.Table", "18ous", [204]], ["mediawiki.widgets.TagMultiselectWidget", "1y5hq", [204]], ["mediawiki.widgets.MenuTagMultiselectWidget", "hkuq9", [204]], ["mediawiki.widgets.UserInputWidget", "1yo2h", [204]], ["mediawiki.widgets.UsersMultiselectWidget", "1dllb", [204]], ["mediawiki.widgets.NamespacesMultiselectWidget", "1skcg", [169]], ["mediawiki.widgets.TitlesMultiselectWidget", "1xq8g", [169]], ["mediawiki.widgets.TagMultiselectWidget.styles", "pqvgn"], ["mediawiki.widgets.SearchInputWidget", "kfr5t", [65, 169, 221]], ["mediawiki.widgets.SearchInputWidget.styles", "1784o"], ["mediawiki.widgets.ToggleSwitchWidget", "1yf2l", [204]], ["mediawiki.watchstar.widgets", "u3rh9", [200]], ["mediawiki.deflate", "1kmt8"], ["oojs", "1u2cw"], ["mediawiki.router", "1l3dg", [198]], ["oojs-ui", "19txf", [207, 204, 209]], ["oojs-ui-core", "1panf", [111, 198, 203, 202, 211]], ["oojs-ui-core.styles", "1wonv"], ["oojs-ui-core.icons", "1ojef"], ["oojs-ui-widgets", "8qnbl", [201, 206]], ["oojs-ui-widgets.styles", "19572"], ["oojs-ui-widgets.icons", "17hqz"], ["oojs-ui-toolbars", "1r917", [201, 208]], ["oojs-ui-toolbars.icons", "13bne"], ["oojs-ui-windows", "1fd1a", [201, 210]], ["oojs-ui-windows.icons", "1j23t"], ["oojs-ui.styles.indicators", "brluv"], ["oojs-ui.styles.icons-accessibility", "1jcjy"], ["oojs-ui.styles.icons-alerts", "zagvm"], ["oojs-ui.styles.icons-content", "1atmm"], ["oojs-ui.styles.icons-editing-advanced", "11vyz"], ["oojs-ui.styles.icons-editing-citation", "dvco4"], ["oojs-ui.styles.icons-editing-core", "zk1yk"], ["oojs-ui.styles.icons-editing-functions", "v4k2d"], ["oojs-ui.styles.icons-editing-list", "bmgj6"], ["oojs-ui.styles.icons-editing-styling", "11ssg"], ["oojs-ui.styles.icons-interactions", "1sawg"], ["oojs-ui.styles.icons-layout", "16m01"], ["oojs-ui.styles.icons-location", "yjj7a"], ["oojs-ui.styles.icons-media", "1m6af"], ["oojs-ui.styles.icons-moderation", "1ezy6"], ["oojs-ui.styles.icons-movement", "wmv3q"], ["oojs-ui.styles.icons-user", "1fjbq"], ["oojs-ui.styles.icons-wikimedia", "3o3sc"], ["skins.vector.search.codex.styles", "vejmj"], ["skins.vector.search.codex.scripts", "1tbcb", [229, 27]], ["skins.vector.search", "1cewn", [230]], ["skins.vector.styles.legacy", "1ao2l"], ["skins.vector.styles", "cbtuq"], ["skins.vector.icons.js", "invos"], ["skins.vector.icons", "rgwlm"], ["skins.vector.clientPreferences", "1n14g", [75]], ["skins.vector.js", "1a27y", [81, 112, 66, 236, 234]], ["skins.vector.legacy.js", "1nrwa", [111]], ["skins.monobook.styles", "p889u"], ["skins.monobook.scripts", "15hjk", [75, 213]], ["skins.modern", "4mhxm"], ["skins.cologneblue", "169ig"], ["skins.timeless", "t7tlx"], ["skins.timeless.js", "d56ub"], ["ext.timeline.styles", "1osj7"], ["ext.wikihiero", "hd43q"], ["ext.wikihiero.special", "j1qhh", [246, 19, 201]], ["ext.wikihiero.visualEditor", "k0kfs", [437]], ["ext.charinsert", "1szkj", [24]], ["ext.charinsert.styles", "17hc7"], ["ext.cite.styles", "1g5go"], ["ext.cite.parsoid.styles", "pfk7m"], ["ext.cite.visualEditor.core", "935t3", [437, 445]], ["ext.cite.visualEditor", "1dd2g", [252, 251, 253, 425, 426, 445, 213, 216, 221]], ["ext.cite.wikiEditor", "162u8", [353]], ["ext.cite.ux-enhancements", "coj3s"], ["ext.cite.community-configuration", "1tu8i", [27]], ["ext.citeThisPage", "17kjw"], ["ext.inputBox.styles", "1hbkr"], ["ext.imagemap", "pugeb", [261]], ["ext.imagemap.styles", "118nu"], ["ext.pygments", "1ipce"], ["ext.geshi.visualEditor", "1ovse", [437]], ["ext.categoryTree", "1ja8m", [38]], ["ext.categoryTree.styles", "1xbsg"], ["ext.spamBlacklist.visualEditor", "11z86"], ["mediawiki.api.titleblacklist", "1amyv", [38]], ["ext.titleblacklist.visualEditor", "9cn1x"], ["ext.tmh.video-js", "1hoae"], ["ext.tmh.videojs-ogvjs", "1begb", [278, 269]], ["ext.tmh.player", "1kmrl", [277, 274, 67]], ["ext.tmh.player.dialog", "14xkd", [273, 209]], ["ext.tmh.player.inline", "1498k", [277, 269, 67]], ["ext.tmh.player.styles", "wcxes"], ["ext.tmh.transcodetable", "1tvbs", [200]], ["ext.tmh.timedtextpage.styles", "bfqwg"], ["ext.tmh.OgvJsSupport", "kckt1"], ["ext.tmh.OgvJs", "5tcrw", [277]], ["embedPlayerIframeStyle", "zgah7"], ["ext.urlShortener.special", "13tu4", [52, 169, 200]], ["ext.urlShortener.qrCode.special", "meka3", [282, 74, 52, 169]], ["ext.urlShortener.qrCode.special.styles", "acbc4"], ["ext.urlShortener.toolbar", "1dnry"], ["ext.globalBlocking", "1m11u", [51, 169, 188]], ["ext.globalBlocking.styles", "1bh82"], ["ext.securepoll.htmlform", "1cf4y", [19, 188, 200]], ["ext.securepoll", "1qcou"], ["ext.securepoll.special", "8s9iw"], ["ext.score.visualEditor", "13zz2", [290, 437]], ["ext.score.visualEditor.icons", "orj1d"], ["ext.score.popup", "11oc2", [38]], ["ext.score.styles", "74ou6"], ["ext.cirrus.serp", "1x2q2", [199, 77]], ["ext.nuke.styles", "1d21s"], ["ext.nuke.fields.NukeDateTimeField", "maij7", [172]], ["ext.confirmEdit.editPreview.ipwhitelist.styles", "nwoqf"], ["ext.confirmEdit.visualEditor", "bl2yi", [818]], ["ext.confirmEdit.simpleCaptcha", "1cj5u"], ["ext.confirmEdit.fancyCaptcha.styles", "1lv38"], ["ext.confirmEdit.fancyCaptcha", "8hn9l", [299, 38]], ["ext.centralauth", "lk560", [19, 77]], ["ext.centralauth.centralautologin", "umf4b", [103]], ["ext.centralauth.centralautologin.clearcookie", "1p0lv"], ["ext.centralauth.misc.styles", "q1pwq"], ["ext.centralauth.globalrenameuser", "qhk11", [77]], ["ext.centralauth.ForeignApi", "1taqi", [48]], ["ext.widgets.GlobalUserInputWidget", "1sbz9", [204]], ["ext.centralauth.globalrenamequeue", "19e3q"], ["ext.centralauth.globalrenamequeue.styles", "1j97l"], ["ext.centralauth.globalvanishrequest", "uw9et"], ["ext.GlobalUserPage", "la1er"], ["ext.apifeatureusage", "1cero"], ["ext.dismissableSiteNotice", "rfldl", [80, 77]], ["ext.dismissableSiteNotice.styles", "iqoef"], ["ext.centralNotice.startUp", "p4jx3", [317, 77]], ["ext.centralNotice.geoIP", "51f30", [80]], ["ext.centralNotice.choiceData", "4ke71", [321]], ["ext.centralNotice.display", "e7dh9", [316, 319, 569, 74, 66]], ["ext.centralNotice.kvStore", "l5kkd"], ["ext.centralNotice.bannerHistoryLogger", "1pcho", [318]], ["ext.centralNotice.impressionDiet", "18ynr", [318]], ["ext.centralNotice.largeBannerLimit", "ldf4w", [318]], ["ext.centralNotice.legacySupport", "1yzqd", [318]], ["ext.centralNotice.bannerSequence", "1hwzn", [318]], ["ext.centralNotice.freegeoipLookup", "1ybx6", [316]], ["ext.centralNotice.impressionEventsSampleRate", "xp6tt", [318]], ["ext.centralNotice.cspViolationAlert", "71y4j"], ["ext.wikimediamessages.styles", "1y0cc"], ["ext.wikimediamessages.contactpage", "1cs01"], ["ext.collection", "j4p2j", [332, 100]], ["ext.collection.bookcreator.styles", "ol18j"], ["ext.collection.bookcreator", "15rnq", [331, 66]], ["ext.collection.checkLoadFromLocalStorage", "imm3j", [330]], ["ext.collection.suggest", "kdcz3", [332]], ["ext.collection.offline", "2gmtr"], ["ext.collection.bookcreator.messageBox", "19txf", [337, 50]], ["ext.collection.bookcreator.messageBox.icons", "10quf"], ["ext.ElectronPdfService.special.styles", "vvfin"], ["ext.ElectronPdfService.special.selectionImages", "1r7oy"], ["ext.advancedSearch.initialstyles", "ci9k1"], ["ext.advancedSearch.styles", "1xd0e"], ["ext.advancedSearch.searchtoken", "1vhat", [], 1], ["ext.advancedSearch.elements", "737hi", [345, 341, 74, 221, 222]], ["ext.advancedSearch.init", "qpor9", [343, 342]], ["ext.advancedSearch.SearchFieldUI", "1bsah", [204]], ["ext.abuseFilter", "1tbep"], ["ext.abuseFilter.edit", "fodqq", [19, 24, 40, 204]], ["ext.abuseFilter.tools", "1advx", [19, 38]], ["ext.abuseFilter.examine", "rp64y", [19, 38]], ["ext.abuseFilter.ace", "d59c7", [551]], ["ext.abuseFilter.visualEditor", "1f8aq"], ["pdfhandler.messages", "i178d"], ["ext.wikiEditor", "jc1k4", [24, 25, 106, 169, 216, 217, 219, 220, 224, 35], 3], ["ext.wikiEditor.styles", "pgt7x", [], 3], ["ext.wikiEditor.images", "1t235"], ["ext.wikiEditor.realtimepreview", "smiph", [353, 355, 113, 64, 66, 221]], ["ext.CodeMirror", "1018v", [75]], ["ext.CodeMirror.WikiEditor", "ewj2d", [357, 24, 220]], ["ext.CodeMirror.lib", "1bd9x"], ["ext.CodeMirror.addons", "19bks", [359]], ["ext.CodeMirror.mode.mediawiki", "1rlnc", [359]], ["ext.CodeMirror.lib.mode.css", "1kqvv", [359]], ["ext.CodeMirror.lib.mode.javascript", "1r235", [359]], ["ext.CodeMirror.lib.mode.xml", "1siba", [359]], ["ext.CodeMirror.lib.mode.htmlmixed", "f433m", [362, 363, 364]], ["ext.CodeMirror.lib.mode.clike", "147xq", [359]], ["ext.CodeMirror.lib.mode.php", "uvn3j", [366, 365]], ["ext.CodeMirror.visualEditor", "87dtg", [357, 444]], ["ext.CodeMirror.v6", "18wug", [371, 75]], ["ext.CodeMirror.v6.init", "1r20q", [5]], ["ext.CodeMirror.v6.lib", "1vmbb"], ["ext.CodeMirror.v6.mode.mediawiki", "p586r", [369]], ["ext.CodeMirror.v6.mode.javascript", "1axb0", [371]], ["ext.CodeMirror.v6.mode.json", "9qe6o", [371]], ["ext.CodeMirror.v6.mode.css", "17g4m", [371]], ["ext.CodeMirror.v6.WikiEditor", "15b29", [369, 353]], ["ext.CodeMirror.v6.visualEditor", "1s8ko", [369, 444]], ["ext.CodeMirror.visualEditor.init", "eyi1p"], ["ext.MassMessage.styles", "11p9u"], ["ext.MassMessage.special.js", "1u6f3", [17, 201]], ["ext.MassMessage.content", "1ih0q", [14, 169, 200]], ["ext.MassMessage.create", "f9e0o", [40, 52, 169]], ["ext.MassMessage.edit", "ro5sf", [40, 175, 200]], ["ext.betaFeatures", "19j30", [201]], ["ext.betaFeatures.styles", "1rrzt"], ["mmv", "1dsbb", [390]], ["mmv.codex", "1uqqs"], ["mmv.ui.reuse", "8r27a", [169, 387]], ["mmv.ui.restriction", "2bkl7"], ["mmv.bootstrap", "r8409", [199, 66, 75, 387]], ["ext.popups.icons", "127of"], ["ext.popups", "13p6r"], ["ext.popups.main", "1nfyd", [74, 81, 66, 75]], ["ext.linter.edit", "4rnx9", [24]], ["ext.linter.styles", "e86ab"], ["socket.io", "f0oz7"], ["peerjs", "1a7xj"], ["dompurify", "13psx"], ["color-picker", "1udyk"], ["unicodejs", "1pa89"], ["papaparse", "1b87h"], ["rangefix", "py825"], ["spark-md5", "1ewgr"], ["ext.visualEditor.supportCheck", "mk13r", [], 4], ["ext.visualEditor.sanitize", "1klwy", [398, 425], 4], ["ext.visualEditor.progressBarWidget", "170cc", [], 4], ["ext.visualEditor.tempWikitextEditorWidget", "vbaxg", [82, 75], 4], ["ext.visualEditor.desktopArticleTarget.init", "1ihtr", [406, 404, 407, 421, 24, 111, 66], 4], ["ext.visualEditor.desktopArticleTarget.noscript", "11fr2"], ["ext.visualEditor.targetLoader", "1hop6", [424, 421, 24, 66, 75], 4], ["ext.visualEditor.desktopTarget", "7navv", [], 4], ["ext.visualEditor.desktopArticleTarget", "2vg64", [428, 425, 433, 411, 426, 439, 103, 77], 4], ["ext.visualEditor.mobileArticleTarget", "6bjwe", [428, 434], 4], ["ext.visualEditor.collabTarget", "1yh4m", [426, 432, 82, 169, 221, 222], 4], ["ext.visualEditor.collabTarget.desktop", "zr0rw", [414, 433, 411, 439], 4], ["ext.visualEditor.collabTarget.mobile", "1x6b4", [414, 434, 438], 4], ["ext.visualEditor.collabTarget.init", "1oyws", [404, 169, 200], 4], ["ext.visualEditor.collabTarget.init.styles", "1rppu"], ["ext.visualEditor.collab", "3cd4l", [399, 430, 397]], ["ext.visualEditor.ve", "17m0y", [], 4], ["ext.visualEditor.track", "10mz7", [420], 4], ["ext.visualEditor.editCheck", "lvr12", [427], 4], ["ext.visualEditor.core.utils", "t3nsm", [421, 200], 4], ["ext.visualEditor.core.utils.parsing", "1rcro", [420], 4], ["ext.visualEditor.base", "1hyh8", [423, 424, 400], 4], ["ext.visualEditor.mediawiki", "505li", [425, 410, 22, 598], 4], ["ext.visualEditor.mwsave", "dcitq", [437, 17, 19, 42, 43, 221], 4], ["ext.visualEditor.articleTarget", "rqaal", [438, 427, 94, 171], 4], ["ext.visualEditor.data", "141gi", [426]], ["ext.visualEditor.core", "x4ftj", [405, 404, 401, 402, 403], 4], ["ext.visualEditor.commentAnnotation", "1d2fc", [430], 4], ["ext.visualEditor.rebase", "1008j", [399, 448, 431, 227, 396], 4], ["ext.visualEditor.core.desktop", "nkcg2", [430], 4], ["ext.visualEditor.core.mobile", "1ttqu", [430], 4], ["ext.visualEditor.welcome", "4re4a", [200], 4], ["ext.visualEditor.switching", "ig20u", [200, 212, 215, 217], 4], ["ext.visualEditor.mwcore", "og34c", [449, 426, 436, 435, 119, 64, 8, 169], 4], ["ext.visualEditor.mwextensions", "19txf", [429, 459, 453, 455, 440, 457, 442, 454, 443, 445], 4], ["ext.visualEditor.mwextensions.desktop", "19txf", [438, 444, 72], 4], ["ext.visualEditor.mwformatting", "1mj5n", [437], 4], ["ext.visualEditor.mwimage.core", "85fw0", [437], 4], ["ext.visualEditor.mwimage", "s1wlu", [460, 441, 184, 26, 224], 4], ["ext.visualEditor.mwlink", "dimfx", [437], 4], ["ext.visualEditor.mwmeta", "qxaup", [443, 96], 4], ["ext.visualEditor.mwtransclusion", "m5w0p", [437, 188], 4], ["treeDiffer", "xiskm"], ["diffMatchPatch", "1s80q"], ["ext.visualEditor.checkList", "hyep7", [430], 4], ["ext.visualEditor.diffing", "1r0b2", [447, 430, 446], 4], ["ext.visualEditor.diffPage.init.styles", "1wwwe"], ["ext.visualEditor.diffLoader", "1dei4", [410], 4], ["ext.visualEditor.diffPage.init", "1vgch", [451, 450, 200, 212, 215], 4], ["ext.visualEditor.language", "2q0nq", [430, 598, 105], 4], ["ext.visualEditor.mwlanguage", "18v5v", [430], 4], ["ext.visualEditor.mwalienextension", "1h689", [437], 4], ["ext.visualEditor.mwwikitext", "15y6y", [443, 82], 4], ["ext.visualEditor.mwgallery", "8496u", [437, 109, 184, 224], 4], ["ext.visualEditor.mwsignature", "1oqbd", [445], 4], ["ext.visualEditor.icons", "19txf", [461, 462, 213, 214, 215, 217, 219, 220, 221, 222, 225, 226, 227, 211], 4], ["ext.visualEditor.icons-licenses", "1221m"], ["ext.visualEditor.moduleIcons", "2dj5e"], ["ext.visualEditor.moduleIndicators", "58hvr"], ["ext.citoid.visualEditor", "8mj1y", [254, 466, 465]], ["quagga2", "1d4mk"], ["ext.citoid.visualEditor.icons", "yog1q"], ["ext.citoid.visualEditor.data", "13ptq", [426]], ["ext.citoid.wikibase.init", "15rai"], ["ext.citoid.wikibase", "i2xw6", [467, 25, 200]], ["ext.templateData", "996q1"], ["ext.templateDataGenerator.editPage", "8oiwy"], ["ext.templateDataGenerator.data", "1hoot", [198]], ["ext.templateDataGenerator.editTemplatePage.loading", "1fb90"], ["ext.templateDataGenerator.editTemplatePage", "1bblm", [469, 474, 471, 24, 598, 204, 209, 221, 222, 225]], ["ext.templateData.images", "1hnmu"], ["ext.TemplateWizard", "1uh2c", [24, 169, 172, 188, 207, 209, 221]], ["mediawiki.libs.guiders", "1ytke"], ["ext.guidedTour.styles", "1iixy", [34, 476]], ["ext.guidedTour.lib.internal", "1ydxh", [77]], ["ext.guidedTour.lib", "3bnwn", [478, 477, 75]], ["ext.guidedTour.launcher", "1qjc8"], ["ext.guidedTour", "1u9n0", [479]], ["ext.guidedTour.tour.firstedit", "pqigh", [481]], ["ext.guidedTour.tour.test", "fiipv", [481]], ["ext.guidedTour.tour.onshow", "1ei3i", [481]], ["ext.guidedTour.tour.uprightdownleft", "te3pq", [481]], ["skins.minerva.styles", "1kdjs"], ["skins.minerva.content.styles.images", "cxq1d"], ["skins.minerva.amc.styles", "1vqc6"], ["skins.minerva.overflow.icons", "15ed7"], ["skins.minerva.icons", "1y3tx"], ["skins.minerva.mainPage.styles", "1wl5z"], ["skins.minerva.userpage.styles", "1dm31"], ["skins.minerva.personalMenu.icons", "fpjdr"], ["skins.minerva.mainMenu.advanced.icons", "1t3u7"], ["skins.minerva.loggedin.styles", "1pgbm"], ["skins.minerva.scripts", "1p20f", [74, 81, 505, 490, 486]], ["skins.minerva.categories.styles", "9s5x8"], ["skins.minerva.codex.styles", "ff6et"], ["mobile.pagelist.styles", "1yl61"], ["mobile.pagesummary.styles", "1gnq9"], ["mobile.userpage.styles", "1j0zy"], ["mobile.init.styles", "62mdm"], ["mobile.init", "1plrq", [505]], ["mobile.codex.styles", "184os"], ["mobile.startup", "1v0eo", [112, 199, 66, 36, 504, 502, 499, 500]], ["mobile.editor.overlay", "1re75", [94, 40, 82, 171, 505, 200, 217]], ["mobile.mediaViewer", "dr4je", [505]], ["mobile.languages.structured", "lbmav", [505]], ["mobile.special.styles", "1y8kw"], ["mobile.special.watchlist.scripts", "1gb6n", [505]], ["mobile.special.codex.styles", "1lhcd"], ["mobile.special.mobileoptions.styles", "ips6w"], ["mobile.special.mobileoptions.scripts", "byzfu", [505]], ["mobile.special.userlogin.scripts", "1lhsb"], ["ext.math.mathjax", "1i46g", [], 5], ["ext.math.styles", "7xrei"], ["ext.math.popup", "1ank0", [47, 75]], ["mw.widgets.MathWbEntitySelector", "fe2lq", [47, 169, 768, 209]], ["ext.math.visualEditor", "nqpmm", [516, 437]], ["ext.math.visualEditor.mathSymbols", "r0b91"], ["ext.math.visualEditor.chemSymbols", "14gru"], ["ext.babel", "1pe18"], ["ext.vipsscaler", "1ltz9"], ["ext.echo.ui.desktop", "16yca", [531, 525, 38, 75, 77]], ["ext.echo.ui", "ucskg", [526, 824, 204, 213, 214, 217, 221, 225, 226, 227]], ["ext.echo.dm", "dmhjt", [529, 26]], ["ext.echo.api", "1kjbw", [47]], ["ext.echo.mobile", "1iwsg", [525, 199]], ["ext.echo.init", "g9xb9", [527]], ["ext.echo.centralauth", "18ma8"], ["ext.echo.styles.badge", "1vott"], ["ext.echo.styles.notifications", "m3gwy"], ["ext.echo.styles.alert", "kku7t"], ["ext.echo.special", "tbwto", [535, 525]], ["ext.echo.styles.special", "1jvxe"], ["ext.thanks", "15g4y", [38, 80]], ["ext.thanks.corethank", "1f0vb", [536, 14, 209]], ["ext.thanks.flowthank", "sbuit", [536, 209]], ["ext.disambiguator", "1s13f", [38, 57]], ["ext.disambiguator.visualEditor", "1tvtf", [444]], ["ext.discussionTools.init.styles", "1hkrr"], ["ext.discussionTools.debug.styles", "139w8"], ["ext.discussionTools.init", "4f4hx", [541, 544, 424, 66, 26, 209, 402]], ["ext.discussionTools.minervaicons", "bafdm"], ["ext.discussionTools.debug", "mlyrl", [543]], ["ext.discussionTools.ReplyWidget", "mgt3q", [818, 543, 428, 458, 456, 175]], ["ext.codeEditor", "1p6ue", [549], 3], ["ext.codeEditor.styles", "bve3o"], ["jquery.codeEditor", "1y9ec", [551, 550, 353, 209], 3], ["ext.codeEditor.icons", "snw05"], ["ext.codeEditor.ace", "yeggd", [], 6], ["ext.codeEditor.ace.modes", "9o1k3", [551], 6], ["ext.scribunto.errors", "e9mvt", [204]], ["ext.scribunto.logs", "7b36r"], ["ext.scribunto.edit", "moabd", [19, 38]], ["ext.relatedArticles.styles", "vquvw"], ["ext.relatedArticles.readMore.bootstrap", "xwzau", [74, 81, 75]], ["ext.relatedArticles.readMore", "1nigb", [77]], ["ext.RevisionSlider.lazyCss", "61te3"], ["ext.RevisionSlider.lazyJs", "1akeb", [562, 226]], ["ext.RevisionSlider.init", "trvmn", [562, 563, 225]], ["ext.RevisionSlider.Settings", "1xpil", [66, 75]], ["ext.RevisionSlider.Slider", "av8tq", [564, 25, 74, 26, 200, 221, 226]], ["ext.RevisionSlider.dialogImages", "c4c1d"], ["ext.TwoColConflict.SplitJs", "18rq2", [567, 64, 66, 200, 221]], ["ext.TwoColConflict.SplitCss", "19qal"], ["ext.TwoColConflict.Split.TourImages", "wzghi"], ["ext.TwoColConflict.JSCheck", "1lbln"], ["ext.eventLogging", "s0tra", [75]], ["ext.eventLogging.debug", "pslee"], ["ext.eventLogging.jsonSchema", "17xxu"], ["ext.eventLogging.jsonSchema.styles", "1245m"], ["ext.wikimediaEvents", "1qzob", [569, 74, 81, 66, 83]], ["ext.wikimediaEvents.wikibase", "1r3lq", [569, 81]], ["ext.wikimediaEvents.networkprobe", "pbn47", [569]], ["ext.wikimediaEvents.exLab", "thaqu", [569]], ["ext.navigationTiming", "1ao7i", [569]], ["ext.uls.common", "1c8te", [598, 66, 75]], ["ext.uls.compactlinks", "1kiru", [578]], ["ext.uls.ime", "1ct1r", [578, 588, 589, 590, 596]], ["ext.uls.displaysettings", "1sbo5", [580, 587, 588, 594, 596, 38, 75]], ["ext.uls.geoclient", "16oj3", [80]], ["ext.uls.i18n", "1m5zg", [16, 77]], ["ext.uls.interface", "16dc6", [594, 198]], ["ext.uls.interlanguage", "1nx96"], ["ext.uls.languagenames", "1vlgg"], ["ext.uls.languagesettings", "1sj13", [589, 590, 599]], ["ext.uls.mediawiki", "3jja3", [578, 586, 589, 594, 597]], ["ext.uls.messages", "qdwks", [583]], ["ext.uls.preferences", "bjbh2", [66, 75]], ["ext.uls.preferencespage", "fwsgu"], ["ext.uls.pt", "4rkpu"], ["ext.uls.setlang", "fxmym", [30]], ["ext.uls.webfonts", "15ld9", [590]], ["ext.uls.webfonts.repository", "1lur0"], ["jquery.ime", "1hezd"], ["jquery.uls", "uwy9n", [16, 598, 599]], ["jquery.uls.data", "2i4ef"], ["jquery.uls.grid", "1u2od"], ["rangy.core", "18ohu"], ["ext.cx.contributions", "xh638", [201, 214, 215]], ["ext.cx.model", "115fa"], ["ext.cx.dashboard", "824ra", [632, 21, 169, 26, 609, 642, 610, 217, 224, 225]], ["sx.publishing.followup", "71vsf", [609, 608, 27]], ["ext.cx.articletopics", "qn21p"], ["mw.cx3", "ax5px", [605, 609, 608, 28]], ["mw.cx3.ve", "1n8kk", [254, 413]], ["mw.cx.util", "rh3b2", [602, 75]], ["mw.cx.SiteMapper", "a3xs0", [602, 47, 74, 75]], ["mw.cx.ui.LanguageFilter", "18oox", [588, 636, 608, 221]], ["ext.cx.wikibase.link", "t1xdz"], ["ext.cx.uls.quick.actions", "ggoeg", [578, 584, 609, 221]], ["ext.cx.eventlogging.campaigns", "1wrx8", [75]], ["ext.cx.interlanguagelink.init", "1590t", [578]], ["ext.cx.interlanguagelink", "p1vh2", [578, 609, 204, 221]], ["ext.cx.translation.conflict", "4dqrk", [103]], ["ext.cx.stats", "1ykbr", [618, 633, 632, 598, 26, 609]], ["chart.js", "12j7j"], ["ext.cx.entrypoints.recentedit", "1ekm7", [598, 609, 608, 27]], ["ext.cx.entrypoints.recenttranslation", "1xty5", [34, 598, 199, 609, 608, 27]], ["ext.cx.entrypoints.newarticle", "1fyz2", [633, 166, 201]], ["ext.cx.entrypoints.newarticle.veloader", "1nxnw"], ["ext.cx.entrypoints.languagesearcher.init", "1qnv0"], ["ext.cx.entrypoints.languagesearcher.legacy", "1ar3j", [598, 609]], ["ext.cx.entrypoints.languagesearcher", "eywnk", [598, 609, 27]], ["ext.cx.entrypoints.mffrequentlanguages", "17hmh"], ["ext.cx.entrypoints.ulsrelevantlanguages", "1yxjd", [578, 609, 27]], ["ext.cx.entrypoints.newbytranslation", "u0aly", [598, 609, 608, 27]], ["ext.cx.entrypoints.newbytranslation.mobile", "is7xy", [609, 608, 214]], ["ext.cx.betafeature.init", "152oe"], ["ext.cx.entrypoints.contributionsmenu", "ojpmi", [633, 103]], ["ext.cx.widgets.spinner", "1psl1", [602]], ["ext.cx.widgets.callout", "wm2x1"], ["mw.cx.dm", "1iamc", [602, 198]], ["mw.cx.dm.Translation", "10xgk", [634]], ["mw.cx.ui", "11zsk", [602, 200]], ["mw.cx.visualEditor", "18xa4", [254, 433, 411, 439, 638, 639]], ["ve.ce.CXLintableNode", "av1wq", [430]], ["ve.dm.CXLintableNode", "sgukm", [430, 634]], ["mw.cx.init", "1knsx", [632, 444, 646, 642, 638, 639, 641]], ["ve.init.mw.CXTarget", "udjcd", [433, 609, 635, 636, 608]], ["mw.cx.ui.Infobar", "wpsd9", [636, 608, 213, 221]], ["mw.cx.ui.CaptchaDialog", "xe231", [826, 636]], ["mw.cx.ui.LoginDialog", "1f640", [636]], ["mw.cx.tools.InstructionsTool", "12ena", [646, 36]], ["mw.cx.tools.TranslationTool", "u9grh", [636]], ["mw.cx.ui.FeatureDiscoveryWidget", "1e4u7", [64, 636]], ["mw.cx.skin", "1e0yo"], ["mint.styles", "1mwmg"], ["mint.app", "h0kxr", [30, 598, 609]], ["ext.ax.articlefooter.entrypoint", "1qr05", [609, 27]], ["mw.externalguidance.init", "19txf", [74]], ["mw.externalguidance", "11i8r", [47, 505, 654, 217]], ["mw.externalguidance.icons", "r1ut6"], ["mw.externalguidance.special", "1oiml", [31, 598, 47, 505, 654]], ["wikibase.client.init", "lju5u"], ["wikibase.client.miscStyles", "4nyqx"], ["wikibase.client.vector-2022", "sy2ym"], ["wikibase.client.linkitem.init", "1bxt8", [19]], ["jquery.wikibase.linkitem", "boegy", [19, 25, 47, 768, 767, 827]], ["wikibase.client.action.edit.collapsibleFooter", "1e4wq", [18, 66]], ["ext.wikimediaBadges", "mw79h"], ["ext.TemplateSandbox.top", "wnclz"], ["ext.TemplateSandbox", "4hpwm", [663]], ["ext.TemplateSandbox.preview", "1w57k", [19, 113]], ["ext.TemplateSandbox.visualeditor", "1frv5", [169, 200]], ["ext.jsonConfig", "1n0ao"], ["ext.jsonConfig.edit", "8yp70", [24, 185, 209]], ["ext.MWOAuth.styles", "w6647"], ["ext.MWOAuth.AuthorizeDialog", "28b80", [209]], ["ext.oath.styles", "95dxx"], ["ext.oath", "1uor9"], ["ext.webauthn.ui.base", "x9cjj", [200]], ["ext.webauthn.register", "1y2z6", [673]], ["ext.webauthn.login", "t0093", [673]], ["ext.webauthn.manage", "1g0sv", [673]], ["ext.webauthn.disable", "wxbt7", [673]], ["ext.checkUser.clientHints", "kmpm2", [38, 11]], ["ext.checkUser.tempAccountOnboarding", "8lmjb", [30]], ["ext.checkUser.images", "1gn6z"], ["ext.checkUser", "1nhxs", [22, 61, 66, 169, 188, 217, 221, 223, 225, 227]], ["ext.checkUser.styles", "vmbpl"], ["ext.ipInfo", "12xct", [51, 66, 204, 214]], ["ext.ipInfo.styles", "19tag"], ["ext.ipInfo.specialIpInfo", "1v4w9"], ["ext.kartographer", "1h6se"], ["ext.kartographer.style", "epn58"], ["ext.kartographer.site", "1rxn9"], ["mapbox", "dyc2x"], ["leaflet.draw", "yaa60", [689]], ["ext.kartographer.link", "13j3v", [693, 199]], ["ext.kartographer.box", "rjv5z", [694, 705, 688, 687, 697, 38, 224]], ["ext.kartographer.linkbox", "2q5eb", [697]], ["ext.kartographer.data", "l7ywb"], ["ext.kartographer.dialog", "1dl4j", [689, 199, 204, 209]], ["ext.kartographer.dialog.sidebar", "d81m3", [66, 221, 226]], ["ext.kartographer.util", "1f0vy", [686]], ["ext.kartographer.frame", "9rq0a", [692, 199]], ["ext.kartographer.staticframe", "14yma", [693, 199, 224]], ["ext.kartographer.preview", "173vm"], ["ext.kartographer.editing", "1hapb", [38]], ["ext.kartographer.editor", "19txf", [692, 690]], ["ext.kartographer.visualEditor", "1tox5", [697, 437, 223]], ["ext.kartographer.lib.leaflet.markercluster", "7fwoo", [689]], ["ext.kartographer.lib.topojson", "kkikj", [689]], ["ext.kartographer.wv", "thy9d", [689, 217]], ["ext.kartographer.specialMap", "kjbdy"], ["ext.pageviewinfo", "x36yf", ["ext.graph.render", 200]], ["ext.3d", "1kblb", [19]], ["ext.3d.styles", "jvyl2"], ["mmv.3d", "ujhs5", [709, 386]], ["mmv.3d.head", "1s1ko", [709, 201, 212, 214]], ["ext.3d.special.upload", "1p8c3", [714, 149]], ["ext.3d.special.upload.styles", "4pnv1"], ["special.readinglist.styles", "188ht"], ["special.readinglist.scripts", "1860d", [30]], ["ext.GlobalPreferences.global", "6cchy", [169, 178, 189]], ["ext.GlobalPreferences.local", "prs1p"], ["ext.GlobalPreferences.global-nojs", "kg98t"], ["ext.GlobalPreferences.local-nojs", "hlt0w"], ["ext.growthExperiments.mobileMenu.icons", "tjs8f"], ["ext.growthExperiments.SuggestedEditSession", "iblmd", [66, 75, 198]], ["ext.growthExperiments.LevelingUp.InviteToSuggestedEdits", "11cua", [201, 226]], ["ext.growthExperiments.HelpPanelCta.styles", "12od1"], ["ext.growthExperiments.HomepageDiscovery.styles", "1sm9j"], ["ext.growthExperiments.HomepageDiscovery", "1ol91"], ["ext.growthExperiments.Homepage.mobile", "1op0e", [730, 505]], ["ext.growthExperiments.Homepage", "s2c9d", [209]], ["ext.growthExperiments.Homepage.Impact", "npdym", [30, 26]], ["ext.growthExperiments.Homepage.Mentorship", "4n642", [738, 722, 199]], ["ext.growthExperiments.Homepage.SuggestedEdits", "fhiyy", [749, 722, 64, 199, 204, 209, 214, 217, 224]], ["ext.growthExperiments.Homepage.styles", "1op9y"], ["ext.growthExperiments.StructuredTask", "s378g", [736, 744, 443, 199, 224, 225, 226]], ["ext.growthExperiments.StructuredTask.desktop", "2chl4", [733, 412]], ["ext.growthExperiments.StructuredTask.mobile", "1u1nm", [733, 413]], ["ext.growthExperiments.StructuredTask.PreEdit", "dw8aq", [749, 722, 204, 209]], ["ext.growthExperiments.StructuredTask.Surfacing", "1e96g", [722, 201]], ["ext.growthExperiments.Help", "14t5b", [749, 744, 66, 204, 209, 213, 215, 216, 217, 221, 227]], ["ext.growthExperiments.HelpPanel", "sxdwv", [738, 724, 736, 64, 226]], ["ext.growthExperiments.HelpPanel.init", "1pah7", [722]], ["ext.growthExperiments.PostEdit", "1oo1m", [749, 722, 744, 209, 224, 226]], ["ext.growthExperiments.Account", "1vzud", [199, 204]], ["ext.growthExperiments.Account.styles", "vn6md"], ["ext.growthExperiments.icons", "14uvs"], ["ext.growthExperiments.MentorDashboard", "17p0g", [30, 744, 105, 188, 26, 209, 216, 217, 221, 224, 225, 226, 227, 28]], ["ext.growthExperiments.MentorDashboard.styles", "eokqt"], ["ext.growthExperiments.MentorDashboard.Discovery", "ls0i0", [64]], ["ext.growthExperiments.MentorDashboard.PostEdit", "oi8wx", [57]], ["ext.growthExperiments.DataStore", "e83n0", [201]], ["ext.growthExperiments.MidEditSignup", "av9sl", [66, 209]], ["ext.nearby.styles", "14xu6"], ["ext.nearby.scripts", "1fv29", [30, 753, 199]], ["ext.nearby.images", "1xmd4"], ["ext.phonos.init", "1gsyh"], ["ext.phonos", "1w9tr", [756, 754, 757, 201, 205, 224]], ["ext.phonos.icons.js", "e0hgu"], ["ext.phonos.styles", "1hl5i"], ["ext.phonos.icons", "1hvim"], ["ext.parsermigration.edit", "dv4zr"], ["ext.parsermigration.notice", "4xyx2", [77]], ["ext.parsermigration.indicator", "44kj2"], ["ext.communityConfiguration.Dashboard", "1eoom"], ["ext.communityConfiguration.Editor.styles", "suzvm"], ["ext.communityConfiguration.Editor", "1a96p", [47, 27]], ["ext.metricsPlatform", "atg19"], ["mw.config.values.wbCurrentSiteDetails", "15k4w"], ["mw.config.values.wbSiteDetails", "1ko2v"], ["mw.config.values.wbRepo", "18lj4"], ["ext.cite.referencePreviews", "1otk4", [393]], ["ext.pygments.view", "1eru0", [67]], ["ext.gadget.Navigation_popups", "1pw8v", [75], 2], ["ext.gadget.exlinks", "a9jh5", [77], 2], ["ext.gadget.lum", "15gua", [], 2], ["ext.gadget.Big_dynamap", "1liw6", [], 2], ["ext.gadget.ExternalSearch", "5shu0", [], 2], ["ext.gadget.QRpediaFix", "1li3q", [], 2], ["ext.gadget.MwToolbar", "t7ud2", [], 2], ["ext.gadget.EditToolbar", "a31v6", [], 2], ["ext.gadget.EditToolbar-core", "176ub", [75], 2], ["ext.gadget.edittop", "1uhpn", [5], 2], ["ext.gadget.wikEd", "x3e9d", [], 2], ["ext.gadget.HotCat", "1os58", [], 2], ["ext.gadget.Cat-a-lot", "3809b", [77], 2], ["ext.gadget.Advisor", "ummnp", [], 2], ["ext.gadget.CategoryMaster", "ubrg7", [77], 2], ["ext.gadget.MonobookToolbar", "1aupp", [5], 2], ["ext.gadget.MonobookToolbarStandard", "15n3x", [786], 2], ["ext.gadget.ProveIt", "1sw3x", [], 2], ["ext.gadget.EditToolbar-menu-page_elements", "13zlu", [779], 2], ["ext.gadget.EditToolbar-menu-thematic_templates", "emakb", [779], 2], ["ext.gadget.EditToolbar-menu-article_templates", "4pcbn", [779], 2], ["ext.gadget.EditToolbar-menu-talk_templates", "fxzve", [779], 2], ["ext.gadget.EditToolbar-menu-other_templates", "102an", [779], 2], ["ext.gadget.EditToolbar-menu-sources_templates", "18h3d", [779], 2], ["ext.gadget.EditToolbar-menu-admin_templates", "1hwdl", [779], 2], ["ext.gadget.EditToolbar-menu-oldstyle_work_templates", "12ddz", [779], 2], ["ext.gadget.OpenStreetMap", "u0djo", [77], 2], ["ext.gadget.ReferenceTooltips", "gunkq", [], 2], ["ext.gadget.UTCLiveClock", "19x8x", [], 2], ["ext.gadget.purgetab", "jo5gk", [77], 2], ["ext.gadget.cats-on-top", "4spiv", [], 2], ["ext.gadget.quicklinks", "1m9ni", [75], 2], ["ext.gadget.HideFundraisingNotice", "wn5x9", [], 2], ["ext.gadget.BKL", "1x0lz", [], 2], ["ext.gadget.quickeditcounter", "q24gy", [38], 2], ["ext.gadget.SmartWatchlist", "be5t3", [], 2], ["ext.gadget.SWLHideSettings", "h5n6q", [], 2], ["ext.gadget.Switcher", "7xozd", [], 2], ["ext.gadget.ParsePhabLinks", "1w4uo", [], 2], ["ext.gadget.Mwbot", "1f7cb", [80], 2], ["ext.gadget.WatchlistTopSectionWidgetFix", "dnta1", [], 2], ["ext.gadget.UploadRedirectToCommons", "18hv0", [], 2], ["ext.gadget.MoveToIncubator", "18uti", [], 2], ["ext.gadget.LegacyStyles", "12kex", [], 2], ["ext.gadget.Quick_patrol", "xy6r1", [77], 2], ["ext.gadget.Quick_diff", "286z1", [77], 2], ["ext.gadget.Quick_rollback", "14o24", [], 2], ["ext.confirmEdit.CaptchaInputWidget", "1swxx", [201]], ["ext.globalCssJs.user", "1son6", [], 0, "metawiki"], ["ext.globalCssJs.user.styles", "1son6", [], 0, "metawiki"], ["ext.wikimediaMessages.ipInfo.hooks", "1ep9x", [683]], ["ext.guidedTour.tour.firsteditve", "7n7fg", [481]], ["ext.echo.emailicons", "1od06"], ["ext.echo.secondaryicons", "1hdmk"], ["ext.wikimediaEvents.visualEditor", "19w1w", [410]], ["mw.cx.externalmessages", "vhkjs"], ["wikibase.Site", "dti9d", [588]], ["ext.guidedTour.tour.checkuserinvestigateform", "rn987", [481]], ["ext.guidedTour.tour.checkuserinvestigate", "1vwkq", [681, 481]], ["ext.guidedTour.tour.helppanel", "1tfay", [481]], ["ext.guidedTour.tour.homepage_mentor", "exsz5", [481]], ["ext.guidedTour.tour.homepage_welcome", "15nr3", [481]], ["ext.guidedTour.tour.homepage_discovery", "184p6", [481]], ["mediawiki.messagePoster", "9dsgz", [47]]]);
      mw.config.set(window.RLCONF || {});
      mw.loader.state(window.RLSTATE || {});
      mw.loader.load(window.RLPAGEMODULES || []);
      queue = window.RLQ || [];
      RLQ = [];
      RLQ.push = function(fn) {
          if (typeof fn === 'function') {
              fn();
          } else {
              RLQ[RLQ.length] = fn;
          }
      }
      ;
      while (queue[0]) {
          RLQ.push(queue.shift());
      }
      NORLQ = {
          push: function() {}
      };
  }());
  document.addEventListener('DOMContentLoaded', function() {
      var userMessageDiv = document.querySelector('.custom-usermessage');
      if (userMessageDiv) {
          userMessageDiv.remove();
      }
  });
}
