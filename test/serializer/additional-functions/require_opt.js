// es6
// does not contain:var y = 5;
// does not contain:var y = 10;
var modules = Object.create(null);

__d = define;
function require(moduleId) {
  var moduleIdReallyIsNumber = moduleId;
  var module = modules[moduleIdReallyIsNumber];
  return module && module.isInitialized ? module.exports : guardedLoadModule(moduleIdReallyIsNumber, module);
}

function define(factory, moduleId, dependencyMap) {
  if (moduleId in modules) {
    return;
  }
  modules[moduleId] = {
    dependencyMap: dependencyMap,
    exports: undefined,
    factory: factory,
    hasError: false,
    isInitialized: false,
  };

  var _verboseName = arguments[3];
  if (_verboseName) {
    modules[moduleId].verboseName = _verboseName;
    global.verboseNamesToModuleIds[_verboseName] = moduleId;
  }
}

var inGuard = false;
function guardedLoadModule(moduleId, module) {
  if (!inGuard && global.ErrorUtils) {
    inGuard = true;
    var returnValue = void 0;
    try {
      returnValue = loadModuleImplementation(moduleId, module);
    } catch (e) {
      global.ErrorUtils.reportFatalError(e);
    }
    inGuard = false;
    return returnValue;
  } else {
    return loadModuleImplementation(moduleId, module);
  }
}

function loadModuleImplementation(moduleId, module) {
  var nativeRequire = global.nativeRequire;
  if (!module && nativeRequire) {
    nativeRequire(moduleId);
    module = modules[moduleId];
  }

  if (!module) {
    throw unknownModuleError(moduleId);
  }

  if (module.hasError) {
    throw moduleThrewError(moduleId);
  }

  module.isInitialized = true;
  var exports = (module.exports = {});
  var _module = module,
    factory = _module.factory,
    dependencyMap = _module.dependencyMap;
  try {
    var _moduleObject = { exports: exports };

    factory(global, require, _moduleObject, exports, dependencyMap);

    module.factory = undefined;

    return (module.exports = _moduleObject.exports);
  } catch (e) {
    module.hasError = true;
    module.isInitialized = false;
    module.exports = undefined;
    throw e;
  }
}

function unknownModuleError(id) {
  var message = 'Requiring unknown module "' + id + '".';
  return Error(message);
}

function moduleThrewError(id) {
  return Error('Requiring module "' + id + '", which threw an exception.');
}

// === End require code ===

define(function(global, require, module, exports) {
  let exportval = { foo: " hello " };
  module.exports = exportval;
}, 0, null);

define(function(global, require, module, exports) {
  var x1 = require(0);
  var y = require(2);
  module.exports = {
    bar: " goodbye",
    foo2: x1.foo,
    baz: y.baz,
  };
}, 1, null);

define(function(global, require, module, exports) {
  module.exports = { baz: " foo " };
}, 2, null);

function additional1() {
  var x2 = require(0);
  global.foo = function() {
    return x2;
  };
  var y = 5;
}

function additional2() {
  //global.bar = function() { return require(0).baz + "bar"; }
  global.bar = function() {
    return 5;
  };
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional1();
  additional2();

  let requireequal = require(0) === global.foo();
  let uninitialized = modules[1].exports === undefined && require(1).bar === " goodbye";
  return " " + requireequal + uninitialized + global.bar();
};
