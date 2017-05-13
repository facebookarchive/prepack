# Prepack test input
node ./bin/prepack.js ./test/node-cli/Simple.js --out Simple-test.js --compatibility node-cli
# Run the resulting program and check it for expected output
node ./Simple-test.js | grep "Hey world" > /dev/null
if [[ $? -ne 0 ]]; then
    exit 1
fi
rm ./Simple-test.js

# Prepack test input
node ./bin/prepack.js ./test/node-cli/FileSystem.js --out FileSystem-test.js --compatibility node-cli
# Run the resulting program and check it for expected output
node ./FileSystem-test.js | grep "Hey Hello world" > /dev/null
if [[ $? -ne 0 ]]; then
    exit 1
fi
rm ./FileSystem-test.js
