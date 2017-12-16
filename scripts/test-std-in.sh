# Prepack test input
cat ./test/std-in/StdIn.js | node ./bin/prepack.js --out StdIn-test.js > /dev/null
# Run the resulting program and check it for expected output
node ./StdIn-test.js | grep "Hello world from std-in" > /dev/null
if [[ $? -ne 0 ]]; then
    echo "Stdin test failed: cat ./test/std-in/StdIn.js | node ./bin/prepack.js --out StdIn-test.js returned an error"
    exit 1
fi
rm ./StdIn-test.js

# Prepack test empty input and check if it logs correct msg
# we swap stdout and stderr to inspect the errors using 2>&1 1>/dev/null
(echo "" | node ./bin/prepack.js --out StdIn-test.js 2>&1 1>/dev/null ) | grep "Prepack returned empty code." > /dev/null
if [[ $? -ne 0 ]]; then
     echo "Stdin test failed: echo "" | node ./bin/prepack.js --out StdIn-test.js didn't return the expected error"
    exit 1
fi

# Prepack test input and check if it exits with signal 1
(echo "{}()" | node ./bin/prepack.js --out StdInError-test.js  2>&1 1>/dev/null ) | grep "In stdin:(1:4) FatalError PP1004: Syntax error: Unexpected token (1:3)" > /dev/null
if [[ $? -ne 0 ]]; then
    echo "Stdin test failed: cat ./test/std-in/StdInError.js | node ./bin/prepack.js --out StdInError-test.js didn't return the expected error"
    # If the test failed, rerun and show the output
    echo "{}()" | node ./bin/prepack.js --out StdInError-test.js
    exit 1
fi
