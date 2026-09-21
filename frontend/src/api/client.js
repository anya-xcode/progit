import axios from "axios";
import { readStorage, removeStorage, writeStorage } from "../utils/storage.js";

// By default requests go to /api on the same origin: Vite proxies that in
// development, and a Vercel function answers it in production. Set
// VITE_API_BASE_URL when the API lives somewhere else (e.g. Render).
// Accepts either "https://host" or "https://host/api" — the /api suffix is
// added when it is missing.
function resolveBaseUrl(configured) {
  if (!configured) return "/api";
  const trimmed = configured.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

const baseURL = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL);
const client = axios.create({ baseURL, timeout: 180_000 });

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
