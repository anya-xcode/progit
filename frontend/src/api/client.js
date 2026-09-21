import axios from "axios";
import { readStorage, removeStorage, writeStorage } from "../utils/storage.js";

// All requests go to /api, which Vite proxies to the Express server in
// development and hits the serverless function in production.
const client = axios.create({ baseURL: "/api", timeout: 180_000 });

// Deployed instances can require a shared access key (APP_ACCESS_KEY).
export const accessKey = {
  get: () => readStorage("accessKey", ""),
  set: (value) => writeStorage("accessKey", value),
  clear: () => removeStorage("accessKey"),
};

client.interceptors.request.use((config) => {
  const key = accessKey.get();
  if (key) config.headers["x-dsaforge-key"] = key;
  return config;
});

// Turn API errors into plain Error objects with a readable message.
client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // The key is missing or wrong: ask for it again.
    if (error.response?.status === 401 && error.response?.data?.code === "ACCESS_KEY_REQUIRED") {
      accessKey.clear();
      window.dispatchEvent(new CustomEvent("dsaforge:access-key-required"));
    }
    const message =
      error.response?.data?.message ||
      (error.code === "ECONNABORTED" ? "The request timed out" : null) ||
      (!error.response ? "Cannot reach the DSAForge server. Is the backend running?" : error.message);
    const wrapped = new Error(message);
    wrapped.status = error.response?.status;
    wrapped.code = error.response?.data?.code;
    return Promise.reject(wrapped);
  }
);

export default client;
