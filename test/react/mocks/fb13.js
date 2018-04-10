
function func(x) {
  if (x) {
    Bootloader.loadModules(['Foo'], function() {}, "Bar");
  }
}

if (window.__optimize) {
  __optimize(func);
}

// when running this test through the JS evaluator
// rather than Prepack, window.__abstract will be
// undefined, allowing the evaluation to run this
// assertion
if (!window.__abstract) {
  if (!func.toString().includes(`Bootloader.loadModules(['Foo'], function () {}, "Bar");`)) {
    throw new Error("Test failed!");
  }
}

window.result = func;
