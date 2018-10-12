// expected Warning: PP0023,PP1007
if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

global.result = __evaluatePureFunction(() => {
  var something_E = global.__abstract ? __abstract(undefined, "({link_react_default_hash: {}})") : {};

  var babelHelpers = {
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
      var hasOwn = Object.prototype.hasOwnProperty;
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

  function invariant(condition, message) {
    if (condition) return;
    throw new Error(message);
  }

  var someModuleY = global.__abstract ? __abstract(undefined, "({getURIBuilder() {return new global.URI();}})") : {};
  var ActorURIConfig = global.__abstract ? __abstract(undefined, "({PARAMETER_ACTOR: 0})") : { PARAMETER_ACTOR: 0 };
  global.URI = global.__abstract
    ? __abstract(undefined, "(function (){return {addQueryData() {}}})")
    : function() {
        return { addQueryData() {} };
      };

  var ActorURI = {
    create: function create(uri, actorID) {
      return new URI(uri).addQueryData(ActorURIConfig.PARAMETER_ACTOR, actorID);
    },
    PARAMETER_ACTOR: ActorURIConfig.PARAMETER_ACTOR,
  };

  var someModuleX = {
    getDialogURI: function getDialogURI(_ref) {
      var actorID = _ref.actorID;
      var feedbackTargetID = _ref.feedbackTargetID;
      var reactionKey = _ref.reactionKey;
      return ActorURI.create(
        someModuleY
          .getURIBuilder()
          .setString("foobar", feedbackTargetID)
          .setEnum("foobar", reactionKey)
          .getURI(),
        actorID
      );
    },

    getPageURI: function getPageURI(_ref2) {
      var actorID = _ref2.actorID;
      var feedbackTargetID = _ref2.feedbackTargetID;
      return ActorURI.create(
        someModuleY
          .getURIBuilder()
          .setString("foobar", feedbackTargetID)
          .getURI(),
        actorID
      );
    },

    getPrimerProps: function getPrimerProps(args) {
      var pageURI = someModuleX.getPageURI(args);
      var dialogURI = someModuleX.getDialogURI(args);
      return {
        ajaxify: dialogURI,
        href: pageURI,
        rel: "foobar",
      };
    },
  };

  var reactionEdge = global.__abstract ? __abstract(undefined, "({reaction_type: {}})") : { reaction_type: {} };
  var actorID = global.__abstract ? __abstract(undefined, "(1)") : 1;
  var reactionIndex = global.__abstract ? __abstract(undefined, "(0)") : 0;

  function Main(props, state) {
    var _ref2, _ref3, _ref4, _ref5;
    var _props = props;
    var feedbackTargetID = _props.feedbackTargetID;
    var relay = _props.relay;
    var selectedReactionIndex = state.selectedReactionIndex;
    var i18nReactionCount = (_ref2 = reactionEdge) != null ? _ref2.i18n_reaction_count : _ref2;
    var i18nReactionName =
      (_ref3 = reactionEdge) != null ? ((_ref3 = _ref3.node) != null ? _ref3.localized_name : _ref3) : _ref3;
    var reactionKey = (_ref4 = reactionEdge) != null ? ((_ref4 = _ref4.node) != null ? _ref4.key : _ref4) : _ref4;
    var reactionType =
      (_ref5 = reactionEdge) != null ? ((_ref5 = _ref5.node) != null ? _ref5.reaction_type : _ref5) : _ref5;

    reactionType || invariant(0, "Error 1");

    reactionKey || invariant(0, "Error 2");

    var primerProps = someModuleX.getPrimerProps({
      actorID: actorID,
      feedbackTargetID: feedbackTargetID,
      reactionKey: reactionKey,
    });

    var reactionsNotFocused = selectedReactionIndex === null;
    var currentReactionIsFocused = selectedReactionIndex === reactionIndex;
    var tabIndex = (reactionsNotFocused && reactionIndex === 0) || currentReactionIsFocused ? 0 : -1;

    var placeholder = function(children) {
      return { i18nReactionName, foo: true, children: children() };
    };

    return placeholder(function() {
      return {
        bar: true,
        children: Second(props.children),
      };
    });
  }

  function Second(props) {
    var _props = props;
    var depressed = _props.depressed;
    var disabled = _props.disabled;
    var image = _props.image;
    var imageRight = _props.imageRight;
    var label = _props.label;
    var labelIsHidden = _props.labelIsHidden;
    var buttonProps = babelHelpers.objectWithoutProperties(_props, [
      "depressed",
      "disabled",
      "image",
      "imageRight",
      "label",
      "labelIsHidden",
    ]);

    var className = "xxx" + (disabled ? " " + "xxx2" : "") + (depressed ? " " + "xxx3" : "");

    var imageChild = image;
    if (imageChild) {
      var imageProps = {};
      if (label) {
        imageProps.alt = "";
        if (!labelIsHidden) {
          imageProps.className = "xxx4";
        }
      }
      imageChild = imageRightChild = { x: "clone" };
    }

    var imageRightChild = imageRight;
    if (imageRightChild) {
      var _imageProps = {};
      if (label) {
        _imageProps.alt = "";
        if (!labelIsHidden) {
          _imageProps.className = "xxx5";
        }
      }
      imageRightChild = { x: "clone" };
    }

    function callback(children) {
      return { x: "final", children: children(props.children) };
    }

    if (props.href) {
      return callback(Third);
    } else if (props.type && props.type !== "submit") {
      return { x: "final2" };
    } else {
      return { x: "final3" };
    }
  }

  var something_B = new RegExp("(^|\\.)somethingB\\.com$", "i");

  var something_D = ["https"];

  function checkSomethingB(uri) {
    if (uri.isEmpty() && uri.toString() !== "#") {
      return false;
    }

    if (!uri.getDomain() && !uri.getProtocol()) {
      return false;
    }

    return something_D.indexOf(uri.getProtocol()) !== -1 && something_B.test(uri.getDomain());
  }

  var something_C = ["http", "https"];
  var something_A = null;

  function checkSomethingA(uri) {
    if (!something_A) {
      something_A = new RegExp("(^|\\.)somethingA\\.com$", "i");
    }

    if (uri.isEmpty() && uri.toString() !== "#") {
      return false;
    }

    if (!uri.getDomain() && !uri.getProtocol()) {
      return true;
    }

    return something_C.indexOf(uri.getProtocol()) !== -1 && something_A.test(uri.getDomain());
  }

  checkSomethingA.setRegex = function(regex) {
    something_A = regex;
  };

  function checkSomethingC(uri) {
    return checkSomethingA(uri) || checkSomethingB(uri) || checkSomethingD(uri);
  }

  function isOnionURI(uri) {
    return uri.getDomain().endsWith(".onion");
  }

  var something_F = new RegExp("(^|\\.)(get|my)somethingD\\.com$", "i");

  var something_D = ["https"];

  function checkSomethingD(uri) {
    if (uri.isEmpty() && uri.toString() !== "#") {
      return false;
    }

    if (!uri.getDomain() && !uri.getProtocol()) {
      return false;
    }

    return something_D.indexOf(uri.getProtocol()) !== -1 && something_F.test(uri.getDomain());
  }

  var RELATIVE_PREFIX = /^(#|\/\w)/;
  function shouldShim(href) {
    if (RELATIVE_PREFIX.test(href)) {
      return false;
    }
    var uri = new URI(href);
    var protocol = uri.getProtocol();
    return (protocol === "http" || protocol === "https") && !checkSomethingC(uri);
  }

  var killswitch = global.__abstract ? __abstract(undefined, "(function killswitch(){})") : function killswitch() {};

  var dontUpgradeRegex = new RegExp("^(l|lm|h)\\..*$", "i");
  function upgradeUnshimmedLink(href) {
    if (killswitch("LINK_UPGRADE_UNSHIMMED_JS")) {
      return null;
    }
    if (href.getProtocol() !== "http") {
      return null;
    }
    if (!checkSomethingC(href)) {
      return null;
    }
    if (dontUpgradeRegex.test(href.getDomain())) {
      return null;
    }
    return href.setProtocol("https");
  }

  var LinkReactUnsafeHrefConfig = global.__abstract
    ? __abstract(undefined, "({LinkHrefChecker: null})")
    : { LinkHrefChecker: null };
  var LinkHrefChecker = LinkReactUnsafeHrefConfig.LinkHrefChecker;

  function Third(props) {
    var _props = props;
    var allowedProtocol = _props.allowunsafehref;
    var isSafeToSkipShim = _props.s;
    var rawHref = _props.href;
    var linkRef = _props.linkRef;
    var target = _props.target;
    var otherProps = babelHelpers.objectWithoutProperties(_props, [
      "allowunsafehref",
      "s",
      "href",
      "linkRef",
      "target",
    ]);

    var href = "#";
    var shimhash = null;

    if (rawHref instanceof URI) {
      href = rawHref.toString();
    } else if (typeof rawHref === "string" && rawHref !== "" && rawHref !== "#") {
      href = rawHref;
    } else if (typeof rawHref === "object" && rawHref !== null) {
      href = rawHref.url.toString();
      shimhash = rawHref.shimhash ? rawHref.shimhash.toString() : shimhash;
    } else {
      href = "#";
      shimhash = null;
    }

    if (LinkHrefChecker) {
      LinkHrefChecker.logIfInvalidProtocol(href, allowedProtocol);
    }

    if (shimhash == null && shouldShim(href)) {
      shimhash = something_E.link_react_default_hash;
    }

    var nofollow = shimhash != null;
    var useRedirect = shimhash != null;
    var useMetaReferrer = false;

    var href_uri = new URI(href);

    if (something_E.supports_meta_referrer) {
      if (something_E.onion_always_shim && isOnionURI(href_uri)) {
        useRedirect = true;
      } else {
        if (isSafeToSkipShim) {
          useRedirect = false;
        }
        if (shimhash != null) {
          useMetaReferrer = true;
        }
      }
    }

    var noopener = something_E.use_rel_no_opener && shimhash !== null && target === "_blank";

    var upgraded_href = upgradeUnshimmedLink(href_uri);
    if (upgraded_href != null) {
      href = upgraded_href.toString();
    }

    var children = Forth(props.children);

    return { x: "final4", children: children };
  }

  var loadLogging = global.__abstract
    ? __abstract(undefined, "(function loadLogging() {})")
    : function loadLogging() {};

  function logMetaReferrer(href, shimhash) {
    loadLogging(function(a, x) {
      var uri = x
        .getURIBuilder()
        .setString("u", href)
        .setString("h", shimhash)
        .getURI();
      new a(uri).send();
    });
  }

  var LynxGeneration = {
    getShimURI: function getShimURI() {
      return new URI("/l.php").setDomain(something_E.linkshim_host);
    },

    getLynxURIProtocol: function getLynxURIProtocol(targetURI) {
      if (something_E.always_use_https) {
        return "https";
      }

      return targetURI.getProtocol() === "http" ? "http" : "https";
    },

    getShimmedHref: function getShimmedHref(href, shimhash) {
      var targetURI = new URI(href);
      var protocol = LynxGeneration.getLynxURIProtocol(targetURI);
      return LynxGeneration.getShimURI()
        .setQueryData({ u: href, h: shimhash })
        .setProtocol(protocol)
        .toString();
    },

    temporarilySetMetaReferrer: function temporarilySetMetaReferrer(href, shimhash) {
      var meta = $("meta_referrer");
      meta.content = something_E.switched_meta_referrer_policy;
      setTimeout(function() {
        meta.content = something_E.default_meta_referrer_policy;
        logMetaReferrer(href, shimhash);
      }, 100);
    },

    loadLogging: loadLogging,
  };

  function Forth(props) {
    var _props2 = props;
    var href = _props2.href;
    var linkRef = _props2.linkRef;
    var shimhash = _props2.shimhash;
    var onClick = _props2.onClick;
    var useRedirect = _props2.useRedirect;
    var useMetaReferrer = _props2.useMetaReferrer;
    var nofollow = _props2.nofollow;
    var noopener = _props2.noopener;
    var rel = _props2.rel;
    var otherProps = babelHelpers.objectWithoutProperties(_props2, [
      "href",
      "linkRef",
      "shimhash",
      "onClick",
      "useRedirect",
      "useMetaReferrer",
      "nofollow",
      "noopener",
      "rel",
    ]);

    var outputHref = href;
    var outputRel = rel;

    if (useRedirect) {
      outputHref = LynxGeneration.getShimmedHref(href, shimhash || "");
    }

    if (nofollow) {
      outputRel = outputRel ? outputRel + " nofollow" : "nofollow";
    }

    if (noopener) {
      outputRel = outputRel ? outputRel + " noopener" : "noopener";
    }

    return {
      x: "final5",
      children: babelHelpers["extends"]({}, otherProps, {
        href: outputHref,
        rel: outputRel,
        ref: linkRef,
        onClick: null,
      }),
    };
  }

  global.__optimize && __optimize(Main);

  global.inspect = function() {
    return Main({}, {});
  };

  return Main;
});
