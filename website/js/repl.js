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
    choices: ["browser", "jsc-600-1-4-17", "node-source-maps", "node-react"],
    defaultVal: "node-react",
    description: "The target environment for Prepack"
  },
  {
    type: "string",
    name: "lazyObjectsRuntime",
    defaultVal: "",
    description: "Enable lazy objects feature and specify the JS runtime that supports this feature."
  },
  {
    type: "choice",
    name: "invariantLevel",
    choices: [0, 1, 2, 3],
    defaultVal: 0,
    description: "Whether and how many checks to generate that validate Prepack's assumptions about the environment."
  },
  {
    type: "boolean",
    name: "reactEnabled",
    defaultVal: true,
    description: "Enables support for React features, such as JSX syntax."
  },
  {
    type: "choice",
    name: "reactOutput",
    choices: ["jsx", "create-element"],
    defaultVal: "jsx",
    description: "Specifies the serialization output of JSX nodes when React mode is enabled."
  },
  {
    type: "boolean",
    name: "stripFlow",
    defaultVal: true,
    description: "Removes Flow type annotations from the output."
  },
];

var demos = [];
/**generate select */
function generateDemosSelect(obj, dom) {
  // var keys = ['<option value='+-1+'>select demo</option>'];
  var keys = [];
  demos = [];
  for (var name in obj) {
    demos.push(name);
    keys.push('<option value=' + name + '>' + name + '</option>');
  }
  dom.innerHTML = keys.join('');
}

var worker;
var debounce;

var messagesOutput = document.querySelector('.input .messages');
var replOutput = document.querySelector('.output .repl');

var isEmpty = /^\s*$/;

function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function createWikiLink(code) {
  const wikiLink = document.createElement('a');
  wikiLink.href = 'https://github.com/facebook/prepack/wiki/' + encodeURIComponent(code);
  wikiLink.text = code;
  wikiLink.setAttribute('target', '_blank');

  return wikiLink;
}

function createLineLink(location) {
  const lineLink = document.createElement('a');
  let lineNumber = location.start ? location.start.line : location.line;
  let colNumber = location.start ? location.start.column : location.column;
  colNumber++;
  let lineText = lineNumber + ':' + colNumber;

  lineLink.href = '';
  lineLink.onclick = function() {
    input.gotoLine(lineNumber);
    return false;
  };
  lineLink.text = lineText;
  lineLink.classList.add("line-link");

  return lineLink;
}

function processMessage(messageNode, data) {
  // TODO: syntax errors need their location stripped
  if (data.location) {
    const wikiLink = createWikiLink(data.errorCode);
    const lineLink = createLineLink(data.location);
    messageNode.appendChild(wikiLink);
    messageNode.appendChild(document.createTextNode(' ('));
    messageNode.appendChild(lineLink);
    messageNode.appendChild(document.createTextNode('):  ' + data.message + '\n'));
  } else if (!data.code) {
    messageNode.appendChild(document.createTextNode(data.message + '\n'));
  } else {
    const wikiLink = createWikiLink(data.errorCode);
    messageNode.appendChild(wikiLink);
    messageNode.appendChild(document.createTextNode(': ' + data.message + '\n'));
  }
}

function getMessageClassType(severity) {
  switch(severity) {
    case "FatalError":
      return "error";
    case "RecoverableError":
      return "error";
    case "Warning":
      return "warning";
    case "Information":
      return "warning";
    default:
      return "error";
  }
}

function showMessages(messages) {
  messagesOutput.style.display = 'inline-block';
  
  for (var i in messages) {
    const message = document.createElement('div');
    message.classList.add("message", getMessageClassType(messages[i].severity));

    processMessage(message, messages[i]);

    messagesOutput.appendChild(message);
  }
}

function getHashedDemo(hash) {
  if (hash[0] !== '#' || hash.length < 2) return null;
  var encoded = hash.slice(1);
  if (encoded.match(/^[a-zA-Z0-9+/=_-]+$/)) {
    return LZString.decompressFromEncodedURIComponent(encoded)
  }
  return null;
}

