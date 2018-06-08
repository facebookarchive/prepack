function func(x) {
  if (x) {
    Bootloader.loadModules(['Foo'], function() {}, "Bar");
  }
}

if (this.__optimize) {
  __optimize(func);
}

func.getTrials = function(_, fn) {
  if (!fn.toString().includes('Bootloader.loadModules(')) {
    throw new Error('Expected to find Bootloader.loadModules() call.');
  }
  return [];
};

module.exports = func;
