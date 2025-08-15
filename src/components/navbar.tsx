import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';

export default function Navbar() {
    const router = useRouter();
    const [dropdownVisible, setDropdownVisible] = useState(false);

    // Close dropdown when clicking outside
    const dropdownRef = useRef<View>(null);

    const handleProfile = () => {
        setDropdownVisible(false);
        router.push('/profile');
    };

    const handleLogout = () => {
        setDropdownVisible(false);
        router.replace('/login');
    };

    return (
        <View style={styles.navbar} className="flex-row items-center justify-between px-6 py-6 bg-white">
            <Text className="text-2xl font-extrabold text-blue-700 tracking-wide">
                Apollo Fire
            </Text>
            <View className="flex-row gap-5">
                <Pressable
                    android_ripple={{ color: '#e0e7ff' }}
                    style={({ pressed }) => [
                        styles.iconButton,
                        {
                            backgroundColor: pressed ? '#eff6ff' : '#f3f4f6',
                            shadowColor: pressed ? '#2563eb' : undefined,
                            shadowOpacity: pressed ? 0.15 : 0,
                        },
                    ]}
                    onPress={() => router.push('/')}
                >
                    <Ionicons name="home-outline" size={23} color="#2563eb" />
                </Pressable>
                <View>
                    <Pressable
                        android_ripple={{ color: '#e0e7ff' }}
                        style={({ pressed }) => [
                            styles.iconButton,
                            {
                                backgroundColor: pressed ? '#eff6ff' : '#f3f4f6',
                                shadowColor: pressed ? '#2563eb' : undefined,
                                shadowOpacity: pressed ? 0.15 : 0,
                            },
                        ]}
                        onPress={() => setDropdownVisible((v) => !v)}
                    >
                        <Ionicons name="settings-outline" size={23} color="#2563eb" />
                    </Pressable>
                    {dropdownVisible && (
                        <TouchableWithoutFeedback onPress={() => setDropdownVisible(false)}>
                            <View style={styles.dropdownOverlay}>
                                <View style={styles.dropdown} ref={dropdownRef}>
                                    <Pressable style={styles.dropdownItem} onPress={handleProfile}>
                                        <Text style={styles.dropdownText}>Profile</Text>
                                    </Pressable>
                                    <Pressable style={styles.dropdownItem} onPress={handleLogout}>
                                        <Text style={styles.dropdownText}>Logout</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    navbar: {
        position: 'absolute',
        top: 15,
        left: 0,
        right: 0,
        zIndex: 100,
        elevation: 8,
        borderBottomWidth: 0,
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        borderRadius: 16,
        margin: 12,
        backgroundColor: 'white',
    },
    iconButton: {
        padding: 10,
        borderRadius: 12,
    },
    dropdownOverlay: {
        position: 'absolute',
        top: 40,
        right: 0,
        left: -100,
        bottom: -100,
        zIndex: 200,
    },
    dropdown: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: 'white',
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 10,
        minWidth: 120,
        paddingVertical: 8,
    },
    dropdownItem: {
        paddingVertical: 10,
        paddingHorizontal: 18,
    },
    dropdownText: {
        fontSize: 16,
        color: '#2563eb',
    },
});