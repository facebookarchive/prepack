// does not contain:eliminate
(function () {
  let f = false;
  let t = true;
  global.inspect = function () {
    if (f) { console.log("eliminate me"); }
    if (t) { } else { console.log("eliminate me"); }

    f ? console.log("eliminate me") : null;
    t ? null : console.log("eliminate me");

    f && console.log("eliminate me");
    t || console.log("eliminate me");

    return 42;
  }
})();
