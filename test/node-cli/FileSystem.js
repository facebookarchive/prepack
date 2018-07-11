var fs = require("fs");

var greetingPath = require.resolve("./Greeting.txt");

var greetingJSON = require("./Greeting.json");

// The residual program after initialization.
__residual(
  "boolean",
  function(fs, greetingJSON, greetingPath, console, JSON) {
    var greetingText = fs.readFileSync(greetingPath, "utf8");

    console.log(`${greetingJSON.greeting} ${greetingText} world!`);

    // Currently, we're required to have a return value even though
    // we're not going to use it.
    return false;
  },
  fs,
  greetingJSON,
  greetingPath,
  console,
  JSON
);
