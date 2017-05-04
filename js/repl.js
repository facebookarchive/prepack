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

function compile() {
  clearTimeout(debounce);
  terminateWorker();

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
            '// Your code was all dead code and thus eliminated.\n' +
            '// Try storing a property on the global object.';
        }
        output.setValue(code, -1);
      } else if (result.type === 'error') {
        errorOutput.style.display = 'block';
        replOutput.style.display = 'none';
        errorOutput.textContent = result.data;
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
input.setValue([
  '(function() {',
  '  function fib(x) {',
  '    return x <= 1 ? x : fib(x - 1) + fib(x - 2);',
  '  }',
  '',
  '  let x = Date.now();',
  '  if (x * 2 > 42) x = fib(10);',
  '  global.result = x;',
  '})();'
].join('\n'), -1);
compile();
input.on('change', compile);
