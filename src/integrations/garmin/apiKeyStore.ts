import * as SecureStore from 'expo-secure-store';

/** The Personal API key grants access to the user's Garmin data, so it lives in the OS keystore. */
const API_KEY_ITEM = 'garmin.personalApiKey';

export const loadApiKey = () => SecureStore.getItemAsync(API_KEY_ITEM);

export const saveApiKey = (apiKey: string) => SecureStore.setItemAsync(API_KEY_ITEM, apiKey);

export const deleteApiKey = () => SecureStore.deleteItemAsync(API_KEY_ITEM);
