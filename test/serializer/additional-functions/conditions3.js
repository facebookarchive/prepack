function cr(a, b, c) {
  b.children = c;
  return a(b);
}

function fn2(a) {
  return JSON.stringify(a);
}

function ShimURI(str) {
  this.str = str;
}
ShimURI.isValidURI = function() {};
ShimURI.prototype.getProtocol = function() {
  return "http";
};
ShimURI.prototype.setProtocol = function() {};
ShimURI.prototype.getDomain = function() {
  return "lol";
};
ShimURI.prototype.getDomain = function() {
  return "lol.com";
};
ShimURI.prototype.toString = function() {
  return "http://foo.com";
};

var isXXXURI = global.__abstract
  ? __abstract("function", "(function a() { return true; })")
  : function() {
      return true;
    };
var XXX2 = global.__abstract ? __abstract("function", "(function b() {})") : function() {};
var XXX3 = global.__abstract ? __abstract("function", "(function c() {})") : function() {};
var XXX6 = global.__abstract
  ? __abstract("object", "({link_react_default_hash: '#', XXX9: true, XXX10: true})")
  : { link_react_default_hash: "#", XXX9: true, XXX10: true };
var XXX7 = global.__abstract
  ? __abstract("function", "(function e() { return true; })")
  : function() {
      return true;
    };
var XXX5 = global.__abstract
  ? __abstract("function", "(function f() { return true;  })")
  : function() {
      return true;
    };
var URI = global.__abstract ? __abstract("function", "(function () { return ShimURI; })()") : ShimURI;

var dontUpgradeRegex = new RegExp("^(l|lm|h)\\..*$", "i");

function XXX8(href) {
  if (XXX5("XXX4")) {
    return null;
  }
  if (href.getProtocol() !== "http") {
    return null;
  }
  if (!isXXXishURI(href)) {
    return null;
  }
  if (dontUpgradeRegex.test(href.getDomain())) {
    return null;
  }
  return href.setProtocol("https");
}

function isXXXishURI(uri) {
  return isXXXURI(uri) || XXX2(uri) || XXX3(uri);
}

var RELATIVE_PREFIX = /^(#|\/\w)/;
function shouldShim(href) {
  if (RELATIVE_PREFIX.test(href.toString())) {
    return false;
  }
  var protocol = href.getProtocol();
  return (protocol === "http" || protocol === "https") && !isXXXishURI(href);
}

function parseHref(rawHref) {
  var href_string = "#";
  var shimhash = null;

  if (rawHref instanceof URI) {
    href_string = rawHref.toString();
  } else if (typeof rawHref === "string" && rawHref !== "" && rawHref !== "#") {
    href_string = rawHref;
  } else if (typeof rawHref === "object" && rawHref !== null) {
    href_string = rawHref.url.toString();
    shimhash = rawHref.shimhash ? rawHref.shimhash.toString() : shimhash;
  } else {
    href_string = "#";
    shimhash = null;
  }

  var href = void 0;
  if (URI.isValidURI(href_string)) {
    href = new URI(href_string);
  } else {
    href = new URI("#");
  }

  if (shimhash == null && shouldShim(href)) {
    shimhash = XXX6.link_react_default_hash;
  }

  var upgraded_href = XXX8(href);
  if (upgraded_href != null) {
    href = upgraded_href;
  }

  return [href, shimhash];
}

function fn1(props) {
  var _props = props;
  var _allowedProtocol = _props.allowunsafehref;
  var isSafeToSkipShim = _props.s;
  var rawHref = _props.href;
  var linkRef = _props.linkRef;
  var target = _props.target;
  var parsed_href = parseHref(rawHref);
  var href = parsed_href[0];
  var shimhash = parsed_href[1];

  var nofollow = shimhash != null;
  var useRedirect = shimhash != null;
  var useMetaReferrer = false;

  if (XXX6.XXX9) {
    if (XXX6.XXX10 && XXX7(href)) {
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

  var noopener = XXX6.use_rel_no_opener && shimhash !== null && target === "_blank";

  return cr(
    fn2,
    Object.assign({}, props, {
      href: href,
      linkRef: linkRef,
      nofollow: nofollow,
      noopener: noopener,
      shimhash: shimhash,
      target: target,
      useRedirect: useRedirect,
      useMetaReferrer: useMetaReferrer,
    })
  );
}

global.__optimize && __optimize(fn1);

global.inspect = function() {
  return fn1({ href: "http://foobar.com", linkRef: "123" });
};
