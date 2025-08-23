// src/security/pin.ts
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const PIN_ENABLED_KEY = "pin_enabled";
const PIN_HASH_KEY = "pin_hash";
const PIN_SALT_KEY = "pin_salt";

async function getItem(k: string) {
  return SecureStore.getItemAsync(k);
}
async function setItem(k: string, v: string) {
  return SecureStore.setItemAsync(k, v);
}
async function delItem(k: string) {
  return SecureStore.deleteItemAsync(k);
}

async function getOrCreateSalt() {
  let salt = await getItem(PIN_SALT_KEY);
  if (!salt) {
    salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await setItem(PIN_SALT_KEY, salt);
  }
  return salt;
}

async function hashPin(pin: string) {
  const salt = await getOrCreateSalt();
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin + salt
  );
}

export async function isPinEnabled() {
  return (await getItem(PIN_ENABLED_KEY)) === "true";
}

export async function enablePin(newPin: string) {
  const hashed = await hashPin(newPin);
  await setItem(PIN_HASH_KEY, hashed);
  await setItem(PIN_ENABLED_KEY, "true");
}

export async function disablePin() {
  await delItem(PIN_HASH_KEY);
  await setItem(PIN_ENABLED_KEY, "false");
}

export async function verifyPin(enteredPin: string) {
  const stored = await getItem(PIN_HASH_KEY);
  if (!stored) return false;
  const enteredHash = await hashPin(enteredPin);
  return stored === enteredHash;
}
