# Prepacks a correct stdin input. Checks if the output execution is correct.
cat ./test/std-in/StdIn.js | node ./bin/prepack.js --out StdIn-test.js > /dev/null
node ./StdIn-test.js | grep "Hello world from std-in" > /dev/null
if [[ $? -ne 0 ]]; then
    echo "Stdin test failed: cat ./test/std-in/StdIn.js | node ./bin/prepack.js --out StdIn-test.js returned an error"
    exit 1
fi
rm ./StdIn-test.js

# Prepacks an empty stdin input. Checks if it exits with signal 0.
echo "" | node ./bin/prepack.js 1>/dev/null 2>&1
if [[ $? -ne 0 ]]; then
     echo "Stdin test failed: echo "" | node ./bin/prepack.js --out StdIn-test.js didn't exit with signal 0"
    exit 1
fi

# Prepacks an empty stdin input. Checks if the correct error message is printed.
(echo "" | node ./bin/prepack.js 2>&1 1>/dev/null ) | grep "Prepack returned empty code." > /dev/null
# grep returns 0, even though prepack returned 1
if [[ $? -ne 0 ]]; then
     echo "Stdin test failed: echo "" | node ./bin/prepack.js --out StdIn-test.js didn't exit with the expected signal 1."
    exit 1
fi

# Prepacks a stdin with a syntax error. Checks if it exits with signal 1.
echo "{}()" | node ./bin/prepack.js 1>/dev/null 2>&1 
if [[ $? -ne 1 ]]; then
    echo "Stdin test failed:echo \"{}()\" | node ./bin/prepack.js --out StdInError-test.js didn't exit with the expected signal 1."
    # If the test failed, rerun and show the output
    echo "{}()" | node ./bin/prepack.js
    exit 1
fi

# Prepacks a stdin with a syntax error. Checks if the correct error message is printed.
(echo "{}()" | node ./bin/prepack.js 2>&1 1>/dev/null ) | grep "In stdin(1:4) FatalError PP1004" > /dev/null
# grep returns 0, even though prepack returned 1
if [[ $? -ne 0 ]]; then
    echo "Stdin test failed: echo \"{}()\" | node ./bin/prepack.js didn't return the expected error message."
    # If the test failed, rerun and show the output
    echo "{}()" | node ./bin/prepack.js
    exit 1
fi
