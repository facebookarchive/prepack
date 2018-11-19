// es6
// does not contain:r(0)
// initialize more modules

var modules = Object.create(null);
__d = define;

require = function(moduleId) {
  var moduleIdReallyIsNumber = moduleId;
  var module = modules[moduleIdReallyIsNumber];
  return module && module.isInitialized ? module.exports : guardedLoadModule(moduleIdReallyIsNumber, module);
};

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
  module.exports = { foo: " hello " };
}, 0, null);

define(function(global, r, module, exports) {
  module.exports = function() {
    return r(0);
  };
}, 1, null);

inspect = function() {
  return require(0).foo;
};

var verboseNamesToModuleIds = {};
var ErrorUtils = undefined;
var nativeRequire = undefined;
if (global.__makePartial) __makePartial(this);
