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
            '// Your code was all dead code and thus eliminated.\n' +
            '// Try storing a property on the global object.';
        }
        output.setValue(code, -1);
      } else if (result.type === 'error') {
          let errorText = result.data;
          if (!errorText.startsWith('Unexpected')) {
            errorOutput.style.display = 'block';
            replOutput.style.display = 'none';
            errorOutput.textContent = errorText;        
        } else {
          let errorLineLink = document.createElement('a');
          let lineText = getLineText(errorText);
          let lineNumber = lineText.slice(0,1);
          errorOutput.style.display = 'block';
          replOutput.style.display = 'none';
          errorLineLink.href = '';
          errorLineLink.onclick = function() {
          input.gotoLine(lineNumber);
          return false;
          }
          errorLineLink.text = lineText;
          errorLineLink.style.color = 'red';
          let beforeLineNumber = document.createTextNode(errorText.slice(0, errorText.indexOf(lineText)));
          let afterLineNumber = document.createTextNode(errorText.slice(errorText.indexOf(')')));
          errorOutput.appendChild(beforeLineNumber);
          errorOutput.appendChild(errorLineLink);
          errorOutput.appendChild(afterLineNumber);
        }
      }

      terminateWorker();
    };
    worker.postMessage(input.getValue());
  }, 500);
}

let getLineText = function(errorText){
  // Of the form (7:5);
  let lineRegEx = /[:\d)]/g;
  let closingBraceIndex = errorText.indexOf(')');
  return errorText.slice(lineRegEx.exec(errorText).index, closingBraceIndex);

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
