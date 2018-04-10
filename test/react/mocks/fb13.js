
function func(x) {
  if (x) {
    Bootloader.loadModules(['Foo'], function() {}, "Bar");
  }
}

if (window.__optimize) {
  __optimize(func);
}

if (!window.__abstract) {
  if (!func.toString().includes(`Bootloader.loadModules(['Foo'], function () {}, "Bar");`)) {
    throw new Error("Test failed!");
  }
}

window.result = func;
