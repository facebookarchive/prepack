var React = require("React");
var { StyleSheet, Text, View } = require("ReactNative");

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#F5FCFF",
    flex: 1,
    justifyContent: "center",
  },
  instructions: {
    color: "#333333",
    marginBottom: 5,
    textAlign: "center",
  },
  welcome: {
    fontSize: 20,
    margin: 10,
    textAlign: "center",
  },
});

class App extends React.Component {
  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>Welcome to React Native!</Text>
        <Text style={styles.instructions}>
          <Text>Foo</Text>
          This is a React Native test.
        </Text>
      </View>
    );
  }
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render simple", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    isRoot: true,
  });
}

module.exports = App;
