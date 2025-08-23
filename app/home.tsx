import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
export default function HomePage() {
  return (
    <View style={styles.container}>
      {/* Background Circles */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />

      {/* Content */}
      <Text style={styles.title}>Apollo Fire App</Text>
      <Text style={styles.subtitle}>React Native + Apollo Starter</Text>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    position: "relative",
  },
  circle1: {
    position: "absolute",
    top: -60,
    left: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#6366f1",
    opacity: 0.08,
  },
  circle2: {
    position: "absolute",
    bottom: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#18181b",
    opacity: 0.06,
  },
  circle3: {
    position: "absolute",
    top: 120,
    right: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#6366f1",
    opacity: 0.07,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#18181b",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6366f1",
    marginBottom: 24,
    letterSpacing: 0.2,
  },
  button: {
    backgroundColor: "#18181b",
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "500",
    fontSize: 15,
  },
});
