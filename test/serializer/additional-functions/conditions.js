function getURL(
  getProtocol,
  getIsGeneric,
  getDomain,
  getPort,
  getPath,
  serialize,
  getQueryData,
  getFragment,
  getForceFragmentSeparator
) {
  var str = "";
  var protocol = getProtocol();
  if (protocol) {
    str += protocol + ":" + (getIsGeneric() ? "" : "//");
  }
  var domain = getDomain();
  if (domain) {
    str += domain;
  }
  var port = getPort();
  if (port) {
    str += ":" + port;
  }

  var path = getPath();
  if (path) {
    str += path;
  } else if (str) {
    str += "/";
  }
  var queryStr = serialize(getQueryData());
  if (queryStr) {
    str += "?" + queryStr;
  }
  var fragment = getFragment();
  if (fragment) {
    str += "#" + fragment;
  } else if (getForceFragmentSeparator()) {
    str += "#";
  }
  return str;
}

global.__optimize && __optimize(getURL);

inspect = function inspect() {
  var getProtocol = function() {
    return "http://";
  };
  var getIsGeneric = function() {
    return true;
  };
  var getPort = function() {
    return 80;
  };
  var getDomain = function() {
    return "foobar.com";
  };
  var getPath = function() {
    return "test";
  };
  var serialize = function(a) {
    return a;
  };
  var getQueryData = function() {
    return "test";
  };
  var getFragment = function() {
    return "frag";
  };
  var getForceFragmentSeparator = function() {
    return false;
  };
  return getURL(
    getProtocol,
    getIsGeneric,
    getDomain,
    getPort,
    getPath,
    serialize,
    getQueryData,
    getFragment,
    getForceFragmentSeparator
  );
};
