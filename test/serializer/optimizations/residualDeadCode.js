// does not contain:eliminate
// contains:preserve
// contains:do
(function() {
  let f = false;
  let t = true;

  global.inspect = function() {
    if (f) {
      console.log("eliminate me");
    }
    if (f) {
      console.log("eliminate me");
    } else {
      console.log("preserve");
    }
    if (t) {
    } else {
      console.log("eliminate me");
    }

    f ? console.log("eliminate me") : null;
    t ? null : console.log("eliminate me");

    f && console.log("eliminate me");
    t || console.log("eliminate me");

    while (f) console.log("eliminate me");
    do {
      break;
    } while (f);

    0 ? console.log("eliminate me") : null;
    1 ? null : console.log("eliminate me");
    "" ? console.log("eliminate me") : null;
    " " ? null : console.log("eliminate me");
    (function() {} ? null : console.log("eliminate me"));
    (() => {}) ? null : console.log("eliminate me");
    /a/ ? null : console.log("eliminate me");
    (class {} ? null : console.log("eliminate me"));
    ({} ? null : console.log("eliminate me"));
    [] ? null : console.log("eliminate me");
    null ? console.log("eliminate me") : null;

    return 42;
  };
})();
