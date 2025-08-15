import React, { useEffect } from "react";
import { Animated, Text } from "react-native";

type SnackbarProps = {
    visible: boolean;
    message: string;
    duration?: number;
    onClose?: () => void;
};

export default function Snackbar({
    visible,
    message,
    duration = 3000,
    onClose,
}: SnackbarProps) {
    const opacity = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.timing(opacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();

            const timer = setTimeout(() => {
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }).start(() => {
                    onClose?.();
                });
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [visible, duration, onClose, opacity]);

    if (!visible) return null;

    return (
        <Animated.View
            style={{
                position: "absolute",
                bottom: 40,
                left: 20,
                right: 20,
                backgroundColor: "#333",
                padding: 16,
                borderRadius: 8,
                alignItems: "center",
                opacity,
                zIndex: 1000,
            }}
        >
            <Text style={{ color: "#fff" }}>{message}</Text>
        </Animated.View>
    );
}