function makeDemoSharable() {
  var encoded = LZString.compressToEncodedURIComponent(input.getValue());
  history.replaceState(undefined, undefined, `#${encoded}`);
}

function showGeneratedCode(code) {
  if (isEmpty.test(code) && !isEmpty.test(input.getValue())) {
    code =
      '// Your code was all dead code and thus eliminated.\n' + '// Try storing a property on the global object.';
  }
  output.setValue(code, -1);
}

function showGenerationGraph(graph) {
  drawGraphCallback = () => {
    if (graph) {
      var graphData = JSON.parse(graph);
      var visData = {
        nodes: graphData.nodes,
        edges: graphData.edges,
      };

      var visOptions = {};
      var boxNetwork = new vis.Network(graphBox, visData, visOptions);
    }
  };

  if (showGraphDiv) drawGraphCallback();
}

function compile() {
  clearTimeout(debounce);
  terminateWorker();

  messagesOutput.innerHTML = '';
  messagesOutput.style.display = 'none';
  replOutput.style.display = 'block';

  output.setValue('// Compiling...', -1);

  debounce = setTimeout(function() {
    worker = new Worker('js/repl-worker.js');
    worker.onmessage = function(e) {
      const result = e.data;
      if (result.type === 'success') {
        const { data, graph, messages } = result;
        showGeneratedCode(data);
        showGenerationGraph(graph);
        showMessages(messages);
      } else if (result.type === 'error') {
        const errors = result.data;
        showMessages(errors);
        output.setValue('// Prepack is unable to produce output for this input.\n// Please check the left pane for diagnostic information.', -1);
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
input.on('change', makeDemoSharable);

/**record **/
var selectRecord = document.querySelector('select.select-record');
var optionsRecord = document.querySelector('#optionsMenuRecord');
var selectInput = document.querySelector('#recordName');
var optionsButton = document.querySelector('#optionsMenuButton');
var saveButton = document.querySelector('#saveBtn');
var deleteButton = document.querySelector('#deleteBtn');
var storage = window.localStorage;

/** graph **/
var graphButton = document.querySelector('#graphBtn');
var graphBox = document.getElementById('graphBox');
var graphDiv = document.querySelector('#graph');
var inputDiv = document.getElementById('inputDiv');
var outputDiv = document.getElementById('outputDiv');
var showGraphDiv = false;
var drawGraphCallback = null;

function changeDemosSelect(val) {
  if (!val.value) return;
  selectInput.value = val.value;
  var localCache = getDemosCache();
  var code = localCache[val.value] || '';
  input.setValue(code);
  compile();
}

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
    '  ["A", "B", 42].forEach(function(x) {',
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

  var hashedDemo = getHashedDemo(location.hash);
  name = null;
  if (hashedDemo) {
    name = createHashedDemoName(hashedDemo, cache);
    cache[name] = hashedDemo;
  }

  generateDemosSelect(cache, selectRecord);
  setDemosCache(cache);
  setTimeout(() => {
    demoSelector.change(name || 'Fibonacci');
  });
}

function createHashedDemoName(hashedDemo, cache) {
  var name = '\xa0';
  for (var key in cache) {
    if (cache[key] === hashedDemo) {
      name = key;
      break;
    }
  }
  return name;
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

graphButton.addEventListener('click', () => {
  if (!showGraphDiv) {
    inputDiv.style.width = "33%";
    outputDiv.style.width = "33%";
    graphDiv.style.width = "34%";
    outputDiv.style.left = "33%";
    graphDiv.style.display = "block";
    showGraphDiv = true;
    graphButton.innerHTML = "HIDE HEAP";
    if (drawGraphCallback !== null) {
      drawGraphCallback();
      drawGraphCallback = null;
    }
  } else {
    inputDiv.style.width = "50%";
    outputDiv.style.width = "50%";
    graphDiv.style.width = "50%";
    outputDiv.style.left = "50%";
    graphDiv.style.display = "none";
    showGraphDiv = false;
    graphButton.innerHTML = "SHOW HEAP";
  }
});
