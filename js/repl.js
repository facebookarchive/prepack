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

var demos = [];
/**generate select */
function generateSelect(obj, dom) {
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
  let loc = error.location ? error.location.start.line + '' + error.location.start.column + ' ' : '';
  if (error.location) {
    let errorLineLink = document.createElement('a');
    let lineText = error.location.start.line + ':' + error.location.start.column;
    let lineNumber = error.location.start.line;
    errorLineLink.href = '';
    errorLineLink.onclick = function() {
      input.gotoLine(lineNumber);
      return false;
    };
    errorLineLink.text = lineText;
    errorLineLink.style.color = 'red';
    let beforeText = error.severity + ' (';
    let afterText = '): ' + error.errorCode + ' ' + error.message + '\n';
    let beforeLineNumber = document.createTextNode(beforeText);
    let afterLineNumber = document.createTextNode(afterText);
    errorOutput.appendChild(beforeLineNumber);
    errorOutput.appendChild(errorLineLink);
    errorOutput.appendChild(afterLineNumber);
  } else {
    errorOutput.appendChild(
      document.createTextNode(error.severity + ': ' + error.errorCode + ' ' + error.message + '\n'),
    );
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
    worker.postMessage(input.getValue());
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
var selectInput = document.querySelector('#recordName');
var saveButton = document.querySelector('#saveBtn');
var deleteButton = document.querySelector('#deleteBtn');
var storage = window.localStorage;

var selectCache = getCache();
var defaultName, defaultVal;
var defaultCode = [
  '(function() {',
  '  function fib(x) {',
  '    return x <= 1 ? x : fib(x - 1) + fib(x - 2);',
  '  }',
  '',
  '  let x = Date.now();',
  '  if (x * 2 > 42) x = fib(10);',
  '  global.result = x;',
  '})();',
].join('\n');
defaultName = generateSelect(selectCache, selectRecord);
selectInput.value = defaultName || '';
defaultVal = defaultName ? selectCache[defaultName] : defaultCode;
input.setValue(defaultVal);
compile();

function changeSelect(val) {
  if (!val.value) return;
  selectInput.value = val.value;
  var localCache = getCache();
  var code = localCache[val.value] || '';
  input.setValue(code);
  compile();
}
changeSelect(defaultVal);

var demoSelector = new Select({
  el: selectRecord,
  className: 'select-theme-dark',
});
demoSelector.on('change', changeSelect);

function getCache() {
  return JSON.parse(storage.getItem('prepackDemos') || '{}');
}

function setCache(data) {
  storage.setItem('prepackDemos', JSON.stringify(data || {}));
}
deleteButton.addEventListener('click', () => {
  var name = selectInput.value;
  if (name == null || name.replace(/\s+/, '') === '') return;
  if (demos.length === 0) {
    selectInput.value = '';
    return;
  }
  var cache = getCache();
  delete cache[name];
  input.setValue('');
  generateSelect(cache, selectRecord);
  setCache(cache);
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
  var cache = getCache();
  cache[name] = code;
  generateSelect(cache, selectRecord);
  setCache(cache);
  setTimeout(() => {
    demoSelector.change(name);
  });
});
