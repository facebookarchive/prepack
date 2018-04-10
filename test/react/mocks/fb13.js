function func(x) {
  if (x) {
    Bootloader.loadModules(['Foo'], function() {}, "Bar");
  }
}

if (window.__optimize) {
  __optimize(func);
}

func.getTrials = function() {
  return func.toString().includes(`Bootloader.loadModules(['Foo'], function () {}, "Bar");`);
};

module.exports = func;
