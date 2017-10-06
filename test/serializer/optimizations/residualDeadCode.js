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

    0 ? console.log("eliminate me") : null;
    1 ? null : console.log("eliminate me");
    '' ? console.log("eliminate me") : null;
    ' ' ? null : console.log("eliminate me");
    (function (){}) ? null : console.log("eliminate me");
    (() => {}) ? null : console.log("eliminate me");
    /a/ ? null : console.log("eliminate me");
    (class {}) ? null : console.log("eliminate me");
    ({}) ? null : console.log("eliminate me");
    [] ? null : console.log("eliminate me");

    return 42;
  }
})();
