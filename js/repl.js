function createEditor(elem) {
  var editor = ace.edit(elem);
  var session = editor.getSession();

  editor.setTheme('ace/theme/tomorrow');
  editor.setShowPrintMargin(false);
  editor.commands.removeCommands(['gotoline', 'find']);

  session.setMode('ace/mode/javascript');
  session.setUseSoftTabs(true);
  session.setTabSize(2);
  session.setUseWorker(false);

  editor.setOption('scrollPastEnd', 0.33);

  elem.style.lineHeight = '18px';

  return editor;
}

var optionsConfig = [
  {
    type: "string",
    name: "mathRandomSeed",
    defaultVal: "",
    description: "If you want Prepack to evaluate Math.random() calls, please provide a seed."
  },
  {
    type: "boolean",
    name: "inlineExpressions",
    defaultVal: true,
    description: "Avoids naming expressions when they are only used once, and instead inline them where they are used."
  },
  {
    type: "boolean",
    name: "delayInitializations",
    defaultVal: false,
    description: "Delay initializations."
  },
  {
    type: "choice",
    name: "compatibility",
    choices: ["browser", "jsc-600-1-4-17", "node-source-maps", "node-cli"],
    defaultVal: "browser",
    description: "The target environment for Prepack"
  }
];

var demos = [];
/**generate select */
function generateDemosSelect(obj, dom) {
  var tmpName;
  // var keys = ['<option value='+-1+'>select demo</option>'];
  var keys = [];
  demos = [];
  for (var name in obj) {
    if (!tmpName) {
      tmpName = name;
    }
    demos.push(name);
    keys.push('<option value=' + name + '>' + name + '</option>');
  }
  dom.innerHTML = keys.join('');
  return tmpName;
}

var worker;
var debounce;

var errorOutput = document.querySelector('.output .error');
var replOutput = document.querySelector('.output .repl');

var isEmpty = /^\s*$/;

function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function processError(errorOutput, error) {
  let errorWikiLink = document.createElement('a');
  errorWikiLink.href = 'https://github.com/facebook/prepack/wiki/' + encodeURIComponent(error.errorCode);
  errorWikiLink.text = error.errorCode;
  errorWikiLink.setAttribute('target', '_blank');
  //console.log(JSON.stringify(error));
  // TODO: syntax errors need their location stripped
  if (error.location) {
    let errorLineLink = document.createElement('a');
    let lineNumber = error.location.start ? error.location.start.line : error.location.line;
    let colNumber = error.location.start ? error.location.start.column : error.location.column;
    colNumber++;
    let lineText = lineNumber + ':' + colNumber;
    errorLineLink.href = '';
    errorLineLink.onclick = function() {
      input.gotoLine(lineNumber);
      return false;
    };
    errorLineLink.text = lineText;
    errorLineLink.style.color = 'red';
    errorOutput.appendChild(errorWikiLink);
    errorOutput.appendChild(document.createTextNode(' ('));
    errorOutput.appendChild(errorLineLink);
    errorOutput.appendChild(document.createTextNode('):  ' + error.message + '\n'));
  } else if (!error.code) {
    errorOutput.appendChild(document.createTextNode(error.message + '\n'));
  } else {
    errorOutput.appendChild(errorWikiLink);
    errorOutput.appendChild(document.createTextNode(': ' + error.message + '\n'));
  }
}

