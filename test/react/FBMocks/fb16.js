var React = require("React");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

__evaluatePureFunction(function() {
  var fbt;
  var _cachedFbtResults = {};

  fbt = function fbt() {};

  fbt._ = function(table, args) {
    var allSubstitutions = {};
    var pattern = table;
    if (table.__vcg) {
      args = args || [];
    }
    if (args) {
      pattern = this._accessTable(table, allSubstitutions, args, 0);
    }
    var cachedFbt = _cachedFbtResults[pattern];
    var hasSubstitutions;
    if (cachedFbt && !hasSubstitutions) {
      return cachedFbt;
    } else {
      var fbtContent;
      var result;
      if (!hasSubstitutions) {
        _cachedFbtResults[pattern] = result;
      }
      return result;
    }
  };

  fbt._accessTable = function(table, substitutions, args, argsIndex) {
    if (argsIndex >= args.length) {
      return table;
    } else if (table == null) {
      return null;
    }
    var pattern = null;
    var arg = args[argsIndex];
    var tableIndex = arg[0];

    if (!Array.isArray(tableIndex)) {
      table = tableIndex !== null ? table[tableIndex] : table;
      pattern = this._accessTable(table, substitutions, args, argsIndex + 1);
    }
    return pattern;
  };

  function _getNumberVariations(number) {
    var numberType;
    if (number === 1) {
      return ["", numberType, "*"];
    }
    return [numberType, "*"];
  }

  fbt._param = fbt.param = function(label, value, variations) {
    return [null, {}];
  };

  fbt._plural = fbt.plural = function(count, label, value) {
    var variation = _getNumberVariations(count);
    return [variation, []];
  };

  var React = require("react");
  function ViewCount(props) {
    return React.createElement(
      "div",
      null,
      fbt._({ "*": "{count} Views", _1: "{count} View" }, [
        fbt._param("count", props.feedback.viewCountReduced),
        fbt._plural(props.feedback.viewCount),
      ])
    );
  }

  ViewCount.getTrials = function(renderer, Root) {
    renderer.update(<Root feedback={{ viewCountReduced: 0, viewCount: 0 }} />);
    return [["fb16 mocks", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(ViewCount, {
      firstRenderOnly: true,
    });
  }

  module.exports = ViewCount;
});
