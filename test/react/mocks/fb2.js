const React = require("react");
this['React'] = React;

if (!window.babelHelpers) {
	window.babelHelpers = {
		inherits(subClass, superClass) {
			Object.assign(subClass, superClass);
			subClass.prototype = Object.create(superClass && superClass.prototype);
			subClass.prototype.constructor = subClass;
			subClass.__superConstructor__ = superClass;
			return superClass;
		},
		_extends: Object.assign,
		extends: Object.assign,
		objectWithoutProperties(obj, keys) {
			var target = {};
			for (var i in obj) {
				if (!hasOwn.call(obj, i) || keys.indexOf(i) >= 0) {
					continue;
				}
				target[i] = obj[i];
			}
			return target;
		},
		taggedTemplateLiteralLoose(strings, raw) {
			strings.raw = raw;
			return strings;
		},
		bind: Function.prototype.bind,
	};
}

module.exports =  (function(modules) {
  // webpackBootstrap
   // The module cache
   var installedModules = {}; // The require function
  
    function __webpack_require__(moduleId) {
    
     // Check if module is in cache
     if (installedModules[moduleId]) {
       return installedModules[moduleId].exports;
      
    } // Create a new module (and put it into the cache)
      var module = (installedModules[moduleId] = {
       i: moduleId,
       l: false,
       exports: {}
      
    }); // Execute the module function
    
      modules[moduleId].call(
      module.exports,
      module,
      module.exports,
      __webpack_require__
    ); // Flag the module as loaded
    
      module.l = true; // Return the exports of the module
    
      return module.exports;
    
  } // expose the modules object (__webpack_modules__)
  
  
    __webpack_require__.m = modules; // expose the module cache
  
    __webpack_require__.c = installedModules; // define getter function for harmony exports
  
    __webpack_require__.d = function(exports, name, getter) {
     if (!__webpack_require__.o(exports, name)) {
       Object.defineProperty(exports, name, {
         configurable: false,
         enumerable: true,
         get: getter
        
      });
      
    }
    
  }; // getDefaultExport function for compatibility with non-harmony modules
  
    __webpack_require__.n = function(module) {
     var getter =
      module && module.__esModule
        ?  function getDefault() {
            return module["default"];
          }
        :  function getModuleExports() {
            return module;
          };
     __webpack_require__.d(getter, "a", getter);
     return getter;
    
  }; // Object.prototype.hasOwnProperty.call
  
    __webpack_require__.o = function(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
  }; // __webpack_public_path__
  
    __webpack_require__.p = ""; // Load entry module and return exports
  
    return __webpack_require__((__webpack_require__.s = 0));
  
})(
  /************************************************************************/
   [
    /* 0 */
    /***/ function(module, exports, __webpack_require__) {
      "use strict";

      var _React$Component, _superProto;

      var React = __webpack_require__(1);
      _React$Component = babelHelpers.inherits(Hello, React.Component);
      _superProto = _React$Component && _React$Component.prototype;
      Hello.prototype.componentDidMount = function() {
        // works!
      };
      Hello.prototype.render = function() {
        return React.createElement(
          "h1",
          null,
          "Hello world",

          React.createElement("img", {
            src:
              "http://foo",
            alt: "Dan",
            width: "32",
            height: "32"
          })
        );
      };
      function Hello() {
        _React$Component.apply(this, arguments);
			}
			
			Hello.getTrials = function(renderer, Root) {
				renderer.update(<Root />);
				return [['fb2 mocks', renderer.toJSON()]];
			};

      if (window.__registerReactComponentRoot) {
        __registerReactComponentRoot(Hello);
      }

      module.exports = Hello;

      /***/
    },
    /* 1 */
    /***/ function(module, exports) {
      module.exports = require("React");

      /***/
    }
    
  ]
);