function compile() {
  clearTimeout(debounce);
  terminateWorker();

  errorOutput.innerHTML = '';
  errorOutput.style.display = 'none';
  replOutput.style.display = 'block';

  output.setValue('// Compiling...', -1);

  debounce = setTimeout(function() {
    worker = new Worker('js/repl-worker.js');
    worker.onmessage = function(e) {
      // turn off compiling

      var result = e.data;
      if (result.type === 'success') {
        var code = result.data;
        if (isEmpty.test(code) && !isEmpty.test(input.getValue())) {
          code =
            '// Your code was all dead code and thus eliminated.\n' + '// Try storing a property on the global object.';
        }
        output.setValue(code, -1);
      } else if (result.type === 'error') {
        let errors = result.data;
        if (typeof errors === 'string') {
          errorOutput.style.display = 'block';
          replOutput.style.display = 'none';
          errorOutput.textContent = errors;
        } else {
          errorOutput.style.display = 'block';
          replOutput.style.display = 'none';
          for (var i in errors) {
            processError(errorOutput, errors[i]);
          }
        }
      }
      terminateWorker();
    };

    var options = {}
    for (var configIndex in optionsConfig) {
      var config = optionsConfig[configIndex];
      var domE = document.querySelector("#prepack-option-" + config.name);
      if (config.type === "choice") {
        options[config.name] = domE.options[domE.selectedIndex].value;
      } else if (config.type === "boolean") {
        options[config.name] = (domE.checked === true);
      } else if (config.type === "string") {
        if (domE.value) {
          options[config.name] = domE.value;
        }
      }      
    }

    worker.postMessage({code: input.getValue(), options: options});
  }, 500);
}

var output = createEditor(replOutput);
output.setReadOnly(true);
output.setHighlightActiveLine(false);
output.setHighlightGutterLine(false);

var input = createEditor(document.querySelector('.input .repl'));
input.on('change', compile);

/**record **/

var selectRecord = document.querySelector('select.select-record');
var optionsRecord = document.querySelector('#optionsMenuRecord');
var selectInput = document.querySelector('#recordName');
var optionsButton = document.querySelector('#optionsMenuButton');
var saveButton = document.querySelector('#saveBtn');
var deleteButton = document.querySelector('#deleteBtn');
var storage = window.localStorage;

var demosSelectCache = getDemosCache();
var defaultName, defaultVal;
defaultName = generateDemosSelect(demosSelectCache, selectRecord);
selectInput.value = defaultName || '';
defaultVal = defaultName ? demosSelectCache[defaultName] : '';
input.setValue(defaultVal);
compile();

function changeDemosSelect(val) {
  if (!val.value) return;
  selectInput.value = val.value;
  var localCache = getDemosCache();
  var code = localCache[val.value] || '';
  input.setValue(code);
  compile();
}
changeDemosSelect(defaultVal);

var demoSelector = new Select({
  el: selectRecord,
  className: 'select-theme-dark',
});
demoSelector.on('change', changeDemosSelect);

function getDemosCache() {
  return JSON.parse(storage.getItem('prepackDemos') || '{}');
}

function setDemosCache(data) {
  storage.setItem('prepackDemos', JSON.stringify(data || {}));
}

function addDefaultExamples() {
  var cache = getDemosCache();
  var code, name;
  name = 'EliminationOfAbstractionTax';
  code = [
    '(function () {',
    '  var self = this;',
    '    ["A", "B", 42].forEach(function(x) {',
    '    var name = "_" + x.toString()[0].toLowerCase();',
    '    var y = parseInt(x);',
    '    self[name] = y ? y : x;',
    '  });',
    '})();',
  ].join('\n');
  cache[name] = code;

  name = 'EnvironmentInteractionsAndBranching';
  code = [
    '(function(){',
    '  function fib(x) { return x <= 1 ? x : fib(x - 1) + fib(x - 2); }',
    '  let x = Date.now();',
    '  if (x === 0) x = fib(10);',
    '  global.result = x;',
    '})();',
  ].join('\n');
  cache[name] = code;

  name = 'Fibonacci';
  code = [
    '(function () {',
    '  function fibonacci(x) {',
    '    return x <= 1 ? x : fibonacci(x - 1) + fibonacci(x - 2);',
    '  }',
    '  global.x = fibonacci(10);',
    '})();',
  ].join('\n');
  cache[name] = code;

  name = 'HelloWorld';
  code = [
    '(function () {',
    '  function hello() { return "hello"; }',
    '  function world() { return "world"; }',
    '  global.s = hello() + " " + world();',
    '})();',
  ].join('\n');
  cache[name] = code;

  name = 'ModuleInitialization';
  code = [
    '(function () {',
    '  let moduleTable = {};',
    '  function define(id, f) { moduleTable[id] = f; }',
    '  function require(id) {',
    '    let x = moduleTable[id];',
    '    return x instanceof Function ? (moduleTable[id] = x()) : x;',
    '  }',
    '  global.require = require;',
    '  define("one", function() { return 1; });',
    '  define("two", function() { return require("one") + require("one"); });',
    '  define("three", function() { return require("two") + require("one"); });',
    '  define("four", function() { return require("three") + require("one"); });',
    '})();',
    'three = require("three");'
  ].join('\n');
  cache[name] = code;

  generateDemosSelect(cache, selectRecord);
  setDemosCache(cache);
  setTimeout(() => {
    demoSelector.change('Fibonacci');
  });
}

