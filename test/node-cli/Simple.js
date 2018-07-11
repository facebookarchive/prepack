var greeting = require("./Greeting");

// The residual program after initialization.
__residual(
  "boolean",
  function(greeting, console) {
    console.log(greeting + " world!");

    // Currently, we're required to have a return value even though
    // we're not going to use it.
    return false;
  },
  greeting,
  console
);