function addOptions() {
  var optionStrings = [];
  for (var configIndex in optionsConfig) {
    var config = optionsConfig[configIndex];
    var configId = 'prepack-option-' + config.name;
    optionStrings.push("<div class='prepack-option'>");    
    optionStrings.push("<label class='prepack-option-label' for='");
    optionStrings.push(configId);
    optionStrings.push("'>");
    optionStrings.push(config.name);
    optionStrings.push("<div class='prepack-option-description'>");
    optionStrings.push(config.description);
    optionStrings.push("</div>");
    if (config.type === "choice") {
      optionStrings.push("<select id='");
      optionStrings.push(configId);
      optionStrings.push("'>");
      for (var nameIndex in config.choices) {
        var name = config.choices[nameIndex];
        if (name === config.defaultVal) {
          optionStrings.push('<option value=' + name + ' selected>' + name + '</option>');
        } else {
          optionStrings.push('<option value=' + name + '>' + name + '</option>');
        }
      }
      optionStrings.push("</select>");
    } else if (config.type === "boolean") {
      optionStrings.push("<input type='checkbox' id='");
      optionStrings.push(configId);
      if (config.defaultVal === true) {
        optionStrings.push("' checked=true>")
      } else {
        optionStrings.push("'>");
      }
    } else if (config.type === "string") {
      optionStrings.push("<input type='text' id='");
      optionStrings.push(configId);
      if (config.defaultVal != null) {
        optionStrings.push("' value='");
        optionStrings.push(config.defaultVal);
        optionStrings.push("'>");
      } else {
        optionStrings.push("'>");
      }
    }    
    optionStrings.push("</label>");
    optionStrings.push("</div>");
  }
  optionsRecord.innerHTML = optionStrings.join('');
  for (var configIndex in optionsConfig) {
    var config = optionsConfig[configIndex];
    var domE = document.querySelector("#prepack-option-" + config.name);
    if (config.type === "choice") {
      var demoSelector = new Select({
        el: domE,
        className: 'select-theme-dark',
      });
      domE.addEventListener('change', compile);
    } else if (config.type === "boolean") {
      domE.addEventListener('change', compile);
    } else if (config.type === "string") {
      domE.addEventListener('input', compile);
    }
  }

  optionsButton.onclick = function() {
    if (optionsRecord.style.display !== "inline-block") {
      optionsRecord.style.display = "inline-block" ;
    } else {
      optionsRecord.style.display = "none" ;
    }
  };
}

addDefaultExamples();

addOptions();

deleteButton.addEventListener('click', () => {
  var name = selectInput.value;
  if (name == null || name.replace(/\s+/, '') === '') return;
  if (demos.length === 0) {
    selectInput.value = '';
    return;
  }
  var cache = getDemosCache();
  delete cache[name];
  input.setValue('');
  generateDemosSelect(cache, selectRecord);
  setDemosCache(cache);
  if (demos.length > 0) {
    selectInput.value = demos[0];
    setTimeout(() => {
      demoSelector.change(demos[0]);
    });
  } else {
    selectInput.value = '';
    input.setValue(defaultCode);
    compile();
  }
});

saveButton.addEventListener('click', () => {
  var name = selectInput.value;
  if (name == null || name.replace(/\s+/, '') === '') return;
  var code = input.getValue();
  var cache = getDemosCache();
  cache[name] = code;
  generateDemosSelect(cache, selectRecord);
  setDemosCache(cache);
  setTimeout(() => {
    demoSelector.change(name);
  });
});
